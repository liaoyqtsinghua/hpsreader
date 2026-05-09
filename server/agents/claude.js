const ANTHROPIC_VERSION = "2023-06-01";

export function createClaudeAgentClient(config = {}) {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
  const model = config.model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
  const baseUrl = (config.baseUrl || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");

  return {
    id: config.id || "claude",
    label: config.label || "Anthropic Claude",
    model,
    configured: Boolean(apiKey),

    async createMessage(input) {
      if (!apiKey) throw badRequest("ANTHROPIC_API_KEY is required for Claude agent runs.");

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens || 2400,
          temperature: input.temperature ?? 0.2,
          system: input.system,
          messages: input.messages,
          tools: input.tools,
        }),
      });

      const payload = await parseJsonResponse(response);
      return normalizeClaudeMessage(payload);
    },
  };
}

export function toClaudeTools(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

function normalizeClaudeMessage(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return {
    id: payload.id,
    role: payload.role || "assistant",
    stopReason: payload.stop_reason,
    usage: payload.usage || {},
    content,
    text: content
      .filter((part) => part.type === "text")
      .map((part) => part.text || "")
      .join("\n")
      .trim(),
    toolUses: content
      .filter((part) => part.type === "tool_use")
      .map((part) => ({
        id: part.id,
        name: part.name,
        input: part.input || {},
      })),
    raw: payload,
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }

  if (!response.ok) {
    const message = payload.error?.message || payload.message || response.statusText;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
