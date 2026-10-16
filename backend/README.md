# Sabha Backend

Python FastAPI backend for the Sabha multi-agent AI advisory board.

## Setup

```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Run server (app is constructed via app/factory.py:create_app)
uvicorn main:app --reload
```

## Database

Run `supabase_schema.sql` as the base bootstrap in Supabase SQL Editor,
then apply `migrations/002-007` in numeric order (personas, knowledge
stacks, meeting lifecycle, persona configuration, knowledge durability,
demo sessions).

## Testing

```bash
# Offline fast suite (default: integration deselected via pytest.ini)
python -m pytest -m "not integration"

# Isolated-infrastructure suite (needs Qdrant/Supabase available)
python -m pytest -m integration
```

The regression ledger (`tests/regression/test_ledger.py`) pins all eleven
B-01..B-11 defects closed with passing tests; no xfail/skip markers remain
(`xfail_strict = true` stays on as a guard).

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.
