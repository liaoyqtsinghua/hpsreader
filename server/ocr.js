import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import tesseract from "tesseract.js";
import { segmentText } from "./ingestion.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"]);
const { recognize } = tesseract;

export function listOcrProviders() {
  return [
    {
      id: "tesseract-js",
      label: "Tesseract.js 开源 OCR",
      kind: "local-js",
      configured: true,
      languages: [
        { id: "eng", label: "English / Latin script" },
        { id: "fra", label: "French" },
        { id: "deu", label: "German" },
        { id: "ell", label: "Greek" },
        { id: "chi_sim", label: "简体中文" },
        { id: "chi_tra", label: "繁体中文" },
      ],
      note: "纯本地 JS OCR Provider，不需要额外安装系统级 Tesseract。",
    },
  ];
}

export async function runDocumentOcr(document, options = {}) {
  if (!document?.storagePath) throw badRequest("Source file is missing.");
  const language = normalizeOcrLanguage(options.language || guessOcrLanguage(document.language));
  const extension = path.extname(document.fileName || document.storagePath).toLowerCase();
  const pageIndex = Math.max(1, Number(options.pageIndex || 1));

  if (options.imageDataUrl) {
    return recognizeImageBuffer(decodeImageDataUrl(options.imageDataUrl), { language, pageIndex });
  }

  if (document.layout === "image" || IMAGE_EXTENSIONS.has(extension)) {
    return recognizeImageFile(document.storagePath, { language, pageIndex: 1 });
  }

  if (document.layout === "pdf" || extension === ".pdf") {
    throw badRequest("当前开源 OCR Provider 已接入，但 PDF 页面截图渲染在无原生依赖方案下由前端 PDF.js 负责；请先用页面预览校对，后续 Sprint 将补充浏览器页图上传 OCR 或服务端渲染插件。");
  }

  throw badRequest("当前文档类型暂不支持 OCR。");
}

export function buildOcrDocumentPatch(document, ocrResult) {
  const sourceText = normalizeOcrText(ocrResult.text);
  const blocks = segmentText(sourceText);
  const pageIndex = ocrResult.pageIndex || 1;
  const replacementSegments = blocks.map((source, index) => ({
    id: randomUUID(),
    index: index + 1,
    source,
    translation: "",
    note: "",
    comments: [],
    status: "draft",
    pageIndex,
    bbox: null,
    ocrConfidence: ocrResult.confidence,
  }));
  const segments = mergeOcrSegments(document, replacementSegments, pageIndex);

  const pages = normalizePages(document.pages, pageIndex).map((page) => (
    page.pageIndex === pageIndex
      ? {
          ...page,
          ocrStatus: "recognized",
          ocrProvider: ocrResult.providerId,
          ocrLanguage: ocrResult.language,
          ocrConfidence: ocrResult.confidence,
          updatedAt: new Date().toISOString(),
        }
      : page
  ));

  return {
    sourceText: mergeOcrSourceText(document, sourceText, pageIndex),
    segments,
    pages,
    ingestionStatus: "ready",
    extractionMethod: "ocr-tesseract-js",
    warning: ocrResult.warning || "",
    updatedAt: new Date().toISOString(),
  };
}

function mergeOcrSegments(document, replacementSegments, pageIndex) {
  if (!replacementSegments.length) return document.segments || [];
  if (document.layout === "pdf" && Array.isArray(document.segments) && document.segments.length) {
    const untouched = document.segments.filter((segment) => Number(segment.pageIndex || 1) !== Number(pageIndex));
    return [...untouched, ...replacementSegments]
      .sort((a, b) => Number(a.pageIndex || 1) - Number(b.pageIndex || 1) || Number(a.index || 0) - Number(b.index || 0))
      .map((segment, index) => ({ ...segment, index: index + 1 }));
  }
  return replacementSegments;
}

function mergeOcrSourceText(document, sourceText, pageIndex) {
  if (document.layout !== "pdf") return sourceText;
  const previous = String(document.sourceText || "").trim();
  const heading = `[OCR page ${pageIndex}]`;
  const withoutOldPage = previous
    .split(/\n\n(?=\[OCR page \d+\])/)
    .filter((block) => !block.startsWith(heading))
    .join("\n\n")
    .trim();
  return [withoutOldPage, `${heading}\n${sourceText}`].filter(Boolean).join("\n\n");
}

export function normalizeOcrText(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ﬀﬁﬂﬃﬄ]/g, (char) => ({
      ﬀ: "ff",
      ﬁ: "fi",
      ﬂ: "fl",
      ﬃ: "ffi",
      ﬄ: "ffl",
    })[char] || char)
    .replace(/-\n(?=[A-Za-zÀ-ž])/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectGarbledText(text) {
  const sample = String(text || "").slice(0, 5000);
  if (!sample) return { garbled: false, score: 0, reasons: [] };
  const replacement = (sample.match(/\uFFFD/g) || []).length;
  const controls = (sample.match(/[\u0000-\u0008\u000E-\u001F]/g) || []).length;
  const oddSymbols = (sample.match(/[□�]/g) || []).length;
  const excessiveSpaces = (sample.match(/\s{4,}/g) || []).length;
  const score = (replacement + controls + oddSymbols * 2 + excessiveSpaces) / sample.length;
  const reasons = [];
  if (replacement || oddSymbols) reasons.push("存在替换字符或方框字符");
  if (controls) reasons.push("存在异常控制字符");
  if (excessiveSpaces) reasons.push("存在异常空白");
  return { garbled: score > 0.02, score: Number(score.toFixed(4)), reasons };
}

async function recognizeImageFile(filePath, options) {
  await fs.access(filePath);
  return recognizeImageInput(filePath, options);
}

async function recognizeImageBuffer(buffer, options) {
  return recognizeImageInput(buffer, options);
}

async function recognizeImageInput(input, options) {
  const result = await recognize(input, options.language, {
    logger: () => {},
  });
  const text = normalizeOcrText(result.data?.text || "");
  return {
    providerId: "tesseract-js",
    language: options.language,
    pageIndex: options.pageIndex,
    text,
    confidence: Math.round(Number(result.data?.confidence || 0)),
    warning: text ? "" : "OCR 未识别到文本。",
  };
}

function decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) throw badRequest("imageDataUrl must be a PNG/JPEG/WebP data URL.");
  return Buffer.from(match[1], "base64");
}

function normalizeOcrLanguage(language) {
  const value = String(language || "eng").trim();
  if (!value) return "eng";
  return value
    .split("+")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join("+") || "eng";
}

function guessOcrLanguage(languageLabel) {
  const text = String(languageLabel || "").toLowerCase();
  if (text.includes("中文")) return "chi_sim";
  if (text.includes("greek") || text.includes("希腊")) return "ell";
  if (text.includes("french") || text.includes("法文")) return "fra";
  if (text.includes("german") || text.includes("德文")) return "deu";
  return "eng";
}

function normalizePages(pages, pageIndex) {
  const normalized = Array.isArray(pages) ? pages : [];
  if (normalized.some((page) => page.pageIndex === pageIndex)) return normalized;
  return [
    ...normalized,
    {
      pageIndex,
      imagePath: "",
      width: null,
      height: null,
      ocrStatus: "pending",
    },
  ].sort((a, b) => a.pageIndex - b.pageIndex);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
