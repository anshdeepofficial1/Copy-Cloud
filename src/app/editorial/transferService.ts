import { supabase, addToHistory, fileKind, generateCode } from "../../lib/supabase";
import { safeRelativePath, sha256 } from "../../lib/transferProtocol.mjs";
import { attachmentPath } from "./attachmentUtils";

export const MAX_TRANSFER_BYTES = 40 * 1024 * 1024;
export type TransferType = "text" | "file" | "mixed";
export type TransferFile = { name: string; path: string; url: string; relativePath?:string; size?:number; hash?:string; load?:()=>Promise<Blob> };
export type Transfer = { code: string; type: TransferType; content: string; files: TransferFile[]; createdAt: string; name?:string; description?:string; secure?:{id:string;owner?:string;envelope:string;expiresAt:string;maxClaims:number} };
const TTL = 24 * 60 * 60 * 1000;
const MESSAGE_TOKEN = "ccnotev1";
const MANIFEST_TOKEN = "ccmanifestv2";
export const MAX_MESSAGE_BYTES=256*1024;

export function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._()-]/g, "_").replace(/\.{2,}/g,"_").slice(0, 180) || "file";
}
export function shareLink(code: string) {
  const url = new URL("/receive", window.location.origin);
  url.searchParams.set("code", code);
  return url.toString();
}
function saveHistory(item: Parameters<typeof addToHistory>[0]) {
  try { addToHistory(item); window.dispatchEvent(new Event('cc-studio-history')); } catch { /* Storage restrictions must not invalidate a successful transfer. */ }
}

// Mixed payloads use a reserved message attachment in the existing file-path array.
// Older clients see the message as a downloadable text file; cleanup still removes every path.
export function draftType(text: string, files: readonly File[]): TransferType {
  return files.length ? (text.trim() ? "mixed" : "file") : "text";
}
export function draftBytes(text: string, files: readonly File[]) {
  return files.reduce((sum, file) => sum + file.size, 0) + new Blob([text]).size;
}
export async function createTransfer(input: { text: string; files: File[] }, onProgress: (done: number, total: number) => void): Promise<Transfer> {
  const { text, files } = input;
  const type = draftType(text, files);
  if (!text.trim() && !files.length) throw new Error("Add text or at least one file.");
  if (new Blob([text]).size > MAX_MESSAGE_BYTES) throw new Error("A message can be up to 256 KB.");
  if (files.length>500) throw new Error("A transfer supports up to 500 files.");
  if (draftBytes(text, files) > MAX_TRANSFER_BYTES) throw new Error("The combined attachment and message size cannot exceed 40 MB.");
  const code = generateCode();
  const paths: string[] = [];
  const attachments: TransferFile[] = [];
  const createdAt = new Date().toISOString();
  let storedContent = text;
  try {
    if (files.length) {
      const total = files.length + (type === "mixed" ? 1 : 0) + 1;
      onProgress(0, total);
      for (const file of files) {
        const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const path = code + "-" + token + "-" + safeName(file.name);
        const { error } = await supabase.storage.from("uploads").upload(path, file, { upsert: false });
        if (error) throw error;
        paths.push(path);
        attachments.push({path,name:file.name,relativePath:attachmentPath(file),size:file.size,hash:await sha256(await file.arrayBuffer()),url:supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl});
        onProgress(paths.length, total);
      }
      if (type === "mixed") {
        const path = code + "-" + MESSAGE_TOKEN + "-CopyCloud-message.txt";
        const {error} = await supabase.storage.from("uploads").upload(path, new Blob([text],{type:"text/plain;charset=utf-8"}), {upsert:false,contentType:"text/plain"});
        if(error) throw error;
        paths.push(path);
        onProgress(paths.length,total);
      }
      const manifestPath=code+"-"+MANIFEST_TOKEN+"-CopyCloud-manifest.json";
      const manifest=JSON.stringify({version:2,files:attachments.map(({path,name,relativePath,size,hash})=>({path,name,relativePath,size,hash}))});
      const {error:manifestError}=await supabase.storage.from("uploads").upload(manifestPath,new Blob([manifest],{type:"application/json"}),{upsert:false,contentType:"application/json"});
      if(manifestError)throw manifestError;
      paths.push(manifestPath);onProgress(paths.length,total);
      storedContent = JSON.stringify(paths);
    }
    const { error } = await supabase.from("clips").insert([{ code, content: storedContent, type: files.length ? "file" : "text", created_at: createdAt }]);
    if (error) throw error;
  } catch (error) {
    if (paths.length) {
      try { await supabase.storage.from("uploads").remove(paths); } catch { /* Existing storage rules may not permit cleanup. */ }
    }
    throw error;
  }
  saveHistory({ code, action: "send", contentType: files.length ? "file" : "text", preview: type === "mixed" ? "Message + " + files.length + " file(s)" : type === "text" ? "Text message" : files.length + " file(s)", ts: Date.now() });
  return { code, type, content: type === "file" ? "" : text, files: attachments, createdAt };
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
  let type: TransferType = data.type;
  let content = data.type === "text" ? data.content : "";
  if (data.type === "file") {
    const paths: unknown = JSON.parse(data.content);
    if (!Array.isArray(paths) || !paths.every(path => typeof path === "string" && path.startsWith(normalized + "-") && !path.includes("/") && !path.includes("\\") && path.length<=1024)) throw new Error("The file list is invalid.");
    const messagePath = normalized + "-" + MESSAGE_TOKEN + "-CopyCloud-message.txt";
    const manifestPath=normalized+"-"+MANIFEST_TOKEN+"-CopyCloud-manifest.json";
    const metadata=new Map<string,{name:string;relativePath:string;size:number;hash:string}>();
    if(paths.includes(manifestPath)){
      const res=await fetch(supabase.storage.from("uploads").getPublicUrl(manifestPath).data.publicUrl);
      if(!res.ok)throw Error("Could not load transfer metadata. Try again.");
      const manifest=await res.json();
      if(manifest?.version!==2||!Array.isArray(manifest.files)||manifest.files.length>500)throw Error("Invalid transfer metadata.");
      for(const item of manifest.files){
        if(!item||typeof item.path!=="string"||!paths.includes(item.path)||item.path===manifestPath||item.path===messagePath||typeof item.name!=="string"||!Number.isSafeInteger(item.size)||item.size<0||typeof item.hash!=="string"||!/^([a-f0-9]{64})$/.test(item.hash))throw Error("Invalid attachment metadata.");
        const relativePath=safeRelativePath(item.relativePath);
        if(relativePath.split("/").at(-1)!==item.name||metadata.has(item.path))throw Error("Invalid attachment filename.");
        metadata.set(item.path,{name:item.name,relativePath,size:item.size,hash:item.hash});
      }
      if(metadata.size!==paths.filter(p=>p!==manifestPath&&p!==messagePath).length)throw Error("Incomplete attachment metadata.");
    }
    for (const path of paths as string[]) {
      if(path===manifestPath)continue;
      const url = supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
      if(path === messagePath) {
        const response = await fetch(url);
        if(!response.ok) throw new Error("Could not load the attached message. Try again.");
        content = await response.text();
        type = "mixed";
      } else {
        files.push({ path, name: path.split("-").slice(2).join("-") || path, url, ...metadata.get(path) });
      }
    }
  }
  saveHistory({ code: normalized, action: "retrieve", contentType: data.type, preview: type === "mixed" ? "Message + " + files.length + " file(s)" : type === "text" ? "Text message" : files.length + " file(s)", ts: Date.now() });
  return { code: normalized, type, content, files, createdAt: data.created_at };
}

export function isPreviewable(name: string) {
  return fileKind(name) !== "other" || /\.(pdf|mp3|wav|ogg|m4a|txt|md|json|csv|log|js|ts|py|html|css|xml|yaml|yml|sql)$/i.test(name);
}

export function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback;
}

export async function fetchVerifiedFile(file:TransferFile):Promise<Blob>{
  if(file.load)return file.load();
  const response=await fetch(file.url);
  if(!response.ok)throw Error("Download failed: "+file.name);
  const blob=await response.blob();
  if(file.size!==undefined&&blob.size!==file.size)throw Error("File size verification failed: "+file.name);
  if(file.hash&&await sha256(await blob.arrayBuffer())!==file.hash)throw Error("Integrity verification failed: "+file.name);
  return blob;
}
