# Codex-Style Composer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move HPS Reader's primary interaction to a Codex-style bottom composer with a `+` module activator and contextual drawers near the composer.

**Architecture:** Keep the current single-page vanilla JS app and existing backend APIs. Reuse existing DOM IDs and functions where possible, adding a composer layer that triggers current translation, terminology, OCR, note, and Agent flows.

**Tech Stack:** Vanilla HTML, CSS, and JavaScript served by the existing Express app.

---

### Task 1: Composer Markup

**Files:**
- Modify: `index.html`

- [ ] Add bottom composer shell with `moduleAddButton`, `moduleMenu`, `composerContextChips`, `composerInput`, `composerRunButton`, and `composerHint`.
- [ ] Move module activation out of the left sidebar module market and expose modules from the composer `+` menu.
- [ ] Preserve all existing IDs used by `src/app.js`.

### Task 2: Composer Layout CSS

**Files:**
- Modify: `src/styles.css`

- [ ] Add fixed bottom composer styling.
- [ ] Add module popover, active module chips, and drawer styling.
- [ ] Give central reader enough bottom padding so the composer does not cover text.
- [ ] Collapse right rail when no module drawer is open.

### Task 3: Composer Behavior

**Files:**
- Modify: `src/app.js`

- [ ] Add composer state: active drawer, module menu open, input value.
- [ ] Wire `+` menu to toggle modules and open their drawer.
- [ ] Render active module chips near composer.
- [ ] Map simple composer commands to existing actions: translate current segment, batch translate, extract terms, check terms, open notes/source/agent/events.
- [ ] Keep existing top buttons functional.

### Task 4: Verification

**Files:**
- Verify: `index.html`, `src/styles.css`, `src/app.js`

- [ ] Run `node --check src/app.js`.
- [ ] Request `/` and `/api/health`.
- [ ] Check static queried IDs are present.
- [ ] Manually inspect browser after refresh.
