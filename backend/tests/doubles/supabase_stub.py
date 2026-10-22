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

import psycopg
from psycopg.types.json import Json
from datetime import date, datetime

import psycopg
from psycopg.rows import dict_row

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SAFE_OPS = {"eq": "=", "neq": "<>", "gte": ">=", "lte": "<=", "gt": ">", "lt": "<"}

# rpc(fn, params) positional signatures: (python_kwarg_name, PG cast suffix).
# Parameters are matched by name so additions stay order-independent.
_RPC_SIGNATURES: dict[str, tuple[tuple[str, str], ...]] = {
    "replace_persona_stacks": (("p_persona_id", ""), ("p_stack_ids", "::uuid[]")),
    "create_meeting_transaction": (("p_meeting", "::jsonb"), ("p_participants", "::jsonb")),
    "activate_prompt_version": (("p_persona_id", ""), ("p_version", "")),
    "create_prompt_version": (
        ("p_persona_id", ""),
        ("p_content", ""),
        ("p_version_id", ""),
        ("p_created_at", "::timestamptz"),
    ),
    "increment_meeting_cost": (("meeting_id", "::uuid"), ("cost_delta", "::decimal")),
    "record_inference_cost": (
        ("p_inference_id", "::uuid"),
        ("p_meeting_id", "::uuid"),
        ("p_purpose", ""),
        ("p_provider", ""),
        ("p_model", ""),
        ("p_cost", "::decimal"),
    ),
    "commit_meeting_ending": (
        ("p_meeting_id", "::uuid"),
        ("p_from_status", ""),
        ("p_content", ""),
    ),
    "claim_operation": (
        ("p_request_key", ""),
        ("p_claimant", ""),
    ),
    "publish_operation": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
    ),
    "admit_turn_operation": (
        ("p_meeting_id", "::uuid"),
        ("p_participant_id", "::uuid"),
        ("p_request_key", ""),
        ("p_payload_hash", ""),
        ("p_payload", "::jsonb"),
        ("p_max_queued", ""),
        ("p_now", "::timestamptz"),
    ),
    "claim_next_turn_operation": (
        ("p_claimant", ""),
        ("p_lease_seconds", ""),
        ("p_global_limit", ""),
        ("p_now", "::timestamptz"),
        ("p_meeting_id", "::uuid"),
    ),
    "renew_turn_operation_lease": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_lease_seconds", ""),
        ("p_now", "::timestamptz"),
    ),
    "start_turn_operation": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_effective_settings", "::jsonb"),
        ("p_now", "::timestamptz"),
    ),
    "recover_turn_operations": (("p_now", "::timestamptz"),),
    "begin_turn_attempt": (
        ("p_operation_id", "::uuid"),
        ("p_attempt_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_provider", ""),
        ("p_model", ""),
        ("p_now", "::timestamptz"),
    ),
    "complete_turn_attempt": (
        ("p_attempt_id", "::uuid"),
        ("p_usage", "::jsonb"),
        ("p_cost", "::decimal"),
        ("p_provider_request_id", ""),
        ("p_now", "::timestamptz"),
    ),
    "fail_turn_attempt": (
        ("p_attempt_id", "::uuid"),
        ("p_status", ""),
        ("p_error_code", ""),
        ("p_now", "::timestamptz"),
    ),
    "publish_turn_operation": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_message", "::jsonb"),
        ("p_usage", "::jsonb"),
        ("p_cost", "::decimal"),
        ("p_now", "::timestamptz"),
    ),
    "fail_turn_operation": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_status", ""),
        ("p_error_code", ""),
        ("p_error_message", ""),
        ("p_now", "::timestamptz"),
    ),
    "cancel_turn_operation": (
        ("p_operation_id", "::uuid"),
        ("p_meeting_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "cancel_turn_operations_for_meeting": (
        ("p_meeting_id", "::uuid"),
        ("p_reason", ""),
        ("p_now", "::timestamptz"),
    ),
    "append_turn_event": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_event_id", "::uuid"),
        ("p_type", ""),
        ("p_payload", "::jsonb"),
        ("p_now", "::timestamptz"),
    ),
    "read_turn_events": (
        ("p_operation_id", "::uuid"),
        ("p_meeting_id", "::uuid"),
        ("p_after_sequence", "::bigint"),
        ("p_limit", ""),
    ),
    "get_turn_operation_status": (
        ("p_operation_id", "::uuid"),
        ("p_meeting_id", "::uuid"),
    ),
    "list_turn_operations": (
        ("p_meeting_id", "::uuid"),
        ("p_limit", ""),
    ),
    "record_turn_disagreement": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_invocation_id", ""),
        ("p_call_id", ""),
        ("p_source_ai_id", "::uuid"),
        ("p_target_name", ""),
        ("p_topic", ""),
        ("p_reasoning", ""),
        ("p_severity", ""),
        ("p_now", "::timestamptz"),
    ),
    "record_turn_consensus": (
        ("p_operation_id", "::uuid"),
        ("p_expected_fence", ""),
        ("p_invocation_id", ""),
        ("p_call_id", ""),
        ("p_participants", "::jsonb"),
        ("p_topic", ""),
        ("p_strength", ""),
        ("p_now", "::timestamptz"),
    ),
    "request_meeting_closing": (
        ("p_meeting_id", "::uuid"),
        ("p_request_key", ""),
        ("p_mode", ""),
        ("p_summary_settings", "::jsonb"),
        ("p_now", "::timestamptz"),
    ),
    "read_meeting_closing": (("p_meeting_id", "::uuid"),),
    "mark_closing_stage": (
        ("p_closing_id", "::uuid"),
        ("p_expected_stage", ""),
        ("p_next_stage", ""),
        ("p_now", "::timestamptz"),
    ),
    "fail_meeting_closing": (
        ("p_closing_id", "::uuid"),
        ("p_expected_stage", ""),
        ("p_error_code", ""),
        ("p_error_message", ""),
        ("p_now", "::timestamptz"),
    ),
    "retry_meeting_closing": (
        ("p_closing_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "reject_meeting_closing": (
        ("p_closing_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "abort_meeting_closing": (
        ("p_closing_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "complete_meeting_closing": (
        ("p_closing_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "archive_meeting_guarded": (
        ("p_meeting_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "unarchive_meeting_guarded": (
        ("p_meeting_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "append_user_message": (
        ("p_meeting_id", "::uuid"),
        ("p_message", "::jsonb"),
        ("p_now", "::timestamptz"),
    ),
    "start_closing_voting": (
        ("p_closing_id", "::uuid"),
        ("p_now", "::timestamptz"),
    ),
    "begin_closing_vote_attempt": (
        ("p_closing_id", "::uuid"),
        ("p_participant_id", "::uuid"),
        ("p_attempt_id", "::uuid"),
        ("p_lease_seconds", "::integer"),
        ("p_provider", ""),
        ("p_model", ""),
        ("p_settings", "::jsonb"),
        ("p_now", "::timestamptz"),
    ),
    "finish_closing_vote_attempt": (
        ("p_closing_id", "::uuid"),
        ("p_participant_id", "::uuid"),
        ("p_attempt_id", "::uuid"),
        ("p_provider", ""),
        ("p_model", ""),
        ("p_status", ""),
        ("p_vote", "::boolean"),
        ("p_reason", ""),
        ("p_usage", "::jsonb"),
        ("p_usage_kind", ""),
        ("p_price_kind", ""),
        ("p_estimated_cost", "::numeric"),
        ("p_reported_cost", "::numeric"),
        ("p_error_code", ""),
        ("p_error_message", ""),
        ("p_now", "::timestamptz"),
    ),
    "reserve_closing_summary_attempt": (
        ("p_closing_id", "::uuid"),
        ("p_attempt_id", "::uuid"),
        ("p_lease_seconds", "::integer"),
        ("p_now", "::timestamptz"),
    ),
    "save_closing_summary_checkpoint": (
        ("p_closing_id", "::uuid"),
        ("p_attempt_id", "::uuid"),
        ("p_summary_text", ""),
        ("p_provider", ""),
        ("p_model", ""),
        ("p_purpose", ""),
        ("p_usage", "::jsonb"),
        ("p_usage_kind", ""),
        ("p_price_kind", ""),
        ("p_estimated_cost", "::numeric"),
        ("p_reported_cost", "::numeric"),
        ("p_now", "::timestamptz"),
    ),
    "read_persona_creation_snapshot": (("p_persona_id", ""),),
    "create_persona_transaction": (
        ("p_persona_id", ""),
        ("p_name", ""),
        ("p_subtitle", ""),
        ("p_color", ""),
        ("p_avatar_url", ""),
        ("p_provider_config", "::jsonb"),
        ("p_is_default", ""),
        ("p_user_id", ""),
        ("p_prompt_id", ""),
        ("p_system_prompt", ""),
        ("p_created_at", "::timestamptz"),
        ("p_stack_ids", "::uuid[]"),
    ),
    "update_persona_transaction": (
        ("p_persona_id", ""),
        ("p_name", ""),
        ("p_subtitle", ""),
        ("p_color", ""),
        ("p_avatar_url", ""),
        ("p_provider_config", "::jsonb"),
        ("p_stack_ids", "::uuid[]"),
        ("p_expected_updated_at", "::timestamptz"),
        ("p_updated_at", "::timestamptz"),
    ),
}


def _adapt_rpc_value(value, cast: str):
    """Adapt a Python rpc parameter per its declared PG cast."""
    if cast == "::jsonb":
        return Json(value) if isinstance(value, (dict, list)) else value
    if cast == "::jsonb[]":
        return [Json(item) for item in value]
    return value


def _adapt_value(value):
    """Adapt Python payloads to psycopg for JSONB-aware inserts/updates.

    PostgREST accepts nested JSON objects for jsonb columns; raw dicts cannot
    be adapted by psycopg on their own.
    """
    if isinstance(value, (dict, list)):
        return Json(value)
    return value


def _postgrest_json(value):
    """Shape values like a PostgREST JSON response (uuids/datetimes -> strings).

    Recursive: pyscopg decodes jsonb columns (or a jsonb-returning RPC) as
    nested Python dicts/lists which still hold raw UUID/datetime objects.
    """
    if isinstance(value, uuid_module.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _postgrest_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_postgrest_json(v) for v in value]
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
        self._single: bool = False
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

    def is_(self, column: str, value) -> "_Table":
        """supabase-py `.is_()`: NULL/boolean membership check."""
        if not _IDENT.match(column):
            raise ValueError(f"Unsafe column: {column}")
        if value is None:
            self._conditions.append(f"{column} IS NULL")
        elif value is True:
            self._conditions.append(f"{column} IS TRUE")
        elif value is False:
            self._conditions.append(f"{column} IS FALSE")
        else:
            self._conditions.append(f"{column} = %s")
            self._params.append(value)
        return self

    def like(self, column: str, pattern: str) -> "_Table":
        if not _IDENT.match(column):
            raise ValueError(f"Unsafe column: {column}")
        self._conditions.append(f"{column} LIKE %s")
        self._params.append(pattern)
        return self

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

    def single(self) -> "_Table":
        """PostgREST `media=single`-like shape: scalar row (or None) instead
        of a list."""
        self._single = True
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
            data = _postgrest_rows(rows)
            if self._single:
                return _PostgrestResult(data[0] if data else None)
            return _PostgrestResult(data)

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
                row = conn.execute(
                    sql, [_adapt_value(v) for v in payload.values()]
                ).fetchone()
                rows.append({k: _postgrest_json(v) for k, v in row.items()})
            return _PostgrestResult(rows)

        if self._action == "update":
            cols = self._columns(conn)
            set_cols = list(self._payload[0].keys())
            for c in set_cols + cols:
                if not _IDENT.match(c):
                    raise ValueError(f"Unsafe column: {c}")
            set_sql = ", ".join(f"{c} = %s" for c in set_cols)
            update_param_list = [_adapt_value(self._payload[0][c]) for c in set_cols]
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
        if self._fn not in _RPC_SIGNATURES:
            raise ValueError(f"Stub does not implement rpc {self._fn!r}")
        signature = _RPC_SIGNATURES[self._fn]
        with psycopg.connect(self._uri, autocommit=True, row_factory=dict_row) as conn:
            placeholders = ", ".join(f"%s{cast}" for _, cast in signature)
            args = tuple(
                _adapt_rpc_value(self._params.get(name), cast) for name, cast in signature
            )
            rows = conn.execute(
                f"SELECT * FROM {self._fn}({placeholders})",
                args,
            ).fetchall()
            if len(rows) == 1 and len(rows[0]) == 1:
                # Scalar (jsonb/void) return: PostgREST exposes the value
                # itself, not a row keyed by the function name.
                data = _postgrest_json(next(iter(rows[0].values())))
            else:
                data = _postgrest_rows(rows)
            return _PostgrestResult(data)


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
