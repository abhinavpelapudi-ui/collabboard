import sys

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    groq_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    langchain_api_key: str = ""
    langchain_tracing_v2: str = "true"
    langchain_project: str = "collabboard-agent"
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_host: str = "https://us.cloud.langfuse.com"
    chroma_persist_dir: str = "/app/chroma_data"
    agent_shared_secret: str = ""
    max_agent_iterations: int = Field(default=10, ge=1, le=50)


settings = Settings()

# Reject startup if agent_shared_secret is empty — prevents auth bypass
if not settings.agent_shared_secret:
    print("FATAL: AGENT_SHARED_SECRET environment variable must be set", file=sys.stderr)
    sys.exit(1)
