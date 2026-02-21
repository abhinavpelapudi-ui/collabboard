"""Chart and dashboard generation tools."""

import uuid
from langchain_core.tools import tool

from app.services.chart_service import render_chart


def _new_temp_id(prefix: str = "obj") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@tool
def generate_chart(
    chart_type: str,
    title: str,
    labels: list[str],
    values: list[float],
    start_x: int = 100,
    start_y: int = 100,
    x_label: str = "",
    y_label: str = "",
) -> dict:
    """Generate a chart image and return a board action to place it on the canvas.

    chart_type must be one of: bar, pie, line, scatter.
    labels and values must be the same length.

    IMPORTANT: Use find_free_space first to determine start_x and start_y so this
    chart doesn't overlap with existing objects.

    Args:
        chart_type: Type of chart (bar, pie, line, scatter)
        title: Chart title
        labels: Data labels
        values: Data values
        start_x: X coordinate for placement (use find_free_space to determine)
        start_y: Y coordinate for placement (use find_free_space to determine)
        x_label: X-axis label
        y_label: Y-axis label
    """
    data_url = render_chart(
        chart_type=chart_type,
        data={"labels": labels, "values": values},
        title=title,
        x_label=x_label,
        y_label=y_label,
    )
    return {
        "action": "create",
        "object_type": "image",
        "temp_id": _new_temp_id("chart"),
        "props": {
            "src": data_url,
            "alt": f"{chart_type} chart: {title}",
            "x": start_x,
            "y": start_y,
            "width": 600,
            "height": 400,
            "rotation": 0,
        },
    }


@tool
def create_dashboard(
    title: str,
    charts: list[dict],
    start_x: int = 50,
    start_y: int = 50,
) -> list[dict]:
    """Create a dashboard with multiple charts inside a frame.

    Each item in charts should have: chart_type, title, labels, values.
    Arranges charts in a 2-column grid inside a frame.

    IMPORTANT: Use find_free_space first to determine start_x and start_y so this
    dashboard doesn't overlap with existing objects.

    Args:
        title: Dashboard title
        charts: List of chart specs with chart_type, title, labels, values
        start_x: X coordinate for the top-left corner (use find_free_space to determine)
        start_y: Y coordinate for the top-left corner (use find_free_space to determine)
    """
    actions = []
    frame_id = _new_temp_id("dashboard")

    num_charts = len(charts)
    cols = 2
    chart_w, chart_h = 500, 350
    padding = 30
    frame_w = cols * chart_w + (cols + 1) * padding
    rows = (num_charts + cols - 1) // cols
    frame_h = rows * chart_h + (rows + 1) * padding + 60  # 60 for title

    # Frame container
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
            "fill": "rgba(255,255,255,0.05)",
            "rotation": 0,
        },
    })

    # Generate each chart
    for i, chart in enumerate(charts):
        col = i % cols
        row = i // cols
        cx = start_x + padding + col * (chart_w + padding)
        cy = start_y + 60 + padding + row * (chart_h + padding)

        data_url = render_chart(
            chart_type=chart.get("chart_type", "bar"),
            data={"labels": chart.get("labels", []), "values": chart.get("values", [])},
            title=chart.get("title", f"Chart {i + 1}"),
            width_px=chart_w,
            height_px=chart_h,
        )

        actions.append({
            "action": "create",
            "object_type": "image",
            "temp_id": _new_temp_id("chart"),
            "props": {
                "src": data_url,
                "alt": chart.get("title", f"Chart {i + 1}"),
                "x": cx,
                "y": cy,
                "width": chart_w,
                "height": chart_h,
                "rotation": 0,
            },
        })

    return actions


CHART_TOOLS = [generate_chart, create_dashboard]
