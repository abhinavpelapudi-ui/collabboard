from pydantic import BaseModel

from app.models.board_objects import BoardAction


# ── Agent Command ────────────────────────────────────────────────────────────

class AgentCommandRequest(BaseModel):
    command: str
    board_id: str
    board_state: list[dict] = []
    attachments: list[dict] = []  # [{"fileId": "...", "fileName": "..."}]
    user_id: str = ""
    model: str = ""  # LLM model_id (e.g. "gpt-4o-mini", "claude-haiku")


class AgentCommandResponse(BaseModel):
    success: bool
    message: str
    actions: list[BoardAction]
    actions_performed: list[str] = []
    trace_id: str = ""
    fit_to_view: bool = False


# ── Document Upload ──────────────────────────────────────────────────────────

class DocumentUploadResponse(BaseModel):
    document_id: str
    file_name: str
    file_type: str
    preview: str  # First 500 chars of extracted text
    metadata: dict  # page_count, word_count, etc.


# ── Dashboard Navigator ─────────────────────────────────────────────────────

class DashboardQueryRequest(BaseModel):
    command: str
    boards: list[dict] = []  # [{id, title, object_count, object_types, content_preview}]
    user_id: str = ""
    model: str = ""


class DashboardQueryResponse(BaseModel):
    message: str
    board_id: str | None = None
    board_title: str | None = None


# ── Chart Generation (used internally by agent tools) ────────────────────────

class ChartRequest(BaseModel):
    chart_type: str  # bar, pie, line, scatter
    data: dict
    title: str
    x_label: str = ""
    y_label: str = ""
    width_px: int = 600
    height_px: int = 400


# ── Sprint Board (used internally by agent tools) ────────────────────────────

class SprintBoardRequest(BaseModel):
    source_text: str
    sprint_name: str = "Sprint 1"
    column_names: list[str] = ["Backlog", "To Do", "In Progress", "Review", "Done"]
