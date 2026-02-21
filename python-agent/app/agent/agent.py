"""Main agent with multi-provider LLM support and all CollabBoard tools using LangGraph."""

import logging
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

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an AI assistant for CollabBoard, a collaborative whiteboard application.
You help users create visual layouts on their boards.

SPATIAL AWARENESS:
- ALWAYS call get_board_layout() FIRST before creating any objects.
- Pass needed_width and needed_height to get recommended x, y coordinates for placement.
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


# Per-model agent cache
_agent_cache: dict[str, object] = {}


def get_agent(model_id: str = DEFAULT_MODEL_ID):
    """Get or create a cached agent for the given model."""
    if model_id not in _agent_cache:
        spec = get_model_spec(model_id)
        llm = _create_llm(spec)
        _agent_cache[model_id] = create_react_agent(
            llm,
            ALL_TOOLS,
            prompt=SYSTEM_PROMPT,
        )
        logger.info("Created agent for model: %s (%s)", model_id, spec.provider)
    return _agent_cache[model_id]


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
    spec = get_model_spec(model_id)
    agent = get_agent(model_id)
    trace_id = str(uuid.uuid4())

    # Set board state so layout-aware tools can access it
    set_board_state(board_state)

    # Build context with full object details so the agent can identify objects for edits
    board_context = _build_board_context(board_state)
    project_ctx = _build_project_context(project_context)

    user_message = f"Board ID: {board_id}\n{board_context}{project_ctx}\n\nCommand: {command}"

    # Collect callbacks for dual tracing
    callbacks = []
    langfuse_handler = get_langfuse_handler()
    if langfuse_handler:
        callbacks.append(langfuse_handler)

    config = {"callbacks": callbacks} if callbacks else {}

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

    # Record cost
    cost_tracker.record(
        model=spec.api_model_name,
        input_tokens=len(command.split()) * 4,
        output_tokens=len(str(actions)) // 4,
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
