from pydantic_settings import BaseSettings


class Settings(BaseSettings):
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
    max_agent_iterations: int = 10

    class Config:
        env_file = ".env"


settings = Settings()
