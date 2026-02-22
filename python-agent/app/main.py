from fastapi import FastAPI
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.tracing.setup import init_tracing, shutdown_tracing
from app.routes.agent_routes import router as agent_router
from app.routes.health import router as health_router
from app.config import settings


class AgentAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        secret = request.headers.get("x-agent-secret", "")
        if settings.agent_shared_secret and secret != settings.agent_shared_secret:
            return JSONResponse(status_code=403, content={"error": "Forbidden"})
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_tracing()
    yield
    shutdown_tracing()


app = FastAPI(title="CollabBoard AI Agent", version="1.0.0", lifespan=lifespan)

app.add_middleware(AgentAuthMiddleware)

app.include_router(health_router)
app.include_router(agent_router, prefix="/agent")
