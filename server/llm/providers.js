const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    modelEnv: "OPENAI_MODEL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-3-5-sonnet-latest",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-1.5-pro",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    modelEnv: "DEEPSEEK_MODEL",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
  },
  {
    id: "qwen",
    label: "Qwen / DashScope",
    kind: "openai-compatible",
    apiKeyEnv: "QWEN_API_KEY",
    baseUrlEnv: "QWEN_BASE_URL",
    modelEnv: "QWEN_MODEL",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    modelEnv: "OPENROUTER_MODEL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "openai-compatible",
    apiKeyEnv: "OLLAMA_API_KEY",
    baseUrlEnv: "OLLAMA_BASE_URL",
    modelEnv: "OLLAMA_MODEL",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:7b",
    local: true,
    enabledWithoutKey: true,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "openai-compatible",
    apiKeyEnv: "LMSTUDIO_API_KEY",
    baseUrlEnv: "LMSTUDIO_BASE_URL",
    modelEnv: "LMSTUDIO_MODEL",
    defaultBaseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    local: true,
    enabledWithoutKey: true,
  },
];

let settingsStore = null;

export function configureProviderSettings(store) {
  settingsStore = store;
}

export async function listProviders() {
  return Promise.all(PROVIDERS.map(async (provider) => ({
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    local: Boolean(provider.local),
    configured: await isConfigured(provider),
    model: await getModel(provider),
    baseUrl: await getBaseUrl(provider),
    hasStoredApiKey: Boolean((await getStoredSettings(provider)).apiKey),
  })));
}

export async function runChatTask(input) {
  const provider = PROVIDERS.find((entry) => entry.id === input.providerId);
  if (!provider) throw badRequest("Unknown LLM provider.");
  if (!(await isConfigured(provider))) throw badRequest(`${provider.label} is not configured.`);

  const messages = normalizeMessages(input);
  if (provider.kind === "anthropic") return runAnthropic(provider, messages);
  if (provider.kind === "gemini") return runGemini(provider, messages);
  return runOpenAiCompatible(provider, messages);
}

export async function getProviderClientConfig(providerId) {
  const provider = PROVIDERS.find((entry) => entry.id === providerId);
  if (!provider) throw badRequest("Unknown LLM provider.");
  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    configured: await isConfigured(provider),
    apiKey: await getApiKey(provider),
    baseUrl: await getBaseUrl(provider),
    model: await getModel(provider),
    local: Boolean(provider.local),
  };
}

async function runOpenAiCompatible(provider, messages) {
  const baseUrl = await getBaseUrl(provider);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await getApiKey(provider)) || "local"}`,
    },
    body: JSON.stringify({
      model: await getModel(provider),
      messages,
      temperature: 0.2,
    }),
  });

  const payload = await parseJsonResponse(response);
  return {
    providerId: provider.id,
    model: await getModel(provider),
    text: payload.choices?.[0]?.message?.content || "",
    raw: payload,
  };
}

async function runAnthropic(provider, messages) {
  const system = messages.find((message) => message.role === "system")?.content || "";
  const userMessages = messages.filter((message) => message.role !== "system");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": await getApiKey(provider),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: await getModel(provider),
      max_tokens: 1600,
      system,
      messages: userMessages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    }),
  });

  const payload = await parseJsonResponse(response);
  return {
    providerId: provider.id,
    model: await getModel(provider),
    text: payload.content?.map((part) => part.text || "").join("") || "",
    raw: payload,
  };
}

async function runGemini(provider, messages) {
  const model = await getModel(provider);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(await getApiKey(provider))}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: messages.map((message) => `${message.role}: ${message.content}`).join("\n\n") }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  const payload = await parseJsonResponse(response);
  return {
    providerId: provider.id,
    model,
    text: payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "",
    raw: payload,
  };
}

function normalizeMessages(input) {
  const task = input.task || "chat";
  const source = String(input.source || "").trim();
  const glossary = Array.isArray(input.glossary) ? input.glossary : [];
  const userPrompt = String(input.prompt || "").trim();

  if (Array.isArray(input.messages) && input.messages.length) {
    return input.messages.map((message) => ({
      role: message.role || "user",
      content: String(message.content || ""),
    }));
  }

  const glossaryText = glossary
    .filter((term) => term.source && term.target)
    .map((term) => `${term.source} => ${term.target}`)
    .join("\n");

  const taskMap = {
    translate: "Translate the source text into polished Chinese. Preserve scholarly terminology and paragraph meaning.",
    polish: "Polish the Chinese text for scholarly writing while preserving meaning.",
    glossary: "Extract important scholarly terms and propose concise Chinese translations as JSON.",
    chat: "Assist with close reading and scholarly analysis.",
  };

  return [
    {
      role: "system",
      content: "You are a careful scholarly reading assistant for local-first research workflows.",
    },
    {
      role: "user",
      content: [
        taskMap[task] || taskMap.chat,
        glossaryText ? `Glossary:\n${glossaryText}` : "",
        userPrompt ? `User instruction:\n${userPrompt}` : "",
        source ? `Source:\n${source}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
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

async function getStoredSettings(provider) {
  if (!settingsStore) return {};
  return settingsStore.getProviderSettings(provider.id);
}

async function getApiKey(provider) {
  const stored = await getStoredSettings(provider);
  return stored.apiKey || process.env[provider.apiKeyEnv] || "";
}

async function getBaseUrl(provider) {
  const stored = await getStoredSettings(provider);
  return stored.baseUrl || process.env[provider.baseUrlEnv] || provider.defaultBaseUrl || "";
}

async function getModel(provider) {
  const stored = await getStoredSettings(provider);
  return stored.model || process.env[provider.modelEnv] || provider.defaultModel;
}

async function isConfigured(provider) {
  return Boolean(provider.enabledWithoutKey || (await getApiKey(provider)));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
