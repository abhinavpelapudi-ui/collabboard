"""Sprint board and Kanban generation tools."""

import uuid
from langchain_core.tools import tool


def _new_temp_id(prefix: str = "obj") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@tool
def generate_sprint_board(
    tasks: list[str],
    sprint_name: str = "Sprint 1",
    column_names: list[str] | None = None,
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a Kanban/sprint board layout from a list of task descriptions.

    Creates column frames and places task sticky notes in the first column (Backlog).
    The user can drag them to other columns during the sprint.

    IMPORTANT: Use find_free_space first to determine start_x and start_y so this
    board doesn't overlap with existing objects.

    Args:
        tasks: List of task description strings
        sprint_name: Name for the sprint frame
        column_names: Column names (default: Backlog, To Do, In Progress, Review, Done)
        start_x: X coordinate for the top-left corner (use find_free_space to determine)
        start_y: Y coordinate for the top-left corner (use find_free_space to determine)
    """
    if column_names is None:
        column_names = ["Backlog", "To Do", "In Progress", "Review", "Done"]

    actions = []
    col_width = 220
    col_padding = 20
    task_h = 100
    task_padding = 10
    header_h = 60

    total_width = len(column_names) * (col_width + col_padding) + col_padding
    max_tasks_per_col = max(len(tasks), 5)
    total_height = header_h + max_tasks_per_col * (task_h + task_padding) + col_padding + 60

    # Sprint frame
    frame_id = _new_temp_id("sprint")
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": frame_id,
        "props": {
            "title": sprint_name,
            "x": start_x,
            "y": start_y,
            "width": total_width,
            "height": total_height,
            "fill": "rgba(255,255,255,0.03)",
            "rotation": 0,
        },
    })

    # Column colors
    col_colors = ["#475569", "#6366f1", "#f59e0b", "#06b6d4", "#22c55e"]

    # Columns
    for i, col_name in enumerate(column_names):
        col_x = start_x + col_padding + i * (col_width + col_padding)
        col_y = start_y + header_h
        col_h = total_height - header_h - col_padding

        actions.append({
            "action": "create",
            "object_type": "rect",
            "temp_id": _new_temp_id("col"),
            "props": {
                "x": col_x,
                "y": col_y,
                "width": col_width,
                "height": col_h,
                "fill": "#1e293b",
                "stroke": col_colors[i % len(col_colors)],
                "stroke_width": 2,
                "text": col_name,
                "rotation": 0,
            },
        })

    # Task sticky notes — all start in the first column (Backlog)
    task_colors = ["#FEF08A", "#BFDBFE", "#BBF7D0", "#FECACA", "#DDD6FE", "#FED7AA"]
    first_col_x = start_x + col_padding + 10
    task_start_y = start_y + header_h + 40

    for i, task_text in enumerate(tasks):
        actions.append({
            "action": "create",
            "object_type": "sticky",
            "temp_id": _new_temp_id("task"),
            "props": {
                "text": task_text,
                "x": first_col_x,
                "y": task_start_y + i * (task_h + task_padding),
                "width": col_width - 20,
                "height": task_h,
                "color": task_colors[i % len(task_colors)],
                "font_size": 12,
                "rotation": 0,
            },
        })

    return actions


SPRINT_TOOLS = [generate_sprint_board]
