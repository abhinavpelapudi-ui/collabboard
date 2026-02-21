"""Document parsing and RAG tools."""

from langchain_core.tools import tool

from app.services.vector_store import search_documents as _search_docs


@tool
def search_documents(board_id: str, query: str, top_k: int = 5) -> list[dict]:
    """Search uploaded documents for a board by semantic similarity.

    Returns the most relevant text chunks matching the query.
    Use this to find information in previously uploaded PDFs, DOCX, or TXT files.
    """
    results = _search_docs(board_id=board_id, query=query, top_k=top_k)
    return [{"text": r["text"], "source": r["metadata"].get("document_id", "")} for r in results]


DOCUMENT_TOOLS = [search_documents]
