"""Chart rendering service using matplotlib with CollabBoard's dark theme."""

import io
import base64
import logging

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for Docker
import matplotlib.pyplot as plt

logger = logging.getLogger(__name__)

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

    labels = data.get("labels", [])
    values = data.get("values", [])

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
