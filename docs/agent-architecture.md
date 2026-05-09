# Claude Agent Architecture

HPS Reader uses a Claude Agent SDK style architecture: a model-specific adapter drives a tool-use loop, while project capabilities are exposed through a local Tool Registry. The same runtime now also supports OpenAI-compatible tool calling providers such as DeepSeek.

## Runtime Flow

```text
User instruction
  -> AgentRuntime
  -> SkillRegistry selects system prompt
  -> ToolRegistry exposes local project tools
  -> Claude Messages API with tools
  -> tool_use blocks
  -> local tool execution
  -> tool_result blocks
  -> repeat until final text or maxSteps
  -> AgentTrace persisted locally
```

## Files

```text
server/agents/
  claude.js       Claude Messages API adapter with tool-use normalization
  openai-compatible.js OpenAI-compatible tool calling adapter for DeepSeek/OpenAI-like APIs
  runtime.js      Multi-step agent loop and trace creation
  tools.js        Local project Tool Registry
  skills.js       Default scholarly Skill Registry
```

## Registered Tools

- `get_project_context`
- `get_document_segments`
- `update_segment_translation`
- `upsert_glossary_term`
- `add_segment_note`
- `record_agent_event`

These tools intentionally operate only inside the selected project. This keeps agent changes local, inspectable, and easy to replace with a stronger permission layer later.

## Default Skills

- `scholarly-workshop`
- `terminology-sentinel`
- `academic-translator`
- `conceptual-archeology`

Each Skill contributes a system prompt and a narrow behavior contract. The runtime is shared.

## Trace Storage

Every agent run is persisted into the project as an `agentTrace`:

```text
agentTraces[]
  id
  projectId
  skillId
  providerId
  model
  status
  userInput
  output
  steps[]
```

Trace steps include assistant messages, tool calls, tool inputs, tool outputs, errors, and token usage where available.

## API

```text
GET  /api/agents/skills
POST /api/agents/run
GET  /api/projects/:projectId/agent-traces
GET  /api/projects/:projectId/agent-traces/:traceId
```

`POST /api/agents/run` requires `ANTHROPIC_API_KEY` in `.env`.
For DeepSeek or other OpenAI-compatible providers, configure the provider in the in-app LLM settings panel and pass `providerId` in the run request.
