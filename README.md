# Scholar Rogue Translator

A small local prototype for a simplified scholarly translation flow:

```text
Research goal -> Translate a passage -> Pick 1 of 3 interpretation cards -> Add comments -> Draft paper material
```

This project intentionally avoids the older HPS Reader complexity. It is a single-page local app with no backend and no build step.

## Use

Open `index.html` in a browser.

## Core Idea

Scholars translate with a purpose. Translation is not only rendering text into another language; it is the process of understanding, revising, and sometimes pushing against the author's view. Each translated passage generates a small roguelite-style choice: three research preference cards. The chosen cards and comments become the seed material for an academic paper.

## Development Spec

See [docs/development-spec.md](docs/development-spec.md) for the four-view product structure, card editing behavior, data model, and implementation milestones.

See [docs/backend-architecture.md](docs/backend-architecture.md) for the recommended backend stack, API draft, data model, AI provider layer, and Agent SDK decision.
