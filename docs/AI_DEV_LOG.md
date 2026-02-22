# AI Development Log — CollabBoard

## Tools & Workflow
- **Claude Code** (CLI): Primary development tool for code generation, refactoring, and debugging
- **Cursor IDE**: AI-assisted editor for iterative development
- **MCP Servers**: Used for file operations and codebase navigation

## MCP Usage
- File system MCP for reading/writing project files
- Git MCP for version control operations

## Effective Prompts

### Prompt 1: Architecture Setup
> "Set up a real-time collaborative whiteboard with React + Konva canvas on the frontend, Hono server with Socket.IO on the backend, and a Python FastAPI agent with LangGraph for AI capabilities."

### Prompt 2: AI Agent Integration
> "Create a LangGraph ReAct agent that can create sticky notes, shapes, frames, connectors, and charts on the board via natural language commands. Support Groq, OpenAI, and Anthropic models."

### Prompt 3: Security Hardening
> "Perform a comprehensive security audit and fix all issues: centralize secrets, add OAuth CSRF protection, fix XSS in email templates, add board authorization middleware."

## Code Analysis
- **AI-generated**: ~70% of initial boilerplate, schemas, and CRUD endpoints
- **Hand-written/Modified**: ~30% — business logic, real-time sync, canvas interactions, UI polish
- **AI-reviewed**: 100% — all code reviewed and refined through AI pair programming

## Strengths of AI-Assisted Development
- Rapid prototyping of full-stack features
- Consistent code patterns across modules
- Comprehensive error handling coverage
- Fast refactoring across many files simultaneously

## Limitations Encountered
- AI sometimes generates overly verbose code requiring cleanup
- Complex canvas interactions (drag, transform, selection) needed manual tuning
- Real-time Socket.IO edge cases required iterative debugging
- UI design decisions (colors, spacing, layout) needed human judgment

## Key Learnings
1. Provide clear architectural context upfront for better code generation
2. Use AI for mechanical tasks (migrations, CRUD, type definitions) and focus human effort on UX
3. Always review AI-generated security-sensitive code (auth, crypto, SQL)
4. Break large tasks into smaller, focused prompts for better results
