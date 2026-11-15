import { safeRelativePath, sha256 } from "../../lib/transferProtocol.mjs";
export type WorkspaceFile = File & { ccPath?: string };
export function attachmentPath(file: WorkspaceFile) {
  return safeRelativePath(file.ccPath || file.webkitRelativePath || file.name);
}
export function withPath(file: File, path: string): WorkspaceFile {
  const safe=safeRelativePath(path);
  Object.defineProperty(file,"ccPath",{value:safe,configurable:true});
  return file;
}
export function renameAttachment(file: WorkspaceFile, name: string): WorkspaceFile {
  const clean=safeRelativePath(name);
  if(clean.includes("/"))throw Error("Enter a filename, not a folder path.");
  const parts=attachmentPath(file).split("/");
  parts[parts.length-1]=clean;
  return withPath(new File([file],clean,{type:file.type,lastModified:file.lastModified}),parts.join("/"));
}
type Entry = {name:string;isFile:boolean;isDirectory:boolean;file?:(success:(f:File)=>void,error:(e:DOMException)=>void)=>void;createReader?:()=>{readEntries:(success:(entries:Entry[])=>void,error:(e:DOMException)=>void)=>void}};
async function walk(entry: Entry, prefix: string, files: WorkspaceFile[], depth=0):Promise<void>{
  if(depth>20)throw Error("Folder nesting is too deep.");
  if(files.length>=500)throw Error("A transfer supports up to 500 files.");
  const path=safeRelativePath(prefix+entry.name);
  if(entry.isFile&&entry.file){
    const f=await new Promise<File>((resolve,reject)=>entry.file!(resolve,reject));
    files.push(withPath(f,path));
  }else if(entry.isDirectory&&entry.createReader){
    const reader=entry.createReader();
    while(true){const batch=await new Promise<Entry[]>((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)await walk(child,path+"/",files,depth+1)}
  }
}
export async function readDrop(data: DataTransfer):Promise<WorkspaceFile[]>{
  // Entry handles must be acquired synchronously while the drop event is active.
  const entries=Array.from(data.items).filter(x=>x.kind==="file").map(x=>(x as any).webkitGetAsEntry?.() as Entry|null);
  const fallback=Array.from(data.files);
  if(!entries.some(Boolean))return fallback;
  const result:WorkspaceFile[]=[];
  for(const entry of entries){if(entry)await walk(entry,"",result)}
  return result.length?result:fallback;
}
export async function findDuplicateIndexes(files: WorkspaceFile[]){
  const seen=new Map<string,number>();const duplicates:number[]=[];
  for(let i=0;i<files.length;i++){
    const file=files[i];if(file.size>40*1024*1024)throw Error("Hashing is limited to 40 MB per attachment in this build.");
    const key=file.size+":"+await sha256(await file.arrayBuffer());
    if(seen.has(key))duplicates.push(i);else seen.set(key,i);
  }
  return duplicates;
}
export function uniqueZipPath(path:string, used:Set<string>){
  const safe=safeRelativePath(path);let next=safe;let i=2;
  while(used.has(next)){
    const slash=safe.lastIndexOf("/"),dot=safe.lastIndexOf(".");
    const split=dot>slash+1?dot:safe.length;
    next=safe.slice(0,split)+" ("+(i++)+")"+safe.slice(split);
  }
  used.add(next);return next;
}
