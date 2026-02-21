"""ChromaDB vector store for document RAG."""

import logging
import chromadb

logger = logging.getLogger(__name__)

_client: chromadb.ClientAPI | None = None


def get_chroma_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.Client()
        logger.info("ChromaDB initialized (in-memory)")
    return _client


def get_or_create_collection(board_id: str) -> chromadb.Collection:
    """Get or create a ChromaDB collection scoped to a board."""
    client = get_chroma_client()
    collection_name = f"board-{board_id.replace('-', '')}"[:63]
    return client.get_or_create_collection(name=collection_name)


def store_document_chunks(
    board_id: str,
    document_id: str,
    chunks: list[str],
    metadatas: list[dict] | None = None,
):
    """Store document text chunks in the vector store."""
    collection = get_or_create_collection(board_id)
    ids = [f"{document_id}-chunk-{i}" for i in range(len(chunks))]
    default_meta = [{"document_id": document_id, "chunk_index": i} for i in range(len(chunks))]

    if metadatas:
        for i, m in enumerate(metadatas):
            default_meta[i].update(m)

    collection.add(documents=chunks, ids=ids, metadatas=default_meta)
    logger.info("Stored %d chunks for document %s in board %s", len(chunks), document_id, board_id)


def search_documents(board_id: str, query: str, top_k: int = 5) -> list[dict]:
    """Search stored documents by semantic similarity."""
    collection = get_or_create_collection(board_id)

    if collection.count() == 0:
        return []

    results = collection.query(query_texts=[query], n_results=min(top_k, collection.count()))

    hits = []
    for i in range(len(results["documents"][0])):
        hits.append({
            "text": results["documents"][0][i],
            "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
            "distance": results["distances"][0][i] if results["distances"] else 0,
        })
    return hits
