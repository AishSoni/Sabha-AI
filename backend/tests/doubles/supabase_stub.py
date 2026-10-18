"""PostgREST-shaped stub of the supabase-py client, backed by the embedded
Postgres instance.

PersonaManager and friends build queries with supabase-py's fluent builder
(`db.table(...).select(...).eq(...).execute()`). Against a real Supabase host
those are HTTP calls; in tests we translate the used subset into parameterized
SQL against the disposable Postgres database, so schema behavior (constraints,
RPC functions, FKs) is exercised for real.

Supported subset (only what services actually use):
    table(name)
        select(cols) | insert(data) | update(dict) | delete()
        eq / neq / in / or_ / order(col, desc=) / limit(n)
    rpc(fn, params)
    .execute() -> object with `.data`

Any identifier is regex-checked; every value is passed as a parameter.
"""

import re
import uuid as uuid_module
from datetime import date, datetime

import psycopg
from psycopg.rows import dict_row

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SAFE_OPS = {"eq": "=", "neq": "<>", "gte": ">=", "lte": "<=", "gt": ">", "lt": "<"}


def _postgrest_json(value):
    """Shape values like a PostgREST JSON response (uuids/datetimes -> strings)."""
    if isinstance(value, uuid_module.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _postgrest_rows(rows):
    return [{k: _postgrest_json(v) for k, v in row.items()} for row in rows]


class _PostgrestResult:
    """Mimics supabase-py APIResponse: carries `.data` only."""

    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, uri: str, table: str):
        self._uri = uri
        self._table = table
        self._projection = "*"
        self._conditions: list[str] = []
        self._params: list = []
        self._order_by: str = ""
        self._limit: int | None = None
        self._action = "select"
        self._payload = None

    # --- query construction -------------------------------------------------
    def select(self, columns: str = "*") -> "_Table":
        self._action = "select"
        parts = [c.strip() for c in columns.split(",")]
        for p in parts:
            if p != "*" and not _IDENT.match(p):
                raise ValueError(f"Unsafe column: {p}")
        self._projection = columns
        return self

    def insert(self, data) -> "_Table":
        self._action = "insert"
        self._payload = data if isinstance(data, list) else [data]
        return self

    def update(self, data: dict) -> "_Table":
        self._action = "update"
        self._payload = [data]
        return self

    def delete(self) -> "_Table":
        self._action = "delete"
        return self

    def eq(self, column: str, value) -> "_Table":
        return self._where("eq", column, value)

    def neq(self, column: str, value) -> "_Table":
        return self._where("neq", column, value)

    def in_(self, column: str, values) -> "_Table":
        return self._where_in(column, list(values))

    def or_(self, condition: str) -> "_Table":
        return self._where_or(condition)

    def order(self, column: str, desc: bool = False) -> "_Table":
        if not _IDENT.match(column):
            raise ValueError(f"Unsafe column: {column}")
        self._order_by = f" ORDER BY {column} {'DESC' if desc else 'ASC'}"
        return self

    def limit(self, count: int) -> "_Table":
        self._limit = int(count)
        return self

    def _where(self, op: str, column: str, value) -> "_Table":
        if not _IDENT.match(column):
            raise ValueError(f"Unsafe column: {column}")
        self._conditions.append(f"{column} {_SAFE_OPS[op]} %s")
        self._params.append(value)
        return self

    def _where_in(self, column: str, values) -> "_Table":
        if not _IDENT.match(column):
            raise ValueError(f"Unsafe column: {column}")
        self._conditions.append(f"{column} = ANY (%s::uuid[])")
        # psycopg adapts Python lists to SQL arrays natively.
        self._params.append(values)
        return self

    def _where_or(self, condition: str) -> "_Table":
        clauses = []
        for token in condition.split(","):
            col, op, _, val = token.partition(".")
            col = col.strip()
            op = op.strip()
            val = val.strip()
            if op == "is":
                self._conditions.append(f"({col} IS {'NULL' if val.lower() == 'null' else 'TRUE' if val.lower() == 'true' else 'FALSE'})")
                continue
            if op not in _SAFE_OPS:
                raise ValueError(f"Unsupported OR operator: {op}")
            clauses.append(f"({col} {_SAFE_OPS[op]} %s)")
            self._params.append(val)
        if clauses:
            self._conditions.append("(" + " OR ".join(clauses) + ")")
        return self

    # --- helpers ------------------------------------------------------------
    def _columns(self, conn) -> list[str]:
        cur = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s ORDER BY ordinal_position",
            (self._table,),
        )
        cols = [r["column_name"] for r in cur.fetchall()]
        if not cols:
            raise ValueError(f"No table named {self._table!r}")
        for c in cols:
            if not _IDENT.match(c):
                raise ValueError(f"Unsafe schema column: {c}")
        return cols

    def _qualified_cols(self, conn, cols) -> str:
        return ", ".join(cols)

    def _where_sql(self) -> str:
        if not self._conditions:
            return ""
        return " WHERE " + " AND ".join(self._conditions)

    # --- execution ----------------------------------------------------------
    def execute(self) -> _PostgrestResult:
        with psycopg.connect(self._uri, autocommit=True, row_factory=dict_row) as conn:
            return self._run(conn)

    def _run(self, conn) -> _PostgrestResult:
        if self._action == "select":
            cols = self._columns(conn)
            projection = self._qualified_cols(conn, cols) if self._projection == "*" else ", ".join(
                c for c in self._projection.split(",") if c.strip()
            )
            sql = f"SELECT {projection} FROM {self._table}{self._where_sql()}{self._order_by}"
            if self._limit is not None:
                sql += f" LIMIT {int(self._limit)}"
            rows = conn.execute(sql, self._params or None).fetchall()
            return _PostgrestResult(_postgrest_rows(rows))

        if self._action == "insert":
            rows = []
            for payload in self._payload:
                cols = list(payload.keys())
                for c in cols:
                    if not _IDENT.match(c):
                        raise ValueError(f"Unsafe column: {c}")
                placeholders = ", ".join(["%s"] * len(cols))
                sql = (
                    f"INSERT INTO {self._table} ({', '.join(cols)}) "
                    f"VALUES ({placeholders}) RETURNING *"
                )
                row = conn.execute(sql, list(payload.values())).fetchone()
                rows.append({k: _postgrest_json(v) for k, v in row.items()})
            return _PostgrestResult(rows)

        if self._action == "update":
            cols = self._columns(conn)
            set_cols = list(self._payload[0].keys())
            for c in set_cols + cols:
                if not _IDENT.match(c):
                    raise ValueError(f"Unsafe column: {c}")
            set_sql = ", ".join(f"{c} = %s" for c in set_cols)
            update_param_list = [self._payload[0][c] for c in set_cols]
            update_param_list.extend(self._params)
            update_sql = (
                f"UPDATE {self._table} SET {set_sql}{self._where_sql()} RETURNING *"
            )
            rows = conn.execute(update_sql, update_param_list or None).fetchall()
            return _PostgrestResult(_postgrest_rows(rows))

        if self._action == "delete":
            self._columns(conn)
            delete_sql = f"DELETE FROM {self._table}{self._where_sql()} RETURNING *"
            rows = conn.execute(delete_sql, self._params or None).fetchall()
            return _PostgrestResult(_postgrest_rows(rows))

        raise RuntimeError(f"Unknown action {self._action}")


class _Rpc:
    def __init__(self, uri: str, fn: str, params: dict):
        self._uri = uri
        self._fn = fn
        self._params = params

    def execute(self) -> _PostgrestResult:
        if not _IDENT.match(self._fn):
            raise ValueError(f"Unsafe rpc: {self._fn}")
        # Positional signature used by replace_persona_stacks(p_persona_id, p_stack_ids)
        func_args = {
            "replace_persona_stacks": [self._params.get("p_persona_id"), self._params.get("p_stack_ids")],
        }
        if self._fn not in func_args:
            raise ValueError(f"Stub does not implement rpc {self._fn!r}")
        with psycopg.connect(self._uri, autocommit=True, row_factory=dict_row) as conn:
            placeholders = ", ".join(["%s"] * len(func_args[self._fn]))
            rows = conn.execute(
                f"SELECT * FROM {self._fn}({placeholders})",
                func_args[self._fn],
            ).fetchall()
            return _PostgrestResult(_postgrest_rows(rows))


class SupabaseStub:
    """Drop-in replacement for the supabase Client surface services use."""

    def __init__(self, uri: str):
        self._uri = uri

    def table(self, name: str) -> _Table:
        if not _IDENT.match(name):
            raise ValueError(f"Unsafe table: {name}")
        return _Table(self._uri, name)

    def rpc(self, fn: str, params: dict | None = None) -> _Rpc:
        return _Rpc(self._uri, fn, params or {})


def stub_for(disposable_db) -> SupabaseStub:
    """Build a SupabaseStub bound to the given disposable database."""
    return SupabaseStub(disposable_db.uri)
