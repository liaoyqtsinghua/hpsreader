const completedKeys = new Set();
const pendingKeys = new Set();

export function createBackgroundKey(projectId, documentId) {
  if (!projectId || !documentId) return "";
  return `${projectId}:${documentId}`;
}

export function shouldRunReadingBackgroundTasks(projectId, documentId) {
  const key = createBackgroundKey(projectId, documentId);
  return Boolean(key) && !completedKeys.has(key) && !pendingKeys.has(key);
}

export function markReadingBackgroundTasksPending(projectId, documentId) {
  const key = createBackgroundKey(projectId, documentId);
  if (key) pendingKeys.add(key);
  return key;
}

export function markReadingBackgroundTasksComplete(projectId, documentId) {
  const key = createBackgroundKey(projectId, documentId);
  if (key) {
    pendingKeys.delete(key);
    completedKeys.add(key);
  }
}

export function markReadingBackgroundTasksIdle(projectId, documentId) {
  const key = createBackgroundKey(projectId, documentId);
  if (key) pendingKeys.delete(key);
}

export function resetReadingBackgroundTaskState() {
  completedKeys.clear();
  pendingKeys.clear();
}
