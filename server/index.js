import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStorage } from "./storage.js";
import { createSettingsStore } from "./settings.js";
import { ingestUploadedFile } from "./ingestion.js";
import { buildExport } from "./exporter.js";
import { configureProviderSettings, listProviders, runChatTask } from "./llm/providers.js";
import { createAgentRuntime } from "./agents/runtime.js";
import { listSkills } from "./agents/skills.js";
import { buildOcrDocumentPatch, detectGarbledText, listOcrProviders, runDocumentOcr } from "./ocr.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const port = Number(process.env.PORT || 4173);

const app = express();
const storage = await createStorage(dataDir);
const settings = await createSettingsStore(dataDir);
configureProviderSettings(settings);
const agentRuntime = createAgentRuntime({ storage });
const batchJobs = new Map();
const upload = multer({
  dest: path.join(dataDir, "uploads"),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

app.use(express.json({ limit: "50mb" }));
app.use(express.static(rootDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "hpsreader", version: "0.1.0" });
});

app.get("/api/projects", async (_req, res, next) => {
  try {
    res.json({ projects: await storage.listProjects() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!name) {
      res.status(400).json({ error: "Project name is required." });
      return;
    }

    const project = await storage.createProject({ name, description });
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId", async (req, res, next) => {
  try {
    res.json({ project: await storage.getProject(req.params.projectId) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/projects/:projectId", async (req, res, next) => {
  try {
    res.json({ project: await storage.updateProject(req.params.projectId, req.body || {}) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/snapshots", async (req, res, next) => {
  try {
    const snapshot = await storage.createProjectSnapshot(req.params.projectId);
    await storage.addAgentEvent(req.params.projectId, {
      type: "storage",
      title: "项目快照已保存",
      detail: snapshot.createdAt,
    });
    res.status(201).json({ snapshot });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/documents", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "File is required." });
      return;
    }

    const result = await ingestUploadedFile(req.file);
    const document = await storage.addDocument(req.params.projectId, result);
    res.status(201).json({ document });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/documents/:documentId/source", async (req, res, next) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    const document = project.documents.find((entry) => entry.id === req.params.documentId);
    if (!document?.storagePath) {
      res.status(404).json({ error: "Source file not found." });
      return;
    }
    const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", buildContentDisposition(disposition, document.fileName || `${document.title || "source"}.pdf`));
    res.sendFile(path.resolve(document.storagePath));
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/documents/:documentId/source-download", async (req, res, next) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    const document = project.documents.find((entry) => entry.id === req.params.documentId);
    if (!document?.storagePath) {
      res.status(404).json({ error: "Source file not found." });
      return;
    }
    res.download(path.resolve(document.storagePath), document.fileName || `${document.title || "source"}.pdf`);
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/documents/:documentId/batch-translate", async (req, res, next) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    const document = project.documents.find((entry) => entry.id === req.params.documentId);
    if (!document) {
      res.status(404).json({ error: "Document not found." });
      return;
    }

    const providerId = String(req.body?.providerId || "").trim();
    if (!providerId) {
      res.status(400).json({ error: "providerId is required." });
      return;
    }

    const segments = selectBatchSegments(document, req.body || {});
    const glossary = (project.glossary || []).filter((term) => term.confirmed && term.source && term.target);
    const job = createBatchJob({
      projectId: req.params.projectId,
      documentId: req.params.documentId,
      documentTitle: document.title,
      providerId,
      style: String(req.body?.style || "literal"),
      onlyEmpty: req.body?.onlyEmpty !== false,
      segments,
    });
    batchJobs.set(job.id, job);
    res.status(202).json({ job: publicBatchJob(job) });

    processBatchTranslationJob(job, {
      glossary,
      segments,
    }).catch((error) => {
      job.status = "failed";
      job.errors.push({ message: error.message || "批量翻译任务失败" });
      touchBatchJob(job);
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/batch-jobs/:jobId", async (req, res) => {
  const job = batchJobs.get(req.params.jobId);
  if (!job || job.projectId !== req.params.projectId) {
    res.status(404).json({ error: "Batch job not found." });
    return;
  }
  res.json({ job: publicBatchJob(job) });
});

app.patch("/api/projects/:projectId/documents/:documentId/segments/:segmentId", async (req, res, next) => {
  try {
    const segment = await storage.updateSegment(
      req.params.projectId,
      req.params.documentId,
      req.params.segmentId,
      req.body || {},
    );
    res.json({ segment });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/documents/:documentId/segments/:segmentId/comments", async (req, res, next) => {
  try {
    const comment = await storage.addSegmentComment(req.params.projectId, req.params.documentId, req.params.segmentId, req.body || {});
    await storage.addAgentEvent(req.params.projectId, {
      type: "comment",
      title: "批注已添加",
      detail: `${comment.target === "translation" ? "译文" : "原文"} · ${comment.selectedText.slice(0, 48)}`,
      segmentId: req.params.segmentId,
    });
    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/projects/:projectId/documents/:documentId/segments/:segmentId/comments/:commentId", async (req, res, next) => {
  try {
    const comment = await storage.updateSegmentComment(
      req.params.projectId,
      req.params.documentId,
      req.params.segmentId,
      req.params.commentId,
      req.body || {},
    );
    res.json({ comment });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:projectId/documents/:documentId/segments/:segmentId/comments/:commentId", async (req, res, next) => {
  try {
    await storage.deleteSegmentComment(req.params.projectId, req.params.documentId, req.params.segmentId, req.params.commentId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/glossary", async (req, res, next) => {
  try {
    const term = await storage.upsertGlossaryTerm(req.params.projectId, req.body || {});
    res.status(201).json({ term });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/projects/:projectId/glossary/:termId", async (req, res, next) => {
  try {
    const term = await storage.updateGlossaryTerm(req.params.projectId, req.params.termId, req.body || {});
    res.json({ term });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:projectId/glossary/:termId", async (req, res, next) => {
  try {
    await storage.deleteGlossaryTerm(req.params.projectId, req.params.termId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/events", async (req, res, next) => {
  try {
    const event = await storage.addAgentEvent(req.params.projectId, req.body || {});
    res.status(201).json({ event });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/export", async (req, res, next) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    const result = buildExport(project, req.body || {});
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename=\"${encodeURIComponent(result.fileName)}\"`);
    res.send(result.body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/agent-traces", async (req, res, next) => {
  try {
    res.json({ traces: await storage.listAgentTraces(req.params.projectId) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/agent-traces/:traceId", async (req, res, next) => {
  try {
    res.json({ trace: await storage.getAgentTrace(req.params.projectId, req.params.traceId) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", async (_req, res, next) => {
  try {
    res.json({ settings: await settings.getPublicSettings() });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/llm/:providerId", async (req, res, next) => {
  try {
    res.json({ settings: await settings.upsertProviderSettings(req.params.providerId, req.body || {}) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/llm/providers", async (_req, res, next) => {
  try {
    res.json({ providers: await listProviders() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ocr/providers", (_req, res) => {
  res.json({ providers: listOcrProviders() });
});

app.get("/api/projects/:projectId/documents/:documentId/ocr-status", async (req, res, next) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    const document = project.documents.find((entry) => entry.id === req.params.documentId);
    if (!document) {
      res.status(404).json({ error: "Document not found." });
      return;
    }
    res.json({
      status: {
        ingestionStatus: document.ingestionStatus || "ready",
        extractionMethod: document.extractionMethod || "text",
        warning: document.warning || "",
        garbled: detectGarbledText(document.sourceText || ""),
        pages: document.pages || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/documents/:documentId/ocr", async (req, res, next) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    const document = project.documents.find((entry) => entry.id === req.params.documentId);
    if (!document) {
      res.status(404).json({ error: "Document not found." });
      return;
    }
    const result = await runDocumentOcr(document, req.body || {});
    const patch = buildOcrDocumentPatch(document, result);
    const updated = await storage.updateDocument(req.params.projectId, req.params.documentId, patch);
    await storage.addAgentEvent(req.params.projectId, {
      type: "ocr",
      title: "开源 OCR 已写回",
      detail: `${result.providerId} · ${result.language} · 置信度 ${result.confidence}`,
    });
    res.json({ document: updated, ocr: result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/llm/chat", async (req, res, next) => {
  try {
    const result = await runChatTask(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/agents/skills", (_req, res) => {
  res.json({ skills: listSkills() });
});

app.post("/api/agents/run", async (req, res, next) => {
  try {
    const result = await agentRuntime.run(req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found." });
    return;
  }
  res.sendFile(path.join(rootDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  const status = error.statusCode || 500;
  console.error(error);
  res.status(status).json({ error: error.message || "Internal server error." });
});

app.listen(port, () => {
  console.log(`HPS Reader running at http://localhost:${port}`);
});

function selectBatchSegments(document, options) {
  let segments = Array.isArray(document.segments) ? document.segments : [];
  const scope = options.scope || "all";
  if (scope === "pages") {
    const startPage = Math.max(1, Number(options.startPage || 1));
    const pageCount = Math.max(1, Number(options.pageCount || 1));
    const endPage = startPage + pageCount - 1;
    segments = segments.filter((segment) => {
      const page = Number(segment.pageIndex || segment.index || 1);
      return page >= startPage && page <= endPage;
    });
  } else if (scope === "remaining" && options.segmentId) {
    const activeIndex = segments.findIndex((segment) => segment.id === options.segmentId);
    if (activeIndex >= 0) segments = segments.slice(activeIndex);
  }
  return segments;
}

function createBatchJob(input) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId: input.projectId,
    documentId: input.documentId,
    documentTitle: input.documentTitle,
    providerId: input.providerId,
    style: input.style,
    onlyEmpty: input.onlyEmpty,
    status: "queued",
    total: input.segments.length,
    translated: 0,
    skipped: 0,
    failed: 0,
    currentSegmentIndex: null,
    currentSegmentId: null,
    errors: [],
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  };
}

async function processBatchTranslationJob(job, input) {
  job.status = "running";
  touchBatchJob(job);
  await storage.addAgentEvent(job.projectId, {
    type: "translation",
    title: "批量翻译已启动",
    detail: `${job.documentTitle} · ${job.total} 个候选段落`,
  });

  for (const segment of input.segments) {
    job.currentSegmentIndex = segment.index;
    job.currentSegmentId = segment.id;
    touchBatchJob(job);

    if (job.onlyEmpty && String(segment.translation || "").trim()) {
      job.skipped += 1;
      touchBatchJob(job);
      continue;
    }

    try {
      const result = await runChatTask({
        providerId: job.providerId,
        task: "translate",
        source: segment.source,
        glossary: input.glossary,
        prompt: `Style: ${job.style}\n请只输出译文正文，不要添加解释。`,
      });
      const translation = String(result.text || "").trim();
      if (!translation) throw new Error("LLM 返回为空。");
      await storage.updateSegment(job.projectId, job.documentId, segment.id, {
        translation,
        status: "machine-draft",
      });
      job.translated += 1;
      await storage.addAgentEvent(job.projectId, {
        type: "translation",
        title: "批量段落译文已保存",
        detail: `${result.providerId || job.providerId} · ${result.model || ""} · 第 ${segment.index} 段`,
        segmentId: segment.id,
      });
    } catch (error) {
      job.failed += 1;
      job.errors.push({
        segmentId: segment.id,
        index: segment.index,
        message: error.message || "翻译失败",
      });
      await storage.addAgentEvent(job.projectId, {
        type: "translation-error",
        title: "批量段落翻译失败",
        detail: `第 ${segment.index} 段 · ${error.message || "翻译失败"}`,
        segmentId: segment.id,
      });
    }
    touchBatchJob(job);
  }

  job.status = job.failed > 0 ? "completed-with-errors" : "completed";
  job.currentSegmentIndex = null;
  job.currentSegmentId = null;
  job.completedAt = new Date().toISOString();
  touchBatchJob(job);
  await storage.addAgentEvent(job.projectId, {
    type: "translation",
    title: "批量翻译任务结束",
    detail: `成功 ${job.translated}，跳过 ${job.skipped}，失败 ${job.failed}`,
  });
}

function touchBatchJob(job) {
  job.updatedAt = new Date().toISOString();
}

function publicBatchJob(job) {
  return {
    id: job.id,
    projectId: job.projectId,
    documentId: job.documentId,
    providerId: job.providerId,
    style: job.style,
    status: job.status,
    total: job.total,
    translated: job.translated,
    skipped: job.skipped,
    failed: job.failed,
    currentSegmentIndex: job.currentSegmentIndex,
    currentSegmentId: job.currentSegmentId,
    errors: job.errors.slice(-10),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

function buildContentDisposition(disposition, fileName) {
  const safeFallback = String(fileName || "source")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[^\x20-\x7E]/g, "_");
  return `${disposition}; filename="${safeFallback}"; filename*=UTF-8''${encodeURIComponent(fileName || "source")}`;
}
