const state = {
  draw: [],
  selectedCardId: "",
  runs: JSON.parse(localStorage.getItem("srt.runs") || "[]"),
};

const els = {
  goalInput: document.querySelector("#goalInput"),
  sourceInput: document.querySelector("#sourceInput"),
  translationInput: document.querySelector("#translationInput"),
  commentInput: document.querySelector("#commentInput"),
  cardGrid: document.querySelector("#cardGrid"),
  paperList: document.querySelector("#paperList"),
  runCount: document.querySelector("#runCount"),
  draftButton: document.querySelector("#draftButton"),
  rerollButton: document.querySelector("#rerollButton"),
  saveRunButton: document.querySelector("#saveRunButton"),
  sampleButton: document.querySelector("#sampleButton"),
  copyButton: document.querySelector("#copyButton"),
  resetButton: document.querySelector("#resetButton"),
};

const CARD_TYPES = [
  {
    kind: "概念史线索",
    title: "追踪概念位移",
    focus: "把本段看成一个概念在不同知识传统之间移动的证据。",
    use: "适合放入论文的文本细读部分，用来证明概念含义并非稳定不变。",
  },
  {
    kind: "方法论批评",
    title: "保留但反问作者",
    focus: "译文尽量保留作者的论证层次，同时在 comment 中指出其方法预设。",
    use: "适合进入论文的方法讨论，说明你如何与作者保持距离。",
  },
  {
    kind: "术语策略",
    title: "固定核心译名",
    focus: "把一个核心术语稳定下来，让后续段落围绕同一译名展开。",
    use: "适合进入术语说明或注释，减少论文中的概念漂移。",
  },
  {
    kind: "论文论点",
    title: "提炼可争辩判断",
    focus: "把段落中的叙述改写成一个可争辩、可被证据支持的论文判断。",
    use: "适合进入引言或章节开头，作为论文主张的候选句。",
  },
  {
    kind: "校勘疑点",
    title: "暂缓解释",
    focus: "承认这里可能有文本、版面或译读问题，先把不确定性保存下来。",
    use: "适合进入脚注或待核清单，避免过早把疑点写成结论。",
  },
  {
    kind: "反例补充",
    title: "寻找相反材料",
    focus: "把本段当成一个需要被其他段落或二手文献检验的命题。",
    use: "适合进入文献回顾或论证转折，帮助论文避免单一证据。",
  },
];

function render() {
  renderCards();
  renderPaperList();
}

function drawCards() {
  const seed = `${els.goalInput.value}\n${els.sourceInput.value}\n${els.translationInput.value}`.length;
  const pool = [...CARD_TYPES].sort((a, b) => scoreCard(a, seed) - scoreCard(b, seed));
  state.draw = pool.slice(0, 3).map((card, index) => ({
    ...card,
    id: `${Date.now()}-${index}`,
  }));
  state.selectedCardId = state.draw[0]?.id || "";
  els.commentInput.value = buildCommentDraft(state.draw[0]);
  renderCards();
}

function scoreCard(card, seed) {
  const text = `${card.kind}${card.title}${els.sourceInput.value}${els.translationInput.value}`;
  let score = seed;
  for (let i = 0; i < text.length; i += 1) score = (score * 33 + text.charCodeAt(i)) % 9973;
  return score + Math.random();
}

function renderCards() {
  els.cardGrid.innerHTML = "";
  if (!state.draw.length) {
    const empty = document.createElement("div");
    empty.className = "choice-card";
    empty.innerHTML = "<p>填入原文和译文后，生成三张理解取向卡。</p>";
    els.cardGrid.appendChild(empty);
    return;
  }

  state.draw.forEach((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice-card ${card.id === state.selectedCardId ? "selected" : ""}`;
    button.innerHTML = `
      <span class="card-kind">${escapeHtml(card.kind)}</span>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.focus)}</p>
      <p>${escapeHtml(card.use)}</p>
    `;
    button.addEventListener("click", () => {
      state.selectedCardId = card.id;
      els.commentInput.value = buildCommentDraft(card);
      renderCards();
    });
    els.cardGrid.appendChild(button);
  });
}

function buildCommentDraft(card) {
  if (!card) return "";
  return `我选择“${card.title}”，因为当前译法应服务于“${els.goalInput.value.trim()}”。${card.focus}`;
}

function saveRun() {
  const card = state.draw.find((entry) => entry.id === state.selectedCardId);
  const source = els.sourceInput.value.trim();
  const translation = els.translationInput.value.trim();
  if (!source || !translation || !card) {
    alert("请先填写原文、译文，并选择一张偏好卡。");
    return;
  }

  state.runs.unshift({
    id: crypto.randomUUID(),
    goal: els.goalInput.value.trim(),
    source,
    translation,
    card,
    comment: els.commentInput.value.trim(),
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem("srt.runs", JSON.stringify(state.runs));
  els.commentInput.value = "";
  renderPaperList();
}

function renderPaperList() {
  els.runCount.textContent = String(state.runs.length);
  els.paperList.innerHTML = "";
  if (!state.runs.length) {
    const empty = document.createElement("article");
    empty.className = "paper-item";
    empty.innerHTML = "<p>还没有材料。每次选择都会让论文方向更清楚一点。</p>";
    els.paperList.appendChild(empty);
    return;
  }

  state.runs.forEach((run) => {
    const item = document.createElement("article");
    item.className = "paper-item";
    item.innerHTML = `
      <strong>${escapeHtml(run.card.kind)} · ${escapeHtml(run.card.title)}</strong>
      <p>${escapeHtml(run.card.use)}</p>
      <blockquote>${escapeHtml(run.comment || run.card.focus)}</blockquote>
      <p>${escapeHtml(run.translation.slice(0, 180))}${run.translation.length > 180 ? "..." : ""}</p>
    `;
    els.paperList.appendChild(item);
  });
}

async function copyMarkdown() {
  const markdown = [
    `# ${els.goalInput.value.trim() || "论文材料池"}`,
    "",
    ...state.runs.flatMap((run, index) => [
      `## ${index + 1}. ${run.card.kind}: ${run.card.title}`,
      "",
      `- 学术目的：${run.goal}`,
      `- 论文用途：${run.card.use}`,
      "",
      "> " + (run.comment || run.card.focus),
      "",
      "### 原文",
      "",
      run.source,
      "",
      "### 译文",
      "",
      run.translation,
      "",
    ]),
  ].join("\n");
  await navigator.clipboard.writeText(markdown);
  alert("Markdown 已复制。");
}

function fillSample() {
  els.sourceInput.value =
    "The historian does not merely reproduce the author's argument; by translating its conceptual vocabulary, she decides which distinctions remain alive for a later inquiry.";
  els.translationInput.value =
    "历史学者并不只是复述作者的论证；通过翻译其概念词汇，她也在决定哪些区分仍能在后来的研究中保持生命力。";
  drawCards();
}

function resetRun() {
  if (!confirm("清空当前论文材料池？")) return;
  state.runs = [];
  localStorage.removeItem("srt.runs");
  renderPaperList();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

els.draftButton.addEventListener("click", drawCards);
els.rerollButton.addEventListener("click", drawCards);
els.saveRunButton.addEventListener("click", saveRun);
els.sampleButton.addEventListener("click", fillSample);
els.copyButton.addEventListener("click", copyMarkdown);
els.resetButton.addEventListener("click", resetRun);

render();
