"""Spatial layout service for intelligent object placement on the board.

Analyzes existing board objects to find open space and prevent overlaps.
"""

from dataclasses import dataclass

# Canvas bounds must match client CANVAS_WIDTH / CANVAS_HEIGHT
CANVAS_WIDTH = 4000
CANVAS_HEIGHT = 3000


@dataclass
class BBox:
    x: float
    y: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    def overlaps(self, other: "BBox", padding: float = 0) -> bool:
        return not (
            self.right + padding <= other.x
            or other.right + padding <= self.x
            or self.bottom + padding <= other.y
            or other.bottom + padding <= self.y
        )


def _extract_bboxes(board_state: list[dict]) -> list[BBox]:
    """Extract bounding boxes from board state objects."""
    bboxes = []
    for obj in board_state:
        x = obj.get("x", 0)
        y = obj.get("y", 0)
        w = obj.get("width", 200)
        h = obj.get("height", 200)
        # Skip connectors (they have 0x0 dimensions)
        if obj.get("type") == "connector":
            continue
        bboxes.append(BBox(x=x, y=y, width=w, height=h))
    return bboxes


def get_board_bounds(board_state: list[dict]) -> dict:
    """Get the bounding rectangle of all existing objects.

    Returns dict with min_x, min_y, max_x, max_y, total_width, total_height.
    Returns zeros if board is empty.
    """
    bboxes = _extract_bboxes(board_state)
    if not bboxes:
        return {
            "min_x": 0, "min_y": 0,
            "max_x": 0, "max_y": 0,
            "total_width": 0, "total_height": 0,
            "object_count": 0,
        }

    min_x = min(b.x for b in bboxes)
    min_y = min(b.y for b in bboxes)
    max_x = max(b.right for b in bboxes)
    max_y = max(b.bottom for b in bboxes)

    return {
        "min_x": min_x, "min_y": min_y,
        "max_x": max_x, "max_y": max_y,
        "total_width": max_x - min_x,
        "total_height": max_y - min_y,
        "object_count": len(bboxes),
    }


def find_open_position(
    board_state: list[dict],
    needed_width: float,
    needed_height: float,
    padding: float = 40,
    prefer: str = "right",
) -> tuple[float, float]:
    """Find a position on the board that doesn't overlap with existing objects.

    Args:
        board_state: Current board objects
        needed_width: Width of the new content block
        needed_height: Height of the new content block
        padding: Gap between existing objects and new content
        prefer: Placement direction - 'right', 'below', or 'auto'

    Returns:
        (x, y) coordinates for the top-left corner of the new content
    """
    bboxes = _extract_bboxes(board_state)

    if not bboxes:
        return (100.0, 100.0)

    bounds = get_board_bounds(board_state)
    max_x = bounds["max_x"]
    max_y = bounds["max_y"]
    min_x = bounds["min_x"]
    min_y = bounds["min_y"]

    def clamp(x: float, y: float) -> tuple[float, float]:
        x = max(0.0, min(x, CANVAS_WIDTH - needed_width))
        y = max(0.0, min(y, CANVAS_HEIGHT - needed_height))
        return (x, y)

    if prefer == "right":
        return clamp(max_x + padding, min_y)

    if prefer == "below":
        return clamp(min_x, max_y + padding)

    # Auto: choose whichever direction gives a more balanced layout
    board_w = max_x - min_x
    board_h = max_y - min_y

    if board_w <= board_h:
        return clamp(max_x + padding, min_y)
    else:
        return clamp(min_x, max_y + padding)


def find_insert_position(
    board_state: list[dict],
    target_x: float,
    target_y: float,
    item_width: float,
    item_height: float,
    padding: float = 20,
) -> tuple[float, float]:
    """Find the nearest non-overlapping position close to a target location.

    Tries the exact target first, then scans nearby positions.

    Args:
        board_state: Current board objects
        target_x, target_y: Desired placement position
        item_width, item_height: Size of the object to place
        padding: Minimum gap between objects

    Returns:
        (x, y) that doesn't overlap with existing objects
    """
    bboxes = _extract_bboxes(board_state)

    def clamp(x: float, y: float) -> tuple[float, float]:
        x = max(0.0, min(x, CANVAS_WIDTH - item_width))
        y = max(0.0, min(y, CANVAS_HEIGHT - item_height))
        return (x, y)

    target_x, target_y = clamp(target_x, target_y)
    candidate = BBox(x=target_x, y=target_y, width=item_width, height=item_height)

    if not any(candidate.overlaps(b, padding) for b in bboxes):
        return (target_x, target_y)

    # Scan in expanding rings around the target
    step = item_width + padding
    for distance in range(1, 20):
        offsets = [
            (distance * step, 0),       # right
            (0, distance * step),        # below
            (-distance * step, 0),       # left
            (0, -distance * step),       # above
            (distance * step, distance * step),   # diagonal
        ]
        for dx, dy in offsets:
            nx, ny = clamp(target_x + dx, target_y + dy)
            candidate = BBox(x=nx, y=ny, width=item_width, height=item_height)
            if not any(candidate.overlaps(b, padding) for b in bboxes):
                return (nx, ny)

    # Fallback: place far to the right, clamped
    max_x = max((b.right for b in bboxes), default=0)
    return clamp(max_x + padding, target_y)


def describe_board_layout(board_state: list[dict]) -> str:
    """Generate a human-readable description of the board layout for the agent.

    Describes where objects are clustered and where free space exists.
    """
    bboxes = _extract_bboxes(board_state)
    if not bboxes:
        return f"The board is empty (canvas is {CANVAS_WIDTH}x{CANVAS_HEIGHT}px). You can place objects starting at position (100, 100)."

    bounds = get_board_bounds(board_state)

    # Categorize objects by region
    mid_x = (bounds["min_x"] + bounds["max_x"]) / 2
    mid_y = (bounds["min_y"] + bounds["max_y"]) / 2

    regions = {"top-left": 0, "top-right": 0, "bottom-left": 0, "bottom-right": 0}
    for b in bboxes:
        cx = b.x + b.width / 2
        cy = b.y + b.height / 2
        h = "left" if cx < mid_x else "right"
        v = "top" if cy < mid_y else "bottom"
        regions[f"{v}-{h}"] += 1

    # Count by type
    type_counts: dict[str, int] = {}
    for obj in board_state:
        t = obj.get("type", "unknown")
        if t == "connector":
            continue
        type_counts[t] = type_counts.get(t, 0) + 1

    types_desc = ", ".join(f"{c} {t}{'s' if c > 1 else ''}" for t, c in type_counts.items())

    occupied_desc = (
        f"Objects occupy the area from ({int(bounds['min_x'])}, {int(bounds['min_y'])}) "
        f"to ({int(bounds['max_x'])}, {int(bounds['max_y'])}) "
        f"({int(bounds['total_width'])}px wide x {int(bounds['total_height'])}px tall)."
    )

    # Find best open areas
    open_right_x = int(bounds["max_x"] + 40)
    open_below_y = int(bounds["max_y"] + 40)

    open_desc = (
        f"Free space available: to the RIGHT starting at x={open_right_x}, "
        f"or BELOW starting at y={open_below_y}."
    )

    dense_regions = [r for r, c in regions.items() if c > len(bboxes) / 4]
    sparse_regions = [r for r, c in regions.items() if c == 0]

    density_desc = ""
    if dense_regions:
        density_desc += f" Most objects are in the {', '.join(dense_regions)} area."
    if sparse_regions:
        density_desc += f" The {', '.join(sparse_regions)} area is empty."

    return (
        f"Board canvas is {CANVAS_WIDTH}x{CANVAS_HEIGHT}px. "
        f"Board has {len(bboxes)} objects ({types_desc}). "
        f"{occupied_desc} {open_desc}{density_desc}"
    )
