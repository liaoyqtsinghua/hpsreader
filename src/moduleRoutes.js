export const DEFAULT_ENABLED_MODULES = {
  glossary: false,
  issues: false,
  notes: false,
  ocr: false,
  events: false,
};

export const MODULE_DEFINITIONS = {
  glossary: { label: "术语卡盒", detail: "统一术语和译名", icon: "术" },
  issues: { label: "一致性卡", detail: "检查译名漂移", icon: "检" },
  notes: { label: "笔记卡", detail: "记录段落判断", icon: "记" },
  ocr: { label: "原图卡 / OCR", detail: "校读页图和扫描件", icon: "图" },
  events: { label: "检索足迹", detail: "查看操作记录", icon: "录" },
};

const MODULE_TO_CONTEXT_TAB = {
  glossary: "glossary",
  issues: "suggestions",
  notes: "notes",
  ocr: "source",
  events: "events",
};

const MODULE_DRAWER_ORDER = ["glossary", "issues", "notes", "ocr", "events"];

export function getContextTabForModule(module) {
  return MODULE_TO_CONTEXT_TAB[module] || null;
}

export function getModuleForContextTab(tab) {
  return Object.entries(MODULE_TO_CONTEXT_TAB).find(([, contextTab]) => contextTab === tab)?.[0] || null;
}

export function isDrawerModule(module) {
  return MODULE_DRAWER_ORDER.includes(module);
}

export function selectNextContextTab(enabledModules) {
  const module = MODULE_DRAWER_ORDER.find((entry) => enabledModules[entry] !== false);
  return module ? getContextTabForModule(module) : "suggestions";
}

export function resolveComposerCommand(rawInput, options = {}) {
  const input = String(rawInput || "").trim();
  const lowerInput = input.toLowerCase();

  if (!input) {
    return options.hasSelectedSegment ? { type: "translate" } : { type: "noop" };
  }

  if (/批量|batch/.test(lowerInput)) return { type: "agentPrompt" };
  if (/抽取|提取|候选/.test(lowerInput) && /术语|term/.test(lowerInput)) return { type: "scanTerms" };
  if (/术语|term|一致|漂移/.test(lowerInput) && /检查|一致|漂移|check/.test(lowerInput)) return { type: "checkTerms" };
  if (/笔记|note/.test(lowerInput)) return { type: "openModule", module: "notes" };
  if (/原图|ocr|校勘|页面|page/.test(lowerInput)) return { type: "openModule", module: "ocr" };
  if (/记录|足迹|history|event/.test(lowerInput)) return { type: "openModule", module: "events" };
  if (/agent|助手/.test(lowerInput)) return { type: "agentPrompt" };
  if (/翻译|译|translate/.test(lowerInput)) return { type: "translate" };

  return { type: "agentPrompt" };
}
