from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Supabase
    supabase_url: str
    supabase_key: str
    supabase_service_key: str = ""
    
    # OpenRouter
    openrouter_api_key: str = ""
    openrouter_default_model: str = "anthropic/claude-sonnet-4-20250514"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    
    # Ollama (local)
    ollama_base_url: str = "http://localhost:11434"
    ollama_default_model: str = "llama3.2"
    
    # Gemini (Google)
    gemini_api_key: str = ""
    gemini_default_model: str = "gemini-1.5-flash"
    
    # Default provider: "openrouter", "ollama", or "gemini"
    default_llm_provider: str = "ollama"
    
    # Qdrant Vector DB (deployment agnostic - same config for cloud or local)
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""  # Only needed for Qdrant Cloud
    
    # Embedding settings
    # Providers: "gemini", "openai", "cohere", "ollama"
    embedding_provider: str = "ollama"
    embedding_model: str = "nomic-embed-text"  # Default for Ollama
    embedding_dimension: int = 768  # Depends on model
    
    # OpenAI (for embeddings if using OpenAI provider)
    openai_api_key: str = ""
    
    # Cohere (for embeddings if using Cohere provider)
    cohere_api_key: str = ""
    
    # App
    app_env: str = "development"
    cors_origins: List[str] = ["http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
