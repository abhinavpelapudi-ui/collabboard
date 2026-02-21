"""Plan generation and reasoning visualization tools."""

import uuid
from langchain_core.tools import tool


def _new_temp_id(prefix: str = "obj") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@tool
def generate_plan_layout(
    steps: list[str],
    title: str = "Plan",
    layout: str = "vertical",
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a visual plan on the board as connected sticky notes.

    Creates a title frame, sticky notes for each step, and connectors between them.

    IMPORTANT: Use find_free_space first to determine start_x and start_y so this
    plan doesn't overlap with existing objects.

    Args:
        steps: List of plan step descriptions
        title: Plan title
        layout: 'vertical' (top to bottom) or 'horizontal' (left to right)
        start_x: X coordinate for the top-left corner (use find_free_space to determine)
        start_y: Y coordinate for the top-left corner (use find_free_space to determine)
    """
    actions = []
    step_w, step_h = 220, 120
    gap = 60
    is_vertical = layout == "vertical"

    # Calculate frame dimensions
    if is_vertical:
        frame_w = step_w + 80
        frame_h = len(steps) * (step_h + gap) + 100
    else:
        frame_w = len(steps) * (step_w + gap) + 80
        frame_h = step_h + 140

    # Frame
    frame_id = _new_temp_id("plan")
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": frame_id,
        "props": {
            "title": title,
            "x": start_x,
            "y": start_y,
            "width": frame_w,
            "height": frame_h,
            "fill": "rgba(255,255,255,0.03)",
            "rotation": 0,
        },
    })

    # Step colors gradient from blue to green
    step_colors = ["#BFDBFE", "#93C5FD", "#6EE7B7", "#86EFAC", "#BBF7D0"]
    step_ids = []

    for i, step_text in enumerate(steps):
        step_id = _new_temp_id("step")
        step_ids.append(step_id)

        if is_vertical:
            sx = start_x + 40
            sy = start_y + 80 + i * (step_h + gap)
        else:
            sx = start_x + 40 + i * (step_w + gap)
            sy = start_y + 80

        actions.append({
            "action": "create",
            "object_type": "sticky",
            "temp_id": step_id,
            "props": {
                "text": f"Step {i + 1}: {step_text}",
                "x": sx,
                "y": sy,
                "width": step_w,
                "height": step_h,
                "color": step_colors[i % len(step_colors)],
                "font_size": 12,
                "rotation": 0,
            },
        })

    # Connectors between sequential steps
    for i in range(len(step_ids) - 1):
        actions.append({
            "action": "create",
            "object_type": "connector",
            "temp_id": _new_temp_id("conn"),
            "props": {
                "from_temp_id": step_ids[i],
                "to_temp_id": step_ids[i + 1],
                "style": "solid",
                "color": "#6366f1",
                "x": 0,
                "y": 0,
                "width": 0,
                "height": 0,
                "rotation": 0,
            },
        })

    return actions


@tool
def generate_workflow(
    stages: list[dict],
    title: str = "Workflow",
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a workflow diagram with stages and connections.

    Each stage should have: name (str), description (str), and optionally connects_to (list of stage indices).

    IMPORTANT: Use find_free_space first to determine start_x and start_y so this
    workflow doesn't overlap with existing objects.

    Args:
        stages: List of dicts with 'name', 'description', and optional 'connects_to' (list of int indices)
        title: Workflow title
        start_x: X coordinate for the top-left corner (use find_free_space to determine)
        start_y: Y coordinate for the top-left corner (use find_free_space to determine)
    """
    actions = []
    stage_w, stage_h = 200, 150
    gap_x = 80

    frame_w = len(stages) * (stage_w + gap_x) + 80
    frame_h = stage_h + 180

    # Frame
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": _new_temp_id("wf"),
        "props": {
            "title": title,
            "x": start_x,
            "y": start_y,
            "width": frame_w,
            "height": frame_h,
            "fill": "rgba(255,255,255,0.03)",
            "rotation": 0,
        },
    })

    stage_ids = []
    stage_colors = ["#FEF08A", "#BFDBFE", "#BBF7D0", "#FECACA", "#DDD6FE", "#FED7AA"]

    for i, stage in enumerate(stages):
        stage_id = _new_temp_id("stage")
        stage_ids.append(stage_id)

        actions.append({
            "action": "create",
            "object_type": "sticky",
            "temp_id": stage_id,
            "props": {
                "text": f"{stage['name']}\n\n{stage.get('description', '')}",
                "x": start_x + 40 + i * (stage_w + gap_x),
                "y": start_y + 80,
                "width": stage_w,
                "height": stage_h,
                "color": stage_colors[i % len(stage_colors)],
                "font_size": 12,
                "rotation": 0,
            },
        })

    # Connections
    for i, stage in enumerate(stages):
        connects_to = stage.get("connects_to", [i + 1] if i < len(stages) - 1 else [])
        for target_idx in connects_to:
            if 0 <= target_idx < len(stage_ids):
                actions.append({
                    "action": "create",
                    "object_type": "connector",
                    "temp_id": _new_temp_id("conn"),
                    "props": {
                        "from_temp_id": stage_ids[i],
                        "to_temp_id": stage_ids[target_idx],
                        "style": "solid",
                        "color": "#6366f1",
                        "x": 0,
                        "y": 0,
                        "width": 0,
                        "height": 0,
                        "rotation": 0,
                    },
                })

    return actions


PLANNING_TOOLS = [generate_plan_layout, generate_workflow]
