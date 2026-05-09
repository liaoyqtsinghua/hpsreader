# V2 研习工坊架构草案

## 产品闭环

```text
导入文献 -> OCR/解析 -> 分段阅读 -> 翻译 -> 术语抽取 -> 人工修订 -> 一致性校对 -> 注记沉淀 -> 知识图谱/研究输出
```

## 模块边界

```text
app/
  archive       文档与项目管理
  codex         原文/译文对照阅读
  marginalia    注记、Agent 发现、术语提示
  workbench     OCR、翻译、润色、校对等工具入口
  ingestion     文件解析、OCR、版式识别
  translation   初译、校对、润色链
  glossary      术语库与一致性监视
  skills        Skill 注册与 Meta-Agent 调度
  agents        Claude tool-use Runtime、工具注册、Trace
  graph         实体关系抽取与知识图谱
  storage       SQLite、本地文件、导入导出
```

## 当前原型映射

当前静态原型把模块暂时集中在 `src/app.js` 中：

- `segmentText`：摄取层的文本分段雏形。
- `createPendingOcrDocument`：PDF/图片摄取占位，先进入待 OCR 状态。
- `generateDraftTranslations`：翻译链占位入口。
- `extractTermCandidates`：术语抽取雏形。
- `scanConsistency`：Terminology Sentinel 初版。
- `recordAgentEvent`：认知足迹与 Agent 事件流雏形。
- `server/agents/runtime.js`：Claude Agent SDK 风格工具循环。
- `server/agents/tools.js`：项目、文档、术语、段落编辑工具注册表。
- `state` + `localStorage`：本地存储占位。

## 数据模型初版

```text
documents
  id
  title
  fileName
  sourceText
  language
  layout
  createdAt
  updatedAt

segments
  id
  documentId
  index
  source
  translation
  note
  status

glossary_terms
  id
  source
  target
  confirmed
  createdAt

agent_events
  id
  documentId
  segmentId
  type
  payload
  createdAt
```

## 下一步工程化拆分

1. 将 `src/app.js` 拆成 `storage.js`、`documents.js`、`glossary.js`、`agents.js`、`render.js`。
2. 建立 Provider 接口：
   - `OcrProvider`
   - `TranslationProvider`
   - `EmbeddingProvider`
   - `GraphProvider`
3. 引入 Tauri 后，将文件系统、SQLite 和模型调用移动到后端命令层。
4. 保留 V1 bridge，用于后续连接 3D 几何建模工具。
