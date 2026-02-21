"""Supported LLM models and their provider metadata."""

from dataclasses import dataclass
from typing import Literal

Provider = Literal["groq", "openai", "anthropic"]


@dataclass(frozen=True)
class ModelSpec:
    model_id: str
    provider: Provider
    display_name: str
    api_model_name: str
    temperature: float = 0.1
    is_free: bool = False


SUPPORTED_MODELS: dict[str, ModelSpec] = {
    "llama-3.3-70b-versatile": ModelSpec(
        model_id="llama-3.3-70b-versatile",
        provider="groq",
        display_name="Llama 3.3 70B (Groq, free)",
        api_model_name="llama-3.3-70b-versatile",
        is_free=True,
    ),
    "gpt-4o-mini": ModelSpec(
        model_id="gpt-4o-mini",
        provider="openai",
        display_name="GPT-4o Mini (OpenAI)",
        api_model_name="gpt-4o-mini",
    ),
    "gpt-4o": ModelSpec(
        model_id="gpt-4o",
        provider="openai",
        display_name="GPT-4o (OpenAI)",
        api_model_name="gpt-4o",
    ),
    "claude-haiku": ModelSpec(
        model_id="claude-haiku",
        provider="anthropic",
        display_name="Claude Haiku (Anthropic)",
        api_model_name="claude-haiku-4-5-20251001",
    ),
    "claude-sonnet": ModelSpec(
        model_id="claude-sonnet",
        provider="anthropic",
        display_name="Claude Sonnet (Anthropic)",
        api_model_name="claude-sonnet-4-5-20250929",
    ),
}

DEFAULT_MODEL_ID = "llama-3.3-70b-versatile"


def get_model_spec(model_id: str) -> ModelSpec:
    """Return the ModelSpec for a given model_id, falling back to default."""
    return SUPPORTED_MODELS.get(model_id, SUPPORTED_MODELS[DEFAULT_MODEL_ID])
