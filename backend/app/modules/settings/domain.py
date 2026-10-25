"""Settings domain values shared by the HTTP and persistence layers."""

from pydantic import BaseModel, Field, field_validator


class SystemAIConfig(BaseModel):
    """Configuration for the System AI used for app-level functions.

    The empty provider means "use the environment default"; an empty model
    means "use the provider's default model". Values are validated here
    because this model is both the persisted server state and the mutation
    request body, so an invalid policy can never be stored.
    """

    provider: str = ""  # Empty = use default
    model: str = Field("", max_length=200)  # Empty = use provider default
    temperature: float = Field(0.5, ge=0, le=1)  # Lower for consistent system tasks
    max_tokens: int = Field(2048, ge=256, le=16000)

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ("", "ollama", "openrouter", "gemini"):
            raise ValueError(
                "provider must be one of: '', ollama, openrouter, gemini"
            )
        return normalized

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        return value.strip()
