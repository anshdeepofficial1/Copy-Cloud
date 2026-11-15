import { createClient } from "@supabase/supabase-js";
import { CHUNK_BYTES, PROTOCOL_VERSION, randomToken, generateCode, toBase64Url, fromBase64Url, sha256, importTransferKey, encryptChunk, decryptChunk, safeRelativePath } from "../../lib/transferProtocol.mjs";
import { attachmentPath, type WorkspaceFile } from "./attachmentUtils";
import { draftType, draftBytes, MAX_TRANSFER_BYTES, MAX_MESSAGE_BYTES, type Transfer, type TransferFile } from "./transferService";

type Status={enabled:false}|{enabled:true;url:string;anonKey:string};
type Options={name:string;description:string;minutes:number;maxClaims:number;password:string};
type Chunk={bytes:number;hash:string};
type Item={id:string;name:string;relativePath:string;size:number;mime:string;chunks:Chunk[]};
type Manifest={version:2;name:string;description:string;text:string;items:Item[]};
type Envelope={v:2;a:string;k?:string;wrap?:{salt:string;iv:string;data:string}};
type ObjectInfo={path:string;bytes:number};
export type SecureUploadSession={id:string;code:string;owner:string;access:string;key:CryptoKey;envelope:string;manifest:Manifest;manifestBytes:Uint8Array;files:WorkspaceFile[];objects:ObjectInfo[];minutes:number;maxClaims:number;reserved:boolean;expiresAt?:string};
export type SecureProgress={done:number;total:number;bytes:number;totalBytes:number};
const enc=new TextEncoder(),dec=new TextDecoder();
const BUCKET="copycloud-v2";
const validToken=(s:unknown)=>typeof s==="string"&&/^[A-Za-z0-9_-]{43}$/.test(s);
const validId=(s:unknown)=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
class ApiError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status}}
async function api<T>(action:string,body:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
  const response=await fetch("/api/secure-transfer",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...body}),signal,cache:"no-store",referrerPolicy:"no-referrer"});
  let data:any;try{data=await response.json()}catch{throw new ApiError(response.status,"Transfer service returned an invalid response.")}
  if(!response.ok)throw new ApiError(response.status,data.error||"Transfer request failed.");
  return data as T;
}
export async function secureStatus():Promise<Status>{try{return await api<Status>("status")}catch{return{enabled:false}}}
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException("Transfer canceled","AbortError")}
async function retry<T>(fn:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  for(let i=0;;i++){
    checkAbort(signal);
    try{return await fn()}catch(e){
      if(i>=3||signal?.aborted||(e instanceof ApiError&&e.status<500&&e.status!==408))throw e;
      await new Promise(r=>setTimeout(r,Math.min(4000,500*2**i)));
    }
  }
}
async function passwordKey(password:string,salt:Uint8Array){
  const raw=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function envelopeFor(access:string,secret:string,password:string){
  const e:Envelope={v:2,a:access};
  if(!password)e.k=secret;
  else{
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await passwordKey(password,salt);
    const wrapped=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode("CopyCloud v2:"+access)},key,fromBase64Url(secret));
    e.wrap={salt:toBase64Url(salt),iv:toBase64Url(iv),data:toBase64Url(new Uint8Array(wrapped))};
  }
  return toBase64Url(enc.encode(JSON.stringify(e)));
}
export function decodeEnvelope(input:string):Envelope{
  let value=input.trim();
  if(value.includes("#cc2="))value=value.split("#cc2=")[1].split("&")[0];
  if(value.startsWith("cc2="))value=value.slice(4);
  if(value.length>1024)throw Error("Invalid secure access key.");
  let e:Envelope;try{e=JSON.parse(dec.decode(fromBase64Url(value)))}catch{throw Error("Invalid secure access key.")}
  if(e?.v!==2||!validToken(e.a)||(!validToken(e.k)&&!e.wrap)||!!e.k===!!e.wrap)throw Error("Invalid secure access key.");
  if(e.wrap){try{if(fromBase64Url(e.wrap.salt).length!==16||fromBase64Url(e.wrap.iv).length!==12||fromBase64Url(e.wrap.data).length!==48)throw Error()}catch{throw Error("Invalid password envelope.")}}
  return e;
}
async function unlock(e:Envelope,password:string){
  if(e.k)return importTransferKey(e.k);
  if(!e.wrap||!password)throw Error("Enter the transfer password.");
  try{
    const key=await passwordKey(password,fromBase64Url(e.wrap.salt));
    const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64Url(e.wrap.iv),additionalData:enc.encode("CopyCloud v2:"+e.a)},key,fromBase64Url(e.wrap.data));
    return importTransferKey(toBase64Url(new Uint8Array(raw)));
  }catch{throw Error("Incorrect password or damaged access key.")}
}
export function secureLink(code:string,envelope:string){
  const url=new URL("/receive",window.location.origin);url.searchParams.set("code",code);url.hash="cc2="+envelope;return url.toString();
}
export function secureFragment(){return new URLSearchParams(location.hash.slice(1)).get("cc2")||""}
export async function prepareSecureUpload(text:string,files:WorkspaceFile[],options:Options,signal?:AbortSignal):Promise<SecureUploadSession>{
  if(!text.trim()&&!files.length)throw Error("Add a message or attachments.");
  if(draftBytes(text,files)>MAX_TRANSFER_BYTES||enc.encode(text).length>MAX_MESSAGE_BYTES||files.length>500)throw Error("Transfer exceeds the current size or item limit.");
  if(options.password&&options.password.length<8)throw Error("Use at least 8 characters for the optional password.");
  const id=crypto.randomUUID(),owner=randomToken(),access=randomToken(),secret=randomToken();
  const key=await importTransferKey(secret),envelope=await envelopeFor(access,secret,options.password);
  const items:Item[]=[];const objects:ObjectInfo[]=[];
  for(const file of files){
    const item:Item={id:crypto.randomUUID(),name:file.name,relativePath:attachmentPath(file),size:file.size,mime:file.type||"application/octet-stream",chunks:[]};
    for(let offset=0,index=0;offset<file.size||index===0;offset+=CHUNK_BYTES,index++){
      checkAbort(signal);
      const bytes=await file.slice(offset,offset+CHUNK_BYTES).arrayBuffer();
      item.chunks.push({bytes:bytes.byteLength,hash:await sha256(bytes)});
      objects.push({path:id+"/"+item.id+"/"+index,bytes:bytes.byteLength+28});
    }
    items.push(item);
  }
  const manifest:Manifest={version:2,name:options.name.slice(0,120),description:options.description.slice(0,500),text,items};
  const manifestBytes=enc.encode(JSON.stringify(manifest));
  if(manifestBytes.length>CHUNK_BYTES)throw Error("Transfer metadata is too large.");
  objects.push({path:id+"/manifest",bytes:manifestBytes.length+28});
  if(objects.length>650)throw Error("Transfer has too many chunks.");
  return{id,code:generateCode(),owner,access,key,envelope,manifest,manifestBytes,files:[...files],objects,minutes:options.minutes,maxClaims:options.maxClaims,reserved:false};
}
async function seal(session:SecureUploadSession,path:string):Promise<Blob>{
  const parts=path.split("/");
  const itemId=parts[1],index=itemId==="manifest"?0:Number(parts[2]);
  let bytes:Uint8Array|ArrayBuffer=session.manifestBytes;
  if(itemId!=="manifest"){
    const itemIndex=session.manifest.items.findIndex(i=>i.id===itemId);
    if(itemIndex<0)throw Error("Missing upload item");
    bytes=await session.files[itemIndex].slice(index*CHUNK_BYTES,(index+1)*CHUNK_BYTES).arrayBuffer();
  }
  const {iv,ciphertext}=await encryptChunk(session.key,bytes,{transferId:session.id,itemId,index});
  return new Blob([fromBase64Url(iv),ciphertext],{type:"application/octet-stream"});
}
export async function uploadSecure(session:SecureUploadSession,status:Extract<Status,{enabled:true}>,onProgress:(p:SecureProgress)=>void,signal?:AbortSignal):Promise<Transfer>{
  checkAbort(signal);
  if(!session.reserved){
    const accessHash=await sha256(enc.encode(session.access)),ownerHash=await sha256(enc.encode(session.owner));
    for(let attempt=0;;attempt++){
      try{
        await retry(()=>api("create",{id:session.id,code:session.code,accessHash,ownerHash,minutes:session.minutes,maxClaims:session.maxClaims,objects:session.objects},signal),signal);
        session.reserved=true;break;
      }catch(e){if(!(e instanceof ApiError)||e.status!==409||attempt>=2||!e.message.includes("collision"))throw e;session.code=generateCode()}
    }
  }
  const storage=createClient(status.url,status.anonKey,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(BUCKET);
  const totalBytes=session.objects.reduce((n,o)=>n+o.bytes,0);
  let done=0,bytes=0;
  onProgress({done,total:session.objects.length,bytes,totalBytes});
  for(let offset=0;offset<session.objects.length;offset+=10){
    checkAbort(signal);
    const batch=session.objects.slice(offset,offset+10);
    await retry(async()=>{
      const {objects}=await api<{objects:{path:string;uploaded:boolean;token?:string}[]}>("upload",{id:session.id,owner:session.owner,paths:batch.map(o=>o.path)},signal);
      for(const object of batch){
      const authorization=objects.find(o=>o.path===object.path);if(!authorization)throw Error("Invalid upload authorization.");
      if(authorization.uploaded)continue;
      if(!authorization.token)throw Error("Missing upload authorization.");
      const blob=await seal(session,object.path);
      checkAbort(signal);
      const {error}=await storage.uploadToSignedUrl(object.path,authorization.token,blob,{contentType:"application/octet-stream",upsert:false});
      if(error)throw Error("Chunk upload failed. Retrying.");
      }
    },signal);
    done+=batch.length;bytes+=batch.reduce((n,o)=>n+o.bytes,0);onProgress({done,total:session.objects.length,bytes,totalBytes});
  }
  const final=await retry(()=>api<{ready:boolean;expiresAt:string}>("finalize",{id:session.id,owner:session.owner},signal),signal);
  if(!final.ready)throw Error("Upload not finalized.");
  session.expiresAt=final.expiresAt;
  return{code:session.code,type:draftType(session.manifest.text,session.files),content:session.manifest.text,files:session.manifest.items.map(i=>({name:i.name,path:i.id,url:"",relativePath:i.relativePath,size:i.size})),createdAt:new Date().toISOString(),name:session.manifest.name,description:session.manifest.description,secure:{id:session.id,owner:session.owner,envelope:session.envelope,expiresAt:final.expiresAt,maxClaims:session.maxClaims}};
}
async function getObject(id:string,grant:string,path:string){
  return retry(async()=>{
    const {objects}=await api<{objects:{path:string;url:string}[]}>("download",{id,grant,paths:[path]});
    if(objects[0]?.path!==path||!objects[0].url)throw Error("Invalid download authorization.");
    const r=await fetch(objects[0].url,{cache:"no-store",referrerPolicy:"no-referrer"});
    if(!r.ok)throw Error("Could not download encrypted chunk.");
    return new Uint8Array(await r.arrayBuffer());
  });
}
async function openObject(key:CryptoKey,id:string,grant:string,itemId:string,index:number,expected?:number){
  const path=id+"/"+itemId+(itemId==="manifest"?"":"/"+index);
  const bytes=await getObject(id,grant,path);
  if(bytes.length<28||bytes.length>CHUNK_BYTES+28||expected!==undefined&&bytes.length!==expected+28)throw Error("Invalid encrypted chunk size.");
  return decryptChunk(key,bytes.slice(12),toBase64Url(bytes.slice(0,12)),{transferId:id,itemId,index});
}
function validateManifest(data:unknown):Manifest{
  const m=data as Manifest;
  if(m?.version!==2||typeof m.text!=="string"||typeof m.name!=="string"||typeof m.description!=="string"||enc.encode(m.text).length>MAX_MESSAGE_BYTES||!Array.isArray(m.items)||m.items.length>500)throw Error("Invalid encrypted manifest.");
  let total=enc.encode(m.text).length,chunkCount=0;const ids=new Set<string>();
  for(const item of m.items){
    if(!item||!validId(item.id)||ids.has(item.id)||typeof item.name!=="string"||typeof item.mime!=="string"||!Number.isSafeInteger(item.size)||item.size<0||!Array.isArray(item.chunks)||item.chunks.length!==Math.max(1,Math.ceil(item.size/CHUNK_BYTES)))throw Error("Invalid encrypted attachment.");
    ids.add(item.id);if(safeRelativePath(item.relativePath).split("/").at(-1)!==item.name)throw Error("Invalid attachment path.");
    let bytes=0;for(const [i,c] of item.chunks.entries()){const expected=Math.min(CHUNK_BYTES,Math.max(0,item.size-i*CHUNK_BYTES));if(!c||c.bytes!==expected||typeof c.hash!=="string"||!/^[a-f0-9]{64}$/.test(c.hash))throw Error("Invalid chunk metadata.");bytes+=c.bytes;chunkCount++}
    if(bytes!==item.size)throw Error("Invalid attachment size.");total+=bytes;
  }
  if(total>MAX_TRANSFER_BYTES||chunkCount>649)throw Error("Transfer exceeds supported limits.");
  return m;
}
export async function receiveSecure(code:string,envelope:string,password:string):Promise<Transfer>{
  const e=decodeEnvelope(envelope);
  const key=await unlock(e,password);
  const {id,grant,expiresAt,createdAt}=await api<{id:string;grant:string;expiresAt:string;createdAt:string}>("claim",{code,access:e.a});
  if(!validId(id)||!validToken(grant))throw Error("Invalid download session.");
  const manifest=validateManifest(JSON.parse(dec.decode(await openObject(key,id,grant,"manifest",0))));
  const files:TransferFile[]=manifest.items.map(item=>({name:item.name,path:item.id,url:"",relativePath:item.relativePath,size:item.size,load:async()=>{
    const parts:Uint8Array[]=[];
    for(const [index,chunk] of item.chunks.entries()){
      const plain=await openObject(key,id,grant,item.id,index,chunk.bytes);
      if(await sha256(plain)!==chunk.hash)throw Error("Attachment integrity check failed.");
      parts.push(plain);
    }
    return new Blob(parts,{type:item.mime||"application/octet-stream"});
  }}));
  return{code,type:files.length?(manifest.text?"mixed":"file"):"text",content:manifest.text,files,createdAt,name:manifest.name,description:manifest.description,secure:{id,envelope:"",expiresAt,maxClaims:0}};
}
export async function revokeSecure(id:string,owner:string){return api<{revoked:boolean;cleanupPending:boolean}>("revoke",{id,owner})}
export async function secureOwnerStatus(id:string,owner:string){return api<{state:string;expiresAt:string;claims:number;maxClaims:number}>("ownerStatus",{id,owner})}
