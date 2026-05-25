# 2026-05-25 阅读器使用反馈

本文档记录 2026-05-25 对 `collab/card-repository-ui` 分支的实际使用反馈，并补充一次针对 Claude Agent SDK 架构贯彻情况的代码检查结论。

当前分支：

```text
collab/card-repository-ui
```

当前检查范围：

- 前端：`src/app.js`
- 批量翻译接口：`server/index.js`
- LLM Provider：`server/llm/providers.js`
- Agent Runtime：`server/agents/runtime.js`
- Claude Adapter：`server/agents/claude.js`
- Tool Registry：`server/agents/tools.js`
- OpenAI-compatible Adapter：`server/agents/openai-compatible.js`
- 架构说明：`docs/agent-architecture.md`

## F-2026-05-25-01 无法进行全部原文翻译

- 类型：翻译工作流缺陷
- 优先级：高
- 状态：待修复

### 现象

当前无法稳定完成“全部原文翻译”：

- 单一卡片点击 LLM 后，翻译内容不完整。
- 用户无法一键对所有卡片进行翻译。
- 无法看到全部翻译任务的进度、成功数、失败数、当前处理卡片。

### 代码检查结论

后端已经存在批量翻译接口和进度对象：

```text
POST /api/projects/:projectId/documents/:documentId/batch-translate
GET  /api/projects/:projectId/batch-jobs/:jobId
```

相关实现位于 `server/index.js`：

- `createBatchJob`
- `processBatchTranslationJob`
- `publicBatchJob`
- `selectBatchSegments`

但当前新卡片 UI 中没有看到前端完整接线：

- `src/app.js` 中没有 `runBatchTranslate` 之类的前端 job 启动和轮询实现。
- 目前 composer 中“批量/batch”会被解析为 `agentPrompt`，而不是调用后端 batch API。
- 卡片级 LLM 按钮只调用 `translateSegmentWithLlm(segment)`，即单段翻译。

### 处理建议

前端需要补齐批量翻译闭环：

1. 在底部 composer 或菜单中明确提供“翻译全部卡片 / 翻译当前页 / 翻译页码范围”入口。
2. 调用后端 `batch-translate` API，而不是把“批量翻译”交给普通 Agent prompt。
3. 新增前端轮询 `batch-jobs/:jobId`。
4. 在 UI 显示：
   - 总卡片数
   - 已翻译数
   - 跳过数
   - 失败数
   - 当前卡片编号
   - 可展开错误列表
5. 每段保存后立即刷新对应卡片，而不是等整批任务结束。
6. 对单卡片 LLM 翻译增加完整性检测：如果译文明显短于原文、返回为空或被截断，应提示重试。

### 验收标准

- 用户可以一键翻译当前文档全部卡片。
- 用户可以选择仅翻译未译卡片。
- UI 显示批量任务进度。
- 每张卡片翻译完成后能看到译文写回。
- 失败卡片有错误记录和重试入口。

## F-2026-05-25-02 右侧卡片的直译草稿不完整

- 类型：翻译质量 / UI 误导
- 优先级：高
- 状态：待修复

### 现象

右侧卡片中的“直译草稿”只包含原文的一两句，无法覆盖完整原文内容。

### 代码检查结论

当前 `src/app.js` 中的 `generateDraftTranslations` 会调用本地 `createDraft(source)` 生成占位草稿。

该草稿不是 LLM 翻译，只是把原文包上一层“直译草稿 / 论文风格草稿 / 专著风格草稿”的占位文本。

因此问题有两层：

1. 如果原文卡片本身被切分不完整，右侧草稿自然只覆盖被切出来的一两句。
2. 即使原文完整，`createDraft` 也不是真实翻译，不应被用户理解为完整机器译文。

### 处理建议

1. UI 上区分“占位草稿”和“LLM 译文”。
2. 自动占位草稿不应默认显示为最终直译结果。
3. 对 `createDraft` 生成的内容增加状态标识，例如：
   - `placeholder-draft`
   - `machine-draft`
   - `edited`
4. 如果用户点击“直译草稿”，应调用 LLM 完整翻译当前卡片。
5. 如果卡片原文很长，需要支持分块翻译和合并，避免模型输出被截断。
6. 增加翻译完整性检查：
   - 原文字符数 / 译文字符数比例异常时提示。
   - 原文有多段但译文只有一段极短文本时提示。
   - LLM 返回可能截断时允许“继续翻译并合并”。

### 验收标准

- 用户能明确区分占位草稿和真实 LLM 译文。
- 单卡片翻译覆盖当前卡片全部原文。
- 长卡片翻译不会静默截断。
- 译文不完整时有可见 warning 和重试/继续入口。

## F-2026-05-25-03 OCR 识别内容不准确

- 类型：OCR 准确性 / 文档摄取
- 优先级：高
- 状态：待修复

### 现象

OCR 识别内容仍不准确，影响后续翻译、术语抽取、批注和导出。

### 已知背景

当前 OCR 主要由 `server/ocr.js` 中的 `tesseract.js` Provider 提供。该方案部署简单，但对复杂 PDF、扫描件、脚注、多栏、特殊字符、历史字体和多语言文本的准确性有限。

### 处理建议

不要直接删除现有 `tesseract-js`。应升级为多 Provider OCR 架构：

1. 保留 `tesseract-js` 作为零安装 fallback。
2. 增加 `tesseract-cli` Provider，用于本地系统级 Tesseract。
3. 增加 `paddleocr` Provider，优先处理复杂扫描件和中英文混排。
4. 可选接入 `ocrmypdf`，用于扫描 PDF 预处理和文本层生成。
5. 为每页/每段保存 OCR 元信息：
   - provider
   - language
   - confidence
   - raw text
   - normalized text
   - warnings
   - char issues
6. 特殊字符处理必须可回溯：
   - 原始 OCR 文本不能丢。
   - normalization 使用 NFC，不默认 NFKC。
   - 希腊字母、重音拉丁字母、数学符号、上标下标应保留。
   - 连字替换应记录 warning，而不是静默不可逆替换。

### 验收标准

- UI 显示当前 OCR Provider、语言和置信度。
- 用户可以对单页/单卡片重新 OCR。
- OCR 低置信度或特殊字符异常时显示 warning。
- 用户可以查看 raw OCR 与 normalized text 的差异。
- 翻译前可选择使用 OCR 文本、校勘文本或原 PDF 文本层。

## F-2026-05-25-04 检查 Claude Agent SDK 架构贯彻情况

- 类型：架构检查
- 优先级：中高
- 状态：部分贯彻，需澄清

### 检查结论

当前项目已经贯彻了“Claude tool-use / Agent SDK 风格”的核心架构，但没有直接依赖或调用官方 Claude Agent SDK 包。

换句话说：

- 已有 Agent runtime loop。
- 已有 Claude Messages API adapter。
- 已有工具注册表 Tool Registry。
- 已有 Skill Registry。
- 已有多步 tool-use / tool-result 循环。
- 已有 Agent trace 持久化。
- 已有 OpenAI-compatible tool calling adapter，支持 DeepSeek 等 Provider。
- 但 `package.json` / `package-lock.json` 中未发现 Claude Agent SDK 依赖。

### 已贯彻的部分

相关文件：

```text
server/agents/runtime.js
server/agents/claude.js
server/agents/tools.js
server/agents/skills.js
server/agents/openai-compatible.js
docs/agent-architecture.md
```

当前 runtime 流程：

1. 读取 project/document/segment context。
2. 选择 skill system prompt。
3. 通过 Tool Registry 暴露本地项目工具。
4. 调用 Claude Messages API 或 OpenAI-compatible tool calling API。
5. 解析 `tool_use` / `tool_calls`。
6. 本地执行工具。
7. 将 `tool_result` 写回 messages。
8. 循环直到 final text 或达到 `maxSteps`。
9. 保存 Agent trace。

这符合 Claude Agent SDK 风格的主要设计。

### 未完全贯彻或需要补强的部分

1. 没有直接使用官方 Claude Agent SDK 包。
2. 工具权限模型还比较弱，当前工具只按 projectId 限定，缺少更细粒度权限。
3. Agent trace 还没有足够好的前端可视化和回放。
4. Agent 运行与普通 LLM 翻译是两套路径，批量翻译没有进入 Agent job 编排。
5. 工具 schema 没有版本管理。
6. 失败恢复、暂停、重试、人工确认节点还不完整。

### 建议

需要先明确项目目标：

- 如果目标是“Claude Agent SDK 风格架构”，当前方向基本成立，但需要补权限、trace UI、任务编排和工具版本。
- 如果目标是“直接采用官方 Claude Agent SDK”，则需要新增官方 SDK 依赖并重构 `server/agents/runtime.js`，把自研 loop 迁移到 SDK 原生抽象。

短期建议保持当前自研 runtime，但在文档中明确命名为：

```text
Claude tool-use style agent runtime
```

不要称为“已完整接入官方 Claude Agent SDK”，避免架构表述不准确。

## 建议排期

### Sprint D1：翻译闭环修复

1. 前端接入后端 batch translation job。
2. 增加全部卡片翻译入口和进度显示。
3. 增加单卡片翻译完整性检测。
4. 区分占位草稿和真实 LLM 译文。

### Sprint D2：OCR 质量与可回溯

1. OCR Provider 抽象。
2. raw / normalized OCR 分离。
3. OCR confidence 和 warnings UI。
4. 支持单页/单卡片重新 OCR。

### Sprint D3：Agent 架构补强

1. 更新架构文档，区分“Claude tool-use style”与“官方 Claude Agent SDK”。
2. 增强工具权限、trace 展示和失败恢复。
3. 评估是否需要直接引入官方 Claude Agent SDK。

