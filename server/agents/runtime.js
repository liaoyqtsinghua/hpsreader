import { randomUUID } from "node:crypto";
import { createClaudeAgentClient, toClaudeTools } from "./claude.js";
import { createOpenAiCompatibleAgentClient, toOpenAiToolResult, toOpenAiTool } from "./openai-compatible.js";
import { createProjectToolRegistry } from "./tools.js";
import { getSkill } from "./skills.js";
import { getProviderClientConfig } from "../llm/providers.js";

export function createAgentRuntime({ storage }) {
  return {
    async run(input) {
      const projectId = input.projectId;
      if (!projectId) throw badRequest("projectId is required.");

      const project = await storage.getProject(projectId);
      const skill = getSkill(input.skillId || "scholarly-workshop");
      const registry = createProjectToolRegistry({ storage, projectId });
      const tools = registry.listTools();
      const providerId = input.providerId || "anthropic";
      const client = await createAgentClient(providerId, input);
      const toolSpec = client.kind === "openai-compatible" ? tools.map(toOpenAiTool) : toClaudeTools(tools);

      const trace = createTrace({
        projectId,
        skillId: skill.id,
        providerId: client.id,
        model: client.model,
        userInput: input.instruction || "",
      });

      if (!client.configured) {
        trace.status = "failed";
        trace.error = `${client.label || client.id} is not configured.`;
        await storage.addAgentTrace(projectId, trace);
        throw badRequest(trace.error);
      }

      const messages = [
        {
          role: "user",
          content: buildUserPrompt({ input, project, skill }),
        },
      ];

      for (let step = 0; step < (input.maxSteps || 8); step += 1) {
        const assistant = await client.createMessage({
          system: skill.systemPrompt,
          messages,
          tools: toolSpec,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
        });

        trace.steps.push({
          id: randomUUID(),
          type: "assistant",
          step,
          messageId: assistant.id,
          stopReason: assistant.stopReason,
          text: assistant.text,
          toolUses: assistant.toolUses,
          usage: assistant.usage,
          createdAt: new Date().toISOString(),
        });

        messages.push({
          role: "assistant",
          content: assistant.content,
          rawMessage: assistant.rawMessage,
        });

        if (!assistant.toolUses.length) {
          trace.status = "completed";
          trace.output = assistant.text;
          break;
        }

        const toolResults = [];
        for (const toolUse of assistant.toolUses) {
          const toolStep = {
            id: randomUUID(),
            type: "tool",
            step,
            toolUseId: toolUse.id,
            name: toolUse.name,
            input: toolUse.input,
            createdAt: new Date().toISOString(),
          };

          try {
            const result = await registry.callTool(toolUse.name, toolUse.input);
            toolStep.result = result;
            toolStep.status = "completed";
            toolResults.push(formatToolResult(client.kind, toolUse, result));
          } catch (error) {
            toolStep.status = "failed";
            toolStep.error = error.message;
            toolResults.push(formatToolResult(client.kind, toolUse, error.message, true));
          }

          trace.steps.push(toolStep);
        }

        if (client.kind === "openai-compatible") {
          messages.push(...toolResults);
        } else {
          messages.push({
            role: "user",
            content: toolResults,
          });
        }
      }

      if (trace.status === "running") {
        trace.status = "stopped";
        trace.output = "Agent stopped after reaching maxSteps.";
      }

      trace.updatedAt = new Date().toISOString();
      const savedTrace = await storage.addAgentTrace(projectId, trace);
      await storage.addAgentEvent(projectId, {
        type: "agent",
        title: `${skill.label} 运行完成`,
        detail: trace.output || trace.status,
      });

      return {
        trace: savedTrace,
        output: trace.output,
      };
    },
  };
}

async function createAgentClient(providerId, input) {
  if (providerId === "anthropic") {
    const config = await getProviderClientConfig(providerId);
    const client = createClaudeAgentClient(config);
    client.id = config.id;
    client.label = config.label;
    client.kind = "anthropic";
    return client;
  }

  if (providerId === "claude") {
    const client = createClaudeAgentClient(input.claude || {});
    client.label = "Anthropic Claude";
    client.kind = "anthropic";
    return client;
  }

  const config = await getProviderClientConfig(providerId);
  if (config.kind !== "openai-compatible") {
    throw badRequest(`${config.label} does not support agent tool calling yet.`);
  }
  return createOpenAiCompatibleAgentClient(config);
}

function formatToolResult(kind, toolUse, result, isError = false) {
  if (kind === "openai-compatible") {
    return toOpenAiToolResult(toolUse.id, toolUse.name, isError ? { error: result } : result);
  }
  return {
    type: "tool_result",
    tool_use_id: toolUse.id,
    is_error: isError || undefined,
    content: typeof result === "string" ? result : JSON.stringify(result),
  };
}

function buildUserPrompt({ input, project, skill }) {
  const document = project.documents.find((entry) => entry.id === input.documentId);
  const segment = document?.segments.find((entry) => entry.id === input.segmentId);
  const context = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      documentCount: project.documents.length,
      glossaryCount: project.glossary.length,
    },
    activeDocument: document
      ? {
          id: document.id,
          title: document.title,
          language: document.language,
          ingestionStatus: document.ingestionStatus,
          segmentCount: document.segments.length,
        }
      : null,
    activeSegment: segment
      ? {
          id: segment.id,
          index: segment.index,
          source: segment.source,
          translation: segment.translation,
          note: segment.note,
        }
      : null,
    skill: skill.id,
  };

  return [
    `Instruction:\n${input.instruction || "Run the selected scholarly agent workflow."}`,
    `Runtime context:\n${JSON.stringify(context, null, 2)}`,
    "Use tools when you need project state, document segments, glossary terms, or persistent updates.",
    "Do not overwrite user-authored translation without a tool call that explicitly targets the segment.",
  ].join("\n\n");
}

function createTrace(input) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId: input.projectId,
    skillId: input.skillId,
    providerId: input.providerId,
    model: input.model,
    status: "running",
    userInput: input.userInput,
    output: "",
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
