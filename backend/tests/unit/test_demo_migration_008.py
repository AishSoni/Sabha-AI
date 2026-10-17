"""Migration 008 contract: real scenario permitted, progress table added."""


def test_migration_008_allows_real_scenario_and_progress_table():
    from pathlib import Path

    sql_path = Path(__file__).resolve().parents[2] / "migrations" / "008_demo_bond_scenario.sql"
    sql = sql_path.read_text()
    assert "indian-corporate-bond-review" in sql
    assert "demo_scenario_progress" in sql
    assert "synthetic-%" in sql
