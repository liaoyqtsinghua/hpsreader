# Backend Architecture

## Positioning

The backend should support a focused scholarly translation game loop:

```text
Intent -> Document segmentation -> AI translation encounter -> editable 3-choice cards -> comment -> deck growth -> paper build
```

The core backend should be a normal application server with durable data models and structured AI generation. Do not make an Agent SDK the whole backend. Agent frameworks are useful later for specialist background tasks, but the product loop itself should stay deterministic and inspectable.

## Recommended Stack

### MVP

```text
Node.js + TypeScript
Fastify or Hono
SQLite
Drizzle ORM or Prisma
Direct AI provider calls with JSON schema validation
Local file storage
```

Why:

- Small surface area.
- Easy to ship locally.
- Good fit for a prototype where the main interaction is select/edit/comment.
- AI outputs are structured and can be validated before saving.

### Production Path

```text
Node.js + TypeScript
Fastify / NestJS
Postgres
pgvector for semantic search
Redis + BullMQ for async jobs
Object storage for uploaded documents
OpenTelemetry for tracing
```

Use Postgres once documents, decks, and paper builds need collaboration, search, audit history, and long-running jobs.

## Agent SDK Decision

### Do Not Use Claude Agent SDK As The Core Backend

Claude Agent SDK is best for tool-using agents that inspect files, call tools, run multi-step loops, or operate with MCP-like capabilities. This product does not need a free-roaming agent for every user step. The scholar's workflow is intentionally constrained:

- AI generates draft translation.
- AI generates exactly 3 cards.
- User edits/selects 1 card.
- AI evaluates deck and drafts paper structure.

This should be modeled as explicit backend services and jobs.

### Where Claude Agent SDK Can Help Later

Use Claude Agent SDK as an optional specialist layer:

- `ResearchCorpusAgent`: search local corpus and notes.
- `DeckCriticAgent`: identify missing counterexamples or weak evidence.
- `PaperReviewerAgent`: review a generated draft.
- `CitationAgent`: suggest bibliography and citation checks.

These agents should write back structured results, not silently mutate core records.

## AI Provider Layer

Create an `AIService` abstraction instead of tying business logic to one provider.

```ts
interface AIService {
  translateEncounter(input: TranslateEncounterInput): Promise<TranslateEncounterOutput>;
  generateCardChoices(input: CardChoiceInput): Promise<CardChoiceOutput>;
  evaluateDeck(input: DeckEvaluationInput): Promise<DeckEvaluationOutput>;
  buildPaperOutline(input: PaperBuildInput): Promise<PaperOutlineOutput>;
  draftPaperSection(input: SectionDraftInput): Promise<SectionDraftOutput>;
}
```

Provider implementations:

- `AnthropicProvider`
- `OpenAIProvider`
- `OpenAICompatibleProvider`
- optional `LocalProvider`

All model outputs must be parsed through schemas. Recommended validation library: `zod`.

## Core Data Model

### Project

```ts
type Project = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};
```

### Document

```ts
type Document = {
  id: string;
  projectId: string;
  title: string;
  fileName?: string;
  sourceText: string;
  segmentCount: number;
  createdAt: string;
  updatedAt: string;
};
```

### Run

```ts
type Run = {
  id: string;
  projectId: string;
  documentId: string;
  objective: string;
  currentEncounterIndex: number;
  totalEncounters: number;
  status: "draft" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
};
```

### Encounter

```ts
type Encounter = {
  id: string;
  runId: string;
  documentId: string;
  segmentIndex: number;
  source: string;
  translationDraft: string;
  selectedCardId?: string;
  status: "pending" | "generated" | "selected" | "completed";
  createdAt: string;
  updatedAt: string;
};
```

### Card Choice

3-choice cards are editable. The saved deck card must preserve both the original AI version and the user's edited version.

```ts
type Card = {
  id: string;
  runId: string;
  encounterId: string;
  type: "concept" | "argument" | "evidence" | "critique" | "terminology" | "philology" | "counterexample";
  rarity: "common" | "rare" | "epic" | "thesis";
  title: string;
  focus: string;
  paperUse: string;
  growthHint: string;
  growthStage: "fragment" | "evidence" | "argument" | "thesis";
  selected: boolean;
  edited: boolean;
  originalAiCard: {
    type: string;
    rarity: string;
    title: string;
    focus: string;
    paperUse: string;
    growthHint: string;
  };
  userComment?: string;
  createdAt: string;
  updatedAt: string;
};
```

### Paper Build

```ts
type PaperBuild = {
  id: string;
  runId: string;
  title: string;
  outline: PaperSection[];
  diagnostics: PaperDiagnostic[];
  draftMarkdown?: string;
  createdAt: string;
  updatedAt: string;
};

type PaperSection = {
  id: string;
  title: string;
  purpose: string;
  cardIds: string[];
  supportScore: number;
  draft?: string;
};
```

## API Draft

### Projects

```text
POST /api/projects
GET  /api/projects
GET  /api/projects/:projectId
```

### Documents

```text
POST /api/projects/:projectId/documents
GET  /api/projects/:projectId/documents/:documentId
POST /api/projects/:projectId/documents/:documentId/segment
```

### Runs

```text
POST /api/projects/:projectId/runs
GET  /api/runs/:runId
POST /api/runs/:runId/start
```

### Encounters

```text
GET  /api/runs/:runId/encounters/current
POST /api/encounters/:encounterId/generate
POST /api/encounters/:encounterId/reroll-cards
PATCH /api/encounters/:encounterId/cards/:cardId
POST /api/encounters/:encounterId/select-card
POST /api/encounters/:encounterId/complete
```

Important: card editing uses `PATCH /cards/:cardId` before selection or after selection.

### Deck

```text
GET  /api/runs/:runId/deck
PATCH /api/cards/:cardId
POST /api/runs/:runId/deck/evaluate
POST /api/runs/:runId/deck/upgrade
```

### Paper

```text
POST /api/runs/:runId/paper-builds
GET  /api/paper-builds/:paperBuildId
PATCH /api/paper-builds/:paperBuildId/sections/:sectionId
POST /api/paper-builds/:paperBuildId/generate-draft
POST /api/paper-builds/:paperBuildId/check-gaps
```

## AI Generation Contracts

### Translation Encounter Output

```ts
type TranslateEncounterOutput = {
  translationDraft: string;
  notes: string[];
  uncertainTerms: string[];
};
```

### Card Choice Output

Must always return exactly 3 cards.

```ts
type CardChoiceOutput = {
  cards: [
    GeneratedCard,
    GeneratedCard,
    GeneratedCard
  ];
};

type GeneratedCard = {
  type: Card["type"];
  rarity: Card["rarity"];
  title: string;
  focus: string;
  paperUse: string;
  growthHint: string;
};
```

Validation rules:

- exactly 3 cards
- titles must be distinct
- types should preferably differ
- `focus` must be concrete to the current passage
- `paperUse` must identify where the card can enter a paper

## Background Jobs

MVP can run synchronously for one encounter at a time.

Use jobs when:

- importing long documents
- translating many encounters ahead
- evaluating the whole deck
- building a paper draft

Recommended job queue:

```text
BullMQ + Redis
```

For a serious durable workflow later:

```text
Temporal
```

## Storage Strategy

### MVP SQLite Tables

```text
projects
documents
runs
encounters
cards
paper_builds
paper_sections
ai_events
```

### Audit Events

Track important user and AI actions:

```ts
type AiEvent = {
  id: string;
  runId: string;
  encounterId?: string;
  cardId?: string;
  type: "translate" | "generate_cards" | "reroll" | "edit_card" | "select_card" | "deck_eval" | "paper_draft";
  summary: string;
  model?: string;
  promptVersion?: string;
  createdAt: string;
};
```

## Prompt Versioning

Every AI task should carry a prompt version:

```text
translateEncounter.v1
generateCardChoices.v1
evaluateDeck.v1
buildPaperOutline.v1
draftPaperSection.v1
```

Store prompt version on `ai_events` so later card quality can be audited.

## Security And Privacy

- Store API keys server-side only.
- Never expose provider keys to the frontend.
- Keep uploaded documents private by default.
- Add per-project export later.
- For cloud deployment, add authentication before allowing uploads.

## Development Order

1. Build backend skeleton with TypeScript, Fastify/Hono, SQLite, zod.
2. Implement document paste/import and segmentation.
3. Implement run creation and encounter retrieval.
4. Implement mock AI service.
5. Implement editable 3-choice card API.
6. Implement deck API and diagnostics.
7. Implement paper build API.
8. Replace mock AI with provider abstraction.
9. Add async jobs for long runs.
10. Add optional Agent SDK specialists.

## Summary Recommendation

Use a conventional TypeScript backend first. Keep the main loop deterministic and schema-driven.

```text
App backend owns workflow.
AI service owns structured generation.
Agent SDKs are optional specialists.
```

