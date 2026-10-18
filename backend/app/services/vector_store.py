"""
Vector store service for Qdrant collection management.
Handles document indexing, semantic search, and collection lifecycle.
"""

from dataclasses import dataclass
from typing import List, Optional
import uuid

from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

from app.core.qdrant import get_qdrant_client
from app.core.config import settings
from app.services.embedding import get_embedding_provider, EmbeddingProvider
from app.services.document_processor import DocumentChunk


@dataclass
class SearchResult:
    """Result from a semantic search query."""
    text: str
    score: float
    document_id: str
    chunk_index: int
    metadata: dict


class VectorStoreManager:
    """
    Manages Qdrant collections for document storage and retrieval.
    
    Collection naming convention:
    - Shared meeting documents: meeting_{meeting_id}_shared
    - Private persona knowledge: persona_{persona_id}_knowledge
    """
    
    def __init__(self, embedding_provider: EmbeddingProvider | None = None):
        """
        Initialize the vector store manager.
        
        Args:
            embedding_provider: Optional custom embedding provider. Defaults to settings.
        """
        self._embedding_provider = embedding_provider
    
    @property
    def client(self):
        """Lazy access to Qdrant client (avoids stale singleton on reload)."""
        return get_qdrant_client()
    
    @property
    def embedding_provider(self) -> EmbeddingProvider:
        """Lazy initialization of embedding provider."""
        if self._embedding_provider is None:
            self._embedding_provider = get_embedding_provider()
        return self._embedding_provider
    
    @staticmethod
    def meeting_collection_name(meeting_id: str) -> str:
        """Get collection name for meeting shared documents."""
        return f"meeting_{meeting_id}_shared"
    
    @staticmethod
    def persona_collection_name(persona_id: str) -> str:
        """Get collection name for persona private knowledge."""
        return f"persona_{persona_id}_knowledge"

    @staticmethod
    def stack_collection_name(stack_id: str) -> str:
        """Get collection name for a knowledge stack."""
        return f"stack_{stack_id}_knowledge"
    
    async def create_collection(self, collection_name: str) -> bool:
        """Create a Qdrant collection if it doesn't exist.

        Race-safe: when creation loses a race (another worker created the
        collection between the listing and our create), the manager re-reads
        the collection and validates its vector configuration instead of
        failing with the server's "already exists" error. Only a collection
        that truly materialized counts as benign.

        Raises:
            ValueError: an existing collection's vector configuration cannot
                accept vectors from the current embedding provider. Producing
                a controlled diagnostic here prevents obscure server errors
                at upsert time.
        Returns:
            True if created now, False if it already existed compatibly.
        """
        # Check if collection exists
        if await self.collection_exists(collection_name):
            await self._validate_collection_config(collection_name)
            return False

        # Create collection with embedding dimension
        try:
            await self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=self.embedding_provider.dimension,
                    distance=Distance.COSINE,
                ),
            )
        except Exception:
            # Losing a creation race ends up here; only treat the collection
            # as benign if it actually exists now (still validates its config).
            if await self.collection_exists(collection_name):
                await self._validate_collection_config(collection_name)
                return False
            raise
        return True

    async def _validate_collection_config(self, collection_name: str) -> None:
        """Raise a controlled ValueError when an existing collection cannot
        accept vectors from the current embedding provider."""
        requested_size = self.embedding_provider.dimension
        info = await self.client.get_collection(collection_name)
        vectors = getattr(
            getattr(getattr(info, "config", None), "params", None), "vectors", None
        )
        if vectors is None:
            raise ValueError(
                f"Collection {collection_name!r} returned an unreadable vector "
                "configuration; refusing to index into it."
            )
        size = getattr(vectors, "size", None)
        if size != requested_size:
            raise ValueError(
                f"Collection {collection_name!r} was created with vector dimension "
                f"{size}, but the current embedding provider produces "
                f"{requested_size}-dimension vectors. Upserts into this collection "
                "would be rejected; re-index its documents into a rebuilt collection."
            )
        try:
            found_distance = Distance(vectors.distance)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Collection {collection_name!r} uses vector distance "
                f"{vectors.distance!r}, which the backend cannot interpret."
            ) from exc
        if found_distance != Distance.COSINE:
            raise ValueError(
                f"Collection {collection_name!r} uses distance "
                f"{found_distance.value}, but the backend requires cosine similarity."
            )
    
    async def delete_collection(self, collection_name: str) -> bool:
        """
        Delete a Qdrant collection.
        
        Args:
            collection_name: Name of the collection to delete
            
        Returns:
            True if deleted, False if didn't exist
        """
        try:
            await self.client.delete_collection(collection_name=collection_name)
            return True
        except Exception:
            return False
    
    async def collection_exists(self, collection_name: str) -> bool:
        """Check if a collection exists."""
        collections = await self.client.get_collections()
        return collection_name in [c.name for c in collections.collections]
    
    async def index_document(
        self,
        collection_name: str,
        document_id: str,
        chunks: List[DocumentChunk],
    ) -> int:
        """
        Index document chunks into a Qdrant collection.
        
        Args:
            collection_name: Target collection
            document_id: Unique document identifier
            chunks: List of document chunks to index
            
        Returns:
            Number of chunks indexed
        """
        if not chunks:
            return 0
        
        # Ensure collection exists
        await self.create_collection(collection_name)
        
        # Generate embeddings for all chunks
        texts = [chunk.text for chunk in chunks]
        embeddings = await self.embedding_provider.embed_batch(texts)
        
        # Create points with metadata
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "document_id": document_id,
                        "text": chunk.text,
                        "chunk_index": chunk.chunk_index,
                        **chunk.metadata,
                    },
                )
            )
        
        # Upsert points into collection
        await self.client.upsert(collection_name=collection_name, points=points)
        
        return len(points)
    
    async def search(
        self,
        collection_name: str,
        query: str,
        limit: int = 5,
        document_id: Optional[str] = None,
    ) -> List[SearchResult]:
        """
        Perform semantic search on a collection.
        
        Args:
            collection_name: Collection to search
            query: Search query text
            limit: Maximum number of results
            document_id: Optional filter to specific document
            
        Returns:
            List of SearchResult objects ordered by relevance
        """
        # Check if collection exists
        if not await self.collection_exists(collection_name):
            return []
        
        # Generate query embedding
        query_embedding = await self.embedding_provider.embed_text(query)
        
        # Build filter if document_id specified
        search_filter = None
        if document_id:
            search_filter = Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            )
        
        # Perform search (query_points is the supported API from qdrant-client 1.16)
        response = await self.client.query_points(
            collection_name=collection_name,
            query=query_embedding,
            query_filter=search_filter,
            limit=limit,
            with_payload=True,
        )
        results = response.points
        
        return [
            SearchResult(
                text=r.payload.get("text", ""),
                score=r.score,
                document_id=r.payload.get("document_id", ""),
                chunk_index=r.payload.get("chunk_index", 0),
                metadata={k: v for k, v in r.payload.items() if k not in ["text", "document_id", "chunk_index"]},
            )
            for r in results
        ]
    
    async def search_multiple_collections(
        self,
        collection_names: List[str],
        query: str,
        limit: int = 5,
    ) -> List[SearchResult]:
        """
        Search across multiple collections and merge results.
        
        Args:
            collection_names: List of collections to search
            query: Search query text
            limit: Maximum total results
            
        Returns:
            Merged and re-ranked results
        """
        all_results = []
        
        for collection_name in collection_names:
            results = await self.search(collection_name, query, limit=limit)
            all_results.extend(results)
        
        # Sort by score and take top results
        all_results.sort(key=lambda r: r.score, reverse=True)
        return all_results[:limit]
    
    async def delete_document(
        self,
        collection_name: str,
        document_id: str,
    ) -> int:
        """
        Delete all chunks belonging to a document.
        
        Args:
            collection_name: Collection containing the document
            document_id: Document ID to delete
            
        Returns:
            Number of points deleted
        """
        if not await self.collection_exists(collection_name):
            return 0
        
        # Delete points by document_id filter
        result = await self.client.delete(
            collection_name=collection_name,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
        )
        
        return getattr(result, "deleted_count", 0)
    
    async def get_collection_stats(self, collection_name: str) -> dict:
        """Get statistics about a collection."""
        if not await self.collection_exists(collection_name):
            return {"exists": False}
        
        info = await self.client.get_collection(collection_name=collection_name)
        return {
            "exists": True,
            "points_count": info.points_count,
            "vectors_count": info.vectors_count,
            "indexed_vectors_count": info.indexed_vectors_count,
        }


# Singleton instance
_vector_store: VectorStoreManager | None = None


def get_vector_store() -> VectorStoreManager:
    """Get or create the vector store manager instance."""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStoreManager()
    return _vector_store
