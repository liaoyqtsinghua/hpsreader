import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENABLED_MODULES,
  getContextTabForModule,
  getModuleForContextTab,
  isDrawerModule,
  resolveComposerCommand,
  selectNextContextTab,
} from "../src/moduleRoutes.js";

test("modules default to opt-in instead of always-on", () => {
  assert.deepEqual(DEFAULT_ENABLED_MODULES, {
    glossary: false,
    issues: false,
    notes: false,
    ocr: false,
    events: false,
  });
});

test("module chips map to the right context drawer panels", () => {
  assert.equal(getContextTabForModule("issues"), "suggestions");
  assert.equal(getContextTabForModule("notes"), "notes");
  assert.equal(getContextTabForModule("ocr"), "source");
  assert.equal(getContextTabForModule("events"), "events");
  assert.equal(getContextTabForModule("glossary"), "glossary");
  assert.equal(getContextTabForModule("agent"), null);
  assert.equal(getModuleForContextTab("glossary"), "glossary");
  assert.equal(getModuleForContextTab("source"), "ocr");
});

test("drawer selection skips disabled drawer modules", () => {
  const enabled = {
    ...DEFAULT_ENABLED_MODULES,
    notes: true,
    events: true,
  };

  assert.equal(selectNextContextTab(enabled), "notes");
  assert.equal(isDrawerModule("agent"), false);
  assert.equal(isDrawerModule("batch"), false);
  assert.equal(isDrawerModule("glossary"), true);
  assert.equal(isDrawerModule("notes"), true);
});

test("composer command resolves common scholarly reading actions", () => {
  assert.deepEqual(resolveComposerCommand("翻译当前段"), { type: "translate" });
  assert.deepEqual(resolveComposerCommand("检查术语一致性"), { type: "checkTerms" });
  assert.deepEqual(resolveComposerCommand("抽取术语候选"), { type: "scanTerms" });
  assert.deepEqual(resolveComposerCommand("打开笔记"), { type: "openModule", module: "notes" });
  assert.deepEqual(resolveComposerCommand("看原图 OCR 校勘"), { type: "openModule", module: "ocr" });
  assert.deepEqual(resolveComposerCommand("批量翻译"), { type: "agentPrompt" });
  assert.deepEqual(resolveComposerCommand("让 Agent 总结这一段"), { type: "agentPrompt" });
});

test("empty composer input translates the selected segment when one exists", () => {
  assert.deepEqual(resolveComposerCommand("", { hasSelectedSegment: true }), { type: "translate" });
  assert.deepEqual(resolveComposerCommand("", { hasSelectedSegment: false }), { type: "noop" });
});
