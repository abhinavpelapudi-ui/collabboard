from fastapi import APIRouter

from app.tracing.cost_tracker import cost_tracker

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "collabboard-agent"}


@router.get("/agent/costs")
async def get_costs():
    return cost_tracker.get_summary()
