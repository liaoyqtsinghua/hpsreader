# Handoff for ganking: Collaboration, OCR, Export, and Suitability Review

Date: 2026-05-19  
Branch: `collab/card-repository-ui`  
Related feedback: `docs/feedback-2026-05-19-collaboration-ocr-export.md`

## 0. Current State

The project is a local-first HPS Reader prototype focused on scholarly PDF/document reading, translation, terminology management, notes, comments, OCR, and Agent-assisted workflows.

Local verification performed on 2026-05-19:

```powershell
npm test
```

Result: 12 tests passed.

Important current implementation points:

- Server entry: `server/index.js`
- JSON storage layer: `server/storage.js`
- OCR provider: `server/ocr.js`
- Export service: `server/exporter.js`
- Frontend app: `src/app.js`
- Card/module routing: `src/moduleRoutes.js`
- Page model helpers: `src/pageModel.js`
- Background reading task state: `src/backgroundTasks.js`
- Tests: `test/*.test.js`

Do not treat current `data/db.json` and `data/server.log` changes as source changes. They are local runtime artifacts.

## 1. Task: Process the New Feedback

The user asked for three feedback areas to be handled:

1. Group collaboration.
2. OCR accuracy and special character handling.
3. Export optimization, with Word/DOCX as a hard requirement.

The feedback has already been summarized in:

```text
docs/feedback-2026-05-19-collaboration-ocr-export.md
```

Recommended implementation order:

1. Implement DOCX export first.
2. Add OCR provider abstraction and special-character preservation.
3. Add collaboration data model and non-real-time collaboration workflows.

This order is deliberate: DOCX is the clearest production blocker; OCR needs data-model changes before provider swapping; collaboration should start with authorship/history/tasks before real-time sync.

## 2. DOCX Export: Highest Priority

### Problem

Current export implementation supports JSON, Markdown/TXT-style text, CSV, and TSV. Word export is not implemented, but user states Word format is mandatory.

Current code:

```text
server/exporter.js
```

Current export API:

```text
POST /api/projects/:projectId/export
```

### Required Behavior

Add `docx` support for:

- Translation only.
- Source + translation parallel layout.
- Translation + comments.
- Source + translation + comments.
- Glossary.
- Reading/project report.

DOCX must open correctly in Microsoft Word.

### Recommended Technical Approach

Use the `docx` npm package first. Do not use string-concatenated HTML renamed as `.docx`; it will be fragile.

Suggested structure:

```text
server/exporters/docx.js
server/exporters/text.js
server/exporters/table.js
server/exporter.js
```

Keep `buildExport(project, options)` as the public facade, but delegate by format.

Minimum implementation:

- Add dependency: `docx`.
- Add `format === "docx"` branch.
- Return a `Buffer` body instead of a string.
- Set MIME type:
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Ensure Express sends binary data without corrupting it.
- Add one automated test that calls the export builder and checks for a non-empty DOCX buffer containing a valid zip signature.

### Suggested Acceptance Test

- Export current document as `docx`.
- Open file in Microsoft Word.
- Confirm source, translation, comments, page/segment identifiers, and glossary are readable.
- Confirm Chinese text is not garbled.

## 3. OCR Accuracy and Special Characters

### Problem

Current OCR implementation uses only `tesseract.js`.

Current code:

```text
server/ocr.js
```

Current provider list:

```js
[
  {
    id: "tesseract-js",
    label: "Tesseract.js 开源 OCR",
    kind: "local-js",
    configured: true
  }
]
```

This is acceptable for a lightweight local prototype, but it is not enough for high-accuracy academic OCR, especially for:

- Scanned PDFs.
- Historical fonts.
- Footnotes.
- Multi-column layouts.
- Greek.
- Accented Latin characters.
- Mathematical or astronomical symbols.
- Ligatures.

### Important Constraint

Do not simply replace all OCR text with normalized text. Academic text needs raw OCR preservation.

### Required Data Model Direction

Add or prepare fields like:

```text
segment.rawSource
segment.normalizedSource
segment.ocrWarnings[]
segment.ocrConfidence
segment.charIssues[]
page.ocrProvider
page.ocrLanguage
page.ocrConfidence
page.imagePath
page.width
page.height
```

Current implementation already stores some page and confidence fields, but not enough for full auditability.

### Provider Strategy

Do not remove `tesseract-js`. Keep it as fallback and add provider abstraction.

Recommended provider tiers:

- `tesseract-js`: zero extra install, lowest deployment friction.
- `tesseract-cli`: better operational control and mature language data support.
- `paddleocr`: likely better for many scanned documents and layout-heavy pages.
- Optional later: `ocrmypdf`, `kraken`, or `calamari` for specialized workflows.

### Special Character Handling

Rules:

- Preserve raw OCR output.
- Normalize a separate field using NFC by default.
- Avoid default NFKC because it may fold meaningful characters.
- Preserve Greek, accented Latin, mathematical symbols, superscripts/subscripts when possible.
- Treat ligature expansion as a warning or reversible transform.
- Generate warnings for replacement characters, control characters, boxes, excessive spacing, suspicious mixed scripts, and low confidence.

Current `normalizeOcrText` already does NFC, whitespace cleanup, and ligature replacement. This needs to become more auditable: keep raw, normalized, and warning metadata.

### Suggested PR Split

1. Add OCR provider interface and provider registry.
2. Extend storage normalization for raw/normalized OCR fields.
3. Add warning generation for suspicious special characters.
4. Add Tesseract CLI or PaddleOCR provider behind configuration.
5. Add UI status display for provider, language, confidence, and warnings.

## 4. Group Collaboration

### Problem

Current app is still local-first and single-user in its persistence model. It has comments/events/segments, but not a real collaborator model.

Current storage:

```text
server/storage.js
```

Current comment structure includes target, selected text, body, draft, timestamps, but no author identity.

### Recommended Scope

Do not start with real-time multi-user editing. Start with collaboration-ready project data:

```text
project.members[]
project.tasks[]
segment.revisions[]
comment.authorId
event.actorId
glossaryTerm.updatedBy
```

Roles:

- Owner
- Editor
- Reviewer
- Reader

First useful workflows:

- Assign page/segment review tasks.
- Filter comments by member.
- Show who edited a translation.
- Show who confirmed or changed a term.
- Prevent silent overwrite by storing segment revisions.

### Suggested PR Split

1. Add data model fields and normalization in `server/storage.js`.
2. Add lightweight member/task CRUD endpoints in `server/index.js`.
3. Add author fields to comments/events/translation updates.
4. Add frontend filters: my tasks, member comments, unresolved review items.
5. Later evaluate WebSocket/CRDT only if real-time collaboration is required.

## 5. Suitability Review

### Summary Judgment

The project is suitable as a local-first scholarly reading and translation prototype. It is also suitable for testing the new card-repository/composer interaction model. It is not yet suitable as a production multi-user collaboration system or as a high-accuracy OCR production pipeline.

### Suitable For

- Local document ingestion and reading experiments.
- Project-based scholarly translation workflows.
- Testing LLM provider integration.
- Testing Agent-assisted reading, translation, terminology, comments, and notes.
- Lightweight OCR for images and page screenshots.
- Early UI/UX validation of cards, modules, drawers, and composer commands.

### Not Yet Suitable For

- Team collaboration with permissions, audit logs, and conflict resolution.
- Production OCR for complex historical/scientific PDFs.
- Guaranteed Word/PDF deliverables.
- Large project persistence with concurrent writes.
- Secure hosted deployment without authentication and authorization.

### Technical Strengths

- Clear small Express backend.
- Local-first setup is easy to run.
- Tests exist for the newer card/module/page helper logic.
- Provider-oriented LLM architecture is already present.
- OCR code is isolated enough to be expanded.
- Export code is centralized and can be refactored into format-specific exporters.

### Technical Risks

- Persistence is JSON-file based. It is acceptable for local prototype usage, but not enough for concurrent collaboration.
- Batch jobs are in-memory and will be lost on process restart.
- OCR depends primarily on Tesseract.js and browser-rendered PDF page images.
- Exporter currently mixes content selection and format generation in one file.
- Frontend is concentrated in `src/app.js`, making larger collaboration features harder to maintain unless split.
- No authentication or authorization model exists yet.

### Recommendation

Keep this branch as the UX/prototype branch for the card repository and composer direction. For the next engineering step, implement DOCX export and OCR provider abstraction before building true multi-user collaboration.

Suggested next milestone:

```text
Milestone: Production Output and OCR Auditability

1. DOCX export with comments and glossary.
2. OCR raw/normalized text split.
3. OCR warnings and confidence surfaced in UI.
4. Collaboration-ready authorship fields.
```

Only after that milestone should the project move toward hosted group collaboration.

## 6. Verification Commands for ganking

Run:

```powershell
npm install
npm test
npm run dev
```

Then open:

```text
http://localhost:4173/
```

Current known local runtime artifacts:

```text
data/db.json
data/server.log
```

Do not commit those unless intentionally updating sample/demo data.
