# Provider 接口草案

V2 会把 OCR、翻译、向量化和图谱生成都做成 Provider。当前静态原型先保留接口边界，后续迁移到 Tauri/SQLite 时可以逐步替换实现。

## OcrProvider

```ts
interface OcrProvider {
  id: string;
  label: string;
  recognize(input: OcrInput): Promise<OcrResult>;
}

interface OcrInput {
  documentId: string;
  filePath: string;
  mimeType: string;
  languageHint?: string;
  layoutHint?: "single-column" | "double-column" | "manuscript" | "classic-text";
}

interface OcrResult {
  pages: OcrPage[];
  language: string;
  layout: string;
  confidence: number;
}
```

## TranslationProvider

```ts
interface TranslationProvider {
  id: string;
  label: string;
  translate(input: TranslationInput): Promise<TranslationResult>;
}

interface TranslationInput {
  segmentId: string;
  source: string;
  glossary: GlossaryTerm[];
  style: "literal" | "paper" | "monograph";
}
```

## AgentEvent

所有 Provider 结果都应先写入 `agent_events`，再由用户确认是否进入正式译文、术语库或知识图谱。
