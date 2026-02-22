"""Agent API routes — the main interface between Node.js and the Python agent."""

import asyncio
import uuid
import logging

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.models.schemas import (
    AgentCommandRequest, AgentCommandResponse,
    DocumentUploadResponse,
    DashboardQueryRequest, DashboardQueryResponse,
)
from app.agent.agent import run_agent, _create_llm
from app.agent.models import SUPPORTED_MODELS, DEFAULT_MODEL_ID, get_model_spec
from app.config import settings
from app.services.document_service import parse_document
from app.services.vector_store import store_document_chunks

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/command", response_model=AgentCommandResponse)
async def handle_command(request: AgentCommandRequest):
    """Process a natural language command and return board actions.

    The Node.js server forwards user commands here. The agent decides which
    tools to call, generates board actions, and returns them for Node.js
    to execute (DB writes + socket broadcasts).
    """
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    result = await asyncio.to_thread(
        run_agent,
        command=request.command,
        board_state=request.board_state,
        board_id=request.board_id,
        model_id=request.model or DEFAULT_MODEL_ID,
        project_context=request.project_context,
    )

    return AgentCommandResponse(
        success=True,
        message=result["message"],
        actions=result["actions"],
        actions_performed=result["actions_performed"],
        trace_id=result["trace_id"],
        fit_to_view=result.get("fit_to_view", False),
    )


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    board_id: str = Form(...),
):
    """Upload and parse a document (PDF, DOCX, or TXT).

    Extracts text, chunks it, and stores in ChromaDB for later RAG queries.
    Returns document metadata and a preview of the extracted content.
    """
    # Validate file type
    filename = file.filename or "unknown"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    supported_types = {"pdf", "docx", "txt"}
    if extension not in supported_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{extension}. Supported: {', '.join(supported_types)}",
        )

    # Read file
    file_bytes = await file.read()
    max_size = 10 * 1024 * 1024  # 10MB
    if len(file_bytes) > max_size:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")

    # Parse document
    try:
        parsed = parse_document(file_bytes, extension)
    except Exception as e:
        logger.error("Failed to parse document %s: %s", filename, e)
        raise HTTPException(status_code=422, detail=f"Failed to parse document: {str(e)}")

    content = parsed["content"]
    metadata = parsed["metadata"]

    # Generate document ID
    document_id = str(uuid.uuid4())

    # Chunk text for vector store (simple fixed-size chunking)
    chunk_size = 1000
    chunk_overlap = 200
    chunks = []
    for i in range(0, len(content), chunk_size - chunk_overlap):
        chunk = content[i : i + chunk_size]
        if chunk.strip():
            chunks.append(chunk)

    # Store in ChromaDB
    if chunks:
        try:
            store_document_chunks(
                board_id=board_id,
                document_id=document_id,
                chunks=chunks,
                metadatas=[{"file_name": filename, "chunk_index": i} for i in range(len(chunks))],
            )
        except Exception as e:
            logger.error("Failed to store chunks in vector store: %s", e)
            # Non-fatal — document is still usable without RAG

    preview = content[:500] + ("..." if len(content) > 500 else "")

    return DocumentUploadResponse(
        document_id=document_id,
        file_name=filename,
        file_type=extension,
        preview=preview,
        metadata=metadata,
    )


DASHBOARD_SYSTEM_PROMPT = """You are a navigation assistant for CollabBoard. The user has multiple boards.
Given their query, help them find the right board to navigate to.

AVAILABLE BOARDS:
{boards_context}

RULES:
- If the user's query clearly matches a specific board, respond with a short friendly message and include the board_id and board_title.
- If multiple boards could match, briefly list the options and ask which one they mean.
- If no board matches, say you couldn't find a matching board and suggest they create a new one.
- Keep responses SHORT (1-2 sentences).
- ALWAYS respond in valid JSON: {{"message": "your response", "board_id": "uuid-or-null", "board_title": "title-or-null"}}
- Use null (not "null") for board_id and board_title when no single board is identified."""


@router.post("/dashboard", response_model=DashboardQueryResponse)
async def handle_dashboard_query(request: DashboardQueryRequest):
    """Match a user query against their boards and return navigation target."""
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    # Build boards context
    board_lines = []
    for b in request.boards:
        parts = [f'"{b.get("title", "Untitled")}" (id={b["id"]})']
        ws_name = b.get("workspace_name")
        if ws_name:
            parts.append(f"workspace: {ws_name}")
        obj_count = b.get("object_count", 0)
        obj_types = b.get("object_types", "")
        if obj_count:
            parts.append(f"{obj_count} objects")
        if obj_types:
            parts.append(f"types: {obj_types}")
        preview = (b.get("content_preview") or "")[:200]
        if preview:
            parts.append(f"content: {preview}")
        board_lines.append("- " + ", ".join(parts))

    boards_context = "\n".join(board_lines) if board_lines else "(No boards yet)"
    prompt = DASHBOARD_SYSTEM_PROMPT.format(boards_context=boards_context)

    spec = get_model_spec(request.model or DEFAULT_MODEL_ID)
    llm = _create_llm(spec)

    from langchain_core.messages import SystemMessage, HumanMessage
    result = await asyncio.to_thread(
        llm.invoke,
        [SystemMessage(content=prompt), HumanMessage(content=request.command)],
    )

    # Parse JSON from LLM response
    import json
    response_text = result.content if isinstance(result.content, str) else str(result.content)
    try:
        # Try to extract JSON from the response (may have markdown wrapping)
        json_str = response_text
        if "```" in json_str:
            json_str = json_str.split("```")[1]
            if json_str.startswith("json"):
                json_str = json_str[4:]
        parsed = json.loads(json_str.strip())
    except (json.JSONDecodeError, IndexError):
        parsed = {"message": response_text, "board_id": None, "board_title": None}

    return DashboardQueryResponse(
        message=parsed.get("message", response_text),
        board_id=parsed.get("board_id"),
        board_title=parsed.get("board_title"),
    )


@router.get("/models")
async def list_models():
    """Return available LLM models for the UI dropdown.

    Only includes models whose API keys are configured.
    """
    models = []
    for model_id, spec in SUPPORTED_MODELS.items():
        available = True
        if spec.provider == "groq" and not settings.groq_api_key:
            available = False
        elif spec.provider == "openai" and not settings.openai_api_key:
            available = False
        elif spec.provider == "anthropic" and not settings.anthropic_api_key:
            available = False

        models.append({
            "model_id": spec.model_id,
            "display_name": spec.display_name,
            "provider": spec.provider,
            "is_free": spec.is_free,
            "available": available,
        })
    return {"models": models, "default": DEFAULT_MODEL_ID}
