"""Agent API routes — the main interface between Node.js and the Python agent."""

import uuid
import logging

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.models.schemas import AgentCommandRequest, AgentCommandResponse, DocumentUploadResponse
from app.agent.agent import run_agent
from app.agent.models import SUPPORTED_MODELS, DEFAULT_MODEL_ID
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

    result = run_agent(
        command=request.command,
        board_state=request.board_state,
        board_id=request.board_id,
        model_id=request.model or DEFAULT_MODEL_ID,
    )

    return AgentCommandResponse(
        success=True,
        message=result["message"],
        actions=result["actions"],
        actions_performed=result["actions_performed"],
        trace_id=result["trace_id"],
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
