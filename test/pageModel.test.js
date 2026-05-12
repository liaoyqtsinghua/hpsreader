import test from "node:test";
import assert from "node:assert/strict";

import { getAdjacentPageNumber, getDocumentPages, getPageByNumber, getSelectedPageNumber } from "../src/pageModel.js";

const doc = {
  segments: [
    { id: "s1", index: 1, pageIndex: 1, source: "a" },
    { id: "s2", index: 2, pageIndex: 1, source: "b" },
    { id: "s3", index: 3, pageIndex: 3, source: "c" },
    { id: "s4", index: 4, pageIndex: 2, source: "d" },
  ],
};

test("groups document segments into sorted pages", () => {
  assert.deepEqual(
    getDocumentPages(doc).map((page) => ({ pageNumber: page.pageNumber, ids: page.segments.map((segment) => segment.id) })),
    [
      { pageNumber: 1, ids: ["s1", "s2"] },
      { pageNumber: 2, ids: ["s4"] },
      { pageNumber: 3, ids: ["s3"] },
    ],
  );
});

test("includes document pages even when a page has no parsed segments", () => {
  const sparseDoc = {
    pages: [{ pageIndex: 1 }, { pageIndex: 2 }, { pageIndex: 3 }],
    segments: [
      { id: "s1", index: 1, pageIndex: 1, source: "a" },
      { id: "s2", index: 2, pageIndex: 3, source: "c" },
    ],
  };

  assert.deepEqual(
    getDocumentPages(sparseDoc).map((page) => ({ pageNumber: page.pageNumber, ids: page.segments.map((segment) => segment.id) })),
    [
      { pageNumber: 1, ids: ["s1"] },
      { pageNumber: 2, ids: [] },
      { pageNumber: 3, ids: ["s2"] },
    ],
  );
  assert.equal(getPageByNumber(sparseDoc, 2).firstSegmentId, "");
  assert.equal(getAdjacentPageNumber(sparseDoc, 1, 1), 2);
});

test("derives selected page from selected segment", () => {
  assert.equal(getSelectedPageNumber(doc, "s3"), 3);
  assert.equal(getSelectedPageNumber(doc, "missing", 2), 2);
  assert.equal(getSelectedPageNumber({ segments: [] }, "", 9), 1);
});

test("returns page model and adjacent page numbers", () => {
  assert.equal(getPageByNumber(doc, 2).firstSegmentId, "s4");
  assert.equal(getPageByNumber(doc, 9).pageNumber, 1);
  assert.equal(getAdjacentPageNumber(doc, 1, 1), 2);
  assert.equal(getAdjacentPageNumber(doc, 3, 1), 3);
  assert.equal(getAdjacentPageNumber(doc, 1, -1), 1);
});
