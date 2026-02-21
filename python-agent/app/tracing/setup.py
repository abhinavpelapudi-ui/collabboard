import os
import logging

from langfuse import Langfuse

from app.config import settings

logger = logging.getLogger(__name__)

langfuse_client: Langfuse | None = None


def init_tracing():
    """Initialize both LangSmith and LangFuse tracing."""
    global langfuse_client

    # LangSmith: auto-traced by LangChain when env vars are set
    os.environ["LANGCHAIN_TRACING_V2"] = settings.langchain_tracing_v2
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project

    if settings.langchain_api_key:
        logger.info("LangSmith tracing enabled (project: %s)", settings.langchain_project)
    else:
        logger.warning("LangSmith tracing disabled — LANGCHAIN_API_KEY not set")

    # LangFuse: explicit client for callback handler
    if settings.langfuse_secret_key and settings.langfuse_public_key:
        langfuse_client = Langfuse(
            secret_key=settings.langfuse_secret_key,
            public_key=settings.langfuse_public_key,
            host=settings.langfuse_host,
        )
        logger.info("LangFuse tracing enabled (host: %s)", settings.langfuse_host)
    else:
        logger.warning("LangFuse tracing disabled — keys not set")


def shutdown_tracing():
    global langfuse_client
    if langfuse_client:
        langfuse_client.flush()
        langfuse_client.shutdown()
        langfuse_client = None


def get_langfuse_handler():
    """Get a LangFuse callback handler for LangChain agent invocations."""
    if not settings.langfuse_secret_key or not settings.langfuse_public_key:
        return None

    try:
        from langfuse.callback import CallbackHandler
    except ImportError:
        try:
            from langfuse.langchain import CallbackHandler
        except ImportError:
            logger.warning("LangFuse callback handler not available — skipping")
            return None

    # Newer langfuse versions read from env vars automatically
    try:
        return CallbackHandler(
            secret_key=settings.langfuse_secret_key,
            public_key=settings.langfuse_public_key,
            host=settings.langfuse_host,
        )
    except TypeError:
        return CallbackHandler()
