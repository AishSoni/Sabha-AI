"""
Qdrant client connection utility.
Provides a singleton async client for vector database operations.
"""

from qdrant_client import AsyncQdrantClient
from app.core.config import settings

# Singleton client instance
_client: AsyncQdrantClient | None = None


def get_qdrant_client() -> AsyncQdrantClient:
    """
    Get or create the Qdrant async client instance.
    The client is deployment agnostic - same interface for cloud or local.
    """
    global _client
    
    if _client is None:
        if settings.qdrant_api_key:
            # Qdrant Cloud
            _client = AsyncQdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key,
            )
        else:
            # Local Qdrant (no API key needed)
            _client = AsyncQdrantClient(url=settings.qdrant_url)
    
    return _client


async def close_qdrant_client() -> None:
    """Close the Qdrant client connection."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None
