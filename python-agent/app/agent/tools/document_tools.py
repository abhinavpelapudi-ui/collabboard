"""Document parsing, RAG, and analysis tools."""

from typing import Literal
from langchain_core.tools import tool

from app.services.vector_store import search_documents as _search_docs
from app.services.chart_service import render_chart
from app.agent.tools.utils import new_temp_id


@tool
def search_documents(board_id: str, query: str, top_k: int = 5) -> list[dict]:
    """Search uploaded documents for a board by semantic similarity.

    Returns the most relevant text chunks matching the query.
    Use this to find information in previously uploaded PDFs, DOCX, or TXT files.
    """
    results = _search_docs(board_id=board_id, query=query, top_k=top_k)
    return [{"text": r["text"], "source": r["metadata"].get("document_id", "")} for r in results]


@tool
def analyze_document(
    board_id: str,
    query: str,
    analysis_type: Literal["summary", "key_points", "timeline", "statistics"],
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Analyze an uploaded document and create visual output on the board.

    IMPORTANT: Use get_board_layout first to determine start_x and start_y.

    Args:
        board_id: Board ID to search documents for
        query: Search query to find relevant document content
        analysis_type: Type of analysis — summary (sticky notes), key_points (bullet points),
                       timeline (horizontal flow), statistics (charts)
        start_x: X coordinate for placement
        start_y: Y coordinate for placement
    """
    # Fetch relevant chunks
    results = _search_docs(board_id=board_id, query=query, top_k=8)
    if not results:
        return [{"action": "create", "object_type": "text", "temp_id": new_temp_id("nodata"),
                 "props": {"text": "No documents found. Upload a file first.",
                           "x": start_x, "y": start_y, "width": 300, "height": 30,
                           "font_size": 14, "color": "#fca5a5", "rotation": 0}}]

    chunks = [r["text"] for r in results]
    combined = "\n".join(chunks)

    actions = []

    if analysis_type == "summary":
        # Create sticky notes with key excerpts
        frame_id = new_temp_id("sum")
        note_w, note_h = 220, 140
        gap = 20
        cols = min(3, len(chunks))
        rows = (min(6, len(chunks)) + cols - 1) // cols
        frame_w = cols * (note_w + gap) + gap + 40
        frame_h = rows * (note_h + gap) + gap + 80

        actions.append({"action": "create", "object_type": "frame", "temp_id": frame_id,
                        "props": {"title": "Document Summary", "x": start_x, "y": start_y,
                                  "width": frame_w, "height": frame_h,
                                  "fill": "rgba(255,255,255,0.05)", "rotation": 0}})

        colors = ["#FEF08A", "#BFDBFE", "#BBF7D0", "#FECACA", "#DDD6FE", "#FED7AA"]
        for i, chunk in enumerate(chunks[:6]):
            col = i % cols
            row = i // cols
            cx = start_x + 20 + gap + col * (note_w + gap)
            cy = start_y + 70 + gap + row * (note_h + gap)
            # Truncate long chunks for readability
            text = chunk[:200] + "..." if len(chunk) > 200 else chunk
            actions.append({"action": "create", "object_type": "sticky",
                            "temp_id": new_temp_id("sn"),
                            "props": {"text": text, "x": cx, "y": cy,
                                      "width": note_w, "height": note_h,
                                      "color": colors[i % len(colors)],
                                      "font_size": 11, "rotation": 0}})

    elif analysis_type == "key_points":
        # Extract and display as numbered text items
        frame_id = new_temp_id("kp")
        item_h = 40
        frame_w = 500
        num_items = min(8, len(chunks))
        frame_h = num_items * (item_h + 10) + 80

        actions.append({"action": "create", "object_type": "frame", "temp_id": frame_id,
                        "props": {"title": "Key Points", "x": start_x, "y": start_y,
                                  "width": frame_w, "height": frame_h,
                                  "fill": "rgba(255,255,255,0.05)", "rotation": 0}})

        for i, chunk in enumerate(chunks[:num_items]):
            text = chunk[:120] + "..." if len(chunk) > 120 else chunk
            actions.append({"action": "create", "object_type": "text",
                            "temp_id": new_temp_id("kpt"),
                            "props": {"text": f"{i + 1}. {text}",
                                      "x": start_x + 20, "y": start_y + 70 + i * (item_h + 10),
                                      "width": frame_w - 40, "height": item_h,
                                      "font_size": 12, "color": "#e2e8f0", "rotation": 0}})

    elif analysis_type == "timeline":
        # Horizontal flow of events/milestones
        step_w, step_h = 200, 100
        gap = 60
        num_steps = min(6, len(chunks))
        frame_w = num_steps * (step_w + gap) + 80
        frame_h = step_h + 160

        frame_id = new_temp_id("tl")
        actions.append({"action": "create", "object_type": "frame", "temp_id": frame_id,
                        "props": {"title": "Timeline", "x": start_x, "y": start_y,
                                  "width": frame_w, "height": frame_h,
                                  "fill": "rgba(255,255,255,0.03)", "rotation": 0}})

        colors = ["#BFDBFE", "#93C5FD", "#6EE7B7", "#86EFAC", "#BBF7D0", "#FEF08A"]
        step_ids = []
        for i, chunk in enumerate(chunks[:num_steps]):
            sid = new_temp_id("ts")
            step_ids.append(sid)
            text = chunk[:100] + "..." if len(chunk) > 100 else chunk
            actions.append({"action": "create", "object_type": "sticky", "temp_id": sid,
                            "props": {"text": text,
                                      "x": start_x + 40 + i * (step_w + gap),
                                      "y": start_y + 80, "width": step_w, "height": step_h,
                                      "color": colors[i % len(colors)],
                                      "font_size": 11, "rotation": 0}})

        # Connect steps sequentially
        for i in range(len(step_ids) - 1):
            actions.append({"action": "create", "object_type": "connector",
                            "temp_id": new_temp_id("tc"),
                            "props": {"from_temp_id": step_ids[i], "to_temp_id": step_ids[i + 1],
                                      "style": "solid", "color": "#6366f1",
                                      "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0}})

    elif analysis_type == "statistics":
        # Word count and length analysis with charts
        word_counts = [len(c.split()) for c in chunks]
        labels = [f"Section {i + 1}" for i in range(len(word_counts))]

        chart_w, chart_h = 500, 350
        frame_w = chart_w + 80
        frame_h = chart_h + 100

        frame_id = new_temp_id("stat")
        actions.append({"action": "create", "object_type": "frame", "temp_id": frame_id,
                        "props": {"title": "Document Statistics", "x": start_x, "y": start_y,
                                  "width": frame_w, "height": frame_h,
                                  "fill": "rgba(255,255,255,0.05)", "rotation": 0}})

        bar_url = render_chart(
            chart_type="bar",
            data={"labels": labels, "values": word_counts},
            title="Word Count by Section",
            x_label="Section", y_label="Words",
            width_px=chart_w, height_px=chart_h,
        )
        actions.append({"action": "create", "object_type": "image",
                        "temp_id": new_temp_id("chart"),
                        "props": {"src": bar_url, "alt": "Document word count chart",
                                  "x": start_x + 40, "y": start_y + 70,
                                  "width": chart_w, "height": chart_h, "rotation": 0}})

    return actions


DOCUMENT_TOOLS = [search_documents, analyze_document]
