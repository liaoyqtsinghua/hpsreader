# Scholar Rogue Translator Development Spec

## Product Thesis

Scholar Rogue Translator is an AI-assisted scholarly translation game. A scholar states a research intention, AI handles the repetitive generation work, and the scholar advances the run by choosing one of three editable interpretation cards and adding optional comments.

The app should feel like a clean IDE with a card-game loop:

```text
Research intent -> Translation encounter -> Pick/edit 1 of 3 cards -> Comment -> Deck growth -> Paper build
```

## Design Principles

- One screen, one visual center.
- AI generates drafts, cards, growth advice, and paper structure automatically.
- The scholar mainly chooses, edits, comments, and accepts/rejects.
- Game elements must support scholarly judgment, not decorate the UI.
- IDE conventions keep the interface quiet: clear panels, compact controls, status rails, keyboard-friendly actions.
- Card game conventions create momentum: encounter, deck, rarity, reroll, growth, build.

## Source Concept

Concept image: `395e45a5-4bc5-42a4-8c77-ad3ba3a262d8.png`

It defines four core views:

1. Academic intent / start.
2. Translation run.
3. Deck / build.
4. Paper build.

## View 1: Academic Intent / Start

### Visual Center

A large centered research-intent input, similar to a search homepage.

### Goal

The scholar states what they want to understand through translation today.

### Primary Action

`Start research run`

### Secondary Action

`Import document`

Import is important, but visually secondary. The first cognitive act is intent-setting.

### Required UI

- Centered app mark.
- Main prompt: `今天你想通过翻译理解什么？`
- Large intent input.
- Example chips:
  - `追踪一个概念的历史变化`
  - `翻译并批评作者的方法`
  - `为论文寻找核心论点`
- Primary start button.
- Small import button in a corner or below the input.
- Minimal footer/help entry.

### Generated State

When the user starts a run, AI creates a `runObjective` card:

```js
{
  id: "objective-...",
  text: "围绕海德格尔的世界概念形成一篇概念史论文",
  tags: ["概念史", "文本细读"],
  createdAt: "..."
}
```

## View 2: Translation Run

### Visual Center

Current encounter: source, AI draft translation, and three editable cards.

This is the longest-stay view.

### Goal

The scholar reads the current passage, reviews the AI draft, chooses or edits one interpretation card, optionally comments, then advances.

### Required Layout

- Thin left rail:
  - current run icon
  - progress
  - catalog
  - history
  - settings
- Top progress:
  - `Encounter 12 / 84`
  - progress bar
- Main encounter panel:
  - source text
  - AI draft translation
- Card choice area:
  - exactly three cards visible
  - reroll button is small and secondary
- Right focus panel:
  - no card selected: placeholder
  - card selected: editable card details + comment
- Primary button:
  - disabled until a card is selected
  - label: `下一段`

### 3-Choice Card Behavior

AI generates three cards per encounter. The user can:

- Select one card.
- Edit card title.
- Edit card body/focus.
- Edit paper usage.
- Edit rarity/type if needed.
- Add optional comment.
- Reroll all three cards.
- Save selected edited card into the deck.

Editing is not a side feature. It is part of scholarly judgment. The chosen card should be saved in its edited form, while unchosen cards can be discarded or retained as run history if needed.

### Card UI Fields

Each card should show compact comparable fields:

- Type: concept, argument, evidence, critique, terminology, philology, counterexample.
- Rarity: common, rare, epic, thesis.
- Title.
- One-line focus.
- Paper use.
- Growth hint.

### Editable Card Data

```js
{
  id: "card-...",
  runId: "run-...",
  encounterId: "encounter-...",
  sourceRange: {
    documentId: "doc-...",
    segmentIndex: 12,
    page: 32
  },
  type: "argument",
  rarity: "rare",
  title: "论证动机",
  focus: "揭示作者推出该观点的动机",
  paperUse: "支持作者立场与论证结构分析",
  growthHint: "可与相邻段落合并为 Argument 卡",
  edited: true,
  originalAiCard: {
    title: "论证动机",
    focus: "揭示作者推出该观点的动机"
  },
  userComment: "这里的动机不只是解释，而是在转移存在论问题的重心。",
  selectedAt: "..."
}
```

### AI Responsibilities

AI should automatically:

- Segment the document.
- Generate the draft translation.
- Generate three mutually different cards.
- Suggest a default comment after a card is selected.
- Summarize how the selected card affects the deck.

Scholar responsibilities:

- Pick one.
- Edit if needed.
- Comment if needed.
- Continue.

## View 3: Deck / Build

### Visual Center

The collected card deck.

### Goal

The scholar organizes cards, checks deck health, and upgrades cards into stronger research arguments.

### Required Layout

- Top metrics:
  - core thesis strength
  - evidence density
  - counterexample gap
  - terminology stability
- Left filter rail:
  - type
  - rarity
  - chapter
  - paper use
- Center:
  - card grid
- Right:
  - selected card detail
  - growth path
  - AI suggestions

### Card Growth

Cards grow through accumulation and editing:

```text
Fragment -> Evidence -> Argument -> Thesis
```

Growth conditions:

- Fragment: one selected card.
- Evidence: card has source, translation, and comment.
- Argument: multiple related evidence cards support the same claim.
- Thesis: argument card is strong enough to anchor a paper section.

### Deck Diagnostics

AI evaluates:

- Does the deck support the original research intent?
- Are there repeated cards that should merge?
- Are there missing counterexamples?
- Are terminology cards consistent?
- Which cards should be upgraded?
- Which cards should be moved into paper slots?

Diagnostics should look like IDE diagnostics, not mobile game stats.

## View 4: Paper Build

### Visual Center

Paper outline with card slots.

### Goal

Transform the deck into an academic paper structure.

### Required Layout

- Center outline:
  - Introduction
  - Literature review
  - Close reading
  - Method discussion
  - Conclusion
- Each section contains card slots.
- Right rail:
  - recommended cards
  - recent cards
  - missing support
- Bottom:
  - AI draft preview
  - build diagnostics

### Primary Actions

- `Generate paper draft`
- `Check argument gaps`
- `Rebuild outline`

### Build Diagnostics

AI should report:

- weak section support
- missing counterexample
- unused strong cards
- comments not absorbed
- terminology instability

### Paper Slot Data

```js
{
  id: "slot-...",
  sectionId: "close-reading",
  cardIds: ["card-1", "card-7"],
  supportScore: 0.8,
  aiDraft: "..."
}
```

## Core Data Model

```js
{
  project: {
    id: "project-...",
    title: "Heidegger translation run",
    documents: [],
    runs: []
  },
  run: {
    id: "run-...",
    objective: "...",
    currentEncounterIndex: 12,
    totalEncounters: 84,
    deck: [],
    paper: {}
  },
  encounter: {
    id: "encounter-...",
    documentId: "doc-...",
    segmentIndex: 12,
    source: "...",
    translationDraft: "...",
    cardChoices: [],
    selectedCardId: "",
    status: "pending | selected | completed"
  },
  card: {
    id: "card-...",
    type: "concept | argument | evidence | critique | terminology | philology | counterexample",
    rarity: "common | rare | epic | thesis",
    title: "...",
    focus: "...",
    paperUse: "...",
    growthStage: "fragment | evidence | argument | thesis",
    userComment: "...",
    sourceExcerpt: "...",
    translationExcerpt: "...",
    edited: false
  }
}
```

## Implementation Milestones

### Milestone 1: Static UI Routing

- Add four views:
  - `intent`
  - `run`
  - `deck`
  - `paper`
- Build navigation without backend.
- Keep state in localStorage.

### Milestone 2: Encounter Loop

- Import/paste document text.
- Split into encounters.
- Generate mock translation draft.
- Generate three mock cards.
- Allow selecting, editing, commenting, rerolling.
- Save edited selected card into deck.

### Milestone 3: Deck View

- Show collected cards.
- Filter by type/rarity.
- Show selected card detail.
- Implement growth stage editing.
- Add mock AI diagnostics.

### Milestone 4: Paper Build View

- Create outline slots.
- Drag or add cards into sections.
- Generate mock paper draft from cards.
- Show build diagnostics.

### Milestone 5: AI Integration

- Replace mock translation with model output.
- Replace mock card generation with model output.
- Add card-growth evaluation prompt.
- Add paper-outline and draft-generation prompt.

## Non-Goals For Current Prototype

- No multi-user collaboration.
- No complex OCR pipeline.
- No full provider settings UI.
- No full document editor.
- No production citation manager.

The first goal is to prove the loop: intent -> encounter -> editable 3-choice card -> deck -> paper.
