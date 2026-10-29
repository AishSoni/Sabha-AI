"""Tunable replay constants: pacing, stream bounds, package limits, defaults.

These are server policy and authoring pacing, not package-format versions or
authored content. IDs, dates, copy and claim text stay in the package builder,
because changing them changes the package content hash and requires an explicit
rebuild and republish.

This module must stay import-free: ``app.platform.config`` uses these values as
its defaults, so importing application code here would create a cycle.

Recorded delays are produced by the package builder (see the ``DELAY_*`` and
``TEXT_CHUNK_CHARS`` values below) and clamped at serving time by
``STREAM_MAX_DELAY_MS``. Keep the clamp and the authored values distinct: the
first is a server safety policy, the second is demo content.
"""

# --- Paced recorded SSE (spec-17) -------------------------------------------
# Every recorded event carries an intended delay; the server caps it so one
# tape cannot hold a stream open indefinitely.
STREAM_MAX_DELAY_MS = 2000
STREAM_MAX_BYTES = 256 * 1024
STREAM_MAX_SECONDS = 120.0
STREAM_MAX_GLOBAL = 8
STREAM_MAX_PER_CLIENT = 2

# --- Followers and paging ---------------------------------------------------
# Replay reads immutable tapes once and never polls the database per token.
TURN_LIST_LIMIT = 100
REPLAY_FOLLOWER_POLL_SECONDS = 0.01

# --- Package and tape bounds ------------------------------------------------
MAX_PACKAGE_BYTES = 25 * 1024 * 1024
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 500
MAX_TAPE_EVENTS = 400
# The read-side SQL limit is deliberately >= the validation ceiling so a valid
# tape can never be truncated by the reader.
TAPE_READ_LIMIT = 500
MAX_TAPE_BYTES = 200_000
TAPE_DELAY_CEILING_MS = 10_000
SOURCE_LOAD_CONCURRENCY = 8

# --- Cache, pool and storage defaults ---------------------------------------
CACHE_MAX_ENTRIES = 256
REGISTRY_TTL_SECONDS = 30.0
STATUS_TTL_SECONDS = 30.0
POOL_MIN_SIZE = 2
POOL_MAX_SIZE = 8
POOL_TIMEOUT_SECONDS = 5.0
POOL_RECONNECT_SECONDS = 5.0
STORAGE_TIMEOUT_SECONDS = 30.0

# --- Guided package authoring pacing ----------------------------------------
TEXT_CHUNK_CHARS = 150
DELAY_TOOL_CALL_MS = 100
DELAY_TOOL_RESULT_MS = 120
DELAY_CITATION_MS = 60
DELAY_THINKING_MS = 60
DELAY_TEXT_MS = 60
DELAY_DONE_MS = 80
DELAY_BALLOT_PROVISIONAL_MS = 80
DELAY_BALLOT_TERMINAL_MS = 100
DELAY_SUMMARY_PROVISIONAL_MS = 100
DELAY_SUMMARY_TERMINAL_MS = 120
