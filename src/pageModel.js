export function getDocumentPages(doc) {
  const segments = Array.isArray(doc?.segments) ? doc.segments : [];
  const rawPages = Array.isArray(doc?.pages) ? doc.pages : [];
  const pages = new Map();

  rawPages.forEach((page, index) => {
    const pageNumber = Number(page.pageIndex || page.number || index + 1);
    if (!Number.isFinite(pageNumber) || pageNumber < 1) return;
    if (!pages.has(pageNumber)) pages.set(pageNumber, []);
  });

  segments.forEach((segment, index) => {
    const pageNumber = Number(segment.pageIndex || index + 1);
    if (!pages.has(pageNumber)) pages.set(pageNumber, []);
    pages.get(pageNumber).push(segment);
  });

  return Array.from(pages.entries())
    .sort(([a], [b]) => a - b)
    .map(([pageNumber, pageSegments]) => ({
      pageNumber,
      segments: pageSegments,
      firstSegmentId: pageSegments[0]?.id || "",
    }));
}

export function getSelectedPageNumber(doc, selectedSegmentId, fallbackPage = 1) {
  const segments = Array.isArray(doc?.segments) ? doc.segments : [];
  const selected = segments.find((segment) => segment.id === selectedSegmentId);
  if (selected) return Number(selected.pageIndex || selected.index || fallbackPage || 1);

  const pages = getDocumentPages(doc);
  if (pages.some((page) => page.pageNumber === Number(fallbackPage))) return Number(fallbackPage);
  return pages[0]?.pageNumber || 1;
}

export function getPageByNumber(doc, pageNumber) {
  const pages = getDocumentPages(doc);
  return pages.find((page) => page.pageNumber === Number(pageNumber)) || pages[0] || { pageNumber: 1, segments: [], firstSegmentId: "" };
}

export function getAdjacentPageNumber(doc, currentPageNumber, direction) {
  const pages = getDocumentPages(doc);
  const index = pages.findIndex((page) => page.pageNumber === Number(currentPageNumber));
  if (index === -1) return pages[0]?.pageNumber || 1;
  const nextIndex = Math.min(Math.max(index + direction, 0), pages.length - 1);
  return pages[nextIndex]?.pageNumber || currentPageNumber;
}
