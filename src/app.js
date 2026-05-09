const api = {
  async get(path) {
    return request(path);
  },
  async post(path, body) {
    return request(path, { method: "POST", body });
  },
  async put(path, body) {
    return request(path, { method: "PUT", body });
  },
  async patch(path, body) {
    return request(path, { method: "PATCH", body });
  },
  async delete(path) {
    return request(path, { method: "DELETE" });
  },
};

const STORAGE_KEYS = {
  activeProjectId: "hpsreader.activeProjectId",
  showTermHighlights: "hpsreader.showTermHighlights",
  floatingNotePosition: "hpsreader.floatingNotePosition",
};

const state = {
  projects: [],
  activeProjectId: null,
  activeProject: null,
  activeDocumentId: null,
  selectedSegmentId: null,
  lockedPage: null,
  showTermHighlights: localStorage.getItem(STORAGE_KEYS.showTermHighlights) !== "false",
  issues: [],
  providers: [],
  ocrProviders: [],
  selectedProviderId: "",
  settings: null,
  skills: [],
  selectedSkillId: "",
  pendingComment: null,
  batchPollTimer: null,
  promptTemplates: [
    {
      id: "custom",
      label: "自定义指令",
      prompt: "",
    },
    {
      id: "translate-with-terms",
      label: "翻译当前段落并说明术语",
      prompt: [
        "任务：翻译当前选中段落，并解释关键术语的译法选择。",
        "范围：只处理当前段落；必要时先读取项目术语库和上下文，但不要改动其他段落。",
        "输出格式：",
        "1. 译文：给出可直接保存的中文译文。",
        "2. 术语说明：列出原词、采用译法、词形/变体、选择理由。",
        "3. 不确定处：说明需要用户确认或回看原图的位置。",
        "约束：优先使用已确认术语；如需新增或调整术语，请说明理由并等待用户确认。",
      ].join("\n"),
    },
    {
      id: "check-terminology",
      label: "检查术语一致性",
      prompt: [
        "任务：检查当前段落的术语一致性。",
        "请对照项目术语库，检查译文是否存在译法漂移、漏译、误译或未考虑词形变化的问题。",
        "输出格式：",
        "1. 结论：通过 / 需要修改 / 需要人工判断。",
        "2. 问题列表：原词、命中词形、当前译法、推荐译法、理由。",
        "3. 建议修改稿：只给当前段落的最小修改。",
        "4. 需确认项：列出不应自动替换的地方。",
        "约束：不要直接粗暴替换；如果存在多种合理译法，请记录为批注或注记。",
      ].join("\n"),
    },
    {
      id: "language-tutor",
      label: "生成原语言学习讲解",
      prompt: [
        "任务：帮助我学习当前段落的原语言，而不是只给译文。",
        "范围：围绕当前段落，必要时引用术语库中已确认的词。",
        "输出格式：",
        "1. 逐句结构：主干、修饰成分、从句或分词结构。",
        "2. 词汇与词形：列出核心词、变格/变位/性数格或重音现象。",
        "3. 句法说明：解释影响理解的语法点。",
        "4. 术语用法：说明术语在本文语境中的含义和译法。",
        "5. 学习提示：给出 2-3 条可复习的语言点。",
        "默认难度：中级；如果原文包含古典语言或学术术语，请特别标出。",
      ].join("\n"),
    },
    {
      id: "concept-summary",
      label: "提取核心概念",
      prompt: [
        "任务：为当前段落生成可用于论文或读书笔记的研究摘要。",
        "输出格式：",
        "1. 核心概念：列出概念及其在段落中的作用。",
        "2. 实体：人物、作品、地点、时代或学派。",
        "3. 论证关系：说明作者如何推进判断。",
        "4. 术语候选：列出可加入术语库的词和建议译法。",
        "5. 研究摘要：100 字以内，保留可追溯到原文的判断。",
        "约束：不要泛泛总结；不确定的概念史判断请标注为“待核”。",
      ].join("\n"),
    },
    {
      id: "faithfulness-check",
      label: "检查译文忠实度",
      prompt: [
        "任务：检查当前译文是否忠实于原文。",
        "请比较原文和译文，重点检查：遗漏、误读、过度解释、术语不一致、语气偏移。",
        "输出格式：",
        "1. 总体判断：准确 / 基本准确 / 需要重译。",
        "2. 逐项问题：按严重程度列出，每项引用原文关键词。",
        "3. 建议修改稿：只给必要的局部修改。",
        "4. 需要回看原图/OCR 的位置：指出疑似文本层或 OCR 问题。",
        "约束：不要为了文采牺牲语义；保留作者的论证层次和限定语。",
      ].join("\n"),
    },
    {
      id: "ocr-suspect",
      label: "识别疑似 OCR 错误",
      prompt: [
        "任务：检查当前段落是否存在疑似 OCR 或 PDF 文本层错误。",
        "请关注乱码、断词、异常符号、重音/希腊字母丢失、脚注混入正文、页眉页脚混入。",
        "输出格式：",
        "1. 可疑文本：引用最小片段。",
        "2. 错误类型：乱码 / 断词 / 字母混淆 / 脚注混入 / 页眉页脚混入 / 其他。",
        "3. 可能的正确形式：如无法判断请写“待看原图”。",
        "4. 下一步：建议查看原图、重新 OCR 或人工校勘。",
        "约束：不要把语言中的罕见词形误判为 OCR 错误。",
      ].join("\n"),
    },
    {
      id: "ocr-image-compare",
      label: "对比原图与 OCR 文本",
      prompt: [
        "任务：对比当前页原图和当前段落 OCR/PDF 文本，找出版面与文字差异。",
        "请先说明当前 Agent 是否能读取原文件或页图；如果不能直接看图，请明确建议用户点击“原文页图”或“原图/文件”进行人工核对。",
        "输出格式：",
        "1. 需要核对的位置：页码、段落号、可疑文本。",
        "2. 可能差异：漏字、误字、断行、脚注混入、页眉页脚混入、图片说明丢失。",
        "3. 校勘建议：给出可执行的人工核对步骤。",
        "4. 是否建议重新 OCR：是 / 否 / 仅局部。",
        "约束：如果没有实际图像输入，不要编造图像内容。",
      ].join("\n"),
    },
    {
      id: "comment-draft",
      label: "生成论文式批注",
      prompt: [
        "任务：围绕当前段落生成一条可保存的学术批注。",
        "批注目标：帮助我记录疑问、术语判断、概念史线索或后续查证任务。",
        "输出格式：",
        "1. 批注正文：150 字以内，直接可粘贴到批注区。",
        "2. 依据：指出来自原文、译文或术语库的依据。",
        "3. 后续动作：需要查证的书目、原图、术语或上下文。",
        "约束：批注应具体、可追踪，避免泛泛总结；不确定处请用“待核”。",
      ].join("\n"),
    },
  ],
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  projectInput: document.querySelector("#projectInput"),
  fileDrop: document.querySelector("#fileDrop"),
  newProjectButton: document.querySelector("#newProjectButton"),
  documentList: document.querySelector("#documentList"),
  documentCount: document.querySelector("#documentCount"),
  glossaryList: document.querySelector("#glossaryList"),
  glossaryCount: document.querySelector("#glossaryCount"),
  readerGrid: document.querySelector("#readerGrid"),
  activeTitle: document.querySelector("#activeTitle"),
  emptyStateTemplate: document.querySelector("#emptyStateTemplate"),
  importProjectButton: document.querySelector("#importProjectButton"),
  exportButton: document.querySelector("#exportButton"),
  saveButton: document.querySelector("#saveButton"),
  batchModal: document.querySelector("#batchModal"),
  exportModal: document.querySelector("#exportModal"),
  batchScopeSelect: document.querySelector("#batchScopeSelect"),
  batchStartPageInput: document.querySelector("#batchStartPageInput"),
  batchPageCountInput: document.querySelector("#batchPageCountInput"),
  runBatchTranslateButton: document.querySelector("#runBatchTranslateButton"),
  batchStatusText: document.querySelector("#batchStatusText"),
  batchOnlyEmptyInput: document.querySelector("#batchOnlyEmptyInput"),
  exportFormatSelect: document.querySelector("#exportFormatSelect"),
  exportContentSelect: document.querySelector("#exportContentSelect"),
  exportScopeSelect: document.querySelector("#exportScopeSelect"),
  exportStartPageInput: document.querySelector("#exportStartPageInput"),
  exportPageCountInput: document.querySelector("#exportPageCountInput"),
  runExportButton: document.querySelector("#runExportButton"),
  issueList: document.querySelector("#issueList"),
  issueCount: document.querySelector("#issueCount"),
  batchFixButton: document.querySelector("#batchFixButton"),
  eventList: document.querySelector("#eventList"),
  eventCount: document.querySelector("#eventCount"),
  noteEditor: document.querySelector("#noteEditor"),
  floatingNote: document.querySelector("#floatingNote"),
  floatingNoteHeader: document.querySelector("#floatingNoteHeader"),
  floatingNoteEditor: document.querySelector("#floatingNoteEditor"),
  floatNoteButton: document.querySelector("#floatNoteButton"),
  closeFloatingNoteButton: document.querySelector("#closeFloatingNoteButton"),
  noteSegmentLabel: document.querySelector("#noteSegmentLabel"),
  termSourceInput: document.querySelector("#termSourceInput"),
  termTargetInput: document.querySelector("#termTargetInput"),
  selectedTermLabel: document.querySelector("#selectedTermLabel"),
  addTermButton: document.querySelector("#addTermButton"),
  llmConfigProvider: document.querySelector("#llmConfigProvider"),
  llmApiKeyInput: document.querySelector("#llmApiKeyInput"),
  llmBaseUrlInput: document.querySelector("#llmBaseUrlInput"),
  llmModelInput: document.querySelector("#llmModelInput"),
  saveLlmSettingsButton: document.querySelector("#saveLlmSettingsButton"),
  testLlmSettingsButton: document.querySelector("#testLlmSettingsButton"),
  llmConfigStatus: document.querySelector("#llmConfigStatus"),
  skillSelect: document.querySelector("#skillSelect"),
  promptTemplateSelect: document.querySelector("#promptTemplateSelect"),
  agentInstruction: document.querySelector("#agentInstruction"),
  runAgentButton: document.querySelector("#runAgentButton"),
  agentStatusLabel: document.querySelector("#agentStatusLabel"),
  segmentButton: document.querySelector("#segmentButton"),
  draftButton: document.querySelector("#draftButton"),
  batchTranslateButton: document.querySelector("#batchTranslateButton"),
  scanTermsButton: document.querySelector("#scanTermsButton"),
  consistencyButton: document.querySelector("#consistencyButton"),
  pageJumpInput: document.querySelector("#pageJumpInput"),
  jumpPageButton: document.querySelector("#jumpPageButton"),
  lockPageButton: document.querySelector("#lockPageButton"),
  syncScrollToggle: document.querySelector("#syncScrollToggle"),
  termHighlightToggle: document.querySelector("#termHighlightToggle"),
  styleSelect: document.querySelector("#styleSelect"),
  commentModal: document.querySelector("#commentModal"),
  commentTargetLabel: document.querySelector("#commentTargetLabel"),
  commentSelectedText: document.querySelector("#commentSelectedText"),
  commentBodyInput: document.querySelector("#commentBodyInput"),
  assistCommentButton: document.querySelector("#assistCommentButton"),
  saveCommentButton: document.querySelector("#saveCommentButton"),
  commentStatusText: document.querySelector("#commentStatusText"),
  ocrStatusLabel: document.querySelector("#ocrStatusLabel"),
  ocrStatusText: document.querySelector("#ocrStatusText"),
  renderPageButton: document.querySelector("#renderPageButton"),
  runOcrButton: document.querySelector("#runOcrButton"),
  pagePreviewCanvas: document.querySelector("#pagePreviewCanvas"),
};

function getActiveDocument() {
  return state.activeProject?.documents?.find((doc) => doc.id === state.activeDocumentId) || null;
}

function getSelectedSegment() {
  const doc = getActiveDocument();
  if (!doc) return null;
  return doc.segments.find((segment) => segment.id === state.selectedSegmentId) || null;
}

function getGlossary() {
  return state.activeProject?.glossary || [];
}

async function request(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: {},
  };

  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if (options.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload;
}

async function init() {
  wireEvents();
  await Promise.all([loadSettings(), loadProviders(), loadOcrProviders(), loadSkills(), loadProjects()]);
  render();
}

async function loadProjects() {
  const payload = await api.get("/api/projects");
  state.projects = payload.projects || [];

  const lastProjectId = localStorage.getItem(STORAGE_KEYS.activeProjectId);
  const preferredProject = state.projects.find((project) => project.id === lastProjectId) || state.projects[0];

  if (preferredProject) {
    await openProject(preferredProject.id, { silent: true });
  } else {
    const created = await api.post("/api/projects", {
      name: "默认研习项目",
      description: "本地部署工作区",
    });
    state.projects = [created.project];
    await openProject(created.project.id, { silent: true });
  }
}

async function loadProviders() {
  const payload = await api.get("/api/llm/providers");
  state.providers = payload.providers || [];
  const configured = state.providers.find((provider) => provider.configured);
  state.selectedProviderId = configured?.id || state.providers[0]?.id || "";
}

async function loadOcrProviders() {
  const payload = await api.get("/api/ocr/providers");
  state.ocrProviders = payload.providers || [];
}

async function loadSettings() {
  const payload = await api.get("/api/settings");
  state.settings = payload.settings || { llm: {} };
}

async function loadSkills() {
  const payload = await api.get("/api/agents/skills");
  state.skills = payload.skills || [];
  state.selectedSkillId = state.skills[0]?.id || "";
}

async function openProject(projectId, options = {}) {
  const payload = await api.get(`/api/projects/${projectId}`);
  state.activeProject = normalizeProject(payload.project);
  state.activeProjectId = state.activeProject.id;
  state.activeDocumentId = state.activeProject.documents[0]?.id || null;
  state.selectedSegmentId = getActiveDocument()?.segments[0]?.id || null;
  localStorage.setItem(STORAGE_KEYS.activeProjectId, projectId);
  if (!options.silent) showToast(`已打开项目：${state.activeProject.name}`);
}

function normalizeProject(project) {
  project.documents = Array.isArray(project.documents) ? project.documents : [];
  project.glossary = Array.isArray(project.glossary) ? project.glossary : [];
  project.agentEvents = Array.isArray(project.agentEvents) ? project.agentEvents : [];
  project.documents.forEach((doc) => {
    doc.pages = Array.isArray(doc.pages) ? doc.pages : [];
    doc.segments = Array.isArray(doc.segments) ? doc.segments : [];
    doc.segments.forEach((segment, index) => {
      segment.index = segment.index || index + 1;
      segment.translation = segment.translation || "";
      segment.note = segment.note || "";
      segment.status = segment.status || "draft";
      segment.pageIndex = segment.pageIndex || index + 1;
      segment.comments = Array.isArray(segment.comments) ? segment.comments : [];
    });
  });
  project.glossary.forEach((term) => {
    term.variants = Array.isArray(term.variants) ? term.variants : [];
    term.lemma = term.lemma || "";
    term.language = term.language || "";
  });
  return project;
}

function render() {
  renderDocuments();
  renderGlossary();
  renderReader();
  scanConsistency();
  renderIssues();
  renderAgentEvents();
  renderLlmSettings();
  renderAgentRunner();
  renderOcrStatus();
  syncSelectedSegmentPanel();
  syncWorkbenchState();
}

function renderDocuments() {
  const documents = state.activeProject?.documents || [];
  els.documentCount.textContent = String(documents.length);
  els.documentList.innerHTML = "";

  renderProjectSwitcher();

  if (documents.length === 0) {
    els.documentList.appendChild(createMutedItem("当前项目尚未导入文献。"));
    return;
  }

  documents.forEach((doc) => {
    const button = document.createElement("button");
    button.className = `document-item ${doc.id === state.activeDocumentId ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="document-title">${escapeHtml(doc.title)}</span>
      <span class="document-meta">${doc.segments.length} 段 · ${doc.language} · ${formatIngestionStatus(doc.ingestionStatus)}</span>
    `;
    button.addEventListener("click", () => {
      state.activeDocumentId = doc.id;
      state.selectedSegmentId = doc.segments[0]?.id || null;
      render();
    });
    els.documentList.appendChild(button);
  });
}

function renderProjectSwitcher() {
  let switcher = document.querySelector("#projectSwitcher");
  if (!switcher) {
    switcher = document.createElement("select");
    switcher.id = "projectSwitcher";
    switcher.className = "project-switcher";
    els.fileDrop.insertAdjacentElement("beforebegin", switcher);
    switcher.addEventListener("change", async (event) => {
      await openProject(event.target.value);
      render();
    });
  }

  switcher.innerHTML = state.projects
    .map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === state.activeProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`)
    .join("");
}

function renderGlossary() {
  const glossary = getGlossary();
  els.glossaryCount.textContent = String(glossary.length);
  els.glossaryList.innerHTML = "";

  if (glossary.length === 0) {
    els.glossaryList.appendChild(createMutedItem("尚未建立术语。"));
    return;
  }

  glossary.forEach((term) => {
    const item = document.createElement("div");
    item.className = "glossary-item";
    item.innerHTML = `
      <div class="term-row">
        <span class="term-source">${escapeHtml(term.confirmed ? "已确认" : "候选术语")}</span>
        <button class="small-button" type="button" data-remove-term="${term.id}">移除</button>
      </div>
      <div class="term-fields">
        <input type="text" value="${escapeHtml(term.source)}" data-term-source="${term.id}" aria-label="术语原词" />
        <input type="text" value="${escapeHtml(term.target)}" data-term-target="${term.id}" aria-label="术语译法" placeholder="填写译法后可确认" />
        <input type="text" value="${escapeHtml((term.variants || []).join('，'))}" data-term-variants="${term.id}" aria-label="术语词形变体" placeholder="词形变体，用逗号分隔" />
        <input type="text" value="${escapeHtml(term.language || '')}" data-term-language="${term.id}" aria-label="术语语言" placeholder="语言，如 Latin / Greek / French" />
      </div>
      <label class="term-confirm">
        <input type="checkbox" data-term-confirmed="${term.id}" ${term.confirmed ? "checked" : ""} />
        <span>加入一致性监视</span>
      </label>
    `;

    item.querySelector("[data-remove-term]").addEventListener("click", async () => {
      await api.delete(`/api/projects/${state.activeProjectId}/glossary/${term.id}`);
      await refreshProject();
      showToast("术语已移除。");
    });

    item.querySelector("[data-term-source]").addEventListener("change", async (event) => {
      await updateGlossaryTerm(term.id, { source: event.target.value.trim() });
    });

    item.querySelector("[data-term-target]").addEventListener("change", async (event) => {
      await updateGlossaryTerm(term.id, {
        target: event.target.value.trim(),
        confirmed: Boolean(event.target.value.trim()),
      });
    });

    item.querySelector("[data-term-variants]").addEventListener("change", async (event) => {
      await updateGlossaryTerm(term.id, {
        variants: parseVariants(event.target.value),
      });
    });

    item.querySelector("[data-term-language]").addEventListener("change", async (event) => {
      await updateGlossaryTerm(term.id, { language: event.target.value.trim() });
    });

    item.querySelector("[data-term-confirmed]").addEventListener("change", async (event) => {
      if (event.target.checked && !term.target.trim()) {
        event.target.checked = false;
        showToast("请先填写译法，再加入一致性监视。");
        return;
      }
      await updateGlossaryTerm(term.id, { confirmed: event.target.checked });
    });

    item.addEventListener("focusin", () => {
      els.selectedTermLabel.textContent = term.source || "-";
      els.termSourceInput.value = term.source;
      els.termTargetInput.value = term.target;
    });

    els.glossaryList.appendChild(item);
  });
}

function renderReader() {
  const doc = getActiveDocument();
  els.readerGrid.innerHTML = "";

  if (!doc) {
    els.activeTitle.textContent = state.activeProject ? `${state.activeProject.name} · 未选择文档` : "未选择项目";
    els.readerGrid.appendChild(els.emptyStateTemplate.content.cloneNode(true));
    return;
  }

  els.activeTitle.textContent = `${state.activeProject.name} / ${doc.title}`;

  doc.segments.forEach((segment) => {
    const commentCount = segment.comments?.length || 0;
    const card = document.createElement("article");
    card.className = `segment-card ${segment.id === state.selectedSegmentId ? "selected" : ""}`;
    card.dataset.segmentId = segment.id;
    card.dataset.pageIndex = segment.pageIndex || segment.index || 1;
    card.innerHTML = `
      <div class="segment-index">${segment.index}</div>
      <section class="segment-pane">
        <div class="pane-label">
          <span>原文 · 页 ${segment.pageIndex || segment.index || 1}</span>
          <button class="inline-tool" type="button" data-comment-source="${segment.id}">批注</button>
          <button class="inline-tool" type="button" data-source-file="${segment.id}">原图/文件</button>
        </div>
        <div class="source-text" tabindex="0">${highlightTerms(segment.source)}</div>
      </section>
      <section class="segment-pane">
        <div class="pane-label">
          <span>译文${commentCount ? ` · ${commentCount} 条批注` : ""}</span>
          <button class="inline-tool" type="button" data-comment-translation="${segment.id}">批注</button>
          <button class="inline-tool" type="button" data-llm-translate="${segment.id}">LLM</button>
        </div>
        <textarea class="translation-editor" data-translation-id="${segment.id}" placeholder="在此写入或生成译文。">${escapeHtml(segment.translation)}</textarea>
      </section>
      ${renderSegmentComments(segment)}
    `;

    card.addEventListener("click", () => selectSegment(segment.id));
    card.querySelector(".translation-editor").addEventListener("change", async (event) => {
      segment.translation = event.target.value;
      await saveSegment(segment, { translation: event.target.value });
      scanConsistency();
      renderIssues();
    });
    card.querySelector("[data-llm-translate]").addEventListener("click", async (event) => {
      event.stopPropagation();
      await translateSegmentWithLlm(segment);
    });
    card.querySelector("[data-source-file]").addEventListener("click", (event) => {
      event.stopPropagation();
      showSourceFileHint(doc, segment);
    });
    card.querySelector("[data-comment-source]").addEventListener("click", (event) => {
      event.stopPropagation();
      openCommentModal(segment, "source");
    });
    card.querySelector("[data-comment-translation]").addEventListener("click", (event) => {
      event.stopPropagation();
      openCommentModal(segment, "translation");
    });
    card.querySelectorAll("[data-delete-comment]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await deleteComment(segment.id, button.dataset.deleteComment).catch(showError);
      });
    });
    els.readerGrid.appendChild(card);
  });
}

function renderSegmentComments(segment) {
  const comments = Array.isArray(segment.comments) ? segment.comments : [];
  if (!comments.length) return "";
  return `
    <section class="segment-comments" aria-label="段落批注">
      ${comments
        .map(
          (comment) => `
            <article class="comment-item">
              <div class="comment-head">
                <span>${comment.target === "translation" ? "译文批注" : "原文批注"} · ${escapeHtml(formatDateTime(comment.createdAt))}</span>
                <button class="small-button compact" type="button" data-delete-comment="${escapeHtml(comment.id)}">删除</button>
              </div>
              <blockquote>${escapeHtml(comment.selectedText)}</blockquote>
              ${comment.body ? `<p>${escapeHtml(comment.body)}</p>` : ""}
              ${comment.llmDraft && !comment.body.includes(comment.llmDraft) ? `<p class="comment-llm">${escapeHtml(comment.llmDraft)}</p>` : ""}
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderIssues() {
  els.issueCount.textContent = String(state.issues.length);
  els.batchFixButton.disabled = state.issues.length === 0;
  els.issueList.innerHTML = "";

  if (state.issues.length === 0) {
    els.issueList.appendChild(createMutedItem("当前没有术语漂移。"));
    return;
  }

  state.issues.forEach((issue) => {
    const item = document.createElement("div");
    item.className = `issue-item ${issue.level === "critical" ? "critical" : ""}`;
    item.innerHTML = `
      <div class="issue-title">${escapeHtml(issue.title)}</div>
      <div class="issue-meta">${escapeHtml(issue.detail)}</div>
      <div class="issue-actions">
        <button class="small-button" type="button" data-jump="${issue.segmentId}">定位</button>
        <button class="small-button" type="button" data-fix="${issue.termId}" data-segment="${issue.segmentId}">修正</button>
      </div>
    `;
    item.querySelector("[data-jump]").addEventListener("click", () => scrollToSegment(issue.segmentId));
    item.querySelector("[data-fix]").addEventListener("click", () => applyTermToSegment(issue.termId, issue.segmentId));
    els.issueList.appendChild(item);
  });
}

function renderAgentEvents() {
  const events = state.activeProject?.agentEvents || [];
  els.eventCount.textContent = String(events.length);
  els.eventList.innerHTML = "";

  renderProviderSelector();

  if (events.length === 0) {
    els.eventList.appendChild(createMutedItem("还没有记录。"));
    return;
  }

  events.slice(0, 20).forEach((event) => {
    const item = document.createElement("div");
    item.className = "event-item";
    item.innerHTML = `
      <span class="event-title">${escapeHtml(event.title)}</span>
      <span class="event-detail">${escapeHtml(event.detail || event.type)}</span>
      <span class="event-time">${escapeHtml(formatDateTime(event.createdAt))}</span>
    `;
    if (event.segmentId) item.addEventListener("click", () => scrollToSegment(event.segmentId));
    els.eventList.appendChild(item);
  });
}

function renderProviderSelector() {
  let wrapper = document.querySelector("#providerSelectorWrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "providerSelectorWrapper";
    wrapper.className = "provider-selector";
    wrapper.innerHTML = `
      <label>
        <span>LLM Provider</span>
        <select id="providerSelector"></select>
      </label>
      <p class="provider-hint" id="providerSelectorHint"></p>
    `;
    document.querySelector(".event-card").prepend(wrapper);
    wrapper.querySelector("select").addEventListener("change", (event) => {
      state.selectedProviderId = event.target.value;
      renderProviderStatus();
      renderAgentRunner();
    });
  }

  const select = wrapper.querySelector("select");
  select.innerHTML = state.providers
    .map((provider) => {
      const status = provider.configured ? "可用" : "未配置";
      return `<option value="${escapeHtml(provider.id)}" ${provider.id === state.selectedProviderId ? "selected" : ""}>${escapeHtml(provider.label)} · ${status}</option>`;
    })
    .join("");
  renderProviderStatus();
}

function renderLlmSettings() {
  if (!els.llmConfigProvider) return;
  const previousProvider = els.llmConfigProvider.value || "deepseek";
  const selectedId = state.providers.some((provider) => provider.id === previousProvider) ? previousProvider : "deepseek";

  els.llmConfigProvider.innerHTML = state.providers
    .map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === selectedId ? "selected" : ""}>${escapeHtml(provider.label)}</option>`)
    .join("");

  syncLlmSettingsForm(selectedId);
}

function syncLlmSettingsForm(providerId) {
  const provider = state.providers.find((entry) => entry.id === providerId);
  const stored = state.settings?.llm?.[providerId] || {};
  if (!provider) return;

  els.llmBaseUrlInput.value = stored.baseUrl || provider.baseUrl || "";
  els.llmModelInput.value = stored.model || provider.model || "";
  els.llmApiKeyInput.value = "";
  const agentText = providerSupportsAgentTools(provider) ? "Agent 可用" : "Agent 暂不支持";
  els.llmConfigStatus.textContent = `${provider.configured ? "已配置" : "未配置"} · ${agentText}`;
}

function renderAgentRunner() {
  if (!els.skillSelect) return;

  els.skillSelect.innerHTML = state.skills
    .map((skill) => `<option value="${escapeHtml(skill.id)}" ${skill.id === state.selectedSkillId ? "selected" : ""}>${escapeHtml(skill.label)}</option>`)
    .join("");
  els.promptTemplateSelect.innerHTML = state.promptTemplates
    .map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`)
    .join("");
  renderProviderStatus();
}

function renderProviderStatus() {
  const provider = state.providers.find((entry) => entry.id === state.selectedProviderId);
  const hint = document.querySelector("#providerSelectorHint");
  if (!provider) {
    if (hint) hint.textContent = "请选择 LLM Provider。";
    if (els.agentStatusLabel) els.agentStatusLabel.textContent = "待命";
    return;
  }

  const supportsTools = providerSupportsAgentTools(provider);
  const configured = provider.configured ? "已配置" : "未配置";
  const agentText = supportsTools ? "支持工具 Agent" : "暂不支持工具 Agent";
  if (hint) {
    hint.textContent = `${provider.label} · ${configured} · ${agentText}`;
    hint.classList.toggle("warning", !supportsTools || !provider.configured);
  }
  if (els.agentStatusLabel) {
    els.agentStatusLabel.textContent = provider.configured && supportsTools ? "可运行" : agentText;
  }
}

function renderOcrStatus() {
  const doc = getActiveDocument();
  if (!els.ocrStatusLabel || !els.ocrStatusText) return;
  if (!doc) {
    els.ocrStatusLabel.textContent = "未选择";
    els.ocrStatusText.textContent = "选择文档后可查看 OCR 状态。";
    els.renderPageButton.disabled = true;
    els.runOcrButton.disabled = true;
    return;
  }

  els.renderPageButton.disabled = doc.layout !== "pdf";
  els.runOcrButton.disabled = !(doc.layout === "image" || doc.layout === "pdf" || doc.ingestionStatus === "pending-ocr");
  els.ocrStatusLabel.textContent = formatExtractionMethod(doc.extractionMethod);
  const warning = doc.warning ? ` · ${doc.warning}` : "";
  const provider = state.ocrProviders[0]?.label || "Tesseract.js 开源 OCR";
  els.ocrStatusText.textContent = `${provider} · ${doc.pages?.length || 1} 页 · ${formatIngestionStatus(doc.ingestionStatus)}${warning}`;
}

function syncSelectedSegmentPanel() {
  const segment = getSelectedSegment();
  if (!segment) {
    els.noteSegmentLabel.textContent = "-";
    els.noteEditor.value = "";
    els.noteEditor.disabled = true;
    return;
  }

  els.noteEditor.disabled = false;
  els.noteSegmentLabel.textContent = `#${segment.index}`;
  if (document.activeElement !== els.noteEditor) els.noteEditor.value = segment.note || "";
  if (document.activeElement !== els.floatingNoteEditor) els.floatingNoteEditor.value = segment.note || "";
}

function createMutedItem(text) {
  const item = document.createElement("div");
  item.className = "document-item";
  item.innerHTML = `<span class="document-meta">${escapeHtml(text)}</span>`;
  return item;
}

function selectSegment(segmentId) {
  if (state.selectedSegmentId === segmentId) return;
  state.selectedSegmentId = segmentId;
  renderReader();
  syncSelectedSegmentPanel();
  syncWorkbenchState();
  if (!state.lockedPage) renderCurrentPdfPage({ silent: true }).catch(() => {});
}

function scrollToSegment(segmentId) {
  selectSegment(segmentId);
  const node = els.readerGrid.querySelector(`[data-segment-id="${segmentId}"]`);
  if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
}

function jumpToPage(page) {
  const doc = getActiveDocument();
  if (!doc) return;
  const target = doc.segments.find((segment) => Number(segment.pageIndex || segment.index || 1) >= page) || doc.segments[0];
  if (target) scrollToSegment(target.id);
}

async function importFile(file) {
  if (!state.activeProjectId) return;
  const form = new FormData();
  form.append("file", file);
  showToast("正在上传并解析文献。");
  await api.post(`/api/projects/${state.activeProjectId}/documents`, form);
  await refreshProject();
  showToast("文献已加入当前项目。");
}

async function createProject() {
  const name = prompt("项目名称", "新研习项目");
  if (!name?.trim()) return;
  const payload = await api.post("/api/projects", { name: name.trim(), description: "" });
  state.projects.unshift({
    id: payload.project.id,
    name: payload.project.name,
    description: payload.project.description,
    documentCount: 0,
    glossaryCount: 0,
    createdAt: payload.project.createdAt,
    updatedAt: payload.project.updatedAt,
  });
  await openProject(payload.project.id);
  render();
}

async function refreshProject() {
  if (!state.activeProjectId) return;
  const previousDocumentId = state.activeDocumentId;
  const previousSegmentId = state.selectedSegmentId;
  await openProject(state.activeProjectId, { silent: true });
  if (state.activeProject.documents.some((doc) => doc.id === previousDocumentId)) {
    state.activeDocumentId = previousDocumentId;
  }
  const doc = getActiveDocument();
  if (doc?.segments.some((segment) => segment.id === previousSegmentId)) {
    state.selectedSegmentId = previousSegmentId;
  }
  render();
}

function syncWorkbenchState() {
  if (els.termHighlightToggle) {
    els.termHighlightToggle.checked = state.showTermHighlights;
  }
  if (els.lockPageButton) {
    els.lockPageButton.textContent = state.lockedPage ? `已锁 ${state.lockedPage}` : "锁定页";
    els.lockPageButton.classList.toggle("active", Boolean(state.lockedPage));
  }
  const selectedPage = state.lockedPage || getSelectedSegment()?.pageIndex;
  if (selectedPage && els.pageJumpInput && document.activeElement !== els.pageJumpInput) {
    els.pageJumpInput.value = String(selectedPage);
  }
}

async function saveSegment(segment, patch, documentId = null) {
  const doc = getActiveDocument();
  if (!doc || !segment) return;
  await api.patch(`/api/projects/${state.activeProjectId}/documents/${documentId || doc.id}/segments/${segment.id}`, patch);
}

function scanConsistency() {
  const doc = getActiveDocument();
  if (!doc) {
    state.issues = [];
    return;
  }

  const issues = [];
  getGlossary().forEach((term) => {
    if (!term.source || !term.target || !term.confirmed) return;
    doc.segments.forEach((segment) => {
      const matches = findTermMatches(segment.source, term);
      const sourceHasTerm = matches.length > 0;
      const translationExists = segment.translation.trim().length > 0;
      const targetMissing = !textHasTerm(segment.translation, { source: term.target, variants: [] });
      if (sourceHasTerm && translationExists && targetMissing) {
        issues.push({
          id: `${term.id}-${segment.id}-${matches[0].form}`,
          termId: term.id,
          segmentId: segment.id,
          matchedForm: matches[0].text,
          level: "warning",
          title: `${term.source} 译法可能漂移`,
          detail: `第 ${segment.index} 段命中词形“${matches[0].text}”，但译文未使用“${term.target}”。`,
        });
      }
    });
  });
  state.issues = issues;
}

async function applyTermToSegment(termId, segmentId) {
  const term = getGlossary().find((entry) => entry.id === termId);
  const doc = getActiveDocument();
  const segment = doc?.segments.find((entry) => entry.id === segmentId);
  if (!doc || !term || !segment || textHasTerm(segment.translation, { source: term.target, variants: [] })) return;

  const suggested = `${segment.translation.trim()}（术语建议：${term.target}）`.trim();
  const nextTranslation = prompt(
    `术语“${term.source}”建议译为“${term.target}”。请确认或编辑第 ${segment.index} 段译文：`,
    suggested,
  );
  if (nextTranslation === null) return;
  segment.translation = nextTranslation.trim();
  await saveSegment(segment, { translation: segment.translation });
  await recordAgentEvent("consistency", "术语译法已确认修正", `第 ${segment.index} 段确认使用“${term.target}”。`, segment.id);
  await refreshProject();
  scrollToSegment(segmentId);
}

async function applyAllConsistencyFixes() {
  const doc = getActiveDocument();
  if (!doc || state.issues.length === 0) return;

  let fixed = 0;
  const preview = state.issues.slice(0, 8).map((issue) => `#${doc.segments.find((entry) => entry.id === issue.segmentId)?.index || "?"} ${issue.matchedForm || ""}`).join("，");
  const confirmed = confirm(`将为 ${state.issues.length} 处术语漂移追加“术语建议”标记。${preview ? `\n预览：${preview}` : ""}`);
  if (!confirmed) return;

  for (const issue of state.issues) {
    const term = getGlossary().find((entry) => entry.id === issue.termId);
    const segment = doc.segments.find((entry) => entry.id === issue.segmentId);
    if (!term?.target || !segment || textHasTerm(segment.translation, { source: term.target, variants: [] })) continue;
    segment.translation = `${segment.translation.trim()}（术语建议：${term.target}）`.trim();
    await saveSegment(segment, { translation: segment.translation });
    fixed += 1;
  }

  await recordAgentEvent("consistency", "批量术语修正完成", `已处理 ${fixed} 处译法漂移。`);
  await refreshProject();
  showToast(`已批量修正 ${fixed} 处。`);
}

async function translateSegmentWithLlm(segment) {
  if (!state.selectedProviderId) {
    showToast("没有可用的 LLM Provider。");
    return;
  }

  const provider = state.providers.find((entry) => entry.id === state.selectedProviderId);
  if (!provider?.configured) {
    showToast("请先在 LLM 设置中配置该 Provider。");
    return;
  }

  const doc = getActiveDocument();
  if (!doc) return;
  const documentId = doc.id;
  const segmentId = segment.id;
  const triggerButton = document.querySelector(`[data-llm-translate="${segmentId}"]`);
  const editor = document.querySelector(`[data-translation-id="${segmentId}"]`);
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = "...";
  }
  if (editor) {
    editor.dataset.loading = "true";
    editor.placeholder = "LLM 正在生成译文...";
  }

  showToast("正在调用 LLM 生成译文。");
  try {
    const result = await api.post("/api/llm/chat", {
      providerId: state.selectedProviderId,
      task: "translate",
      source: segment.source,
      glossary: getGlossary().filter((term) => term.confirmed),
      prompt: `Style: ${els.styleSelect.value}`,
    });

    const text = String(result.text || "").trim();
    if (!text) {
      throw new Error("LLM 返回为空，未生成可显示译文。");
    }

    segment.translation = text;
    syncTranslationEditor(segmentId, text);
    await saveSegment(segment, { translation: text, status: "machine-draft" }, documentId);
    await recordAgentEvent("translation", "LLM 初译已生成", `${provider.label} · ${result.model || provider.model} · 第 ${segment.index} 段`, segment.id);
    await refreshProject();
    syncTranslationEditor(segmentId, text);
    scrollToSegment(segmentId);
    showToast("LLM 译文已写入当前段落。");
  } catch (error) {
    await recordAgentEvent("translation-error", "LLM 翻译失败", `${provider.label} · 第 ${segment.index} 段 · ${error.message}`, segment.id).catch(() => {});
    throw error;
  } finally {
    const freshButton = document.querySelector(`[data-llm-translate="${segmentId}"]`);
    const freshEditor = document.querySelector(`[data-translation-id="${segmentId}"]`);
    if (freshButton) {
      freshButton.disabled = false;
      freshButton.textContent = "LLM";
    }
    if (freshEditor) {
      delete freshEditor.dataset.loading;
      freshEditor.placeholder = "在此写入或生成译文。";
    }
  }
}

async function runBatchTranslate() {
  const doc = getActiveDocument();
  if (!doc) return;
  const provider = state.providers.find((entry) => entry.id === state.selectedProviderId);
  if (!provider?.configured) {
    showToast("请先配置可用的 LLM Provider。");
    return;
  }

  els.runBatchTranslateButton.disabled = true;
  els.batchStatusText.textContent = "正在创建后端批量翻译任务。";
  try {
    const payload = await api.post(`/api/projects/${state.activeProjectId}/documents/${doc.id}/batch-translate`, {
      providerId: state.selectedProviderId,
      scope: els.batchScopeSelect.value,
      startPage: Number(els.batchStartPageInput.value || 1),
      pageCount: Number(els.batchPageCountInput.value || 1),
      onlyEmpty: els.batchOnlyEmptyInput.checked,
      segmentId: state.selectedSegmentId,
      style: els.styleSelect.value,
    });
    await pollBatchJob(payload.job.id);
  } catch (error) {
    els.runBatchTranslateButton.disabled = false;
    els.batchStatusText.textContent = "批量翻译会逐段保存，并记录认知足迹。";
    throw error;
  }
}

async function pollBatchJob(jobId) {
  clearTimeout(state.batchPollTimer);
  const payload = await api.get(`/api/projects/${state.activeProjectId}/batch-jobs/${jobId}`);
  const job = payload.job;
  const done = job.status === "completed" || job.status === "completed-with-errors" || job.status === "failed";
  const current = job.currentSegmentIndex ? ` · 当前第 ${job.currentSegmentIndex} 段` : "";
  els.batchStatusText.textContent = `后端任务 ${job.status}：成功 ${job.translated}/${job.total}，跳过 ${job.skipped}，失败 ${job.failed}${current}`;
  await refreshProject();
  if (!done) {
    state.batchPollTimer = setTimeout(() => {
      pollBatchJob(jobId).catch(showError);
    }, 1200);
    return;
  }
  els.runBatchTranslateButton.disabled = false;
  showToast(`批量翻译结束：成功 ${job.translated}，失败 ${job.failed}。`);
  if (job.failed === 0) closeModal("batchModal");
}

async function runAgent() {
  if (!state.activeProjectId) return;
  const instruction = els.agentInstruction.value.trim();
  if (!instruction) {
    showToast("请先写 Agent 指令。");
    return;
  }

  const provider = state.providers.find((entry) => entry.id === state.selectedProviderId);
  if (!provider?.configured) {
    showToast("请先配置可用的 LLM Provider。");
    renderProviderStatus();
    return;
  }
  if (!providerSupportsAgentTools(provider)) {
    showToast(`${provider.label} 当前暂不支持工具 Agent，请选择 DeepSeek、OpenAI、Qwen、OpenRouter、Ollama、LM Studio 或 Claude。`);
    renderProviderStatus();
    return;
  }

  els.runAgentButton.disabled = true;
  els.agentStatusLabel.textContent = "运行中";
  showToast(`${provider.label} Agent 正在运行。`);

  try {
    const result = await api.post("/api/agents/run", {
      projectId: state.activeProjectId,
      documentId: state.activeDocumentId,
      segmentId: state.selectedSegmentId,
      skillId: state.selectedSkillId,
      providerId: state.selectedProviderId,
      instruction,
      maxSteps: 8,
    });
    els.agentStatusLabel.textContent = "完成";
    await refreshProject();
    showToast(result.output ? "Agent 已完成并保存 trace。" : "Agent 已完成。");
  } finally {
    els.runAgentButton.disabled = false;
    renderProviderStatus();
  }
}

function providerSupportsAgentTools(provider) {
  if (!provider) return false;
  return provider.kind === "openai-compatible" || provider.kind === "anthropic" || provider.id === "claude";
}

async function generateDraftTranslations() {
  const doc = getActiveDocument();
  if (!doc) return;

  let generated = 0;
  for (const segment of doc.segments) {
    if (segment.translation.trim()) continue;
    segment.translation = createDraft(segment.source);
    await saveSegment(segment, { translation: segment.translation, status: "machine-draft" });
    generated += 1;
  }

  await recordAgentEvent("translation", "占位初译草稿已生成", `生成 ${generated} 个段落。`);
  await refreshProject();
  showToast("已生成占位初译稿。");
}

function createDraft(source) {
  const glossaryHit = getGlossary().find((term) => source.toLowerCase().includes(term.source.toLowerCase()));
  const prefixMap = {
    literal: "直译草稿",
    paper: "论文风格草稿",
    monograph: "专著风格草稿",
  };
  const hint = glossaryHit ? `；术语提示：${glossaryHit.source} -> ${glossaryHit.target}` : "";
  return `[${prefixMap[els.styleSelect.value]}] ${source}${hint}`;
}

async function scanTerms() {
  const doc = getActiveDocument();
  if (!doc) return;

  const candidates = extractTermCandidates(doc.sourceText);
  let added = 0;
  for (const source of candidates) {
    const exists = getGlossary().some((term) => term.source.toLowerCase() === source.toLowerCase());
    if (exists) continue;
    await api.post(`/api/projects/${state.activeProjectId}/glossary`, { source, target: "", confirmed: false });
    added += 1;
  }

  await recordAgentEvent("glossary", "候选术语扫描完成", `新增 ${added} 个候选术语。`);
  await refreshProject();
  showToast(added > 0 ? `已发现 ${added} 个候选术语。` : "没有发现新的候选术语。");
}

function extractTermCandidates(text) {
  const latinTerms = Array.from(String(text).matchAll(/\b[A-Z][A-Za-zÀ-ž-]{3,}\b/g)).map((match) => match[0]);
  const cjkTerms = Array.from(String(text).matchAll(/[\u4e00-\u9fff]{2,6}/g)).map((match) => match[0]);
  const stopWords = new Set(["This", "That", "These", "Those", "When", "Where", "From", "With"]);
  const counts = new Map();
  [...latinTerms, ...cjkTerms].forEach((term) => {
    if (stopWords.has(term)) return;
    counts.set(term, (counts.get(term) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([term]) => term);
}

async function addTermFromInputs() {
  const source = els.termSourceInput.value.trim();
  const target = els.termTargetInput.value.trim();
  if (!source) {
    showToast("请先填写原词。");
    return;
  }

  await api.post(`/api/projects/${state.activeProjectId}/glossary`, {
    source,
    target,
    variants: buildDefaultVariants(source),
    confirmed: Boolean(target),
  });
  await recordAgentEvent("glossary", "术语库已更新", target ? `${source} -> ${target}` : source);
  els.termSourceInput.value = "";
  els.termTargetInput.value = "";
  await refreshProject();
}

async function updateGlossaryTerm(termId, patch) {
  await api.patch(`/api/projects/${state.activeProjectId}/glossary/${termId}`, patch);
  await refreshProject();
}

function exportProject() {
  openModal("exportModal");
}

async function createProjectSnapshot() {
  if (!state.activeProjectId) return;
  els.saveButton.disabled = true;
  els.saveButton.textContent = "保存中";
  try {
    const payload = await api.post(`/api/projects/${state.activeProjectId}/snapshots`, {});
    await refreshProject();
    els.saveButton.textContent = "保存项目快照";
    showToast(`项目快照已保存：${formatDateTime(payload.snapshot.createdAt)}`);
  } finally {
    els.saveButton.disabled = false;
  }
}

async function runExport() {
  if (!state.activeProject) return;
  const doc = getActiveDocument();
  const payload = {
    format: els.exportFormatSelect.value,
    content: els.exportContentSelect.value,
    scope: els.exportScopeSelect.value,
    documentId: doc?.id,
    segmentId: state.selectedSegmentId,
    startPage: Number(els.exportStartPageInput.value || 1),
    pageCount: Number(els.exportPageCountInput.value || 1),
  };
  const response = await fetch(`/api/projects/${state.activeProjectId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("导出失败。");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const fileName = decodeURIComponent(disposition.match(/filename=\"?([^"]+)/)?.[1] || "hpsreader-export.txt");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  closeModal("exportModal");
}

async function importProjectJson(file) {
  const payload = JSON.parse(await file.text());
  const project = payload.project || payload;
  if (!project?.name) {
    showToast("未识别到项目 JSON。");
    return;
  }

  const created = await api.post("/api/projects", {
    name: `${project.name} 导入`,
    description: project.description || "JSON import",
  });
  await openProject(created.project.id, { silent: true });

  for (const term of project.glossary || []) {
    await api.post(`/api/projects/${created.project.id}/glossary`, term);
  }
  await recordAgentEvent("storage", "项目 JSON 已导入", project.name);
  await loadProjects();
  render();
}

async function recordAgentEvent(type, title, detail, segmentId = null) {
  if (!state.activeProjectId) return;
  await api.post(`/api/projects/${state.activeProjectId}/events`, { type, title, detail, segmentId });
}

async function saveLlmSettings() {
  const providerId = els.llmConfigProvider.value;
  const payload = {
    apiKey: els.llmApiKeyInput.value.trim(),
    baseUrl: els.llmBaseUrlInput.value.trim(),
    model: els.llmModelInput.value.trim(),
  };

  await api.put(`/api/settings/llm/${providerId}`, payload);
  await Promise.all([loadSettings(), loadProviders()]);
  syncLlmSettingsForm(providerId);
  state.selectedProviderId = providerId;
  showToast("LLM 设置已保存。");
  renderProviderSelector();
  renderAgentRunner();
}

async function testCurrentProvider() {
  const providerId = els.llmConfigProvider.value;
  const provider = state.providers.find((entry) => entry.id === providerId);
  if (!provider?.configured) {
    showToast("请先保存 API Key，再测试 Provider。");
    return;
  }

  els.testLlmSettingsButton.disabled = true;
  try {
    const result = await api.post("/api/llm/chat", {
      providerId,
      task: "chat",
      prompt: "请只回复：连接成功",
      source: "ping",
    });
    showToast(result.text ? `测试成功：${result.text.slice(0, 40)}` : "测试完成，但返回为空。");
  } finally {
    els.testLlmSettingsButton.disabled = false;
  }
}

function highlightTerms(text) {
  const source = String(text || "");
  if (!state.showTermHighlights) return escapeHtml(source);

  const matches = [];
  getGlossary()
    .filter((term) => term.confirmed && term.source && term.source.length > 1)
    .forEach((term) => {
      findTermMatches(source, term).forEach((match) => {
        matches.push({ ...match, term });
      });
    });

  const selected = [];
  matches
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    .forEach((match) => {
      const overlaps = selected.some((entry) => match.start < entry.end && match.end > entry.start);
      if (!overlaps) selected.push(match);
    });

  if (!selected.length) return escapeHtml(source);
  selected.sort((a, b) => a.start - b.start);
  let cursor = 0;
  let html = "";
  selected.forEach((match) => {
    html += escapeHtml(source.slice(cursor, match.start));
    const title = [
      match.term.target || "未设置译法",
      match.form !== match.term.source ? `命中词形：${match.text}` : "",
      match.term.language ? `语言：${match.term.language}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    html += `<mark class="term-mark" title="${escapeHtml(title)}">${escapeHtml(source.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  });
  html += escapeHtml(source.slice(cursor));
  return html;
}

function syncTranslationEditor(segmentId, text) {
  const doc = getActiveDocument();
  const segment = doc?.segments.find((entry) => entry.id === segmentId);
  if (segment) segment.translation = text;
  const editor = document.querySelector(`[data-translation-id="${segmentId}"]`);
  if (editor) {
    editor.value = text;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function findTermMatches(text, term) {
  const source = String(text || "");
  const forms = getTermForms(term);
  const matches = [];
  forms.forEach((form) => {
    if (!form || form.length < 2) return;
    const pattern = buildTermPattern(form);
    let match;
    while ((match = pattern.exec(source)) !== null) {
      matches.push({
        form,
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  });
  return matches;
}

function textHasTerm(text, term) {
  return findTermMatches(text, term).length > 0;
}

function getTermForms(term) {
  const baseForms = [term.source, term.lemma, ...(term.variants || [])];
  const forms = [...baseForms, ...baseForms.map(foldDiacritics), ...buildDefaultVariants(term.source)];
  return Array.from(new Set(forms.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function buildDefaultVariants(source) {
  const text = String(source || "").trim();
  if (!text || /[\u3400-\u9fff]/.test(text)) return [];
  const variants = [];
  if (text.includes("-")) variants.push(text.replace(/-/g, " "));
  if (text.includes(" ")) variants.push(text.replace(/\s+/g, "-"));
  if (/^[A-Za-zÀ-ž-]+$/.test(text)) {
    variants.push(`${text}s`, `${text}es`);
    if (text.endsWith("y")) variants.push(`${text.slice(0, -1)}ies`);
  }
  return variants.filter((entry) => entry && entry !== text);
}

function buildTermPattern(form) {
  const parts = escapeRegExp(form.normalize("NFC"))
    .replace(/\\\-/g, "[-\\s]+")
    .replace(/\s+/g, "[-\\s]+");
  const latinBoundary = /^[A-Za-zÀ-ž\s-]+$/.test(form);
  const body = stripDiacriticsPattern(parts);
  return new RegExp(latinBoundary ? `(?<![A-Za-zÀ-ž])${body}(?![A-Za-zÀ-ž])` : body, "giu");
}

function stripDiacriticsPattern(pattern) {
  const groups = {
    a: "[aàáâãäåāăąǎ]",
    e: "[eèéêëēĕėęě]",
    i: "[iìíîïĩīĭįıǐ]",
    o: "[oòóôõöøōŏőǒ]",
    u: "[uùúûüũūŭůűųǔ]",
    c: "[cçćĉċč]",
    n: "[nñńņň]",
    y: "[yýÿŷ]",
  };
  return pattern.replace(/[aeioucny]/gi, (letter) => {
    const group = groups[letter.toLowerCase()];
    if (!group) return letter;
    return letter === letter.toUpperCase() ? group.toUpperCase() : group;
  });
}

function parseVariants(value) {
  return Array.from(new Set(String(value || "").split(/[,，;\n]/).map((entry) => entry.trim()).filter(Boolean)));
}

function foldDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showSourceFileHint(doc, segment) {
  const page = segment.pageIndex || segment.index || 1;
  if (!doc.storagePath) {
    showToast("当前文档没有原始文件路径。");
    return;
  }
  const sourceUrl = `/api/projects/${state.activeProjectId}/documents/${doc.id}/source?disposition=inline#page=${page}`;
  const downloadUrl = `/api/projects/${state.activeProjectId}/documents/${doc.id}/source-download`;
  const preview = window.open("", "_blank", "width=980,height=720");
  if (!preview) {
    window.open(sourceUrl, "_blank", "noopener");
    return;
  }
  preview.document.write(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(doc.title || "原文预览")}</title>
        <style>
          body { margin: 0; font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif; background: #fbf9ff; color: #262238; }
          header { align-items: center; background: #f6f2fb; border-bottom: 1px solid #e5dff0; display: flex; gap: 12px; height: 52px; justify-content: space-between; padding: 0 16px; }
          strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          a { border: 1px solid #e5dff0; border-radius: 6px; color: #6f55ad; padding: 7px 10px; text-decoration: none; }
          iframe { border: 0; height: calc(100vh - 52px); width: 100vw; }
        </style>
      </head>
      <body>
        <header>
          <strong>${escapeHtml(doc.title || doc.fileName || "原文文件")}</strong>
          <a href="${downloadUrl}">下载原文件</a>
        </header>
        <iframe src="${sourceUrl}" title="原文预览"></iframe>
      </body>
    </html>
  `);
  preview.document.close();
}

async function renderCurrentPdfPage(options = {}) {
  const doc = getActiveDocument();
  if (!doc) return;
  if (doc.layout !== "pdf") {
    if (!options.silent) showToast("当前文档不是 PDF，无法渲染页图。");
    return;
  }
  if (!window.pdfjsLib) {
    if (!options.silent) showToast("PDF.js 尚未加载完成，请稍后重试。");
    return;
  }

  const page = state.lockedPage || getSelectedSegment()?.pageIndex || Number(els.pageJumpInput.value || 1);
  els.ocrStatusText.textContent = `正在渲染第 ${page} 页原文页图。`;
  const sourceUrl = `/api/projects/${state.activeProjectId}/documents/${doc.id}/source?disposition=inline`;
  const loadingTask = window.pdfjsLib.getDocument(sourceUrl);
  const pdf = await loadingTask.promise;
  const safePage = Math.min(Math.max(1, Number(page || 1)), pdf.numPages);
  const pdfPage = await pdf.getPage(safePage);
  const viewport = pdfPage.getViewport({ scale: 1.35 });
  const canvas = els.pagePreviewCanvas;
  const context = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await pdfPage.render({ canvasContext: context, viewport }).promise;
  els.pageJumpInput.value = String(safePage);
  els.ocrStatusText.textContent = `已渲染第 ${safePage}/${pdf.numPages} 页；可对照原文版面校读。`;
}

async function runOpenSourceOcr() {
  const doc = getActiveDocument();
  if (!doc) return;
  const language = prompt("OCR 语言代码", guessOcrLanguageInput(doc.language));
  if (!language) return;

  els.runOcrButton.disabled = true;
  els.ocrStatusText.textContent = "Tesseract.js 正在本地识别，首次加载语言模型可能较慢。";
  try {
    const payload = await api.post(`/api/projects/${state.activeProjectId}/documents/${doc.id}/ocr`, {
      providerId: "tesseract-js",
      language,
      pageIndex: state.lockedPage || getSelectedSegment()?.pageIndex || 1,
      imageDataUrl: doc.layout === "pdf" ? await capturePdfPageForOcr(doc) : "",
    });
    state.activeProject.documents = state.activeProject.documents.map((entry) => (entry.id === doc.id ? payload.document : entry));
    await refreshProject();
    showToast("OCR 结果已写回文档。");
  } finally {
    els.runOcrButton.disabled = false;
  }
}

async function capturePdfPageForOcr(doc) {
  if (doc.layout !== "pdf") return "";
  if (!window.pdfjsLib) throw new Error("PDF.js 尚未加载完成，请稍后重试。");
  const page = state.lockedPage || getSelectedSegment()?.pageIndex || Number(els.pageJumpInput.value || 1);
  els.ocrStatusText.textContent = `正在为 OCR 渲染第 ${page} 页图像。`;
  const sourceUrl = `/api/projects/${state.activeProjectId}/documents/${doc.id}/source?disposition=inline`;
  const loadingTask = window.pdfjsLib.getDocument(sourceUrl);
  const pdf = await loadingTask.promise;
  const safePage = Math.min(Math.max(1, Number(page || 1)), pdf.numPages);
  const pdfPage = await pdf.getPage(safePage);
  const viewport = pdfPage.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await pdfPage.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

function openCommentModal(segment, target) {
  const selectedText = getSelectedText(segment, target);
  if (!selectedText) {
    showToast("请先在原文或译文中选中要批注的文字。");
    return;
  }

  state.pendingComment = {
    documentId: getActiveDocument()?.id,
    segmentId: segment.id,
    target,
    selectedText,
    llmDraft: "",
  };
  els.commentTargetLabel.textContent = target === "translation" ? `译文 · 第 ${segment.index} 段` : `原文 · 第 ${segment.index} 段`;
  els.commentSelectedText.textContent = selectedText;
  els.commentBodyInput.value = "";
  els.commentStatusText.textContent = "批注会绑定到当前段落和选中的文本。";
  openModal("commentModal");
}

function getSelectedText(segment, target) {
  if (target === "translation") {
    const editor = document.querySelector(`[data-translation-id="${segment.id}"]`);
    if (editor && editor.selectionStart !== editor.selectionEnd) {
      return editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    }
  }

  const selection = window.getSelection();
  const selected = selection?.toString().trim() || "";
  if (!selected) return "";
  const node = selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
  const card = node?.closest?.(".segment-card");
  if (card?.dataset.segmentId === segment.id) return selected;
  return "";
}

async function assistCommentWithLlm() {
  const pending = state.pendingComment;
  if (!pending) return;
  const provider = state.providers.find((entry) => entry.id === state.selectedProviderId);
  if (!provider?.configured) {
    showToast("请先配置可用的 LLM Provider。");
    return;
  }

  const segment = getActiveDocument()?.segments.find((entry) => entry.id === pending.segmentId);
  if (!segment) return;
  els.assistCommentButton.disabled = true;
  els.commentStatusText.textContent = "LLM 正在生成批注草稿。";
  try {
    const result = await api.post("/api/llm/chat", {
      providerId: state.selectedProviderId,
      task: "chat",
      messages: [
        {
          role: "system",
          content: "你是一个严谨的学术阅读批注助手。请用中文生成可直接写入批注区的短批注，不要泛泛而谈。",
        },
        {
          role: "user",
          content: [
            `批注对象：${pending.target === "translation" ? "译文" : "原文"}`,
            `选中文本：${pending.selectedText}`,
            `原文段落：${segment.source}`,
            `译文段落：${segment.translation || "尚未生成译文"}`,
            `用户已有批注：${els.commentBodyInput.value.trim() || "无"}`,
            "请生成：1. 核心判断；2. 可能的问题或术语提醒；3. 如有必要，给出一句可执行的修改建议。",
          ].join("\n\n"),
        },
      ],
    });
    const draft = String(result.text || "").trim();
    if (!draft) throw new Error("LLM 返回为空，未生成批注草稿。");
    pending.llmDraft = draft;
    els.commentBodyInput.value = els.commentBodyInput.value.trim()
      ? `${els.commentBodyInput.value.trim()}\n\nLLM 辅助：${draft}`
      : draft;
    els.commentStatusText.textContent = "LLM 批注草稿已写入，可继续编辑后保存。";
  } finally {
    els.assistCommentButton.disabled = false;
  }
}

async function savePendingComment() {
  const pending = state.pendingComment;
  if (!pending?.documentId || !pending.segmentId) return;
  const body = els.commentBodyInput.value.trim();
  if (!body && !pending.llmDraft) {
    showToast("请先填写批注内容。");
    return;
  }

  await api.post(
    `/api/projects/${state.activeProjectId}/documents/${pending.documentId}/segments/${pending.segmentId}/comments`,
    {
      target: pending.target,
      selectedText: pending.selectedText,
      body,
      llmDraft: pending.llmDraft,
    },
  );
  closeModal("commentModal");
  state.pendingComment = null;
  await refreshProject();
  scrollToSegment(pending.segmentId);
  showToast("批注已保存。");
}

async function deleteComment(segmentId, commentId) {
  const doc = getActiveDocument();
  if (!doc || !commentId) return;
  await api.delete(`/api/projects/${state.activeProjectId}/documents/${doc.id}/segments/${segmentId}/comments/${commentId}`);
  await refreshProject();
  scrollToSegment(segmentId);
  showToast("批注已删除。");
}

function openModal(id) {
  document.querySelector(`#${id}`)?.classList.remove("hidden");
}

function closeModal(id) {
  document.querySelector(`#${id}`)?.classList.add("hidden");
}

function toggleFloatingNote(show = true) {
  if (show) applyFloatingNotePosition();
  els.floatingNote.classList.toggle("hidden", !show);
  syncSelectedSegmentPanel();
}

function wireFloatingNoteDrag() {
  let start = null;
  els.floatingNoteHeader.addEventListener("pointerdown", (event) => {
    start = {
      x: event.clientX,
      y: event.clientY,
      left: els.floatingNote.offsetLeft,
      top: els.floatingNote.offsetTop,
    };
    els.floatingNoteHeader.setPointerCapture(event.pointerId);
  });
  els.floatingNoteHeader.addEventListener("pointermove", (event) => {
    if (!start) return;
    const next = constrainFloatingNotePosition(start.left + event.clientX - start.x, start.top + event.clientY - start.y);
    els.floatingNote.style.left = `${next.left}px`;
    els.floatingNote.style.top = `${next.top}px`;
    els.floatingNote.style.right = "auto";
    els.floatingNote.style.bottom = "auto";
  });
  els.floatingNoteHeader.addEventListener("pointerup", () => {
    saveFloatingNotePosition();
    start = null;
  });
}

function applyFloatingNotePosition() {
  const raw = localStorage.getItem(STORAGE_KEYS.floatingNotePosition);
  if (!raw) return;
  try {
    const position = JSON.parse(raw);
    const next = constrainFloatingNotePosition(Number(position.left), Number(position.top));
    els.floatingNote.style.left = `${next.left}px`;
    els.floatingNote.style.top = `${next.top}px`;
    els.floatingNote.style.right = "auto";
    els.floatingNote.style.bottom = "auto";
  } catch {
    localStorage.removeItem(STORAGE_KEYS.floatingNotePosition);
  }
}

function saveFloatingNotePosition() {
  if (!els.floatingNote || els.floatingNote.classList.contains("hidden")) return;
  localStorage.setItem(
    STORAGE_KEYS.floatingNotePosition,
    JSON.stringify({
      left: els.floatingNote.offsetLeft,
      top: els.floatingNote.offsetTop,
    }),
  );
}

function constrainFloatingNotePosition(left, top) {
  const width = els.floatingNote.offsetWidth || 320;
  const height = els.floatingNote.offsetHeight || 260;
  const maxLeft = Math.max(12, window.innerWidth - width - 12);
  const maxTop = Math.max(12, window.innerHeight - height - 12);
  return {
    left: Math.min(Math.max(Number.isFinite(left) ? left : maxLeft, 12), maxLeft),
    top: Math.min(Math.max(Number.isFinite(top) ? top : maxTop, 12), maxTop),
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatIngestionStatus(status) {
  const labels = {
    ready: "可研读",
    "pending-ocr": "待 OCR",
    unsupported: "待适配",
  };
  return labels[status] || "可研读";
}

function formatExtractionMethod(method) {
  const labels = {
    text: "文本导入",
    "pdf-text-layer": "PDF 文本层",
    "pending-ocr": "待 OCR",
    "ocr-tesseract-js": "Tesseract.js OCR",
    unsupported: "待适配",
  };
  return labels[method] || method || "未知";
}

function guessOcrLanguageInput(language) {
  const text = String(language || "").toLowerCase();
  if (text.includes("中文")) return "chi_sim";
  if (text.includes("greek") || text.includes("希腊")) return "ell";
  if (text.includes("french") || text.includes("法文")) return "fra";
  if (text.includes("german") || text.includes("德文")) return "deu";
  return "eng";
}

function wireEvents() {
  els.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (file) await importFile(file).catch(showError);
    event.target.value = "";
  });

  els.projectInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (file) await importProjectJson(file).catch(showError);
    event.target.value = "";
  });

  els.fileDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.fileDrop.classList.add("dragging");
  });

  els.fileDrop.addEventListener("dragleave", () => {
    els.fileDrop.classList.remove("dragging");
  });

  els.fileDrop.addEventListener("drop", async (event) => {
    event.preventDefault();
    els.fileDrop.classList.remove("dragging");
    const [file] = event.dataTransfer.files;
    if (file) await importFile(file).catch(showError);
  });

  els.newProjectButton.addEventListener("click", () => createProject().catch(showError));
  els.importProjectButton.addEventListener("click", () => els.projectInput.click());
  els.exportButton.addEventListener("click", exportProject);
  els.runExportButton.addEventListener("click", () => runExport().catch(showError));
  els.saveButton.addEventListener("click", () => createProjectSnapshot().catch(showError));
  els.draftButton.addEventListener("click", () => generateDraftTranslations().catch(showError));
  els.batchTranslateButton.addEventListener("click", () => openModal("batchModal"));
  els.runBatchTranslateButton.addEventListener("click", () => runBatchTranslate().catch(showError));
  els.scanTermsButton.addEventListener("click", () => scanTerms().catch(showError));
  els.consistencyButton.addEventListener("click", async () => {
    scanConsistency();
    await recordAgentEvent("consistency", "一致性检查完成", `发现 ${state.issues.length} 个待处理问题。`).catch(showError);
    await refreshProject().catch(showError);
    showToast("一致性检查完成。");
  });
  els.batchFixButton.addEventListener("click", () => applyAllConsistencyFixes().catch(showError));
  els.jumpPageButton.addEventListener("click", () => {
    const page = Number(els.pageJumpInput.value || 1);
    if (state.lockedPage) state.lockedPage = page;
    syncWorkbenchState();
    jumpToPage(page);
    if (state.lockedPage) renderCurrentPdfPage().catch(showError);
  });
  els.lockPageButton.addEventListener("click", () => {
    const page = Number(els.pageJumpInput.value || 1);
    state.lockedPage = state.lockedPage === page ? null : page;
    syncWorkbenchState();
    if (state.lockedPage) jumpToPage(page);
    renderCurrentPdfPage().catch(showError);
  });
  els.termHighlightToggle.addEventListener("change", (event) => {
    state.showTermHighlights = event.target.checked;
    localStorage.setItem(STORAGE_KEYS.showTermHighlights, String(state.showTermHighlights));
    renderReader();
  });
  els.llmConfigProvider.addEventListener("change", (event) => syncLlmSettingsForm(event.target.value));
  els.saveLlmSettingsButton.addEventListener("click", () => saveLlmSettings().catch(showError));
  els.testLlmSettingsButton.addEventListener("click", () => testCurrentProvider().catch(showError));
  els.skillSelect.addEventListener("change", (event) => {
    state.selectedSkillId = event.target.value;
  });
  els.promptTemplateSelect.addEventListener("change", (event) => {
    const template = state.promptTemplates.find((entry) => entry.id === event.target.value);
    if (template && template.prompt) {
      els.agentInstruction.value = template.prompt;
    }
  });
  els.runAgentButton.addEventListener("click", () => runAgent().catch(showError));
  els.assistCommentButton.addEventListener("click", () => assistCommentWithLlm().catch(showError));
  els.saveCommentButton.addEventListener("click", () => savePendingComment().catch(showError));
  els.renderPageButton.addEventListener("click", () => renderCurrentPdfPage().catch(showError));
  els.runOcrButton.addEventListener("click", () => runOpenSourceOcr().catch(showError));
  els.segmentButton.addEventListener("click", () => showToast("当前文档已按段落组织。"));
  els.addTermButton.addEventListener("click", () => addTermFromInputs().catch(showError));
  els.floatNoteButton.addEventListener("click", () => toggleFloatingNote(true));
  els.closeFloatingNoteButton.addEventListener("click", () => toggleFloatingNote(false));
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });
  wireFloatingNoteDrag();

  els.noteEditor.addEventListener("change", async (event) => {
    const segment = getSelectedSegment();
    if (!segment) return;
    segment.note = event.target.value;
    await saveSegment(segment, { note: event.target.value }).catch(showError);
  });
  els.floatingNoteEditor.addEventListener("change", async (event) => {
    const segment = getSelectedSegment();
    if (!segment) return;
    segment.note = event.target.value;
    els.noteEditor.value = event.target.value;
    await saveSegment(segment, { note: event.target.value }).catch(showError);
  });
}

function showError(error) {
  console.error(error);
  showToast(error.message || "操作失败。");
}

init().catch(showError);
