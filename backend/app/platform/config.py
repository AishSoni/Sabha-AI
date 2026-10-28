from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings
from typing import List


RUNTIME_MODES = ("local", "hosted", "demo")
SUPPORTED_LLM_PROVIDERS = ("ollama", "openrouter", "gemini")
SUPPORTED_EMBEDDING_PROVIDERS = ("gemini", "openai", "cohere", "ollama")


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Supabase. Required for live composition; a replay-only process may start
    # without live credentials and is validated by ``validate_live_config``.
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_key: str = ""
    # Direct/session PostgreSQL URL used by the operator scripts and restore.
    database_url: str = ""
    # Server-only replay reader URL (dedicated LOGIN role, never the live
    # service credential). Empty until a strict replay runtime is configured.
    replay_database_url: str = ""
    
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
    # Serve only the recorded replay graph. No live container, recovery
    # workers, Qdrant, providers, or service-role client is constructed.
    replay_only: bool = False
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

    @field_validator("runtime_mode")
    @classmethod
    def validate_runtime_mode(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in RUNTIME_MODES:
            raise ValueError(
                f"runtime_mode must be one of {', '.join(RUNTIME_MODES)}"
            )
        return normalized

    @model_validator(mode="after")
    def validate_live_config(self):
        if not self.replay_only and (not self.supabase_url or not self.supabase_key):
            raise ValueError(
                "SUPABASE_URL and SUPABASE_KEY are required unless REPLAY_ONLY=true"
            )
        return self

    @field_validator("default_llm_provider")
    @classmethod
    def validate_default_llm_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in SUPPORTED_LLM_PROVIDERS:
            raise ValueError(
                "default_llm_provider must be one of "
                f"{', '.join(SUPPORTED_LLM_PROVIDERS)}"
            )
        return normalized

    @field_validator("embedding_provider")
    @classmethod
    def validate_embedding_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in SUPPORTED_EMBEDDING_PROVIDERS:
            raise ValueError(
                "embedding_provider must be one of "
                f"{', '.join(SUPPORTED_EMBEDDING_PROVIDERS)}"
            )
        return normalized

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
