"""Chart rendering service using matplotlib with CollabBoard's dark theme."""

import io
import base64
import logging
import threading

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for Docker
import matplotlib.pyplot as plt

logger = logging.getLogger(__name__)

_chart_lock = threading.Lock()

# CollabBoard dark theme colors
BG_COLOR = "#1e293b"
PLOT_BG = "#0f172a"
TEXT_COLOR = "#e2e8f0"
GRID_COLOR = "#334155"
ACCENT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899"]


def render_chart(
    chart_type: str,
    data: dict,
    title: str,
    x_label: str = "",
    y_label: str = "",
    width_px: int = 600,
    height_px: int = 400,
) -> str:
    """Render a chart and return it as a base64 data URL.

    Args:
        chart_type: One of 'bar', 'pie', 'line', 'scatter'
        data: Chart data with 'labels' and 'values' keys (and optionally 'x', 'y')
        title: Chart title
        x_label: X-axis label
        y_label: Y-axis label
        width_px: Image width in pixels
        height_px: Image height in pixels

    Returns:
        A data:image/png;base64,... URL string
    """
    MAX_DATA_POINTS = 200
    with _chart_lock:
        fig, ax = plt.subplots(figsize=(width_px / 100, height_px / 100), dpi=100)

        # Dark theme
        fig.patch.set_facecolor(BG_COLOR)
        ax.set_facecolor(PLOT_BG)
        ax.tick_params(colors=TEXT_COLOR, which="both")
        ax.xaxis.label.set_color(TEXT_COLOR)
        ax.yaxis.label.set_color(TEXT_COLOR)
        ax.title.set_color(TEXT_COLOR)
        ax.spines["bottom"].set_color(GRID_COLOR)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color(GRID_COLOR)
        ax.grid(True, color=GRID_COLOR, alpha=0.3)

        labels = data.get("labels", [])[:MAX_DATA_POINTS]
        values = data.get("values", [])[:MAX_DATA_POINTS]

        if chart_type == "bar":
            colors = [ACCENT_COLORS[i % len(ACCENT_COLORS)] for i in range(len(labels))]
            ax.bar(labels, values, color=colors, width=0.6)
            plt.xticks(rotation=45, ha="right", fontsize=8)

        elif chart_type == "pie":
            colors = [ACCENT_COLORS[i % len(ACCENT_COLORS)] for i in range(len(labels))]
            ax.pie(
                values,
                labels=labels,
                colors=colors,
                autopct="%1.1f%%",
                textprops={"color": TEXT_COLOR, "fontsize": 9},
            )

        elif chart_type == "line":
            x = data.get("x", list(range(len(values))))
            ax.plot(x, values, color=ACCENT_COLORS[0], linewidth=2, marker="o", markersize=4)
            ax.fill_between(x, values, alpha=0.1, color=ACCENT_COLORS[0])

        elif chart_type == "scatter":
            x = data.get("x", list(range(len(values))))
            ax.scatter(x, values, color=ACCENT_COLORS[0], s=40, alpha=0.7)

        else:
            ax.text(
                0.5, 0.5, f"Unknown chart type: {chart_type}",
                ha="center", va="center", color=TEXT_COLOR, transform=ax.transAxes,
            )

        ax.set_title(title, fontsize=12, fontweight="bold", pad=10)
        if x_label:
            ax.set_xlabel(x_label)
        if y_label:
            ax.set_ylabel(y_label)

        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close(fig)
        buf.seek(0)

        b64 = base64.b64encode(buf.read()).decode("utf-8")
        return f"data:image/png;base64,{b64}"


def render_gantt(
    tasks: list[dict],
    title: str = "Project Timeline",
    width_px: int = 800,
    height_px: int = 400,
) -> str:
    """Render a Gantt chart and return as a base64 data URL.

    Args:
        tasks: List of dicts with keys: name (str), start_date (str YYYY-MM-DD),
               end_date (str YYYY-MM-DD), status (str), assignee (str, optional)
        title: Chart title
        width_px: Image width in pixels
        height_px: Image height in pixels

    Returns:
        A data:image/png;base64,... URL string
    """
    from datetime import datetime, timedelta
    from matplotlib.patches import Patch

    status_colors = {
        "done": "#22c55e",
        "in_progress": "#f59e0b",
        "review": "#06b6d4",
        "todo": "#6b7280",
    }

    MAX_GANTT_TASKS = 200

    # Parse tasks and compute dates
    parsed = []
    for t in tasks[:MAX_GANTT_TASKS]:
        name = t.get("name", "Task")
        try:
            start = datetime.strptime(t.get("start_date", ""), "%Y-%m-%d")
        except (ValueError, TypeError):
            start = datetime.now()
        try:
            end = datetime.strptime(t.get("end_date", ""), "%Y-%m-%d")
        except (ValueError, TypeError):
            end = start + timedelta(days=7)
        if end <= start:
            end = start + timedelta(days=1)
        status = t.get("status", "todo")
        assignee = t.get("assignee", "")
        parsed.append({"name": name, "start": start, "end": end, "status": status, "assignee": assignee})

    if not parsed:
        parsed = [{"name": "No tasks", "start": datetime.now(), "end": datetime.now() + timedelta(days=1), "status": "todo", "assignee": ""}]

    with _chart_lock:
        n = len(parsed)
        fig_h = max(height_px, n * 35 + 120) / 100
        fig, ax = plt.subplots(figsize=(width_px / 100, fig_h), dpi=100)

        # Dark theme
        fig.patch.set_facecolor(BG_COLOR)
        ax.set_facecolor(PLOT_BG)
        ax.tick_params(colors=TEXT_COLOR, which="both")
        ax.xaxis.label.set_color(TEXT_COLOR)
        ax.yaxis.label.set_color(TEXT_COLOR)
        ax.title.set_color(TEXT_COLOR)
        for spine in ax.spines.values():
            spine.set_color(GRID_COLOR)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, axis="x", color=GRID_COLOR, alpha=0.3)

        # Draw bars
        for i, task in enumerate(parsed):
            duration = (task["end"] - task["start"]).days
            color = status_colors.get(task["status"], "#6b7280")
            ax.barh(
                i, duration, left=task["start"].toordinal(),
                height=0.6, color=color, alpha=0.8, edgecolor="none",
            )
            if task["assignee"]:
                mid = task["start"].toordinal() + duration / 2
                ax.text(mid, i, task["assignee"], ha="center", va="center",
                        fontsize=7, color="white", fontweight="bold")

        # Y axis labels
        ax.set_yticks(list(range(n)))
        ax.set_yticklabels([t["name"][:30] for t in parsed], fontsize=8, color=TEXT_COLOR)
        ax.invert_yaxis()

        # X axis: date labels
        all_starts = [t["start"].toordinal() for t in parsed]
        all_ends = [t["end"].toordinal() for t in parsed]
        x_min = min(all_starts) - 2
        x_max = max(all_ends) + 2
        ax.set_xlim(x_min, x_max)

        tick_count = min(8, x_max - x_min)
        tick_step = max(1, (x_max - x_min) // tick_count)
        tick_positions = list(range(x_min, x_max + 1, tick_step))
        tick_labels = [datetime.fromordinal(int(d)).strftime("%m/%d") for d in tick_positions]
        ax.set_xticks(tick_positions)
        ax.set_xticklabels(tick_labels, fontsize=7, color=TEXT_COLOR, rotation=45, ha="right")

        ax.set_title(title, fontsize=12, fontweight="bold", pad=10, color=TEXT_COLOR)

        # Legend
        legend_elements = [
            Patch(facecolor=c, label=s.replace("_", " ").title())
            for s, c in status_colors.items()
        ]
        ax.legend(handles=legend_elements, loc="upper right", fontsize=7,
                  facecolor=BG_COLOR, edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR)

        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close(fig)
        buf.seek(0)

        b64 = base64.b64encode(buf.read()).decode("utf-8")
        return f"data:image/png;base64,{b64}"
