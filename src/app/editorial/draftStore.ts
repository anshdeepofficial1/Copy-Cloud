import { attachmentPath, withPath, type WorkspaceFile } from "./attachmentUtils";
const DB="copycloud-drafts-v1",STORE="workspace",KEY="draft";
export const DRAFT_PREF="cc_remember_draft";
type Stored={text:string;files:{file:File;path:string}[];savedAt:number};
let queue:Promise<unknown>=Promise.resolve();
function open():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error("Draft storage is blocked."))});
}
async function transact<T>(mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await open();
  try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(STORE,mode),req=action(tx.objectStore(STORE));let result:T;req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Draft storage failed"))})}finally{db.close()}
}
function serial<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.catch(()=>{}).then(fn);queue=next;return next}
export function readDraft(){return serial(async()=>{
  const value=await transact<Stored|undefined>("readonly",s=>s.get(KEY));
  if(!value)return null;
  if(Date.now()-value.savedAt>24*60*60*1000){await transact("readwrite",s=>s.delete(KEY));return null}
  return{text:value.text,files:value.files.map(x=>withPath(x.file,x.path))};
})}
export function saveDraft(text:string,files:WorkspaceFile[]){return serial(async()=>{
  if(files.reduce((n,f)=>n+f.size,0)+new Blob([text]).size>40*1024*1024){await transact("readwrite",s=>s.delete(KEY));return}
  if(!text&&!files.length){await transact("readwrite",s=>s.delete(KEY));return}
  await transact("readwrite",s=>s.put({text,files:files.map(file=>({file,path:attachmentPath(file)})),savedAt:Date.now()} satisfies Stored,KEY));
})}
export function clearDraft(){return serial(()=>transact("readwrite",s=>s.delete(KEY)))}
export function draftPreference(){try{return localStorage.getItem(DRAFT_PREF)==="yes"}catch{return false}}
