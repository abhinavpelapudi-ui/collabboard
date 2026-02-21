"""Board manipulation tools that mirror CollabBoard's existing tool set.

Each tool returns a list of BoardAction dicts. The LangChain agent calls these
tools, and the results are collected into the final response sent to Node.js.
"""

import json
import uuid
from langchain_core.tools import tool

from app.services.layout_service import (
    describe_board_layout,
    find_open_position,
    find_insert_position,
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
    shape_type: str, x: int, y: int, width: int, height: int, fill: str = "#93C5FD"
) -> dict:
    """Create a rectangle or circle shape. shape_type must be 'rect' or 'circle'."""
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
def create_connector(
    from_temp_id: str, to_temp_id: str, style: str = "solid", color: str = "#6366f1"
) -> dict:
    """Create a connector arrow between two objects. Use their temp_ids from previous tool calls."""
    return {
        "action": "create",
        "object_type": "connector",
        "temp_id": _new_temp_id("conn"),
        "props": {
            "from_temp_id": from_temp_id,
            "to_temp_id": to_temp_id,
            "style": style,
            "color": color,
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "rotation": 0,
        },
    }


@tool
def move_object(object_id: str, x: int, y: int) -> dict:
    """Move an existing object to a new position. Requires the real object ID."""
    return {
        "action": "update",
        "object_type": "sticky",  # type doesn't matter for updates
        "object_id": object_id,
        "props": {"x": x, "y": y},
    }


@tool
def update_text(object_id: str, text: str) -> dict:
    """Update the text content of an existing object. Requires the real object ID."""
    return {
        "action": "update",
        "object_type": "sticky",
        "object_id": object_id,
        "props": {"text": text},
    }


@tool
def change_color(object_id: str, color: str) -> dict:
    """Change the color of an existing object. Requires the real object ID."""
    return {
        "action": "update",
        "object_type": "sticky",
        "object_id": object_id,
        "props": {"color": color, "fill": color},
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
def resize_object(object_id: str, width: int, height: int) -> dict:
    """Resize an existing object. Requires the real object ID."""
    return {
        "action": "update",
        "object_type": "sticky",
        "object_id": object_id,
        "props": {"width": width, "height": height},
    }


@tool
def get_board_layout() -> str:
    """Analyze the current board layout and find where free space is.

    ALWAYS call this tool FIRST before creating any new objects.
    It tells you where existing objects are and where to place new content
    so nothing overlaps.

    Returns a description of the board layout with recommended placement coordinates.
    """
    return describe_board_layout(_current_board_state)


@tool
def find_free_space(needed_width: int, needed_height: int, prefer: str = "right") -> str:
    """Find a specific position on the board where new content of the given size can fit
    without overlapping existing objects.

    Args:
        needed_width: Total width in pixels of the content you want to place
        needed_height: Total height in pixels of the content you want to place
        prefer: Where to place relative to existing content - 'right', 'below', or 'auto'

    Returns a JSON string with the recommended x, y coordinates.
    """
    x, y = find_open_position(
        _current_board_state,
        needed_width=needed_width,
        needed_height=needed_height,
        prefer=prefer,
    )
    return json.dumps({"x": int(x), "y": int(y)})


@tool
def find_position_near(target_x: int, target_y: int, item_width: int = 200, item_height: int = 200) -> str:
    """Find the nearest non-overlapping position close to a target location.

    Use this when the user specifies where they want something placed,
    or when you want to place something near an existing object.

    Returns a JSON string with the adjusted x, y coordinates.
    """
    x, y = find_insert_position(
        _current_board_state,
        target_x=target_x,
        target_y=target_y,
        item_width=item_width,
        item_height=item_height,
    )
    return json.dumps({"x": int(x), "y": int(y)})


@tool
def list_board_objects(object_type: str = "", limit: int = 30) -> str:
    """List objects currently on the board with their IDs, text, color, and position.

    Use this to find specific objects when the board context listing is truncated
    or when you need to see all objects of a certain type.

    Args:
        object_type: Filter by type (e.g. 'sticky', 'rect', 'text', 'frame'). Empty = all types.
        limit: Maximum number of objects to return.

    Returns a JSON list of objects with id, type, text, color, x, y, width, height.
    """
    results = []
    for obj in _current_board_state:
        if obj.get("type") == "connector":
            continue
        if object_type and obj.get("type") != object_type:
            continue
        if len(results) >= limit:
            break
        results.append({
            "id": obj.get("id", ""),
            "type": obj.get("type", "unknown"),
            "text": (obj.get("text", "") or obj.get("title", ""))[:120],
            "color": obj.get("color", "") or obj.get("fill", ""),
            "x": int(obj.get("x", 0)),
            "y": int(obj.get("y", 0)),
            "width": int(obj.get("width", 0)),
            "height": int(obj.get("height", 0)),
        })
    if not results:
        return json.dumps({"message": "No matching objects found.", "objects": []})
    return json.dumps({"count": len(results), "objects": results})


@tool
def find_objects_by_text(search_text: str) -> str:
    """Search for board objects whose text content contains the given search string.

    Case-insensitive partial match. Returns matching objects with their IDs so you
    can update, move, recolor, or delete them.

    Args:
        search_text: Text to search for (case-insensitive, partial match).

    Returns a JSON list of matching objects.
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
                "width": int(obj.get("width", 0)),
                "height": int(obj.get("height", 0)),
            })
    if not results:
        return json.dumps({"message": f"No objects found containing '{search_text}'.", "objects": []})
    return json.dumps({"count": len(results), "objects": results})


# All board tools exported as a list
BOARD_TOOLS = [
    get_board_layout,
    find_free_space,
    find_position_near,
    list_board_objects,
    find_objects_by_text,
    create_sticky_note,
    create_shape,
    create_frame,
    create_text,
    create_connector,
    move_object,
    update_text,
    change_color,
    delete_object,
    resize_object,
]
