"""Demo runtime bounds (D-02/D-10 finalized values + documented local caps).

D-02: idle expiry 2h, absolute lifetime 24h.
D-10: 1 scenario/session, 100 actions/session, 30 writes/min.
Local caps below are chosen Phase 08 values for the single-process fixture
runtime, recorded here (not D-decisions): at most 100 live sessions, at
most 20 creations/hour per creation key, bounded idempotency history, and a
request-payload budget mirroring the queue content budget.
"""

# --- Decided inputs (D-02 / D-10; do not retune without a new decision) ---
IDLE_TIMEOUT_S = 2 * 60 * 60
ABSOLUTE_LIFETIME_S = 24 * 60 * 60
MAX_SCENARIOS_PER_SESSION = 1
MAX_ACTIONS_PER_SESSION = 100
WRITE_WINDOW_S = 60
MAX_WRITES_PER_MINUTE = 30

# --- Phase 08 local caps (documented choices for the fixture runtime) ---
MAX_ACTIVE_SESSIONS = 100
CREATION_WINDOW_S = 60 * 60
MAX_SESSION_CREATIONS_PER_HOUR = 20
MAX_ACTION_PAYLOAD_CHARS = 8000
MAX_RESET_KEYS_PER_SESSION = 32
