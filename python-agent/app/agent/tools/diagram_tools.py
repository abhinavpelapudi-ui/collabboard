"""Diagram generation tools: sequence diagrams, system architecture, project tracking."""

import uuid
from langchain_core.tools import tool

from app.services.chart_service import render_chart, render_gantt


def _new_temp_id(prefix: str = "obj") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@tool
def generate_sequence_diagram(
    participants: list[str],
    messages: list[dict],
    title: str = "Sequence Diagram",
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a sequence diagram showing message flow between participants.

    IMPORTANT: Use get_board_layout first to determine start_x and start_y.

    Args:
        participants: List of actor/participant names (e.g. ["Client", "Server", "Database"])
        messages: List of message dicts with keys: from_name (str), to_name (str), label (str), type (str: "solid" or "dashed")
        title: Diagram title
        start_x: X coordinate for placement
        start_y: Y coordinate for placement
    """
    actions = []
    actor_w, actor_h = 140, 50
    actor_gap = 60
    msg_height = 50
    padding = 40

    num_actors = len(participants)
    total_w = num_actors * (actor_w + actor_gap) - actor_gap + padding * 2
    total_h = actor_h + len(messages) * msg_height + padding * 3 + 60

    # Frame
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": _new_temp_id("seq"),
        "props": {
            "title": title,
            "x": start_x,
            "y": start_y,
            "width": total_w,
            "height": total_h,
            "fill": "rgba(255,255,255,0.03)",
            "rotation": 0,
        },
    })

    # Actor boxes across the top
    actor_positions: dict[str, int] = {}
    actor_ids: dict[str, str] = {}
    actor_colors = ["#93C5FD", "#86EFAC", "#FEF08A", "#FECACA", "#DDD6FE", "#FED7AA"]

    for i, name in enumerate(participants):
        ax = start_x + padding + i * (actor_w + actor_gap)
        ay = start_y + 60
        actor_positions[name] = ax + actor_w // 2
        aid = _new_temp_id("actor")
        actor_ids[name] = aid

        actions.append({
            "action": "create",
            "object_type": "rect",
            "temp_id": aid,
            "props": {
                "x": ax,
                "y": ay,
                "width": actor_w,
                "height": actor_h,
                "fill": actor_colors[i % len(actor_colors)],
                "stroke": "#475569",
                "stroke_width": 2,
                "text": name,
                "rotation": 0,
            },
        })

    # Lifelines — thin vertical rects below each actor
    lifeline_top = start_y + 60 + actor_h + 10
    lifeline_h = len(messages) * msg_height + padding
    for name in participants:
        cx = actor_positions[name]
        actions.append({
            "action": "create",
            "object_type": "rect",
            "temp_id": _new_temp_id("life"),
            "props": {
                "x": cx - 1,
                "y": lifeline_top,
                "width": 2,
                "height": lifeline_h,
                "fill": "#475569",
                "stroke": "transparent",
                "stroke_width": 0,
                "rotation": 0,
            },
        })

    # Message arrows with labels
    for i, msg in enumerate(messages):
        from_name = msg.get("from_name", msg.get("from", ""))
        to_name = msg.get("to_name", msg.get("to", ""))
        label = msg.get("label", "")
        style = msg.get("type", "solid")

        if from_name not in actor_positions or to_name not in actor_positions:
            continue

        my = lifeline_top + 20 + i * msg_height

        # Label text above the arrow
        fx = actor_positions[from_name]
        tx = actor_positions[to_name]
        label_x = min(fx, tx) + abs(fx - tx) // 2 - len(label) * 3
        actions.append({
            "action": "create",
            "object_type": "text",
            "temp_id": _new_temp_id("mlbl"),
            "props": {
                "text": label,
                "x": label_x,
                "y": my - 18,
                "width": max(len(label) * 8, 80),
                "height": 20,
                "font_size": 11,
                "color": "#e2e8f0",
                "rotation": 0,
            },
        })

        # Small invisible rects at arrow endpoints for connector
        from_id = _new_temp_id("mpt")
        to_id = _new_temp_id("mpt")
        actions.append({
            "action": "create",
            "object_type": "rect",
            "temp_id": from_id,
            "props": {
                "x": fx - 4, "y": my - 4, "width": 8, "height": 8,
                "fill": "transparent", "stroke": "transparent", "stroke_width": 0, "rotation": 0,
            },
        })
        actions.append({
            "action": "create",
            "object_type": "rect",
            "temp_id": to_id,
            "props": {
                "x": tx - 4, "y": my - 4, "width": 8, "height": 8,
                "fill": "transparent", "stroke": "transparent", "stroke_width": 0, "rotation": 0,
            },
        })
        actions.append({
            "action": "create",
            "object_type": "connector",
            "temp_id": _new_temp_id("marr"),
            "props": {
                "from_temp_id": from_id,
                "to_temp_id": to_id,
                "style": style,
                "color": "#6366f1",
                "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0,
            },
        })

    return actions


@tool
def generate_system_diagram(
    components: list[dict],
    connections: list[dict],
    title: str = "System Architecture",
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a system architecture diagram with typed components and connections.

    IMPORTANT: Use get_board_layout first to determine start_x and start_y.

    Args:
        components: List of dicts with name (str), type (str: "service"|"database"|"client"|"queue"|"cache"), description (str)
        connections: List of dicts with from_idx (int), to_idx (int), label (str) — indices into components list
        title: Diagram title
        start_x: X coordinate for placement
        start_y: Y coordinate for placement
    """
    actions = []
    comp_w, comp_h = 180, 100
    gap_x, gap_y = 80, 80
    cols = min(4, max(2, len(components)))
    rows = (len(components) + cols - 1) // cols

    frame_w = cols * (comp_w + gap_x) + gap_x
    frame_h = rows * (comp_h + gap_y) + gap_y + 60

    # Color by type
    type_colors = {
        "service": "#93C5FD",
        "database": "#86EFAC",
        "client": "#FEF08A",
        "queue": "#DDD6FE",
        "cache": "#FED7AA",
    }
    type_strokes = {
        "service": "#3b82f6",
        "database": "#22c55e",
        "client": "#eab308",
        "queue": "#8b5cf6",
        "cache": "#f97316",
    }

    # Frame
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": _new_temp_id("sys"),
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

    comp_ids = []
    for i, comp in enumerate(components):
        cid = _new_temp_id("comp")
        comp_ids.append(cid)

        col = i % cols
        row = i // cols
        cx = start_x + gap_x + col * (comp_w + gap_x)
        cy = start_y + 60 + gap_y + row * (comp_h + gap_y)

        comp_type = comp.get("type", "service")
        fill = type_colors.get(comp_type, "#93C5FD")
        stroke = type_strokes.get(comp_type, "#3b82f6")

        label = comp.get("name", f"Component {i + 1}")
        desc = comp.get("description", "")
        text = f"{label}\n({comp_type})\n{desc}" if desc else f"{label}\n({comp_type})"

        actions.append({
            "action": "create",
            "object_type": "sticky",
            "temp_id": cid,
            "props": {
                "text": text,
                "x": cx,
                "y": cy,
                "width": comp_w,
                "height": comp_h,
                "color": fill,
                "font_size": 12,
                "rotation": 0,
            },
        })

    # Connections
    for conn in connections:
        fi = conn.get("from_idx", 0)
        ti = conn.get("to_idx", 0)
        if 0 <= fi < len(comp_ids) and 0 <= ti < len(comp_ids):
            actions.append({
                "action": "create",
                "object_type": "connector",
                "temp_id": _new_temp_id("conn"),
                "props": {
                    "from_temp_id": comp_ids[fi],
                    "to_temp_id": comp_ids[ti],
                    "style": "solid",
                    "color": "#6366f1",
                    "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0,
                },
            })

    return actions


@tool
def generate_gantt_chart(
    tasks: list[dict],
    title: str = "Project Timeline",
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a Gantt chart showing project timeline with task bars on a date axis.

    IMPORTANT: Use get_board_layout first to determine start_x and start_y.

    Args:
        tasks: List of dicts with name (str), start_date (str YYYY-MM-DD), end_date (str YYYY-MM-DD), status (str: "todo"|"in_progress"|"review"|"done"), assignee (str, optional)
        title: Chart title
        start_x: X coordinate for placement
        start_y: Y coordinate for placement
    """
    actions = []
    n = len(tasks)
    chart_w = 800
    chart_h = max(400, n * 35 + 120)
    padding = 30

    frame_w = chart_w + padding * 2
    frame_h = chart_h + padding * 2 + 60

    # Frame
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": _new_temp_id("gantt"),
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

    # Summary text
    counts = {"todo": 0, "in_progress": 0, "review": 0, "done": 0}
    for t in tasks:
        s = t.get("status", "todo")
        if s in counts:
            counts[s] += 1
    total = len(tasks)
    done_pct = round(counts["done"] / total * 100) if total > 0 else 0

    actions.append({
        "action": "create",
        "object_type": "text",
        "temp_id": _new_temp_id("gsum"),
        "props": {
            "text": f"{done_pct}% Complete  |  {counts['done']}/{total} done  |  {counts['in_progress']} in progress  |  {counts['todo']} to do",
            "x": start_x + padding,
            "y": start_y + 60,
            "width": frame_w - padding * 2,
            "height": 30,
            "font_size": 14,
            "color": "#e2e8f0",
            "rotation": 0,
        },
    })

    # Gantt chart image
    gantt_url = render_gantt(
        tasks=tasks,
        title=title,
        width_px=chart_w,
        height_px=chart_h,
    )
    actions.append({
        "action": "create",
        "object_type": "image",
        "temp_id": _new_temp_id("gchart"),
        "props": {
            "src": gantt_url,
            "alt": f"Gantt chart: {title}",
            "x": start_x + padding,
            "y": start_y + 100,
            "width": chart_w,
            "height": chart_h,
            "rotation": 0,
        },
    })

    return actions


DIAGRAM_TOOLS = [generate_sequence_diagram, generate_system_diagram, generate_gantt_chart]
