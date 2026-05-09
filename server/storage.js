import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DB_FILE = "db.json";

export async function createStorage(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, DB_FILE);

  async function readDb() {
    try {
      const raw = await fs.readFile(dbPath, "utf8");
      return normalizeDb(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const initial = normalizeDb({});
      await writeDb(initial);
      return initial;
    }
  }

  async function writeDb(db) {
    const tmpPath = `${dbPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmpPath, dbPath);
  }

  async function mutate(mutator) {
    const db = await readDb();
    const result = await mutator(db);
    db.updatedAt = new Date().toISOString();
    await writeDb(db);
    return result;
  }

  return {
    async listProjects() {
      const db = await readDb();
      return db.projects.map(toProjectSummary);
    },

    async createProject(input) {
      return mutate((db) => {
        const project = {
          id: randomUUID(),
          name: input.name,
          description: input.description || "",
          documents: [],
          glossary: [],
          agentEvents: [],
          agentTraces: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.projects.unshift(project);
        return project;
      });
    },

    async getProject(projectId) {
      const db = await readDb();
      return findProject(db, projectId);
    },

    async updateProject(projectId, patch) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        if (typeof patch.name === "string") project.name = patch.name.trim() || project.name;
        if (typeof patch.description === "string") project.description = patch.description.trim();
        project.updatedAt = new Date().toISOString();
        return project;
      });
    },

    async createProjectSnapshot(projectId) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        project.snapshots = Array.isArray(project.snapshots) ? project.snapshots : [];
        const snapshotProject = structuredClone(project);
        delete snapshotProject.snapshots;
        const snapshot = {
          id: randomUUID(),
          name: `${project.name} 快照`,
          project: snapshotProject,
          createdAt: new Date().toISOString(),
        };
        project.snapshots.unshift(snapshot);
        project.snapshots = project.snapshots.slice(0, 12);
        project.updatedAt = snapshot.createdAt;
        return {
          id: snapshot.id,
          name: snapshot.name,
          createdAt: snapshot.createdAt,
        };
      });
    },

    async addDocument(projectId, document) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        project.documents.unshift(document);
        project.updatedAt = new Date().toISOString();
        project.agentEvents.unshift(createEvent("ingestion", "文献已摄取", `${document.title} · ${document.segments.length} 段`));
        project.agentEvents = project.agentEvents.slice(0, 120);
        return document;
      });
    },

    async updateDocument(projectId, documentId, patch) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const document = findDocument(project, documentId);
        applyDocumentPatch(document, patch || {});
        document.updatedAt = new Date().toISOString();
        project.updatedAt = document.updatedAt;
        return document;
      });
    },

    async updateSegment(projectId, documentId, segmentId, patch) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const document = findDocument(project, documentId);
        const segment = document.segments.find((entry) => entry.id === segmentId);
        if (!segment) throw notFound("Segment not found.");

        if (typeof patch.translation === "string") {
          segment.translation = patch.translation;
          segment.status = "edited";
        }
        if (typeof patch.note === "string") segment.note = patch.note;
        if (typeof patch.status === "string") segment.status = patch.status;

        document.updatedAt = new Date().toISOString();
        project.updatedAt = document.updatedAt;
        return segment;
      });
    },

    async addSegmentComment(projectId, documentId, segmentId, input) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const document = findDocument(project, documentId);
        const segment = findSegment(document, segmentId);
        const comment = createComment(input);
        segment.comments.unshift(comment);
        document.updatedAt = new Date().toISOString();
        project.updatedAt = document.updatedAt;
        return comment;
      });
    },

    async updateSegmentComment(projectId, documentId, segmentId, commentId, patch) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const document = findDocument(project, documentId);
        const segment = findSegment(document, segmentId);
        const comment = segment.comments.find((entry) => entry.id === commentId);
        if (!comment) throw notFound("Comment not found.");

        if (typeof patch.body === "string") comment.body = patch.body.trim();
        if (typeof patch.llmDraft === "string") comment.llmDraft = patch.llmDraft.trim();
        if (typeof patch.selectedText === "string") comment.selectedText = patch.selectedText.trim();
        if (typeof patch.target === "string") comment.target = normalizeCommentTarget(patch.target);
        comment.updatedAt = new Date().toISOString();
        document.updatedAt = comment.updatedAt;
        project.updatedAt = comment.updatedAt;
        return comment;
      });
    },

    async deleteSegmentComment(projectId, documentId, segmentId, commentId) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const document = findDocument(project, documentId);
        const segment = findSegment(document, segmentId);
        segment.comments = segment.comments.filter((entry) => entry.id !== commentId);
        document.updatedAt = new Date().toISOString();
        project.updatedAt = document.updatedAt;
      });
    },

    async upsertGlossaryTerm(projectId, input) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const source = String(input.source || "").trim();
        const target = String(input.target || "").trim();
        if (!source) throw badRequest("Glossary source is required.");
        const variants = normalizeVariants(input.variants);
        const lemma = typeof input.lemma === "string" ? input.lemma.trim() : "";
        const language = typeof input.language === "string" ? input.language.trim() : "";

        let term = project.glossary.find((entry) => entry.source.toLowerCase() === source.toLowerCase());
        if (term) {
          term.target = target;
          term.confirmed = Boolean(input.confirmed ?? target);
          term.variants = variants;
          term.lemma = lemma;
          term.language = language;
          term.updatedAt = new Date().toISOString();
        } else {
          term = {
            id: randomUUID(),
            source,
            target,
            variants,
            lemma,
            language,
            confirmed: Boolean(input.confirmed ?? target),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          project.glossary.unshift(term);
        }

        project.updatedAt = new Date().toISOString();
        return term;
      });
    },

    async updateGlossaryTerm(projectId, termId, patch) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const term = project.glossary.find((entry) => entry.id === termId);
        if (!term) throw notFound("Glossary term not found.");

        if (typeof patch.source === "string") term.source = patch.source.trim();
        if (typeof patch.target === "string") term.target = patch.target.trim();
        if (Array.isArray(patch.variants) || typeof patch.variants === "string") term.variants = normalizeVariants(patch.variants);
        if (typeof patch.lemma === "string") term.lemma = patch.lemma.trim();
        if (typeof patch.language === "string") term.language = patch.language.trim();
        if (typeof patch.confirmed === "boolean") term.confirmed = patch.confirmed && Boolean(term.target);
        if (!term.source) throw badRequest("Glossary source is required.");
        if (!term.target) term.confirmed = false;
        term.updatedAt = new Date().toISOString();
        project.updatedAt = term.updatedAt;
        return term;
      });
    },

    async deleteGlossaryTerm(projectId, termId) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        project.glossary = project.glossary.filter((entry) => entry.id !== termId);
        project.updatedAt = new Date().toISOString();
      });
    },

    async addAgentEvent(projectId, input) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        const event = createEvent(input.type || "manual", input.title || "事件", input.detail || "", input.segmentId || null);
        project.agentEvents.unshift(event);
        project.agentEvents = project.agentEvents.slice(0, 120);
        project.updatedAt = new Date().toISOString();
        return event;
      });
    },

    async listAgentTraces(projectId) {
      const db = await readDb();
      const project = findProject(db, projectId);
      return project.agentTraces.map(toTraceSummary);
    },

    async getAgentTrace(projectId, traceId) {
      const db = await readDb();
      const project = findProject(db, projectId);
      const trace = project.agentTraces.find((entry) => entry.id === traceId);
      if (!trace) throw notFound("Agent trace not found.");
      return trace;
    },

    async addAgentTrace(projectId, trace) {
      return mutate((db) => {
        const project = findProject(db, projectId);
        project.agentTraces.unshift(trace);
        project.agentTraces = project.agentTraces.slice(0, 80);
        project.updatedAt = new Date().toISOString();
        return trace;
      });
    },
  };
}

function normalizeDb(db) {
  return {
    version: 1,
    projects: Array.isArray(db.projects) ? db.projects : [],
    updatedAt: db.updatedAt || new Date().toISOString(),
  };
}

function findProject(db, projectId) {
  const project = db.projects.find((entry) => entry.id === projectId);
  if (!project) throw notFound("Project not found.");
  project.documents = Array.isArray(project.documents) ? project.documents : [];
  project.documents.forEach(normalizeDocument);
  project.glossary = (Array.isArray(project.glossary) ? project.glossary : []).map(normalizeGlossaryTerm);
  project.agentEvents = Array.isArray(project.agentEvents) ? project.agentEvents : [];
  project.agentTraces = Array.isArray(project.agentTraces) ? project.agentTraces : [];
  project.snapshots = Array.isArray(project.snapshots) ? project.snapshots : [];
  return project;
}

function findDocument(project, documentId) {
  const document = project.documents.find((entry) => entry.id === documentId);
  if (!document) throw notFound("Document not found.");
  normalizeDocument(document);
  return document;
}

function findSegment(document, segmentId) {
  const segment = document.segments.find((entry) => entry.id === segmentId);
  if (!segment) throw notFound("Segment not found.");
  segment.comments = Array.isArray(segment.comments) ? segment.comments : [];
  return segment;
}

function normalizeDocument(document) {
  const fileName = String(document.fileName || document.title || document.storagePath || "").toLowerCase();
  if (!document.layout) {
    if (document.mimeType === "application/pdf" || fileName.endsWith(".pdf")) document.layout = "pdf";
    else if (document.mimeType?.startsWith?.("image/") || /\.(png|jpe?g|webp|tiff?|bmp)$/.test(fileName)) document.layout = "image";
    else document.layout = "text";
  }
  if (!document.extractionMethod) {
    document.extractionMethod = document.layout === "pdf" ? "pdf-text-layer" : "text";
  }
  document.pages = Array.isArray(document.pages) ? document.pages : [];
  document.segments = Array.isArray(document.segments) ? document.segments : [];
  document.segments.forEach((segment) => {
    segment.comments = Array.isArray(segment.comments) ? segment.comments.map(normalizeComment) : [];
  });
  return document;
}

function applyDocumentPatch(document, patch) {
  if (typeof patch.sourceText === "string") document.sourceText = patch.sourceText;
  if (Array.isArray(patch.segments)) document.segments = patch.segments;
  if (Array.isArray(patch.pages)) document.pages = patch.pages;
  if (typeof patch.ingestionStatus === "string") document.ingestionStatus = patch.ingestionStatus;
  if (typeof patch.extractionMethod === "string") document.extractionMethod = patch.extractionMethod;
  if (typeof patch.warning === "string") document.warning = patch.warning;
  if (typeof patch.language === "string") document.language = patch.language;
  normalizeDocument(document);
}

function normalizeGlossaryTerm(term) {
  term.variants = normalizeVariants(term.variants);
  term.lemma = typeof term.lemma === "string" ? term.lemma : "";
  term.language = typeof term.language === "string" ? term.language : "";
  term.confirmed = Boolean(term.confirmed && term.target);
  return term;
}

function normalizeComment(comment) {
  return {
    id: comment.id || randomUUID(),
    target: normalizeCommentTarget(comment.target),
    selectedText: String(comment.selectedText || "").trim(),
    body: String(comment.body || "").trim(),
    llmDraft: String(comment.llmDraft || "").trim(),
    createdAt: comment.createdAt || new Date().toISOString(),
    updatedAt: comment.updatedAt || comment.createdAt || new Date().toISOString(),
  };
}

function createComment(input = {}) {
  const selectedText = String(input.selectedText || "").trim();
  if (!selectedText) throw badRequest("Comment selectedText is required.");
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    target: normalizeCommentTarget(input.target),
    selectedText,
    body: String(input.body || "").trim(),
    llmDraft: String(input.llmDraft || "").trim(),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeCommentTarget(target) {
  return target === "translation" ? "translation" : "source";
}

function normalizeVariants(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,，;\n]/);
  return Array.from(
    new Set(
      raw
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
    ),
  );
}

function toProjectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description || "",
    documentCount: Array.isArray(project.documents) ? project.documents.length : 0,
    glossaryCount: Array.isArray(project.glossary) ? project.glossary.length : 0,
    traceCount: Array.isArray(project.agentTraces) ? project.agentTraces.length : 0,
    snapshotCount: Array.isArray(project.snapshots) ? project.snapshots.length : 0,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
  };
}

function toTraceSummary(trace) {
  return {
    id: trace.id,
    skillId: trace.skillId,
    providerId: trace.providerId,
    model: trace.model,
    status: trace.status,
    userInput: trace.userInput,
    output: trace.output,
    stepCount: Array.isArray(trace.steps) ? trace.steps.length : 0,
    createdAt: trace.createdAt,
    updatedAt: trace.updatedAt,
  };
}

function createEvent(type, title, detail, segmentId = null) {
  return {
    id: randomUUID(),
    type,
    title,
    detail,
    segmentId,
    createdAt: new Date().toISOString(),
  };
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
