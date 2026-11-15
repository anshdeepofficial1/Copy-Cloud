import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowDown, ArrowUp, ArrowRight, ArrowUpRight, Check, Clipboard, Clock3, Cloud, Copy, Download, Eye, File, FileText, FolderOpen, Image, Pencil, Search, Wrench, Link2, Plus, QrCode, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import QRCode from "react-qr-code";
import JSZip from "jszip";
import { toast } from "sonner";
import { clearHistoryStore, fileKind, formatFileSize, getHistory, type HistoryItem } from "../../lib/supabase";
import { cleanCode, createTransfer, draftType, draftBytes, errorMessage, fetchVerifiedFile, isPreviewable, MAX_MESSAGE_BYTES, MAX_TRANSFER_BYTES, receiveTransfer, shareLink, type Transfer, type TransferType } from "./transferService";
import "../../styles/transfer-studio.css";
import "../../styles/workspace-tools.css";
import { DRAFT_PREF, draftPreference, readDraft, saveDraft, clearDraft } from "./draftStore";
import { peerFragment, PEER_MAX_BYTES } from "./peerTransport";
import { secureStatus, secureLink, secureFragment, decodeEnvelope, prepareSecureUpload, uploadSecure, receiveSecure, revokeSecure, secureOwnerStatus, type SecureUploadSession } from "./secureClient";
import { attachmentPath, renameAttachment, readDrop, findDuplicateIndexes, uniqueZipPath, type WorkspaceFile } from "./attachmentUtils";

const PdfPreview = lazy(() => import("./PdfPreview"));
const LocalFileTools = lazy(() => import("./LocalFileTools"));
const Markdown = lazy(() => import("react-markdown"));
const PeerSender = lazy(() => import("./PeerTransfer").then(m=>({default:m.PeerSender})));
const PeerReceiver = lazy(() => import("./PeerTransfer").then(m=>({default:m.PeerReceiver})));

type Preview = { name:string; url:string; kind:"image"|"video"|"audio"|"pdf"|"text" };
function previewKind(name:string):Preview["kind"]|undefined {
  const kind=fileKind(name);
  if(kind==="image"||kind==="video") return kind;
  if(/\.pdf$/i.test(name))return "pdf";
  if(/\.(mp3|wav|ogg|m4a)$/i.test(name))return "audio";
  if(/\.(txt|md|json|csv|log|js|ts|py|html|css|xml|yaml|yml|sql)$/i.test(name))return "text";
}
async function copyValue(value:string,message:string) {
  try { await navigator.clipboard.writeText(value);toast.success(message); } catch { toast.error("Clipboard unavailable. Select and copy the content manually."); }
}
function saveBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function TextPreview({url}:{url:string}){
  const [value,setValue]=useState("");const [error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();void fetch(url,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error("Could not open text file");const b=await r.blob();if(b.size>1024*1024)throw Error("Text preview is limited to 1 MB. Download to read the full file.");setValue(await b.text())}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[url]);
  return <pre className="ts-text-preview">{error||value||"Loading text…"}</pre>;
}
function PreviewDialog({preview,onClose}:{preview:Preview;onClose:()=>void}) {
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const prev=document.activeElement as HTMLElement|null;close.current?.focus();const esc=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose()};document.addEventListener("keydown",esc);return()=>{document.removeEventListener("keydown",esc);prev?.focus()}},[onClose]);
  return <div className="ts-overlay" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={preview.name} className={"ts-modal"+(preview.kind==="pdf"?" ts-modal-pdf":"")} onClick={e=>e.stopPropagation()}><header><span>{preview.name}</span><button ref={close} className="ts-icon" aria-label="Close preview" onClick={onClose}><X size={20}/></button></header><div className="ts-media">{preview.kind==="image"?<img src={preview.url} alt={preview.name}/>:preview.kind==="video"?<video src={preview.url} controls autoPlay/>:preview.kind==="audio"?<audio src={preview.url} controls autoPlay/>:preview.kind==="text"?<TextPreview url={preview.url}/>:<Suspense fallback={<div className="ts-pdf-status">Loading PDF viewer…</div>}><PdfPreview key={preview.url} url={preview.url} name={preview.name}/></Suspense>}</div></section></div>;
}
function StudioHeader({kicker,title,description,children}:{kicker:string;title:string;description:string;children?:React.ReactNode}) {
  return <header className="ts-heading"><div><div className="ts-kicker"><span/> {kicker}</div><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}
function FileGlyph({name}:{name:string}) {
  return fileKind(name)==="image"?<Image size={21}/>:<File size={21}/>;
}
function Receipt({transfer,onReset}:{transfer:Transfer;onReset:()=>void}) {
  const [showQR,setShowQR]=useState(false);
  const url=transfer.secure?secureLink(transfer.code,transfer.secure.envelope):shareLink(transfer.code);
  const [revoked,setRevoked]=useState(false);
  const [revoking,setRevoking]=useState(false);
  const [claims,setClaims]=useState<number|null>(null);
  return <section className="ts-receipt"><div className="ts-receipt-status"><span><Check size={18}/></span><div><strong>Transfer ready</strong><small>Saved to CopyCloud</small></div></div>
    <p>{transfer.secure?"Share the full private link or the code and access key. The code alone cannot decrypt this transfer.":"Open CopyCloud on your other device and enter this code. Ordinary cloud transfers are not end-to-end encrypted."}</p><div className="ts-code" aria-label="Transfer code">{transfer.code}</div>
    <button className="ts-action" disabled={revoked} onClick={()=>void copyValue(transfer.code,"Code copied")}><Copy size={17}/> Copy code</button>
    <div className="ts-share-actions"><button disabled={revoked} onClick={()=>void copyValue(url,"Link copied")}><Link2 size={18}/> Copy link</button><button disabled={revoked} onClick={()=>setShowQR(!showQR)} aria-expanded={showQR}><QrCode size={18}/> {showQR?"Hide QR":"Show QR"}</button></div>
    {showQR&&!revoked&&<div className="ts-qr"><QRCode value={url} size={160} bgColor="#fff" fgColor="#1c1b18"/><small>Scan with your device camera</small></div>}
    {transfer.secure&&<div className="ts-private-receipt"><button className="ts-quiet" disabled={revoked} onClick={()=>void copyValue(transfer.secure!.envelope,"Secure access key copied")}><Copy size={15}/> Copy access key</button><button className="ts-quiet" disabled={revoked||revoking} onClick={async()=>{try{const status=await secureOwnerStatus(transfer.secure!.id,transfer.secure!.owner!);setClaims(status.claims);if(status.state==="revoked")setRevoked(true)}catch(e){toast.error(errorMessage(e,"Could not check status"))}}}>Check access count {claims===null?"":claims+" / "+transfer.secure.maxClaims}</button><button className="ts-quiet" disabled={revoked||revoking} onClick={async()=>{if(!window.confirm("Revoke this transfer? Recipients cannot start new downloads."))return;setRevoking(true);try{const r=await revokeSecure(transfer.secure!.id,transfer.secure!.owner!);setRevoked(r.revoked);setShowQR(false);toast.success("Transfer revoked")}catch(e){toast.error(errorMessage(e,"Could not revoke transfer"))}finally{setRevoking(false)}}}>{revoked?"Revoked":revoking?"Revoking…":"Revoke transfer"}</button></div>}
    {typeof navigator.share==="function"&&!revoked&&<button className="ts-quiet" onClick={()=>void navigator.share({title:"CopyCloud transfer",url}).catch(()=>{})}>Share using device</button>}
    <div className="ts-divider"/><div className="ts-note"><Clock3 size={16}/> {revoked?"Revoked":transfer.secure?"Expires "+new Date(transfer.secure.expiresAt).toLocaleString():"Available for 24 hours"}</div>
    <button className="ts-quiet" onClick={onReset}><RotateCcw size={16}/> Start another transfer</button>
  </section>;
}
export function SendStudio(){
  const [text,setText]=useState("");
  const [files,setFiles]=useState<WorkspaceFile[]>([]);
  const [rememberDraft,setRememberDraft]=useState(draftPreference);
  const [draftLoaded,setDraftLoaded]=useState(false);
  const [draftError,setDraftError]=useState("");
  useEffect(()=>{let active=true;if(draftPreference())void readDraft().then(saved=>{if(active&&saved){setText(old=>old||saved.text);setFiles(old=>old.length?old:saved.files)}}).catch(()=>{if(active)setDraftError("Saved draft could not be restored.")}).finally(()=>{if(active)setDraftLoaded(true)});else setDraftLoaded(true);return()=>{active=false}},[]);
  const [showTools,setShowTools]=useState(false);
  const [markdown,setMarkdown]=useState(false);
  const [checkingDuplicates,setCheckingDuplicates]=useState(false);
  const [privateConfig,setPrivateConfig]=useState<Awaited<ReturnType<typeof secureStatus>>>({enabled:false});
  const [mode,setMode]=useState<"legacy"|"private"|"direct"|"nearby">("legacy");
  const [peerActive,setPeerActive]=useState(false);
  const peerMode=mode==="direct"||mode==="nearby";
  const [options,setOptions]=useState({name:"",description:"",minutes:60,maxClaims:20,password:""});
  const [securePending,setSecurePending]=useState(false);
  const [secureBytes,setSecureBytes]=useState({bytes:0,totalBytes:0});
  const secureSession=useRef<SecureUploadSession|null>(null);
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>{let active=true;void secureStatus().then(s=>{if(active){setPrivateConfig(s);if(s.enabled)setMode(current=>current==="legacy"?"private":current)}});return()=>{active=false;abort.current?.abort()}},[]);
  const folderInput=useRef<HTMLInputElement>(null);
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
  useEffect(()=>{if(!draftLoaded||!rememberDraft)return;const timer=setTimeout(()=>{void (transfer?clearDraft():saveDraft(text,files)).catch(()=>setDraftError("Unable to save draft on this device."))},400);return()=>clearTimeout(timer)},[text,files,transfer,draftLoaded,rememberDraft]);
  const ready=(!!text.trim()||files.length>0)&&bytes<=(peerMode?PEER_MAX_BYTES:MAX_TRANSFER_BYTES)&&new Blob([text]).size<=MAX_MESSAGE_BYTES&&files.length<=(peerMode?100:500);
  useEffect(()=>()=>{if(preview?.url.startsWith("blob:"))URL.revokeObjectURL(preview.url)},[preview]);
  const addFiles=(incoming:File[])=>{
    if(busyRef.current||transfer||secureSession.current||peerActive)return;
    if(!incoming.length)return;
    setError("");
    setFiles(old=>{const next=[...old,...incoming];return next.slice(0,500)});
    if(files.length+incoming.length>500)toast.error("Only the first 500 attachments were added.");
  };
  const moveFile=(index:number,delta:number)=>setFiles(old=>{const copy=[...old];const next=index+delta;if(next<0||next>=copy.length)return old;[copy[index],copy[next]]=[copy[next],copy[index]];return copy});
  const reset=()=>{void clearDraft().catch(()=>{});setTransfer(null);setText("");setFiles([]);setError("");setProgress({done:0,total:0});setSecurePending(false);secureSession.current=null;setOptions(o=>({...o,password:""}));};
  async function send(){
    if(!ready||busyRef.current||transfer)return;
    busyRef.current=true;setBusy(true);setError("");setProgress({done:0,total:files.length});
    try{
      if(mode==="private"&&privateConfig.enabled){
        const controller=new AbortController();abort.current=controller;
        if(!secureSession.current){secureSession.current=await prepareSecureUpload(text,files,options,controller.signal);setSecurePending(true)}
        const value=await uploadSecure(secureSession.current,privateConfig,p=>{setProgress({done:p.done,total:p.total});setSecureBytes({bytes:p.bytes,totalBytes:p.totalBytes})},controller.signal);
        secureSession.current=null;setSecurePending(false);setTransfer(value);setOptions(o=>({...o,password:""}));
      }else setTransfer(await createTransfer({text,files},(done,total)=>setProgress({done,total})));
      void clearDraft().catch(()=>{});toast.success("Transfer created")
    }
    catch(e){setError(errorMessage(e,"Transfer failed. Try again."))}
    finally{busyRef.current=false;setBusy(false);abort.current=null}
  }
  async function discardPrivate(){
    const session=secureSession.current;if(!session)return;
    if(busy)return;
    try{if(session.reserved)await revokeSecure(session.id,session.owner);secureSession.current=null;setSecurePending(false);setError("");setProgress({done:0,total:0});setSecureBytes({bytes:0,totalBytes:0})}
    catch(e){setError(errorMessage(e,"Could not revoke upload. Try again."))}
  }
  return <section className="ts-page ed-width">
    <StudioHeader kicker="WORKSPACE / SEND" title="What are we sending?" description="Write a message, attach files, or combine both. Everything travels under one code."><Link className="ts-link" to="/receive">Receiving instead? <ArrowDownLeft size={18}/></Link></StudioHeader>
    <div className="ts-grid">
      <div className="ts-composer">
        <div className="ts-section-label"><span>01</span><strong>Prepare your transfer</strong><small>{transfer?"Complete":busy?"In progress":"Draft"}</small></div>
        <input type="file" multiple hidden ref={folderInput} {...({webkitdirectory:"",directory:""} as any)} onChange={e=>{addFiles(Array.from(e.currentTarget.files||[]));e.currentTarget.value=""}}/><input type="file" multiple hidden ref={fileInput} onChange={e=>{addFiles(Array.from(e.currentTarget.files||[]));e.currentTarget.value=""}}/>
        <div className={"ts-canvas ts-unified"+(drag?" dragging":"")} onDragOver={e=>{e.preventDefault();if(!busy&&!transfer&&!securePending&&!peerActive)setDrag(true)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false)}} onPaste={e=>{const pasted=Array.from(e.clipboardData.files);if(pasted.length&&!busy&&!transfer&&!securePending&&!peerActive){e.preventDefault();addFiles(pasted)}}} onDrop={e=>{e.preventDefault();setDrag(false);if(!busy&&!transfer&&!securePending&&!peerActive)void readDrop(e.dataTransfer).then(addFiles).catch(e=>setError(errorMessage(e,"Could not read folder.")))}}>
          <div className="ts-canvas-bar"><span><FileText size={17}/> Message <small>Optional with files</small></span><button disabled={busy||!!transfer||securePending||peerActive} onClick={async()=>{try{setText(await navigator.clipboard.readText());setError("")}catch{toast.error("Use your device's paste shortcut")}}}><Clipboard size={16}/> Paste</button><button disabled={!text||busy||!!transfer||securePending||peerActive} onClick={()=>setText("")} aria-label="Clear text"><Trash2 size={16}/></button></div>
          <div className="ts-text-tools"><button disabled={busy||!!transfer||securePending||peerActive||!text.trim()} onClick={()=>{try{setText(JSON.stringify(JSON.parse(text),null,2));toast.success("Valid JSON formatted")}catch{toast.error("This is not valid JSON")}}}>Format JSON</button><button aria-pressed={markdown} disabled={!text.trim()} onClick={()=>setMarkdown(v=>!v)}>{markdown?"Edit text":"Markdown preview"}</button></div>{markdown?<div className="ts-markdown"><Suspense fallback={<span>Loading preview…</span>}><Markdown skipHtml components={{img:()=>null,a:({children})=><span>{children}</span>}}>{text}</Markdown></Suspense></div>:<textarea aria-label="Transfer message" spellCheck={false} placeholder="Write a message, paste a link or drop in a code snippet..." value={text} disabled={busy||!!transfer||securePending||peerActive} onChange={e=>{setText(e.target.value);setError("")}}/>}
          <div className="ts-message-count">{text.length.toLocaleString()} characters · {formatFileSize(new Blob([text]).size)} / 256 KB</div>
          <div className="ts-attachments"><div className="ts-attachment-head"><div><FolderOpen size={19}/><span>Attachments <small>{files.length?files.length+" added":"Optional"}</small></span></div><div className="ts-attachment-actions"><button disabled={busy||!!transfer||securePending||peerActive} onClick={()=>folderInput.current?.click()}>Add folder</button><button disabled={busy||!!transfer||securePending||peerActive} onClick={()=>fileInput.current?.click()}><Plus size={16}/> Add files</button></div></div>{files.length>0&&<div className="ts-text-tools"><button disabled={busy||!!transfer||securePending||peerActive} onClick={()=>setShowTools(true)}><Wrench size={15}/> File tools</button><button disabled={busy||!!transfer||securePending||peerActive||checkingDuplicates} onClick={async()=>{setCheckingDuplicates(true);try{const indexes=await findDuplicateIndexes(files);if(indexes.length&&window.confirm("Remove "+indexes.length+" byte-identical duplicate(s)?"))setFiles(old=>old.filter((_,i)=>!indexes.includes(i)));else if(!indexes.length)toast.success("No duplicate files found")}catch(e){toast.error(errorMessage(e,"Could not check duplicates"))}finally{setCheckingDuplicates(false)}}}>{checkingDuplicates?"Checking…":"Find duplicates"}</button></div>}
            <AnimatePresence initial={false}>{files.length===0?<motion.button key="empty" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="ts-attach-drop" disabled={busy||!!transfer||securePending||peerActive} onClick={()=>fileInput.current?.click()}><UploadCloud size={28} strokeWidth={1.5}/><span><strong>Drop files anywhere here</strong><small>or browse to attach files</small></span><Plus size={18}/></motion.button>:<motion.div key="files" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="ts-file-list">{files.map((f,i)=><motion.article layout={!reduced} key={f.name+"-"+f.lastModified+"-"+i} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}}><span className="ts-file-icon"><FileGlyph name={f.name}/></span><div><strong title={attachmentPath(f)}>{attachmentPath(f)}</strong><small>{formatFileSize(f.size)}</small></div><button className="ts-icon" disabled={busy||!!transfer||securePending||peerActive||i===0} aria-label={"Move "+f.name+" up"} onClick={()=>moveFile(i,-1)}><ArrowUp size={15}/></button><button className="ts-icon" disabled={busy||!!transfer||securePending||peerActive||i===files.length-1} aria-label={"Move "+f.name+" down"} onClick={()=>moveFile(i,1)}><ArrowDown size={15}/></button><button className="ts-icon" disabled={busy||!!transfer||securePending||peerActive} aria-label={"Rename "+f.name} onClick={()=>{const name=window.prompt("Rename attachment",f.name);if(name!==null)try{const renamed=renameAttachment(f,name);setFiles(old=>old.map((x,j)=>j===i?renamed:x))}catch(e){toast.error(errorMessage(e,"Invalid filename"))}}}><Pencil size={15}/></button>{isPreviewable(f.name)&&<button className="ts-icon" aria-label={"Preview "+f.name} onClick={()=>{const kind=previewKind(f.name);if(kind)setPreview({name:f.name,kind,url:URL.createObjectURL(f)})}}><Eye size={17}/></button>}<button className="ts-icon" disabled={busy||!!transfer||securePending||peerActive} aria-label={"Remove "+f.name} onClick={()=>setFiles(old=>old.filter((_,j)=>j!==i))}><X size={17}/></button></motion.article>)}</motion.div>}</AnimatePresence>
          </div>
          <div className="ts-canvas-footer"><span>{text.trim()&&files.length?"Message + files":files.length?files.length+" file(s)":text.trim()?"Message only":"Empty draft"}</span><span className={bytes>(peerMode?PEER_MAX_BYTES:MAX_TRANSFER_BYTES)?"ts-error":""}>{formatFileSize(bytes)} / {peerMode?"2 GB":"40 MB"}</span></div>
        </div>
        <div className="ts-composer-foot"><label className="ts-draft-pref"><input type="checkbox" checked={rememberDraft} onChange={e=>{const enabled=e.target.checked;setRememberDraft(enabled);setDraftError("");try{localStorage.setItem(DRAFT_PREF,enabled?"yes":"no")}catch{}if(!enabled)void clearDraft().catch(()=>setDraftError("Could not clear saved draft."))}}/> Remember unfinished draft on this device</label>{!transfer&&<button disabled={busy||securePending||peerActive||(!text&&!files.length)} onClick={reset}>Clear draft</button>}</div>{rememberDraft&&<p className="ts-draft-note">Stored locally for up to 24 hours (40 MB). Do not enable on shared devices. Passwords and pairing keys are never saved.</p>}{draftError&&<p role="alert" className="ts-error">{draftError}</p>}
      </div>
      <aside className="ts-inspector"><div className="ts-section-label"><span>02</span><strong>Share</strong><small>{transfer?"Ready":"Next step"}</small></div>
        {!transfer&&<div className="ts-security-options"><label>Transfer mode<select aria-label="Transfer mode" value={mode} disabled={busy||securePending||peerActive} onChange={e=>setMode(e.target.value as typeof mode)}>{privateConfig.enabled&&<option value="private">Private cloud</option>}<option value="legacy">Ordinary cloud</option><option value="direct">Direct (WebRTC)</option><option value="nearby">Nearby (local network)</option></select></label><small>{bytes>MAX_TRANSFER_BYTES?"Direct transfer is recommended for larger files, when both devices are online.":"Cloud is convenient when the receiver is offline. Direct avoids cloud storage."}</small></div>}{transfer?<Receipt transfer={transfer} onReset={reset}/>:peerMode?<Suspense fallback={<p>Loading peer transfer…</p>}><PeerSender key={mode} mode={mode} text={text} files={files} onActiveChange={setPeerActive}/></Suspense>:<div className="ts-inspector-inner"><div className="ts-share-art"><span><FileText size={26}/></span><i/><span><QrCode size={28}/></span></div><h2>Ready to move?</h2><p>{mode==="private"?"Encrypt content in this browser before uploading.":"Create a short code and send it to your other device."}</p><div className="ts-security-options">{mode==="private"&&privateConfig.enabled?<><label>Transfer name<input value={options.name} maxLength={120} disabled={busy||securePending} onChange={e=>setOptions(o=>({...o,name:e.target.value}))}/></label><label>Description<input value={options.description} maxLength={500} disabled={busy||securePending} onChange={e=>setOptions(o=>({...o,description:e.target.value}))}/></label><label>Expires after<select value={options.minutes} disabled={busy||securePending} onChange={e=>setOptions(o=>({...o,minutes:Number(e.target.value)}))}>{[[15,"15 minutes"],[60,"1 hour"],[360,"6 hours"],[1440,"24 hours"]].map(([n,label])=><option key={n} value={n}>{label}</option>)}</select></label><label>Access sessions<select value={options.maxClaims} disabled={busy||securePending} onChange={e=>setOptions(o=>({...o,maxClaims:Number(e.target.value)}))}>{[1,2,5,10,20,100].map(n=><option key={n} value={n}>{n===1?"One-time access":n+" sessions"}</option>)}</select></label><label>Optional password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} disabled={busy||securePending} value={options.password} onChange={e=>setOptions(o=>({...o,password:e.target.value}))}/></label><small>Share the full secure link and password separately. A recipient can retain downloaded copies.</small></>:<small>Ordinary cloud is not end-to-end encrypted. Do not send sensitive content.</small>}</div><div className="ts-summary"><div><span>Content</span><strong>{type==="mixed"?"Message + files":files.length?files.length+" file(s)":"Message"}</strong></div><div><span>Message</span><strong>{text.trim()?text.length.toLocaleString()+" chars":"None"}</strong></div><div><span>Attachments</span><strong>{files.length?files.length+" · "+formatFileSize(bytes):"None"}</strong></div><div><span>Available for</span><strong>{mode==="private"?options.minutes+" minutes":"24 hours"}</strong></div></div>
        {busy&&<div className="ts-progress"><progress max={mode==="private"?Math.max(1,secureBytes.totalBytes):Math.max(1,progress.total)} value={mode==="private"?secureBytes.bytes:files.length?progress.done:undefined}/><small>{mode==="private"?formatFileSize(secureBytes.bytes)+" / "+formatFileSize(secureBytes.totalBytes)+" encrypted chunks":files.length?"Uploaded "+progress.done+" of "+progress.total+" items":"Creating your code…"}</small></div>}
        {error&&<p role="alert" className="ts-error">{error}</p>}
        <button className="ts-action" disabled={!ready||busy} onClick={()=>void send()}>{busy?"Creating transfer…":securePending?"Resume encrypted upload":"Create transfer"}<ArrowRight size={18}/></button>{mode==="private"&&busy&&<button className="ts-quiet" onClick={()=>abort.current?.abort()}>Pause upload</button>}{securePending&&!busy&&<button className="ts-quiet" onClick={()=>void discardPrivate()}>Cancel and revoke upload</button>}<div className="ts-note"><Clock3 size={15}/> No account required</div></div>}
      </aside>
    </div>
    <div className="ts-bottom-links"><Link to="/history"><Clock3 size={17}/> Recent transfers <ArrowUpRight size={15}/></Link><Link to="/how-it-works">How it works <ArrowUpRight size={15}/></Link></div>
    {preview&&<PreviewDialog preview={preview} onClose={()=>setPreview(null)}/>}{showTools&&<Suspense fallback={<div className="ts-overlay">Loading file tools…</div>}><LocalFileTools files={files} onClose={()=>setShowTools(false)} onApply={output=>{addFiles(output);setShowTools(false)}}/></Suspense>}
  </section>;
}
export function ReceiveStudio({prefill}:{prefill?:string}){
  const [code,setCode]=useState(prefill||"");
  const [peer,setPeer]=useState(()=>!!peerFragment());
  const [accessKey,setAccessKey]=useState(secureFragment);
  const [password,setPassword]=useState("");
  const [showSecure,setShowSecure]=useState(()=>!!secureFragment());
  const [previewBusy,setPreviewBusy]=useState(false);
  const [result,setResult]=useState<Transfer|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [downloading,setDownloading]=useState<string|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  useEffect(()=>()=>{if(preview?.url.startsWith("blob:"))URL.revokeObjectURL(preview.url)},[preview]);
  const seq=useRef(0);
  const fetchTransfer=async(value:string)=>{
    const key=++seq.current;setLoading(true);setError("");setResult(null);
    try{const data=accessKey.trim()?await receiveSecure(value,accessKey,password):await receiveTransfer(value);if(key===seq.current){setResult(data);setPassword("")}}
    catch(e){if(key===seq.current)setError(errorMessage(e,"Could not find this transfer."))}
    finally{if(key===seq.current)setLoading(false)}
  };
  useEffect(()=>{if(prefill){setCode(prefill);const fragment=secureFragment();setAccessKey(fragment);setShowSecure(!!fragment);if(!fragment){void receiveTransfer(prefill).then(data=>{setResult(data);setError("")}).catch(e=>setError(errorMessage(e,"Could not find this transfer.")))}else setResult(null)}return()=>{seq.current++}},[prefill]);
  async function download(path?:string){
    if(!result||downloading)return;
    setDownloading(path||"zip");
    try{
      if(path){const file=result.files.find(f=>f.path===path);if(!file)throw Error("Missing file");saveBlob(await fetchVerifiedFile(file),file.name)}
      else{const zip=new JSZip();const used=new Set<string>();if(result.type==="mixed")zip.file(uniqueZipPath("CopyCloud-message.txt",used),result.content);for(const file of result.files){zip.file(uniqueZipPath(file.relativePath||file.name,used),await fetchVerifiedFile(file))}saveBlob(await zip.generateAsync({type:"blob"}),"copycloud-"+result.code+".zip")}
      toast.success("Download ready");
    }catch(e){toast.error(errorMessage(e,"Download failed."))}finally{setDownloading(null)}
  }
  const externalLink=(()=>{if(!result||!result.content)return null;try{const url=new URL(result.content.trim());return ["http:","https:"].includes(url.protocol)?url.href:null}catch{return null}})();
  if(peer)return <section className="ts-page ed-width ts-receive-page"><StudioHeader kicker="WORKSPACE / DIRECT" title="Receive from a device." description="Pair with an online sender instead of retrieving a cloud transfer."><button className="ts-link" onClick={()=>setPeer(false)}>Use cloud code</button></StudioHeader><Suspense fallback={<p>Loading peer receiver…</p>}><PeerReceiver/></Suspense></section>;
  return <section className="ts-page ed-width ts-receive-page">
    <StudioHeader kicker="WORKSPACE / RECEIVE" title="Pick up where you left off." description="Enter the code from the sending device. Your content will appear here."><div className="ts-receive-actions"><button className="ts-link" onClick={()=>setPeer(true)}>Receive directly</button><Link className="ts-link" to="/workspace">Send instead <ArrowUpRight size={18}/></Link></div></StudioHeader>
    <div className="ts-receive-grid"><form className="ts-inbox" onSubmit={e=>{e.preventDefault();if(!loading&&code.length===6)void fetchTransfer(code)}}><div className="ts-section-label"><span>01</span><strong>Find a transfer</strong></div><div className="ts-inbox-content"><div className="ts-receive-symbol"><ArrowDownLeft size={35} strokeWidth={1.4}/></div><label htmlFor="ts-receive-code">Transfer code</label><input id="ts-receive-code" value={code} maxLength={6} placeholder="ABC123" spellCheck={false} autoComplete="off" autoCapitalize="characters" onChange={e=>{setCode(cleanCode(e.target.value));setError("")}} disabled={loading}/><button type="button" className="ts-quiet" disabled={loading} onClick={async()=>{try{setCode(cleanCode(await navigator.clipboard.readText()));setError("")}catch{toast.error("Use your device's paste shortcut")}}}><Clipboard size={16}/> Paste code</button><button type="button" className="ts-quiet" onClick={()=>setShowSecure(v=>!v)}>{showSecure?"Hide secure access":"Use secure access key"}</button>{showSecure&&<div className="ts-security-options"><label>Secure access key<textarea value={accessKey} onChange={e=>setAccessKey(e.target.value)} placeholder="Paste the key or private link" rows={3}/></label><label>Password (if required)<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></label></div>}<button className="ts-action" type="submit" disabled={loading||code.length!==6}>{loading?"Finding transfer…":"Find content"}<ArrowRight size={18}/></button>{error&&<p role="alert" className="ts-error">{error}</p>}</div></form>
      <div className="ts-received"><div className="ts-section-label"><span>02</span><strong>Received content</strong>{result&&<small>{result.code}</small>}</div>{!result?<div className="ts-empty"><Cloud size={47} strokeWidth={1.25}/><h2>{loading?"Looking for your transfer…":"Your inbox is ready."}</h2><p>{loading?"Checking CopyCloud for this code.":"Once a valid code is entered, your text or files will be shown here."}</p></div>:<div className="ts-result">{result.name&&<h2>{result.name}</h2>}{result.description&&<p>{result.description}</p>}{result.secure&&<p className="ts-private-label">Decrypted in this browser · session expires {new Date(result.secure.expiresAt).toLocaleString()}</p>}<div className="ts-result-status"><Check size={18}/> Transfer found <span>{result.type==="mixed"?"Message + "+result.files.length+" files":result.type==="text"?"Text":result.files.length+" files"}</span></div>{result.content&&<><div className="ts-received-label"><FileText size={17}/> Message</div><pre>{result.content}</pre><div className="ts-result-actions"><button className="ts-action" onClick={()=>void copyValue(result.content,"Text copied")}><Copy size={17}/> Copy text</button>{externalLink&&<a className="ts-link" href={externalLink} target="_blank" rel="noopener noreferrer">Open link <ArrowUpRight size={16}/></a>}</div></>}{result.files.length>0&&<><div className="ts-received-label"><FolderOpen size={17}/> Attachments</div><div className="ts-file-list">{result.files.map(f=><article key={f.path}><span className="ts-file-icon"><FileGlyph name={f.name}/></span><div><strong title={f.relativePath||f.name}>{f.relativePath||f.name}</strong><small>{f.size===undefined?"Ready to download":formatFileSize(f.size)+" · integrity checked on download"}</small></div>{isPreviewable(f.name)&&<button className="ts-icon" aria-label={"Preview "+f.name} disabled={previewBusy} onClick={async()=>{const kind=previewKind(f.name);if(!kind)return;setPreviewBusy(true);try{const url=f.load?URL.createObjectURL(await fetchVerifiedFile(f)):f.url;setPreview({name:f.name,url,kind})}catch(e){toast.error(errorMessage(e,"Preview unavailable"))}finally{setPreviewBusy(false)}}}><Eye size={17}/></button>}<button disabled={!!downloading} className="ts-icon" aria-label={"Download "+f.name} onClick={()=>void download(f.path)}><Download size={17}/></button></article>)}</div>{(result.files.length>1||result.type==="mixed")&&<button disabled={!!downloading} className="ts-action" onClick={()=>void download()}><Download size={18}/> {downloading?"Preparing download…":"Download all as ZIP"}</button>}</>}</div>}</div>
    </div><div className="ts-bottom-links"><Link to="/history"><Clock3 size={17}/> Recent transfers <ArrowUpRight size={15}/></Link><Link to="/workspace">Create a transfer <ArrowUpRight size={15}/></Link></div>{preview&&<PreviewDialog preview={preview} onClose={()=>setPreview(null)}/>}
  </section>;
}
export function HistoryStudio(){
  const [items,setItems]=useState<HistoryItem[]>(()=>{try{return getHistory()}catch{return []}});
  const [filter,setFilter]=useState<"all"|"send"|"retrieve">("all");
  const [search,setSearch]=useState("");
  const shown=items.filter(i=>(filter==="all"||i.action===filter)&&[i.code,i.preview,i.contentType].some(v=>v.toLowerCase().includes(search.toLowerCase())));
  return <section className="ts-page ed-width"><StudioHeader kicker="WORKSPACE / HISTORY" title="Your recent activity." description="Transfers from this browser. History stays on this device."><button className="ts-link" disabled={!items.length} onClick={()=>{if(window.confirm("Clear local transfer history?")){try{clearHistoryStore();setItems([]);window.dispatchEvent(new Event('cc-studio-history'));toast.success("History cleared")}catch{toast.error("Could not clear history")}}}}><Trash2 size={17}/> Clear history</button></StudioHeader><div className="ts-history"><div className="ts-history-top"><strong>{items.length} transfers</strong><label className="ts-history-search"><Search size={17}/><input aria-label="Search transfer history" placeholder="Search transfers" value={search} onChange={e=>setSearch(e.target.value)}/></label><div>{(["all","send","retrieve"] as const).map(f=><button key={f} className={filter===f?"active":""} onClick={()=>setFilter(f)}>{f==="all"?"All":f==="send"?"Sent":"Received"}</button>)}</div></div>{!shown.length?<div className="ts-empty"><Clock3 size={44} strokeWidth={1.4}/><h2>No transfers yet.</h2><p>Send or receive something to see it here.</p><Link className="ts-link" to="/workspace">Start a transfer <ArrowRight size={16}/></Link></div>:<div className="ts-history-list">{shown.map((item,i)=><article key={item.code+"-"+item.action+"-"+i}><span className="ts-file-icon">{item.contentType==="text"?<FileText size={20}/>:<FolderOpen size={20}/>}</span><div><strong>{item.preview||item.contentType}</strong><small>{item.code} · {item.action==="send"?"Sent":"Received"} · {new Date(item.ts).toLocaleString()}</small></div><Link to={"/receive?code="+encodeURIComponent(item.code)} className="ts-link">Open <ArrowUpRight size={16}/></Link></article>)}</div>}</div></section>;
}
