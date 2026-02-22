"""Main agent with multi-provider LLM support and all CollabBoard tools using LangGraph."""

import logging
import re
import threading
import uuid

from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.tracing.setup import get_langfuse_handler
from app.tracing.cost_tracker import cost_tracker
from app.agent.models import get_model_spec, ModelSpec, DEFAULT_MODEL_ID
from app.agent.tools.board_tools import BOARD_TOOLS, set_board_state
from app.agent.tools.chart_tools import CHART_TOOLS
from app.agent.tools.document_tools import DOCUMENT_TOOLS
from app.agent.tools.sprint_tools import SPRINT_TOOLS
from app.agent.tools.planning_tools import PLANNING_TOOLS
from app.agent.tools.diagram_tools import DIAGRAM_TOOLS
from app.services.layout_service import describe_board_layout, find_open_position

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an AI assistant for CollabBoard, a collaborative whiteboard application.
You help users create visual layouts on their boards.

SPATIAL AWARENESS:
- The current board layout is already provided in the user message under "BOARD LAYOUT:".
- Use that layout info to determine where to place new objects.
- Only call get_board_layout(needed_width, needed_height) when you need SPECIFIC pixel
  coordinates for a block of a given width and height — e.g., for complex multi-object
  diagrams where exact placement matters. Pass actual pixel dimensions, not zeros.
- Leave at least 20-40px gaps between objects.

EDITING EXISTING OBJECTS:
- The board state listing shows every object with its ID, type, text, color, and position.
- Use update_object(object_id, ...) to change text, color, position, or size.
- Use delete_object(object_id) to remove an object.
- Use find_objects_by_text() to search for objects by text content.
- NEVER recreate an object that already exists. Update it in place.

DIAGRAMS & PLANNING:
- Use generate_sequence_diagram for message flow between actors/services.
- Use generate_system_diagram for architecture and component layouts.
- Use generate_gantt_chart for timeline/schedule visualization with start/end dates.
- Use generate_flow_diagram for plans, workflows, and processes as connected nodes.
- Use generate_team_graph to show who is working on what (person → task connections).
- Use generate_sprint_board for Kanban-style sprint boards from task lists.

DOCUMENT ANALYSIS:
- Use analyze_document to create visual summaries, key points, timelines, or stats from uploaded docs.
- The board_id is provided in the context below — pass it to document tools.

Guidelines:
- Sticky notes auto-size based on text length, leave 20-30px gaps
- Colors: yellow (#FEF08A) ideas, blue (#93C5FD) info, green (#86EFAC) done, red (#FCA5A5) blockers
- For connectors, reference temp_ids of objects you just created
- ALWAYS call the tools. Do not just describe what you would do.

RESPONSE STYLE (CRITICAL):
- Your final message to the user must be SHORT, friendly, and human-readable.
- NEVER mention object IDs, temp_ids, coordinates, hex colors, or internal details.
- NEVER list raw tool outputs or action results.
- Good: "Done! I created a SWOT analysis with 4 sticky notes."
- Good: "I've added a sequence diagram showing the login flow between Client, Server, and Database."
- Bad: "Created sticky obj-a1b2c3d4 at (100,200) with color #FEF08A..."
- Summarize WHAT you did in plain language, not HOW you did it internally."""


ALL_TOOLS = BOARD_TOOLS + CHART_TOOLS + DOCUMENT_TOOLS + SPRINT_TOOLS + PLANNING_TOOLS + DIAGRAM_TOOLS

# ── Tool-set definitions for intent-based selective loading ──────────────────
TOOL_SETS: dict[str, list] = {
    "board_only": BOARD_TOOLS,                                    # 10 tools
    "chart":      BOARD_TOOLS + CHART_TOOLS,                      # 12 tools
    "diagram":    BOARD_TOOLS + DIAGRAM_TOOLS + PLANNING_TOOLS,   # 15 tools
    "sprint":     BOARD_TOOLS + SPRINT_TOOLS,                     # 11 tools
    "document":   BOARD_TOOLS + DOCUMENT_TOOLS,                   # 12 tools
    "all":        ALL_TOOLS,                                       # 20 tools
}


def _classify_tool_set(command: str) -> str:
    """Return the tool-set key appropriate for this command."""
    cmd = command.lower()
    if any(w in cmd for w in ["analyze", "summarize", "document", "pdf", "uploaded"]):
        return "document"
    if any(w in cmd for w in ["sprint", "kanban", "backlog", "scrum"]):
        return "sprint"
    if any(w in cmd for w in ["chart", "dashboard", "bar chart", "pie chart", "line chart"]):
        return "chart"
    if any(w in cmd for w in [
        "sequence diagram", "system diagram", "architecture", "gantt",
        "flow diagram", "workflow", "team graph", "roadmap", "timeline",
        "process flow",
    ]):
        return "diagram"
    if any(w in cmd for w in [
        "sticky", "note", "shape", "frame", "connector", "arrow",
        "move", "delete", "remove", "update", "change", "edit",
        "color", "position", "resize",
    ]):
        return "board_only"
    return "all"


# ── Deterministic command router ────────────────────────────────────────────
_COLOR_MAP: dict[str, str] = {
    "yellow": "#FEF08A", "blue": "#93C5FD", "green": "#86EFAC",
    "red": "#FCA5A5", "purple": "#DDD6FE", "orange": "#FED7AA",
    "pink": "#FECACA", "white": "#FFFFFF",
}

_SELECTED_OBJ_RE = re.compile(
    r'^\[Selected object: id=(?P<obj_id>[^,\]]+),\s*type=(?P<obj_type>[^,\]]+)'
    r'(?:,\s*text="(?P<obj_text>[^"]*)")?\]\s*(?P<rest>.+)$',
    re.DOTALL,
)

_STICKY_RE = re.compile(
    r'^(?:create|add|make|put)\s+(?:a\s+)?'
    r'(?:(?P<color>yellow|blue|green|red|purple|orange|pink|white)\s+)?'
    r'sticky\s*(?:note\s*)?'
    r'(?:saying|with\s+text|that\s+says|titled|:)?\s*'
    r'["\']?(?P<text>.+?)["\']?$',
    re.IGNORECASE,
)

_FIT_VIEW_RE = re.compile(
    r'^(?:fit\s+(?:view|to\s+screen|everything)|zoom\s+to\s+fit|show\s+all|see\s+everything)$',
    re.IGNORECASE,
)

_DELETE_RE = re.compile(
    r'^(?:delete|remove)\s+(?:this|it|that|the\s+\w+)\s*$',
    re.IGNORECASE,
)

_RECOLOR_RE = re.compile(
    r'^(?:make\s+(?:it|this)|change\s+(?:it\s+)?(?:to|into)|set\s+(?:it\s+)?(?:color\s+)?to)\s+'
    r'(?P<color>yellow|blue|green|red|purple|orange|pink|white)\s*$',
    re.IGNORECASE,
)


def try_deterministic_route(
    command: str,
    board_state: list[dict],
    board_id: str,
    trace_id: str,
) -> dict | None:
    """Handle simple commands deterministically without invoking the LLM.

    Returns a result dict (same shape as run_agent) if matched, or None to
    fall through to the full agent.
    """
    cmd = command.strip()

    # Extract selected object context if present
    selected_id = ""
    selected_type = ""
    m_sel = _SELECTED_OBJ_RE.match(cmd)
    if m_sel:
        selected_id = m_sel.group("obj_id")
        selected_type = m_sel.group("obj_type")
        cmd = m_sel.group("rest").strip()

    # ── Fit view ──
    if _FIT_VIEW_RE.match(cmd):
        return {
            "message": "Zooming to fit everything on screen.",
            "actions": [],
            "actions_performed": ["fit_view"],
            "trace_id": trace_id,
            "fit_to_view": True,
        }

    # ── Create a sticky note ──
    m = _STICKY_RE.match(cmd)
    if m:
        text = (m.group("text") or "").strip().strip("'\"")
        if text:
            color_kw = (m.group("color") or "").lower()
            color_hex = _COLOR_MAP.get(color_kw, "#FEF08A")

            x, y = find_open_position(board_state, needed_width=200, needed_height=140)

            text_len = len(text)
            if text_len <= 30:
                w, h, fs = 160, 100, 16
            elif text_len <= 80:
                w, h, fs = 200, 140, 15
            elif text_len <= 150:
                w, h, fs = 220, 180, 14
            else:
                w, h, fs = 250, 220, 13

            temp_id = f"sticky-{uuid.uuid4().hex[:8]}"
            action = {
                "action": "create",
                "object_type": "sticky",
                "temp_id": temp_id,
                "props": {
                    "text": text, "x": int(x), "y": int(y),
                    "width": w, "height": h, "color": color_hex,
                    "font_size": fs, "rotation": 0,
                },
            }
            preview = text[:40] + ("..." if len(text) > 40 else "")
            return {
                "message": f'Done! Created a sticky note: "{preview}"',
                "actions": [action],
                "actions_performed": ["create_sticky_note: sticky"],
                "trace_id": trace_id,
                "fit_to_view": False,
            }

    # ── Delete selected object ──
    if selected_id and _DELETE_RE.match(cmd):
        return {
            "message": "Done! Deleted the object.",
            "actions": [{
                "action": "delete",
                "object_type": selected_type or "sticky",
                "object_id": selected_id,
                "props": {},
            }],
            "actions_performed": ["delete_object"],
            "trace_id": trace_id,
            "fit_to_view": False,
        }

    # ── Recolor selected object ──
    if selected_id:
        m = _RECOLOR_RE.match(cmd)
        if m:
            color_kw = m.group("color").lower()
            color_hex = _COLOR_MAP.get(color_kw, "#FEF08A")
            return {
                "message": f"Done! Changed the color to {color_kw}.",
                "actions": [{
                    "action": "update",
                    "object_type": selected_type or "sticky",
                    "object_id": selected_id,
                    "props": {"color": color_hex, "fill": color_hex},
                }],
                "actions_performed": ["update_object"],
                "trace_id": trace_id,
                "fit_to_view": False,
            }

    return None


def _create_llm(spec: ModelSpec) -> BaseChatModel:
    """Create the appropriate LangChain chat model for the given spec."""
    if spec.provider == "groq":
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is not configured")
        return ChatGroq(
            model=spec.api_model_name,
            temperature=spec.temperature,
            api_key=settings.groq_api_key,
        )
    elif spec.provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is not configured")
        return ChatOpenAI(
            model=spec.api_model_name,
            temperature=spec.temperature,
            api_key=settings.openai_api_key,
        )
    elif spec.provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured")
        return ChatAnthropic(
            model=spec.api_model_name,
            temperature=spec.temperature,
            api_key=settings.anthropic_api_key,
        )
    else:
        raise ValueError(f"Unknown provider: {spec.provider}")


# Per (model, tool_set) agent cache with thread-safe access
_agent_cache: dict[tuple[str, str], object] = {}
_agent_cache_lock = threading.Lock()
_MAX_AGENT_CACHE_SIZE = 20


def get_agent(model_id: str = DEFAULT_MODEL_ID, tool_set_key: str = "all"):
    """Get or create a cached agent for the given model and tool set."""
    cache_key = (model_id, tool_set_key)
    with _agent_cache_lock:
        if cache_key in _agent_cache:
            return _agent_cache[cache_key]
    # Build agent outside the lock (expensive operation)
    spec = get_model_spec(model_id)
    llm = _create_llm(spec)
    tools = TOOL_SETS.get(tool_set_key, ALL_TOOLS)
    new_agent = create_react_agent(
        llm,
        tools,
        prompt=SYSTEM_PROMPT,
    )
    with _agent_cache_lock:
        if len(_agent_cache) >= _MAX_AGENT_CACHE_SIZE:
            oldest_key = next(iter(_agent_cache))
            del _agent_cache[oldest_key]
        _agent_cache[cache_key] = new_agent
    logger.info(
        "Created agent for model=%s tool_set=%s (%d tools)",
        model_id, tool_set_key, len(tools),
    )
    return new_agent


MAX_OBJECTS_IN_CONTEXT = 50
MAX_TEXT_LENGTH = 80


def _build_board_context(board_state: list[dict]) -> str:
    """Build a detailed board context string the LLM can use to identify objects."""
    if not board_state:
        return "Board is empty (0 objects)."

    # Count by type
    type_counts: dict[str, int] = {}
    for obj in board_state:
        t = obj.get("type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1
    summary = ", ".join(f"{c} {t}{'s' if c > 1 else ''}" for t, c in type_counts.items())

    lines = [f"Board has {len(board_state)} objects ({summary})."]
    lines.append("")
    lines.append("OBJECTS ON BOARD:")

    # List each object with key details (cap at MAX_OBJECTS_IN_CONTEXT)
    listed = 0
    for obj in board_state:
        if obj.get("type") == "connector":
            continue  # Skip connectors — not directly editable by text
        if listed >= MAX_OBJECTS_IN_CONTEXT:
            remaining = len(board_state) - listed
            lines.append(f"  ... and {remaining} more objects (use list_board_objects to see all)")
            break

        obj_id = obj.get("id", "?")
        obj_type = obj.get("type", "unknown")
        x = int(obj.get("x", 0))
        y = int(obj.get("y", 0))
        w = int(obj.get("width", 0))
        h = int(obj.get("height", 0))

        # Get display text
        text = obj.get("text", "") or obj.get("title", "")
        if text and len(text) > MAX_TEXT_LENGTH:
            text = text[:MAX_TEXT_LENGTH] + "..."

        # Get color
        color = obj.get("color", "") or obj.get("fill", "")

        parts = [f"  [{obj_type}] id={obj_id}"]
        if text:
            parts.append(f'text="{text}"')
        if color:
            parts.append(f"color={color}")
        parts.append(f"pos=({x},{y}) size={w}x{h}")

        # Task metadata
        assigned = obj.get("assigned_to", "")
        if assigned:
            parts.append(f"assigned={assigned}")
        tags = obj.get("tags")
        if tags:
            parts.append(f"tags={','.join(tags)}")
        status = obj.get("status", "")
        if status:
            parts.append(f"status={status}")
        priority = obj.get("priority", "")
        if priority:
            parts.append(f"priority={priority}")
        due = obj.get("due_date", "")
        if due:
            parts.append(f"due={due}")

        lines.append(" ".join(parts))
        listed += 1

    return "\n".join(lines)


def _build_project_context(project_context: dict | None) -> str:
    """Build a project context string for project-aware prompting."""
    if not project_context:
        return ""

    lines = ["\nPROJECT CONTEXT:"]
    name = project_context.get("name", "")
    if name:
        lines.append(f"  Project: {name}")
    desc = project_context.get("description", "")
    if desc:
        lines.append(f"  Description: {desc}")
    industry = project_context.get("industry", "")
    if industry:
        lines.append(f"  Industry: {industry}")
    status = project_context.get("status", "")
    if status:
        lines.append(f"  Status: {status}")
    start = project_context.get("start_date", "")
    end = project_context.get("end_date", "")
    if start or end:
        lines.append(f"  Timeline: {start or '?'} → {end or '?'}")

    # Sibling boards in the same project
    siblings = project_context.get("sibling_boards", [])
    if siblings:
        lines.append(f"  Other boards in this project ({len(siblings)}):")
        for sb in siblings[:10]:
            obj_count = sb.get("object_count", 0)
            lines.append(f"    - \"{sb.get('title', 'Untitled')}\" ({obj_count} objects)")

    # Cross-board task summary
    task_stats = project_context.get("task_stats")
    if task_stats:
        lines.append(f"  Project tasks: {task_stats.get('total_objects', 0)} total, "
                      f"{task_stats.get('done_count', 0)} done, "
                      f"{task_stats.get('in_progress_count', 0)} in progress, "
                      f"{task_stats.get('todo_count', 0)} todo")
        assignees = task_stats.get("assignees", [])
        if assignees:
            lines.append(f"  Assignees: {', '.join(assignees[:10])}")

    return "\n".join(lines)


def run_agent(
    command: str,
    board_state: list[dict],
    board_id: str = "",
    model_id: str = DEFAULT_MODEL_ID,
    project_context: dict | None = None,
) -> dict:
    """Run the agent with a user command and return board actions.

    Args:
        command: Natural language command from the user
        board_state: Current objects on the board
        board_id: Board ID for document search scoping
        model_id: LLM model to use (e.g. 'gpt-4o-mini', 'claude-haiku')
        project_context: Optional project metadata when board belongs to a project

    Returns:
        dict with 'message', 'actions', 'actions_performed', 'trace_id'
    """
    trace_id = str(uuid.uuid4())

    # Set board state so layout-aware tools can access it
    set_board_state(board_state)

    # ── Optimization 2: Try deterministic route first (zero LLM calls) ──
    deterministic_result = try_deterministic_route(command, board_state, board_id, trace_id)
    if deterministic_result is not None:
        logger.info("Deterministic route matched for command: %s", command[:60])
        cost_tracker.record(
            model="deterministic",
            input_tokens=0,
            output_tokens=0,
            trace_id=trace_id,
            operation="deterministic_route",
        )
        return deterministic_result

    # ── Full agent path ──
    spec = get_model_spec(model_id)
    tool_set_key = _classify_tool_set(command)
    agent = get_agent(model_id, tool_set_key)

    # Build context with full object details so the agent can identify objects for edits
    board_context = _build_board_context(board_state)

    # Optimization 1: Pre-compute layout so agent doesn't need to call get_board_layout first
    board_layout = describe_board_layout(board_state)

    project_ctx = _build_project_context(project_context)

    user_message = (
        f"Board ID: {board_id}\n{board_context}\n\n"
        f"BOARD LAYOUT:\n{board_layout}"
        f"{project_ctx}\n\n"
        f"Command: {command}"
    )

    # Collect callbacks for dual tracing
    callbacks = []
    langfuse_handler = get_langfuse_handler()
    if langfuse_handler:
        callbacks.append(langfuse_handler)

    # Optimization 3: Cap ReAct iterations using the config setting
    config: dict = {"recursion_limit": settings.max_agent_iterations}
    if callbacks:
        config["callbacks"] = callbacks

    try:
        result = agent.invoke(
            {"messages": [HumanMessage(content=user_message)]},
            config=config,
        )
    except Exception as e:
        logger.error("Agent execution failed: %s", e)
        return {
            "message": f"Agent error: {str(e)}",
            "actions": [],
            "actions_performed": [],
            "trace_id": trace_id,
        }

    # Extract board actions from tool call results in the message history
    actions = []
    actions_performed = []
    final_message = "Done"
    fit_to_view = False

    for msg in result.get("messages", []):
        # Tool messages contain the structured output from our tools
        if hasattr(msg, "type") and msg.type == "tool":
            content = msg.content
            # Tool output can be a string representation of dict/list
            if isinstance(content, str):
                try:
                    import json
                    content = json.loads(content)
                except (json.JSONDecodeError, TypeError):
                    continue

            if isinstance(content, dict) and "action" in content:
                if content["action"] == "fit_view":
                    fit_to_view = True
                    actions_performed.append("fit_view")
                else:
                    actions.append(content)
                    actions_performed.append(
                        f"{msg.name}: {content.get('object_type', '')}"
                    )
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and "action" in item:
                        actions.append(item)
                actions_performed.append(f"{msg.name}: {len(content)} objects")

        # The last AI message is the final response
        if hasattr(msg, "type") and msg.type == "ai" and isinstance(msg.content, str) and msg.content:
            final_message = msg.content

    # Extract actual token usage from LLM response metadata
    messages = result.get("messages", [])
    total_input = 0
    total_output = 0
    for m in messages:
        if hasattr(m, 'response_metadata'):
            usage = m.response_metadata.get("usage", {})
            total_input += usage.get("input_tokens", usage.get("prompt_tokens", 0))
            total_output += usage.get("output_tokens", usage.get("completion_tokens", 0))

    # Record cost (fall back to estimates if actual usage not available)
    cost_tracker.record(
        model=spec.api_model_name,
        input_tokens=total_input or len(command.split()) * 4,
        output_tokens=total_output or len(str(actions)) // 4,
        trace_id=trace_id,
        operation=_classify_operation(command),
    )

    return {
        "message": final_message,
        "actions": actions,
        "actions_performed": actions_performed,
        "trace_id": trace_id,
        "fit_to_view": fit_to_view,
    }


def _classify_operation(command: str) -> str:
    """Classify the operation type for cost tracking."""
    cmd = command.lower()
    if any(w in cmd for w in ["sprint", "kanban", "backlog"]):
        return "sprint_board"
    if any(w in cmd for w in ["chart", "graph", "dashboard", "metric"]):
        return "chart_generation"
    if any(w in cmd for w in ["plan", "steps", "roadmap"]):
        return "plan_generation"
    if any(w in cmd for w in ["workflow", "process", "flow"]):
        return "workflow_generation"
    if any(w in cmd for w in ["sequence", "seq diagram"]):
        return "sequence_diagram"
    if any(w in cmd for w in ["architecture", "system diagram", "component"]):
        return "system_diagram"
    if any(w in cmd for w in ["tracker", "completion", "progress"]):
        return "project_tracking"
    if any(w in cmd for w in ["analyze", "summarize", "summary", "timeline", "statistics"]):
        return "document_analysis"
    if any(w in cmd for w in ["document", "pdf", "search", "find in"]):
        return "document_search"
    return "board_manipulation"
