export function createProjectToolRegistry({ storage, projectId }) {
  const tools = [
    {
      name: "get_project_context",
      description: "Read the active project summary, documents, glossary, and recent agent events.",
      inputSchema: {
        type: "object",
        properties: {
          includeSegments: { type: "boolean", description: "Include segment text for all documents." },
        },
      },
      async execute(input) {
        const project = await storage.getProject(projectId);
        return serializeProject(project, { includeSegments: Boolean(input.includeSegments) });
      },
    },
    {
      name: "get_document_segments",
      description: "Read segment-level source, translation, and notes for one document.",
      inputSchema: {
        type: "object",
        required: ["documentId"],
        properties: {
          documentId: { type: "string" },
          start: { type: "number", description: "Optional 1-based segment start index." },
          limit: { type: "number", description: "Maximum number of segments to return." },
        },
      },
      async execute(input) {
        const project = await storage.getProject(projectId);
        const document = project.documents.find((entry) => entry.id === input.documentId);
        if (!document) throw notFound("Document not found.");
        const start = Math.max(Number(input.start || 1), 1);
        const limit = Math.min(Math.max(Number(input.limit || 20), 1), 80);
        return {
          document: {
            id: document.id,
            title: document.title,
            language: document.language,
            ingestionStatus: document.ingestionStatus,
          },
          segments: document.segments.slice(start - 1, start - 1 + limit),
        };
      },
    },
    {
      name: "update_segment_translation",
      description: "Persist a translation draft or corrected translation for a specific segment.",
      inputSchema: {
        type: "object",
        required: ["documentId", "segmentId", "translation"],
        properties: {
          documentId: { type: "string" },
          segmentId: { type: "string" },
          translation: { type: "string" },
          note: { type: "string" },
          status: { type: "string" },
        },
      },
      async execute(input) {
        const patch = {
          translation: String(input.translation || ""),
          status: input.status || "agent-draft",
        };
        if (typeof input.note === "string") patch.note = input.note;
        return storage.updateSegment(projectId, input.documentId, input.segmentId, patch);
      },
    },
    {
      name: "upsert_glossary_term",
      description: "Create or update a project glossary term.",
      inputSchema: {
        type: "object",
        required: ["source"],
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          confirmed: { type: "boolean" },
        },
      },
      async execute(input) {
        return storage.upsertGlossaryTerm(projectId, {
          source: input.source,
          target: input.target || "",
          confirmed: Boolean(input.confirmed),
        });
      },
    },
    {
      name: "add_segment_note",
      description: "Add or replace a scholarly note for a segment.",
      inputSchema: {
        type: "object",
        required: ["documentId", "segmentId", "note"],
        properties: {
          documentId: { type: "string" },
          segmentId: { type: "string" },
          note: { type: "string" },
        },
      },
      async execute(input) {
        return storage.updateSegment(projectId, input.documentId, input.segmentId, {
          note: String(input.note || ""),
        });
      },
    },
    {
      name: "record_agent_event",
      description: "Persist an agent event in the project cognitive trace.",
      inputSchema: {
        type: "object",
        required: ["title"],
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          segmentId: { type: "string" },
        },
      },
      async execute(input) {
        return storage.addAgentEvent(projectId, {
          type: input.type || "agent",
          title: input.title,
          detail: input.detail || "",
          segmentId: input.segmentId || null,
        });
      },
    },
  ];

  return {
    listTools() {
      return tools.map(({ execute, ...tool }) => tool);
    },

    async callTool(name, input) {
      const tool = tools.find((entry) => entry.name === name);
      if (!tool) throw notFound(`Tool not found: ${name}`);
      return tool.execute(input || {});
    },
  };
}

function serializeProject(project, options) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    documents: project.documents.map((document) => ({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      language: document.language,
      layout: document.layout,
      ingestionStatus: document.ingestionStatus,
      segmentCount: document.segments.length,
      segments: options.includeSegments ? document.segments : undefined,
    })),
    glossary: project.glossary,
    recentEvents: project.agentEvents.slice(0, 12),
  };
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}
