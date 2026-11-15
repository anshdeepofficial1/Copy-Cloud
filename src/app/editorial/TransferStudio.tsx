import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Clipboard, Clock3, Cloud, Copy, Download, Eye, File, FileText, FolderOpen, Image, Link2, Plus, QrCode, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import QRCode from "react-qr-code";
import JSZip from "jszip";
import { toast } from "sonner";
import { clearHistoryStore, fileKind, formatFileSize, getHistory, type HistoryItem } from "../../lib/supabase";
import { cleanCode, createTransfer, draftType, draftBytes, errorMessage, isPreviewable, MAX_TRANSFER_BYTES, receiveTransfer, shareLink, type Transfer, type TransferType } from "./transferService";
import "../../styles/transfer-studio.css";

const PdfPreview = lazy(() => import("./PdfPreview"));

type Preview = { name:string; url:string; kind:"image"|"video"|"audio"|"pdf" };
function previewKind(name:string):Preview["kind"]|undefined {
  const kind=fileKind(name);
  if(kind==="image"||kind==="video") return kind;
  if(/\.pdf$/i.test(name))return "pdf";
  if(/\.(mp3|wav|ogg|m4a)$/i.test(name))return "audio";
}
async function copyValue(value:string,message:string) {
  try { await navigator.clipboard.writeText(value);toast.success(message); } catch { toast.error("Clipboard unavailable. Select and copy the content manually."); }
}
function saveBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function PreviewDialog({preview,onClose}:{preview:Preview;onClose:()=>void}) {
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const prev=document.activeElement as HTMLElement|null;close.current?.focus();const esc=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose()};document.addEventListener("keydown",esc);return()=>{document.removeEventListener("keydown",esc);prev?.focus()}},[onClose]);
  return <div className="ts-overlay" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={preview.name} className={"ts-modal"+(preview.kind==="pdf"?" ts-modal-pdf":"")} onClick={e=>e.stopPropagation()}><header><span>{preview.name}</span><button ref={close} className="ts-icon" aria-label="Close preview" onClick={onClose}><X size={20}/></button></header><div className="ts-media">{preview.kind==="image"?<img src={preview.url} alt={preview.name}/>:preview.kind==="video"?<video src={preview.url} controls autoPlay/>:preview.kind==="audio"?<audio src={preview.url} controls autoPlay/>:<Suspense fallback={<div className="ts-pdf-status">Loading PDF viewer…</div>}><PdfPreview key={preview.url} url={preview.url} name={preview.name}/></Suspense>}</div></section></div>;
}
function StudioHeader({kicker,title,description,children}:{kicker:string;title:string;description:string;children?:React.ReactNode}) {
  return <header className="ts-heading"><div><div className="ts-kicker"><span/> {kicker}</div><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}
function FileGlyph({name}:{name:string}) {
  return fileKind(name)==="image"?<Image size={21}/>:<File size={21}/>;
}
function Receipt({transfer,onReset}:{transfer:Transfer;onReset:()=>void}) {
  const [showQR,setShowQR]=useState(false);
  const url=shareLink(transfer.code);
  return <section className="ts-receipt"><div className="ts-receipt-status"><span><Check size={18}/></span><div><strong>Transfer ready</strong><small>Saved to CopyCloud</small></div></div>
    <p>Open CopyCloud on your other device and enter this code.</p><div className="ts-code" aria-label="Transfer code">{transfer.code}</div>
    <button className="ts-action" onClick={()=>void copyValue(transfer.code,"Code copied")}><Copy size={17}/> Copy code</button>
    <div className="ts-share-actions"><button onClick={()=>void copyValue(url,"Link copied")}><Link2 size={18}/> Copy link</button><button onClick={()=>setShowQR(!showQR)} aria-expanded={showQR}><QrCode size={18}/> {showQR?"Hide QR":"Show QR"}</button></div>
    {showQR&&<div className="ts-qr"><QRCode value={url} size={160} bgColor="#fff" fgColor="#1c1b18"/><small>Scan with your device camera</small></div>}
    <div className="ts-divider"/><div className="ts-note"><Clock3 size={16}/> Available for 24 hours</div>
    <button className="ts-quiet" onClick={onReset}><RotateCcw size={16}/> Start another transfer</button>
  </section>;
}
export function SendStudio(){
  const [text,setText]=useState("");
  const [files,setFiles]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [drag,setDrag]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0});
  const [transfer,setTransfer]=useState<Transfer|null>(null);
  const [error,setError]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const busyRef=useRef(false);
  const reduced=useReducedMotion();
  const type=draftType(text,files);
  const bytes=draftBytes(text,files);
  const ready=(!!text.trim()||files.length>0)&&bytes<=MAX_TRANSFER_BYTES;
  useEffect(()=>()=>{if(preview?.url.startsWith("blob:"))URL.revokeObjectURL(preview.url)},[preview]);
  const addFiles=(incoming:File[])=>{
    if(busyRef.current||transfer)return;
    if(!incoming.length)return;
    setError("");
    setFiles(old=>{const next=[...old];for(const f of incoming)if(!next.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))next.push(f);return next});
  };
  const reset=()=>{setTransfer(null);setText("");setFiles([]);setError("");setProgress({done:0,total:0});};
  async function send(){
    if(!ready||busyRef.current||transfer)return;
    busyRef.current=true;setBusy(true);setError("");setProgress({done:0,total:files.length});
    try{setTransfer(await createTransfer({text,files},(done,total)=>setProgress({done,total})));toast.success("Transfer created")}
    catch(e){setError(errorMessage(e,"Transfer failed. Try again."))}
    finally{busyRef.current=false;setBusy(false)}
  }
  return <section className="ts-page ed-width">
    <StudioHeader kicker="WORKSPACE / SEND" title="What are we sending?" description="Write a message, attach files, or combine both. Everything travels under one code."><Link className="ts-link" to="/receive">Receiving instead? <ArrowDownLeft size={18}/></Link></StudioHeader>
    <div className="ts-grid">
      <div className="ts-composer">
        <div className="ts-section-label"><span>01</span><strong>Prepare your transfer</strong><small>{transfer?"Complete":busy?"In progress":"Draft"}</small></div>
        <input type="file" multiple hidden ref={fileInput} onChange={e=>{addFiles(Array.from(e.currentTarget.files||[]));e.currentTarget.value=""}}/>
        <div className={"ts-canvas ts-unified"+(drag?" dragging":"")} onDragOver={e=>{e.preventDefault();if(!busy&&!transfer)setDrag(true)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false)}} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(Array.from(e.dataTransfer.files))}}>
          <div className="ts-canvas-bar"><span><FileText size={17}/> Message <small>Optional with files</small></span><button disabled={busy||!!transfer} onClick={async()=>{try{setText(await navigator.clipboard.readText());setError("")}catch{toast.error("Use your device's paste shortcut")}}}><Clipboard size={16}/> Paste</button><button disabled={!text||busy||!!transfer} onClick={()=>setText("")} aria-label="Clear text"><Trash2 size={16}/></button></div>
          <textarea aria-label="Transfer message" spellCheck={false} placeholder="Write a message, paste a link or drop in a code snippet..." value={text} disabled={busy||!!transfer} onChange={e=>{setText(e.target.value);setError("")}}/>
          <div className="ts-message-count">{text.length.toLocaleString()} characters</div>
          <div className="ts-attachments"><div className="ts-attachment-head"><div><FolderOpen size={19}/><span>Attachments <small>{files.length?files.length+" added":"Optional"}</small></span></div><button disabled={busy||!!transfer} onClick={()=>fileInput.current?.click()}><Plus size={16}/> Add files</button></div>
            <AnimatePresence initial={false}>{files.length===0?<motion.button key="empty" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="ts-attach-drop" disabled={busy||!!transfer} onClick={()=>fileInput.current?.click()}><UploadCloud size={28} strokeWidth={1.5}/><span><strong>Drop files anywhere here</strong><small>or browse to attach files</small></span><Plus size={18}/></motion.button>:<motion.div key="files" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="ts-file-list">{files.map((f,i)=><motion.article layout={!reduced} key={f.name+"-"+f.lastModified+"-"+i} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}}><span className="ts-file-icon"><FileGlyph name={f.name}/></span><div><strong>{f.name}</strong><small>{formatFileSize(f.size)}</small></div>{isPreviewable(f.name)&&<button className="ts-icon" aria-label={"Preview "+f.name} onClick={()=>{const kind=previewKind(f.name);if(kind)setPreview({name:f.name,kind,url:URL.createObjectURL(f)})}}><Eye size={17}/></button>}<button className="ts-icon" disabled={busy||!!transfer} aria-label={"Remove "+f.name} onClick={()=>setFiles(old=>old.filter((_,j)=>j!==i))}><X size={17}/></button></motion.article>)}</motion.div>}</AnimatePresence>
          </div>
          <div className="ts-canvas-footer"><span>{text.trim()&&files.length?"Message + files":files.length?files.length+" file(s)":text.trim()?"Message only":"Empty draft"}</span><span className={bytes>MAX_TRANSFER_BYTES?"ts-error":""}>{formatFileSize(bytes)} / 40 MB attachments</span></div>
        </div>
        <div className="ts-composer-foot"><span><Cloud size={16}/> Temporary cloud transfer</span>{!transfer&&<button disabled={busy||(!text&&!files.length)} onClick={reset}>Clear draft</button>}</div>
      </div>
      <aside className="ts-inspector"><div className="ts-section-label"><span>02</span><strong>Share</strong><small>{transfer?"Ready":"Next step"}</small></div>
        {transfer?<Receipt transfer={transfer} onReset={reset}/>:<div className="ts-inspector-inner"><div className="ts-share-art"><span><FileText size={26}/></span><i/><span><QrCode size={28}/></span></div><h2>Ready to move?</h2><p>Create a short code and send it to your other device.</p><div className="ts-summary"><div><span>Content</span><strong>{type==="mixed"?"Message + files":files.length?files.length+" file(s)":"Message"}</strong></div><div><span>Message</span><strong>{text.trim()?text.length.toLocaleString()+" chars":"None"}</strong></div><div><span>Attachments</span><strong>{files.length?files.length+" · "+formatFileSize(bytes):"None"}</strong></div><div><span>Available for</span><strong>24 hours</strong></div></div>
        {busy&&<div className="ts-progress"><progress max={Math.max(1,progress.total)} value={files.length?progress.done:undefined}/><small>{files.length?"Uploaded "+progress.done+" of "+progress.total+" items":"Creating your code…"}</small></div>}
        {error&&<p role="alert" className="ts-error">{error}</p>}
        <button className="ts-action" disabled={!ready||busy} onClick={()=>void send()}>{busy?"Creating transfer…":"Create transfer"}<ArrowRight size={18}/></button><div className="ts-note"><Clock3 size={15}/> No account required</div></div>}
      </aside>
    </div>
    <div className="ts-bottom-links"><Link to="/history"><Clock3 size={17}/> Recent transfers <ArrowUpRight size={15}/></Link><Link to="/how-it-works">How it works <ArrowUpRight size={15}/></Link></div>
    {preview&&<PreviewDialog preview={preview} onClose={()=>setPreview(null)}/>}
  </section>;
}
export function ReceiveStudio({prefill}:{prefill?:string}){
  const [code,setCode]=useState(prefill||"");
  const [result,setResult]=useState<Transfer|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [downloading,setDownloading]=useState<string|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const seq=useRef(0);
  const fetchTransfer=async(value:string)=>{
    const key=++seq.current;setLoading(true);setError("");setResult(null);
    try{const data=await receiveTransfer(value);if(key===seq.current)setResult(data)}
    catch(e){if(key===seq.current)setError(errorMessage(e,"Could not find this transfer."))}
    finally{if(key===seq.current)setLoading(false)}
  };
  useEffect(()=>{if(prefill){setCode(prefill);void fetchTransfer(prefill)}return()=>{seq.current++}},[prefill]);
  async function download(path?:string){
    if(!result||downloading)return;
    setDownloading(path||"zip");
    try{
      if(path){const file=result.files.find(f=>f.path===path);if(!file)throw Error("Missing file");const res=await fetch(file.url);if(!res.ok)throw Error("Download failed");saveBlob(await res.blob(),file.name)}
      else{const zip=new JSZip();if(result.type==="mixed")zip.file("CopyCloud-message.txt",result.content);for(const [index,file] of result.files.entries()){const res=await fetch(file.url);if(!res.ok)throw Error("Download failed: "+file.name);let name=file.name;if(zip.file(name))name=(index+1)+"-"+name;zip.file(name,await res.blob())}saveBlob(await zip.generateAsync({type:"blob"}),"copycloud-"+result.code+".zip")}
      toast.success("Download ready");
    }catch(e){toast.error(errorMessage(e,"Download failed."))}finally{setDownloading(null)}
  }
  const externalLink=(()=>{if(!result||!result.content)return null;try{const url=new URL(result.content.trim());return ["http:","https:"].includes(url.protocol)?url.href:null}catch{return null}})();
  return <section className="ts-page ed-width ts-receive-page">
    <StudioHeader kicker="WORKSPACE / RECEIVE" title="Pick up where you left off." description="Enter the code from the sending device. Your content will appear here."><Link className="ts-link" to="/workspace">Send instead <ArrowUpRight size={18}/></Link></StudioHeader>
    <div className="ts-receive-grid"><form className="ts-inbox" onSubmit={e=>{e.preventDefault();if(!loading&&code.length===6)void fetchTransfer(code)}}><div className="ts-section-label"><span>01</span><strong>Find a transfer</strong></div><div className="ts-inbox-content"><div className="ts-receive-symbol"><ArrowDownLeft size={35} strokeWidth={1.4}/></div><label htmlFor="ts-receive-code">Transfer code</label><input id="ts-receive-code" value={code} maxLength={6} placeholder="ABC123" spellCheck={false} autoComplete="off" autoCapitalize="characters" onChange={e=>{setCode(cleanCode(e.target.value));setError("")}} disabled={loading}/><button type="button" className="ts-quiet" disabled={loading} onClick={async()=>{try{setCode(cleanCode(await navigator.clipboard.readText()));setError("")}catch{toast.error("Use your device's paste shortcut")}}}><Clipboard size={16}/> Paste code</button><button className="ts-action" type="submit" disabled={loading||code.length!==6}>{loading?"Finding transfer…":"Find content"}<ArrowRight size={18}/></button>{error&&<p role="alert" className="ts-error">{error}</p>}</div></form>
      <div className="ts-received"><div className="ts-section-label"><span>02</span><strong>Received content</strong>{result&&<small>{result.code}</small>}</div>{!result?<div className="ts-empty"><Cloud size={47} strokeWidth={1.25}/><h2>{loading?"Looking for your transfer…":"Your inbox is ready."}</h2><p>{loading?"Checking CopyCloud for this code.":"Once a valid code is entered, your text or files will be shown here."}</p></div>:<div className="ts-result"><div className="ts-result-status"><Check size={18}/> Transfer found <span>{result.type==="mixed"?"Message + "+result.files.length+" files":result.type==="text"?"Text":result.files.length+" files"}</span></div>{result.content&&<><div className="ts-received-label"><FileText size={17}/> Message</div><pre>{result.content}</pre><div className="ts-result-actions"><button className="ts-action" onClick={()=>void copyValue(result.content,"Text copied")}><Copy size={17}/> Copy text</button>{externalLink&&<a className="ts-link" href={externalLink} target="_blank" rel="noopener noreferrer">Open link <ArrowUpRight size={16}/></a>}</div></>}{result.files.length>0&&<><div className="ts-received-label"><FolderOpen size={17}/> Attachments</div><div className="ts-file-list">{result.files.map(f=><article key={f.path}><span className="ts-file-icon"><FileGlyph name={f.name}/></span><div><strong>{f.name}</strong><small>Ready to download</small></div>{isPreviewable(f.name)&&<button className="ts-icon" aria-label={"Preview "+f.name} onClick={()=>{const kind=previewKind(f.name);if(kind)setPreview({name:f.name,url:f.url,kind})}}><Eye size={17}/></button>}<button disabled={!!downloading} className="ts-icon" aria-label={"Download "+f.name} onClick={()=>void download(f.path)}><Download size={17}/></button></article>)}</div>{(result.files.length>1||result.type==="mixed")&&<button disabled={!!downloading} className="ts-action" onClick={()=>void download()}><Download size={18}/> {downloading?"Preparing download…":"Download all as ZIP"}</button>}</>}</div>}</div>
    </div><div className="ts-bottom-links"><Link to="/history"><Clock3 size={17}/> Recent transfers <ArrowUpRight size={15}/></Link><Link to="/workspace">Create a transfer <ArrowUpRight size={15}/></Link></div>{preview&&<PreviewDialog preview={preview} onClose={()=>setPreview(null)}/>}
  </section>;
}
export function HistoryStudio(){
  const [items,setItems]=useState<HistoryItem[]>(()=>{try{return getHistory()}catch{return []}});
  const [filter,setFilter]=useState<"all"|"send"|"retrieve">("all");
  const shown=items.filter(i=>filter==="all"||i.action===filter);
  return <section className="ts-page ed-width"><StudioHeader kicker="WORKSPACE / HISTORY" title="Your recent activity." description="Transfers from this browser. History stays on this device."><button className="ts-link" disabled={!items.length} onClick={()=>{if(window.confirm("Clear local transfer history?")){try{clearHistoryStore();setItems([]);window.dispatchEvent(new Event('cc-studio-history'));toast.success("History cleared")}catch{toast.error("Could not clear history")}}}}><Trash2 size={17}/> Clear history</button></StudioHeader><div className="ts-history"><div className="ts-history-top"><strong>{items.length} transfers</strong><div>{(["all","send","retrieve"] as const).map(f=><button key={f} className={filter===f?"active":""} onClick={()=>setFilter(f)}>{f==="all"?"All":f==="send"?"Sent":"Received"}</button>)}</div></div>{!shown.length?<div className="ts-empty"><Clock3 size={44} strokeWidth={1.4}/><h2>No transfers yet.</h2><p>Send or receive something to see it here.</p><Link className="ts-link" to="/workspace">Start a transfer <ArrowRight size={16}/></Link></div>:<div className="ts-history-list">{shown.map((item,i)=><article key={item.code+"-"+item.action+"-"+i}><span className="ts-file-icon">{item.contentType==="text"?<FileText size={20}/>:<FolderOpen size={20}/>}</span><div><strong>{item.preview||item.contentType}</strong><small>{item.code} · {item.action==="send"?"Sent":"Received"} · {new Date(item.ts).toLocaleString()}</small></div><Link to={"/receive?code="+encodeURIComponent(item.code)} className="ts-link">Open <ArrowUpRight size={16}/></Link></article>)}</div>}</div></section>;
}
