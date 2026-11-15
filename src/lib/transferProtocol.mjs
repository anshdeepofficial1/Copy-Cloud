// CopyCloud protocol primitives; browser and Node Web Crypto compatible.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PROTOCOL_VERSION = 2;
export const CHUNK_BYTES = 1024 * 1024;
export function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64Url(value);
}
export function generateCode() {
  const n = CODE_ALPHABET.length;
  const limit = 256 - 256 % n;
  let code = "";
  while (code.length < 6) {
    for (const value of crypto.getRandomValues(new Uint8Array(12))) {
      if (value < limit) code += CODE_ALPHABET[value % n];
      if (code.length === 6) return code;
    }
  }
  return code;
}
export function toBase64Url(bytes) {
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function fromBase64Url(value) {
  if(typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value)) throw Error("Invalid base64url");
  return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0));
}
export async function sha256(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,"0")).join("");
}
export function safeRelativePath(value) {
  if(typeof value!=="string" || !value || value.length>1024 || /[\u0000-\u001f\u007f\\]/.test(value)) throw Error("Invalid filename");
  const parts=value.split("/");
  if(parts.some(p=>!p||p==="."||p===".."||/^[A-Za-z]:/.test(p))) throw Error("Unsafe path");
  return parts.join("/");
}
export async function importTransferKey(secret) {
  const raw=fromBase64Url(secret);
  if(raw.byteLength!==32)throw Error("Invalid transfer key");
  return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
function contextBytes(context) {
  return new TextEncoder().encode(JSON.stringify([PROTOCOL_VERSION,context.transferId,context.itemId,context.index]));
}
export async function encryptChunk(key,bytes,context) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:contextBytes(context),tagLength:128},key,bytes);
  return {iv:toBase64Url(iv),ciphertext:new Uint8Array(ciphertext)};
}
export async function decryptChunk(key,bytes,iv,context) {
  return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64Url(iv),additionalData:contextBytes(context),tagLength:128},key,bytes));
}
