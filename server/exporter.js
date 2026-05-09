export function buildExport(project, options = {}) {
  const format = options.format || "json";
  const content = options.content || "parallel";
  const scope = options.scope || "document";
  const documentId = options.documentId || project.documents[0]?.id;
  const document = project.documents.find((entry) => entry.id === documentId) || project.documents[0];
  const segments = selectSegments(document, options);

  if (format === "json") {
    return {
      fileName: `${safeName(project.name)}-${content}.json`,
      mimeType: "application/json",
      body: JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), project, options }, null, 2),
    };
  }

  if (format === "csv" || format === "tsv") {
    const delimiter = format === "tsv" ? "\t" : ",";
    return {
      fileName: `${safeName(document?.title || project.name)}-${content}.${format}`,
      mimeType: format === "tsv" ? "text/tab-separated-values" : "text/csv",
      body: buildTable(segments, delimiter, content),
    };
  }

  return {
    fileName: `${safeName(document?.title || project.name)}-${content}.${format}`,
    mimeType: format === "md" ? "text/markdown" : "text/plain",
    body: buildTextExport({ project, document, segments, content, format }),
  };
}

function selectSegments(document, options) {
  if (!document) return [];
  let segments = document.segments || [];
  if (options.scope === "current-segment" && options.segmentId) {
    return segments.filter((segment) => segment.id === options.segmentId);
  }

  const startPage = Number(options.startPage || 0);
  const pageCount = Number(options.pageCount || 0);
  if (startPage > 0) {
    const endPage = pageCount > 0 ? startPage + pageCount - 1 : startPage;
    segments = segments.filter((segment) => {
      const page = Number(segment.pageIndex || segment.index || 1);
      return page >= startPage && page <= endPage;
    });
  }
  return segments;
}

function buildTextExport({ project, document, segments, content, format }) {
  const lines = [];
  lines.push(format === "md" ? `# ${project.name}` : project.name);
  if (document) lines.push(format === "md" ? `## ${document.title}` : document.title);
  lines.push("");

  if (content === "glossary") {
    project.glossary.forEach((term) => {
      lines.push(`- ${term.source} => ${term.target || ""}`);
    });
    return lines.join("\n");
  }

  if (content === "events") {
    project.agentEvents.forEach((event) => {
      lines.push(`- ${event.createdAt} ${event.title}: ${event.detail || ""}`);
    });
    return lines.join("\n");
  }

  segments.forEach((segment) => {
    lines.push(format === "md" ? `### ${segment.index}` : `#${segment.index}`);
    if (content === "parallel") {
      lines.push(`原文：${segment.source}`);
      lines.push(`译文：${segment.translation || ""}`);
    } else if (content === "translation") {
      lines.push(segment.translation || "");
    } else if (content === "notes") {
      lines.push(segment.note || "");
    } else if (content === "translation-notes") {
      lines.push(`译文：${segment.translation || ""}`);
      lines.push(`笔记：${segment.note || ""}`);
    } else if (content === "comments") {
      appendComments(lines, segment, format);
    } else if (content === "translation-comments") {
      lines.push(`译文：${segment.translation || ""}`);
      appendComments(lines, segment, format);
    }
    lines.push("");
  });
  return lines.join("\n");
}

function buildTable(segments, delimiter, content) {
  const rows = [["index", "page", "source", "translation", "note", "comments"]];
  segments.forEach((segment) => {
    rows.push([
      segment.index,
      segment.pageIndex || "",
      content === "translation" ? "" : segment.source,
      content === "notes" ? "" : segment.translation || "",
      content === "parallel" || content === "translation-notes" || content === "notes" ? segment.note || "" : "",
      content === "comments" || content === "translation-comments" ? formatCommentsInline(segment) : "",
    ]);
  });
  return rows.map((row) => row.map((cell) => quoteCell(cell, delimiter)).join(delimiter)).join("\n");
}

function appendComments(lines, segment, format) {
  const comments = Array.isArray(segment.comments) ? segment.comments : [];
  if (!comments.length) {
    lines.push("批注：");
    return;
  }
  lines.push(format === "md" ? "#### 批注" : "批注：");
  comments.forEach((comment, index) => {
    const target = comment.target === "translation" ? "译文" : "原文";
    const selected = comment.selectedText ? `「${comment.selectedText}」` : "";
    const body = comment.body || comment.llmDraft || "";
    lines.push(format === "md" ? `- ${index + 1}. ${target} ${selected}：${body}` : `${index + 1}. ${target} ${selected}：${body}`);
  });
}

function formatCommentsInline(segment) {
  return (Array.isArray(segment.comments) ? segment.comments : [])
    .map((comment, index) => {
      const target = comment.target === "translation" ? "译文" : "原文";
      const selected = comment.selectedText ? `「${comment.selectedText}」` : "";
      return `${index + 1}. ${target}${selected}: ${comment.body || comment.llmDraft || ""}`;
    })
    .join("\n");
}

function quoteCell(value, delimiter) {
  const text = String(value ?? "");
  if (text.includes(delimiter) || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function safeName(value) {
  return String(value || "hpsreader-export")
    .replace(/[\\/:*?"<>|]/g, "-")
    .slice(0, 80);
}
