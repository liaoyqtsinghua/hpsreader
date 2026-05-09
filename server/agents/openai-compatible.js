export function createOpenAiCompatibleAgentClient(config) {
  return {
    id: config.id,
    label: config.label,
    model: config.model,
    configured: Boolean(config.configured),
    kind: "openai-compatible",

    async createMessage(input) {
      if (!config.configured) throw badRequest(`${config.label} is not configured.`);
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey || "local"}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: toOpenAiMessages(input.system, input.messages),
          tools: input.tools,
          tool_choice: "auto",
          temperature: input.temperature ?? 0.2,
        }),
      });

      const payload = await parseJsonResponse(response);
      const message = payload.choices?.[0]?.message || {};
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      return {
        id: payload.id || "",
        role: "assistant",
        stopReason: payload.choices?.[0]?.finish_reason || "",
        usage: payload.usage || {},
        content: message.content || "",
        rawMessage: message,
        text: message.content || "",
        toolUses: toolCalls.map((call) => ({
          id: call.id,
          name: call.function?.name,
          input: parseToolArguments(call.function?.arguments),
        })),
        raw: payload,
      };
    },
  };
}

export function toOpenAiTool(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

export function toOpenAiToolResult(toolUseId, name, result) {
  return {
    role: "tool",
    tool_call_id: toolUseId,
    name,
    content: typeof result === "string" ? result : JSON.stringify(result),
  };
}

function toOpenAiMessages(system, messages) {
  const output = [];
  if (system) output.push({ role: "system", content: system });
  messages.forEach((message) => {
    if (message.role === "tool") {
      output.push(message);
    } else if (message.role === "assistant" && message.rawMessage) {
      output.push({
        ...message.rawMessage,
        content: message.rawMessage.content || "",
      });
    } else {
      output.push({
        role: message.role,
        content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
      });
    }
  });
  return output;
}

function parseToolArguments(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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
