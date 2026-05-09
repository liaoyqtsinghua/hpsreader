import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".text"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"]);

export async function ingestUploadedFile(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const now = new Date().toISOString();
  let text = "";
  let ingestionStatus = "ready";
  let layout = "text";
  let warning = "";
  let pageCount = 1;
  let extractionMethod = "text";

  if (TEXT_EXTENSIONS.has(extension) || file.mimetype.startsWith("text/")) {
    text = await fs.readFile(file.path, "utf8");
  } else if (extension === ".pdf" || file.mimetype === "application/pdf") {
    layout = "pdf";
    const buffer = await fs.readFile(file.path);
    const parsed = await pdfParse(buffer);
    pageCount = parsed.numpages || 1;
    extractionMethod = "pdf-text-layer";
    text = normalizeText(parsed.text || "");
    if (!text) {
      ingestionStatus = "pending-ocr";
      extractionMethod = "pending-ocr";
      warning = "PDF 未提取到文本，可能是扫描件。请接入 OCR Provider 后处理。";
      text = createPendingOcrText(file.originalname, warning);
    } else if (looksGarbled(text)) {
      warning = "PDF 文本层可能存在乱码或字体编码问题，建议后续使用 OCR Provider 重新识别。";
    }
  } else if (IMAGE_EXTENSIONS.has(extension) || file.mimetype.startsWith("image/")) {
    layout = "image";
    ingestionStatus = "pending-ocr";
    extractionMethod = "pending-ocr";
    warning = "图片文件已入库，等待 OCR Provider 识别。";
    text = createPendingOcrText(file.originalname, warning);
  } else {
    ingestionStatus = "unsupported";
    extractionMethod = "unsupported";
    warning = "暂不支持该文件类型。";
    text = createPendingOcrText(file.originalname, warning);
  }

  const normalized = normalizeText(text);
  const sourceBlocks = segmentText(normalized);
  const segments = sourceBlocks.map((source, index) => ({
    id: randomUUID(),
    index: index + 1,
    source,
    translation: "",
    note: "",
    status: ingestionStatus === "ready" ? "draft" : ingestionStatus,
    pageIndex: estimatePageIndex(index, sourceBlocks.length, pageCount),
    bbox: null,
    ocrConfidence: null,
  }));
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    pageIndex: index + 1,
    imagePath: "",
    width: null,
    height: null,
    ocrStatus: ingestionStatus === "pending-ocr" ? "pending" : "text-layer",
  }));

  return {
    id: randomUUID(),
    title: file.originalname.replace(/\.[^.]+$/, ""),
    fileName: file.originalname,
    storagePath: file.path,
    mimeType: file.mimetype,
    size: file.size,
    language: detectLanguage(normalized),
    layout,
    ingestionStatus,
    extractionMethod,
    warning,
    sourceText: normalized,
    pages,
    segments,
    createdAt: now,
    updatedAt: now,
  };
}

export function segmentText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, " ").trim())
    .filter(Boolean);

  const sourceBlocks = blocks.length > 1 ? blocks : normalized.split(/(?<=[。！？.!?])\s+/).filter(Boolean);
  return sourceBlocks.length ? sourceBlocks : [normalized];
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function detectLanguage(text) {
  const latin = (text.match(/[A-Za-zÀ-ž]/g) || []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  if (cjk > latin) return "中文";
  if (latin > 0) return "拉丁字母文本";
  return "未知";
}

function createPendingOcrText(fileName, warning) {
  return [
    `文件 ${fileName} 已上传。`,
    "",
    warning,
    "",
    "后续路线：配置 OCR Provider 后，系统会把识别结果写回为段落级原文，并保留此摄取事件作为认知足迹。",
  ].join("\n");
}

function estimatePageIndex(segmentIndex, segmentCount, pageCount) {
  if (!pageCount || pageCount <= 1) return 1;
  return Math.min(pageCount, Math.max(1, Math.ceil(((segmentIndex + 1) / Math.max(segmentCount, 1)) * pageCount)));
}

function looksGarbled(text) {
  const sample = String(text || "").slice(0, 4000);
  if (!sample) return false;
  const replacement = (sample.match(/\uFFFD/g) || []).length;
  const controls = (sample.match(/[\u0000-\u0008\u000E-\u001F]/g) || []).length;
  const oddSymbols = (sample.match(/[□�]/g) || []).length;
  return (replacement + controls + oddSymbols) / sample.length > 0.02;
}
