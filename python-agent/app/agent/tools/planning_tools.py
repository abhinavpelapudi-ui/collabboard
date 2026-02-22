"""Plan, workflow, and team visualization tools."""

from langchain_core.tools import tool

from app.agent.tools.utils import new_temp_id


@tool
def generate_flow_diagram(
    steps: list[dict],
    title: str = "Flow Diagram",
    layout: str = "horizontal",
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a visual flow diagram as connected nodes — works for plans, workflows, and processes.

    Each step can have optional connections to create branching flows. If no connections are
    specified, steps are connected sequentially.

    IMPORTANT: Use get_board_layout first to determine start_x and start_y.

    Args:
        steps: List of dicts with name (str), description (str, optional), connects_to (list of int indices, optional)
        title: Diagram title
        layout: 'horizontal' (left to right) or 'vertical' (top to bottom)
        start_x: X coordinate for placement
        start_y: Y coordinate for placement
    """
    actions = []
    node_w, node_h = 220, 130
    gap = 70
    is_vertical = layout == "vertical"

    if is_vertical:
        frame_w = node_w + 80
        frame_h = len(steps) * (node_h + gap) + 100
    else:
        frame_w = len(steps) * (node_w + gap) + 80
        frame_h = node_h + 160

    # Frame
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": new_temp_id("flow"),
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

    node_colors = ["#FEF08A", "#BFDBFE", "#BBF7D0", "#FECACA", "#DDD6FE", "#FED7AA"]
    node_ids = []

    for i, step in enumerate(steps):
        nid = new_temp_id("node")
        node_ids.append(nid)

        name = step if isinstance(step, str) else step.get("name", f"Step {i + 1}")
        desc = "" if isinstance(step, str) else step.get("description", "")
        text = f"{name}\n\n{desc}" if desc else name

        if is_vertical:
            nx = start_x + 40
            ny = start_y + 80 + i * (node_h + gap)
        else:
            nx = start_x + 40 + i * (node_w + gap)
            ny = start_y + 80

        actions.append({
            "action": "create",
            "object_type": "sticky",
            "temp_id": nid,
            "props": {
                "text": text,
                "x": nx,
                "y": ny,
                "width": node_w,
                "height": node_h,
                "color": node_colors[i % len(node_colors)],
                "font_size": 12,
                "rotation": 0,
            },
        })

    # Connections
    for i, step in enumerate(steps):
        if isinstance(step, str):
            connects_to = [i + 1] if i < len(steps) - 1 else []
        else:
            connects_to = step.get("connects_to", [i + 1] if i < len(steps) - 1 else [])

        for target_idx in connects_to:
            if 0 <= target_idx < len(node_ids):
                actions.append({
                    "action": "create",
                    "object_type": "connector",
                    "temp_id": new_temp_id("conn"),
                    "props": {
                        "from_temp_id": node_ids[i],
                        "to_temp_id": node_ids[target_idx],
                        "style": "solid",
                        "color": "#6366f1",
                        "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0,
                    },
                })

    return actions


@tool
def generate_team_graph(
    members: list[dict],
    title: str = "Team Workload",
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Generate a team flow graph showing who is working on what.

    Creates person nodes connected to their assigned task nodes, organized by workload.

    IMPORTANT: Use get_board_layout first to determine start_x and start_y.

    Args:
        members: List of dicts with name (str), role (str), tasks (list of dicts with name (str) and status (str: "todo"|"in_progress"|"done"))
        title: Graph title
        start_x: X coordinate for placement
        start_y: Y coordinate for placement
    """
    actions = []
    member_w, member_h = 160, 80
    task_w, task_h = 180, 70
    member_gap_y = 40
    task_gap_y = 10
    task_offset_x = 260  # horizontal distance from member to tasks
    padding = 40

    # Calculate height
    total_h = padding
    for m in members:
        tasks = m.get("tasks", [])
        section_h = max(member_h, len(tasks) * (task_h + task_gap_y))
        total_h += section_h + member_gap_y
    total_h += padding + 60

    frame_w = member_w + task_offset_x + task_w + padding * 2
    frame_h = max(total_h, 300)

    # Frame
    actions.append({
        "action": "create",
        "object_type": "frame",
        "temp_id": new_temp_id("team"),
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

    person_colors = ["#93C5FD", "#86EFAC", "#DDD6FE", "#FED7AA", "#FECACA", "#FEF08A"]
    status_colors = {
        "done": "#86EFAC",
        "in_progress": "#FEF08A",
        "review": "#93C5FD",
        "todo": "#e2e8f0",
    }

    current_y = start_y + 70
    for mi, member in enumerate(members):
        name = member.get("name", f"Member {mi + 1}")
        role = member.get("role", "")
        tasks = member.get("tasks", [])

        # Person node
        person_id = new_temp_id("person")
        person_text = f"{name}\n({role})" if role else name
        actions.append({
            "action": "create",
            "object_type": "sticky",
            "temp_id": person_id,
            "props": {
                "text": person_text,
                "x": start_x + padding,
                "y": current_y,
                "width": member_w,
                "height": member_h,
                "color": person_colors[mi % len(person_colors)],
                "font_size": 13,
                "rotation": 0,
            },
        })

        # Task nodes
        task_start_y = current_y
        for ti, task in enumerate(tasks):
            task_name = task.get("name", f"Task {ti + 1}")
            task_status = task.get("status", "todo")
            task_id = new_temp_id("task")

            actions.append({
                "action": "create",
                "object_type": "sticky",
                "temp_id": task_id,
                "props": {
                    "text": f"{task_name}\n[{task_status.replace('_', ' ')}]",
                    "x": start_x + padding + task_offset_x,
                    "y": task_start_y + ti * (task_h + task_gap_y),
                    "width": task_w,
                    "height": task_h,
                    "color": status_colors.get(task_status, "#e2e8f0"),
                    "font_size": 11,
                    "rotation": 0,
                },
            })

            # Connect person to task
            actions.append({
                "action": "create",
                "object_type": "connector",
                "temp_id": new_temp_id("ptc"),
                "props": {
                    "from_temp_id": person_id,
                    "to_temp_id": task_id,
                    "style": "solid",
                    "color": "#6366f1",
                    "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0,
                },
            })

        section_h = max(member_h, len(tasks) * (task_h + task_gap_y))
        current_y += section_h + member_gap_y

    return actions


PLANNING_TOOLS = [generate_flow_diagram, generate_team_graph]
