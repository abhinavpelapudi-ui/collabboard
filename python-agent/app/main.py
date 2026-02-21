from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.tracing.setup import init_tracing, shutdown_tracing
from app.routes.agent_routes import router as agent_router
from app.routes.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_tracing()
    yield
    shutdown_tracing()


app = FastAPI(title="CollabBoard AI Agent", version="1.0.0", lifespan=lifespan)

app.include_router(health_router)
app.include_router(agent_router, prefix="/agent")
