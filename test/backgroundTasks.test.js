import test from "node:test";
import assert from "node:assert/strict";

import {
  createBackgroundKey,
  markReadingBackgroundTasksComplete,
  markReadingBackgroundTasksIdle,
  markReadingBackgroundTasksPending,
  resetReadingBackgroundTaskState,
  shouldRunReadingBackgroundTasks,
} from "../src/backgroundTasks.js";

test("background reading tasks use one key per project and document", () => {
  assert.equal(createBackgroundKey("project-1", "doc-1"), "project-1:doc-1");
  assert.equal(createBackgroundKey("", "doc-1"), "");
});

test("background reading tasks run once per project and document", () => {
  resetReadingBackgroundTaskState();

  assert.equal(shouldRunReadingBackgroundTasks("project-1", "doc-1"), true);
  markReadingBackgroundTasksPending("project-1", "doc-1");
  assert.equal(shouldRunReadingBackgroundTasks("project-1", "doc-1"), false);
  markReadingBackgroundTasksComplete("project-1", "doc-1");
  assert.equal(shouldRunReadingBackgroundTasks("project-1", "doc-1"), false);
  assert.equal(shouldRunReadingBackgroundTasks("project-1", "doc-2"), true);
});

test("failed background reading tasks may be retried", () => {
  resetReadingBackgroundTaskState();

  markReadingBackgroundTasksPending("project-1", "doc-1");
  markReadingBackgroundTasksIdle("project-1", "doc-1");

  assert.equal(shouldRunReadingBackgroundTasks("project-1", "doc-1"), true);
});
