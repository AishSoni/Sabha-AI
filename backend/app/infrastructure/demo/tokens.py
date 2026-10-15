"""Opaque demo-session tokens (D-07).

Tokens carry 256 bits of `secrets` entropy, travel once (issuance
response + `Authorization: Bearer` header), and rest only as SHA-256
hashes. Verification is constant-time. No token-derived value is ever
logged; see `observability.log_event`, whose signature has no token
parameter by design.
"""

import hashlib
import hmac
import secrets

TOKEN_BYTES = 32


def issue_token() -> str:
    """Mint one opaque bearer token (256-bit entropy, URL-safe)."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    """Hash a token for storage; the raw value never rests server-side."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(token: str, token_hash: str) -> bool:
    """Constant-time check of a presented token against a stored hash."""
    if not token or not token_hash:
        return False
    return hmac.compare_digest(hash_token(token), token_hash)
