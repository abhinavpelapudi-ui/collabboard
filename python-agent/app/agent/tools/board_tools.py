"""Board manipulation tools for CollabBoard.

Each tool returns BoardAction dicts. The LangChain agent calls these tools,
and the results are collected into the final response sent to Node.js.

IMPORTANT: Tool count is kept low (9 tools) to ensure reliable function
calling with Llama models on Groq.
"""

import json
import uuid
from typing import Literal
from langchain_core.tools import tool

from app.services.layout_service import (
    describe_board_layout,
    find_open_position,
)

# Thread-local board state set before each agent invocation
_current_board_state: list[dict] = []


def set_board_state(board_state: list[dict]):
    """Set the current board state for layout-aware tools."""
    global _current_board_state
    _current_board_state = board_state


def _new_temp_id(prefix: str = "obj") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@tool
def get_board_layout(needed_width: int = 0, needed_height: int = 0) -> str:
    """Analyze the board and find free space for new content.

    ALWAYS call this FIRST before creating objects so you know where to place them.

    If needed_width and needed_height are provided (> 0), also returns recommended
    x, y coordinates where a block of that size can fit without overlapping.

    Args:
        needed_width: Width in pixels of content to place (0 = just describe layout)
        needed_height: Height in pixels of content to place (0 = just describe layout)
    """
    layout_desc = describe_board_layout(_current_board_state)
    if needed_width > 0 and needed_height > 0:
        x, y = find_open_position(
            _current_board_state,
            needed_width=needed_width,
            needed_height=needed_height,
        )
        layout_desc += f"\n\nRecommended placement for {needed_width}x{needed_height} block: x={int(x)}, y={int(y)}"
    return layout_desc


@tool
def create_sticky_note(text: str, x: int, y: int, color: str = "#FEF08A") -> dict:
    """Create a sticky note on the board with text, position, and color."""
    return {
        "action": "create",
        "object_type": "sticky",
        "temp_id": _new_temp_id("sticky"),
        "props": {
            "text": text,
            "x": x,
            "y": y,
            "width": 200,
            "height": 200,
            "color": color,
            "font_size": 14,
            "rotation": 0,
        },
    }


@tool
def create_shape(
    shape_type: Literal["rect", "circle"], x: int, y: int, width: int, height: int, fill: str = "#93C5FD"
) -> dict:
    """Create a rectangle or circle shape on the board."""
    return {
        "action": "create",
        "object_type": shape_type,
        "temp_id": _new_temp_id(shape_type),
        "props": {
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "fill": fill,
            "stroke": "#1e40af",
            "stroke_width": 2,
            "rotation": 0,
        },
    }


@tool
def create_frame(title: str, x: int, y: int, width: int, height: int) -> dict:
    """Create a labeled frame/container to group objects."""
    return {
        "action": "create",
        "object_type": "frame",
        "temp_id": _new_temp_id("frame"),
        "props": {
            "title": title,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "fill": "rgba(255,255,255,0.05)",
            "rotation": 0,
        },
    }


@tool
def create_text(text: str, x: int, y: int, font_size: int = 16, color: str = "#e2e8f0") -> dict:
    """Create a standalone text element on the board."""
    return {
        "action": "create",
        "object_type": "text",
        "temp_id": _new_temp_id("text"),
        "props": {
            "text": text,
            "x": x,
            "y": y,
            "width": max(len(text) * font_size * 0.6, 100),
            "height": font_size * 2,
            "font_size": font_size,
            "color": color,
            "rotation": 0,
        },
    }


@tool
def create_connector(from_temp_id: str, to_temp_id: str, color: str = "#6366f1") -> dict:
    """Create a connector arrow between two objects. Use their temp_ids from previous tool calls."""
    return {
        "action": "create",
        "object_type": "connector",
        "temp_id": _new_temp_id("conn"),
        "props": {
            "from_temp_id": from_temp_id,
            "to_temp_id": to_temp_id,
            "style": "solid",
            "color": color,
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "rotation": 0,
        },
    }


@tool
def update_object(
    object_id: str,
    text: str = "",
    color: str = "",
    x: int = -1,
    y: int = -1,
    width: int = -1,
    height: int = -1,
) -> dict:
    """Update an existing object: move, resize, recolor, or change text. Only set fields you want to change.

    Args:
        object_id: The ID of the object to update (from board listing)
        text: New text content (leave empty to keep current)
        color: New color hex code (leave empty to keep current)
        x: New x position (-1 to keep current)
        y: New y position (-1 to keep current)
        width: New width (-1 to keep current)
        height: New height (-1 to keep current)
    """
    props: dict = {}
    if text:
        props["text"] = text
    if color:
        props["color"] = color
        props["fill"] = color
    if x >= 0:
        props["x"] = x
    if y >= 0:
        props["y"] = y
    if width >= 0:
        props["width"] = width
    if height >= 0:
        props["height"] = height

    return {
        "action": "update",
        "object_type": "sticky",
        "object_id": object_id,
        "props": props,
    }


@tool
def delete_object(object_id: str) -> dict:
    """Delete an existing object from the board. Requires the real object ID."""
    return {
        "action": "delete",
        "object_type": "sticky",
        "object_id": object_id,
        "props": {},
    }


@tool
def find_objects_by_text(search_text: str) -> str:
    """Search for board objects whose text contains the given string (case-insensitive).

    Returns matching objects with IDs so you can update or delete them.
    """
    query = search_text.lower()
    results = []
    for obj in _current_board_state:
        text = (obj.get("text", "") or obj.get("title", "")).lower()
        if query in text:
            results.append({
                "id": obj.get("id", ""),
                "type": obj.get("type", "unknown"),
                "text": (obj.get("text", "") or obj.get("title", ""))[:120],
                "color": obj.get("color", "") or obj.get("fill", ""),
                "x": int(obj.get("x", 0)),
                "y": int(obj.get("y", 0)),
            })
    if not results:
        return json.dumps({"message": f"No objects found containing '{search_text}'."})
    return json.dumps({"count": len(results), "objects": results})


@tool
def fit_view() -> dict:
    """Zoom the board view to fit all objects on screen.

    Call this when the user asks to see all notes, zoom to fit, or make everything visible.
    """
    return {"action": "fit_view"}


# All board tools exported as a list (10 tools)
BOARD_TOOLS = [
    get_board_layout,
    find_objects_by_text,
    create_sticky_note,
    create_shape,
    create_frame,
    create_text,
    create_connector,
    update_object,
    delete_object,
    fit_view,
]
