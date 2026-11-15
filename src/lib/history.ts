export interface HistoryItem {
  code: string;
  action: "send" | "retrieve";
  contentType: "text" | "file";
  preview: string;
  ts: number;
}

const HISTORY_KEY = "cc_hist_v2";
const TTL_MS = 24 * 60 * 60 * 1000;

function pruneExpired(items: HistoryItem[]): HistoryItem[] {
  const cutoff = Date.now() - TTL_MS;
  return items.filter((h) => typeof h.ts === "number" && h.ts >= cutoff);
}

export function addToHistory(item: HistoryItem) {
  let hist: HistoryItem[] = [];
  try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch {}
  hist = pruneExpired(hist).filter((h) => !(h.code === item.code && h.action === item.action));
  hist.unshift({...item,preview:item.contentType==="text"?"Text message":item.preview});
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 20)));
}

export function getHistory(): HistoryItem[] {
  let hist: HistoryItem[] = [];
  try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch {}
  const pruned = pruneExpired(hist).map(h=>h.contentType==="text"?{...h,preview:"Text message"}:h);
  if (JSON.stringify(pruned) !== JSON.stringify(hist)) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));
  }
  return pruned;
}

export function clearHistoryStore() {
  localStorage.removeItem(HISTORY_KEY);
}

