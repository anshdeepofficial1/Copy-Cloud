import { supabase, addToHistory, fileKind } from "../../lib/supabase";

export const MAX_TRANSFER_BYTES = 40 * 1024 * 1024;
export type TransferType = "text" | "file";
export type TransferFile = { name: string; path: string; url: string };
export type Transfer = { code: string; type: TransferType; content: string; files: TransferFile[]; createdAt: string };
const TTL = 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function newCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._()-]/g, "_").slice(0, 180) || "file";
}
export function shareLink(code: string) {
  const url = new URL("/receive", window.location.origin);
  url.searchParams.set("code", code);
  return url.toString();
}
function saveHistory(item: Parameters<typeof addToHistory>[0]) {
  try { addToHistory(item); } catch { /* Storage restrictions must not invalidate a successful transfer. */ }
}

export async function createTransfer(input: { type: TransferType; text: string; files: File[] }, onProgress: (done: number, total: number) => void): Promise<Transfer> {
  const { type, text, files } = input;
  if (type === "text" && !text.trim()) throw new Error("Add some text first.");
  if (type === "file" && !files.length) throw new Error("Add at least one file first.");
  if (type === "file" && files.reduce((sum, file) => sum + file.size, 0) > MAX_TRANSFER_BYTES) throw new Error("The total file size cannot exceed 40 MB.");
  const code = newCode();
  const paths: string[] = [];
  const createdAt = new Date().toISOString();
  let content = text;
  try {
    if (type === "file") {
      onProgress(0, files.length);
      for (const file of files) {
        const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const path = code + "-" + token + "-" + safeName(file.name);
        const { error } = await supabase.storage.from("uploads").upload(path, file, { upsert: false });
        if (error) throw error;
        paths.push(path);
        onProgress(paths.length, files.length);
      }
      content = JSON.stringify(paths);
    }
    const { error } = await supabase.from("clips").insert([{ code, content, type, created_at: createdAt }]);
    if (error) throw error;
  } catch (error) {
    if (paths.length) {
      try { await supabase.storage.from("uploads").remove(paths); } catch { /* Existing storage rules may not permit cleanup. */ }
    }
    throw error;
  }
  saveHistory({ code, action: "send", contentType: type, preview: type === "text" ? text.slice(0, 40) : files.length + " file(s)", ts: Date.now() });
  return { code, type, content, files: paths.map((path, i) => ({ path, name: files[i].name, url: supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl })), createdAt };
}

export async function receiveTransfer(code: string): Promise<Transfer> {
  const normalized = cleanCode(code);
  if (normalized.length !== 6) throw new Error("Enter a six-character code.");
  const { data, error } = await supabase.from("clips").select("code,content,type,created_at").eq("code", normalized).maybeSingle();
  if (error) throw error;
  if (!data || typeof data.content !== "string" || (data.type !== "text" && data.type !== "file")) throw new Error("Transfer not found or expired. Check the code and try again.");
  const stamp = Date.parse(data.created_at);
  if (Number.isFinite(stamp) && Date.now() - stamp >= TTL) throw new Error("This transfer has expired.");
  const files: TransferFile[] = [];
  if (data.type === "file") {
    const paths: unknown = JSON.parse(data.content);
    if (!Array.isArray(paths) || !paths.every(path => typeof path === "string" && path.startsWith(normalized + "-") && !path.includes("/") && !path.includes(".."))) throw new Error("The file list is invalid.");
    for (const path of paths as string[]) {
      files.push({ path, name: path.split("-").slice(2).join("-") || path, url: supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl });
    }
  }
  saveHistory({ code: normalized, action: "retrieve", contentType: data.type, preview: data.type === "text" ? data.content.slice(0, 40) : files.length + " file(s)", ts: Date.now() });
  return { code: normalized, type: data.type, content: data.content, files, createdAt: data.created_at };
}

export function isPreviewable(name: string) {
  return fileKind(name) !== "other" || /\.(pdf|mp3|wav|ogg|m4a)$/i.test(name);
}

export function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback;
}
