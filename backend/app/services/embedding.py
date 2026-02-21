"""
Embedding service for text-to-vector conversion.
Supports multiple providers: Gemini, OpenAI, Cohere, and Ollama.
"""

from abc import ABC, abstractmethod
from typing import List
import httpx

from app.core.config import settings


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""
    
    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return the embedding dimension for this provider/model."""
        pass
    
    @abstractmethod
    async def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        pass
    
    @abstractmethod
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        pass


class GeminiEmbedding(EmbeddingProvider):
    """Google Gemini embedding provider."""
    
    # Model dimensions mapping
    MODEL_DIMENSIONS = {
        "text-embedding-004": 768,
        "embedding-001": 768,
    }
    
    def __init__(self, model: str = "text-embedding-004"):
        self.model = model
        self.api_key = settings.gemini_api_key
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required for Gemini embeddings")
    
    @property
    def dimension(self) -> int:
        return self.MODEL_DIMENSIONS.get(self.model, 768)
    
    async def embed_text(self, text: str) -> List[float]:
        result = await self.embed_batch([text])
        return result[0]
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        url = f"{self.base_url}/models/{self.model}:batchEmbedContents"
        
        requests = [{"model": f"models/{self.model}", "content": {"parts": [{"text": t}]}} for t in texts]
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                params={"key": self.api_key},
                json={"requests": requests},
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
        
        return [emb["values"] for emb in data["embeddings"]]


class OpenAIEmbedding(EmbeddingProvider):
    """OpenAI embedding provider."""
    
    MODEL_DIMENSIONS = {
        "text-embedding-3-small": 1536,
        "text-embedding-3-large": 3072,
        "text-embedding-ada-002": 1536,
    }
    
    def __init__(self, model: str = "text-embedding-3-small"):
        self.model = model
        self.api_key = settings.openai_api_key
        self.base_url = "https://api.openai.com/v1"
        
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI embeddings")
    
    @property
    def dimension(self) -> int:
        return self.MODEL_DIMENSIONS.get(self.model, 1536)
    
    async def embed_text(self, text: str) -> List[float]:
        result = await self.embed_batch([text])
        return result[0]
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        url = f"{self.base_url}/embeddings"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": texts},
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
        
        # Sort by index to ensure correct order
        embeddings = sorted(data["data"], key=lambda x: x["index"])
        return [emb["embedding"] for emb in embeddings]


class CohereEmbedding(EmbeddingProvider):
    """Cohere embedding provider."""
    
    MODEL_DIMENSIONS = {
        "embed-english-v3.0": 1024,
        "embed-multilingual-v3.0": 1024,
        "embed-english-light-v3.0": 384,
        "embed-multilingual-light-v3.0": 384,
    }
    
    def __init__(self, model: str = "embed-english-v3.0"):
        self.model = model
        self.api_key = settings.cohere_api_key
        self.base_url = "https://api.cohere.ai/v1"
        
        if not self.api_key:
            raise ValueError("COHERE_API_KEY is required for Cohere embeddings")
    
    @property
    def dimension(self) -> int:
        return self.MODEL_DIMENSIONS.get(self.model, 1024)
    
    async def embed_text(self, text: str) -> List[float]:
        result = await self.embed_batch([text])
        return result[0]
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        url = f"{self.base_url}/embed"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "texts": texts,
                    "input_type": "search_document",  # or "search_query" for queries
                    "truncate": "END"
                },
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
        
        return data["embeddings"]


class OllamaEmbedding(EmbeddingProvider):
    """Ollama local embedding provider."""
    
    MODEL_DIMENSIONS = {
        "nomic-embed-text": 768,
        "mxbai-embed-large": 1024,
        "all-minilm": 384,
        "snowflake-arctic-embed": 1024,
        "qwen3-embedding:0.6b": 1024,
        "qwen3-embedding": 1024,
    }
    
    def __init__(self, model: str = "nomic-embed-text"):
        self.model = model
        self.base_url = settings.ollama_base_url
    
    @property
    def dimension(self) -> int:
        return self.MODEL_DIMENSIONS.get(self.model, settings.embedding_dimension)
    
    async def embed_text(self, text: str) -> List[float]:
        url = f"{self.base_url}/api/embeddings"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"model": self.model, "prompt": text},
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
        
        return data["embedding"]
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        # Ollama doesn't have native batch support, so we do sequential calls
        # Could be optimized with asyncio.gather for parallel execution
        embeddings = []
        for text in texts:
            emb = await self.embed_text(text)
            embeddings.append(emb)
        return embeddings


def get_embedding_provider(
    provider: str | None = None, 
    model: str | None = None
) -> EmbeddingProvider:
    """
    Get an embedding provider instance.
    
    Args:
        provider: Provider name (gemini, openai, cohere, ollama). Defaults to settings.
        model: Model name. Defaults to settings.
    
    Returns:
        EmbeddingProvider instance
    """
    provider = provider or settings.embedding_provider
    model = model or settings.embedding_model
    
    providers = {
        "gemini": GeminiEmbedding,
        "openai": OpenAIEmbedding,
        "cohere": CohereEmbedding,
        "ollama": OllamaEmbedding,
    }
    
    if provider not in providers:
        raise ValueError(f"Unknown embedding provider: {provider}. Supported: {list(providers.keys())}")
    
    return providers[provider](model=model)
