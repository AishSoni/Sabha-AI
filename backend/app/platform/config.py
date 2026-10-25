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
    # Trusted destinations for user-provided Ollama origins (SSRF guard for
    # settings probes). Comma-separated; empty falls back to the origin of
    # ollama_base_url itself. Hostnames are pinned to resolved IPs.
    ollama_allowed_origins: str = ""
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
    runtime_mode: str = "local"  # local | hosted | demo - demo denies writes
    cors_origins: List[str] = ["http://localhost:3000"]

    # Durable knowledge (spec 09)
    knowledge_bucket: str = "knowledge-sources"

    # Durable turn queue (spec 07)
    turn_max_queued_per_meeting: int = 10
    turn_global_concurrency: int = 1
    turn_lease_seconds: int = 60
    turn_poll_seconds: float = 0.5
    turn_runner_enabled: bool = True
    turn_execution_timeout_seconds: int = 300

    # Coordinated closing (spec 08)
    closing_attempt_lease_seconds: int = 120
    closing_drain_timeout_seconds: int = 300
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
