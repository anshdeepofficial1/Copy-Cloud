import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { ArrowRight, Copy, Download, QrCode, Wifi, X } from "lucide-react";
import { toast } from "sonner";
import { formatFileSize } from "../../lib/supabase";
import { makeOffer, answerOffer, applyAnswer, peerOfferLink, peerFragment, makePayload, parseManifest, sendPayload, receivePayload, PEER_MEMORY_LIMIT, PEER_MAX_BYTES, type PeerLink, type PeerMode, type PeerManifest, type PeerProgress, type PeerResult } from "./peerTransport";
import type { WorkspaceFile } from "./attachmentUtils";

const message=(e:unknown)=>e instanceof Error?e.message:"Peer transfer failed.";
async function copy(value:string){try{await navigator.clipboard.writeText(value);toast.success("Copied")}catch{toast.error("Select and copy the token manually.")}}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function Progress({value}:{value:PeerProgress|null}){
  return value?<div className="ts-progress ts-peer-progress"><progress max={Math.max(1,value.total)} value={value.done}/><small>{formatFileSize(value.done)} / {formatFileSize(value.total)}</small><small>{formatFileSize(Math.round(value.speed))}/s{value.eta!==null?" · ~"+Math.ceil(value.eta)+" sec remaining":""}</small></div>:null;
}
export function PeerSender({mode,text,files,onActiveChange}:{mode:PeerMode;text:string;files:WorkspaceFile[];onActiveChange:(v:boolean)=>void}){
  const [phase,setPhase]=useState<"idle"|"creating"|"pairing"|"connecting"|"sending"|"done"|"error">("idle");
  const [offer,setOffer]=useState("");const [answer,setAnswer]=useState("");const [error,setError]=useState("");
  const [qr,setQr]=useState(false);const [paused,setPaused]=useState(false);const [value,setValue]=useState<PeerProgress|null>(null);
  const link=useRef<PeerLink|null>(null),payload=useRef<ReturnType<typeof makePayload>|null>(null),pause=useRef(false),run=useRef(0);
  useEffect(()=>()=>{run.current++;link.current?.close();onActiveChange(false)},[]);
  function reset(){
    run.current++;link.current?.close();link.current=null;payload.current=null;pause.current=false;setPaused(false);
    setPhase("idle");setOffer("");setAnswer("");setError("");setValue(null);setQr(false);onActiveChange(false);
  }
  async function start(){
    const id=++run.current;setError("");setPhase("creating");onActiveChange(true);
    try{payload.current=makePayload(text,files);const r=await makeOffer(mode);if(id!==run.current){r.link.close();return}link.current=r.link;setOffer(peerOfferLink(r.token));setPhase("pairing")}
    catch(e){if(id===run.current){setError(message(e));setPhase("error");onActiveChange(false)}}
  }
  async function connect(){
    if(!link.current||!payload.current||!answer.trim())return;
    const id=run.current;setPhase("connecting");setError("");
    try{
      await applyAnswer(link.current,answer);
      if(id!==run.current)return;setPhase("sending");
      await sendPayload(link.current,payload.current,p=>{if(id===run.current)setValue(p)},()=>pause.current);
      if(id===run.current){setPhase("done");onActiveChange(false);toast.success("Peer confirmed delivery")}
    }catch(e){if(id===run.current){setError(message(e));setPhase("error");onActiveChange(false);link.current?.close()}}
  }
  const ready=(!!text.trim()||files.length>0)&&files.length<=100&&files.reduce((n,f)=>n+f.size,0)+new Blob([text]).size<=PEER_MAX_BYTES;
  return <div className="ts-peer">
    <div className="ts-share-art"><span><Wifi size={29}/></span><i/><span><QrCode size={29}/></span></div>
    <h2>{mode==="nearby"?"Nearby pairing":"Direct transfer"}</h2>
    <p>{mode==="nearby"?"Local network candidates only. Connect both devices to the same network.":"Pair two online browsers for direct WebRTC transfer. Internet connections may require a relay that is not configured."}</p>
    <small>Pairing requires exchanging an offer and a response over a trusted channel. Files and text are encrypted between the paired browsers and do not enter cloud storage.</small>
    {phase==="idle"&&<button className="ts-action" disabled={!ready} onClick={()=>void start()}>Create pairing link <ArrowRight size={17}/></button>}
    {phase==="creating"&&<p role="status">Gathering network candidates…</p>}
    {phase==="pairing"&&<><label>1. Open this pairing link on the receiving device<textarea readOnly value={offer} aria-label="Pairing link"/></label><div className="ts-share-actions"><button onClick={()=>void copy(offer)}><Copy size={16}/> Copy link</button>{offer.length<1800&&<button onClick={()=>setQr(v=>!v)}><QrCode size={16}/> QR</button>}</div>{qr&&<div className="ts-qr"><QRCode value={offer} size={200} level="L"/></div>}<label>2. Paste the response from the receiver<textarea value={answer} onChange={e=>setAnswer(e.target.value)} aria-label="Pairing response" placeholder="Receiver's response token"/></label><button className="ts-action" disabled={!answer.trim()} onClick={()=>void connect()}>Connect and send <ArrowRight size={16}/></button></>}
    {phase==="connecting"&&<p role="status">Connecting paired devices…</p>}
    {phase==="sending"&&<><p role="status">{value?"Sending encrypted chunks…":"Waiting for receiver to accept…"}</p><Progress value={value}/><button className="ts-quiet" onClick={()=>{pause.current=!pause.current;setPaused(pause.current)}}>{paused?"Resume":"Pause"} transfer</button></>}
    {phase==="done"&&<p role="status" className="ts-private-label">Transfer complete. Receiver confirmed all bytes.</p>}
    {error&&<p role="alert" className="ts-error">{error}</p>}
    {phase!=="idle"&&<button className="ts-quiet" onClick={reset}><X size={16}/> {phase==="done"||phase==="error"?"Start again":"Cancel pairing / transfer"}</button>}
    <small>Keep both pages open. A disconnected session must be paired again; pause/resume works while the connection remains open.</small>
  </div>;
}
export function PeerReceiver(){
  const [offer,setOffer]=useState(peerFragment);const [answer,setAnswer]=useState("");
  const [phase,setPhase]=useState<"idle"|"pairing"|"waiting"|"accept"|"receiving"|"done"|"error">("idle");
  const [manifest,setManifest]=useState<PeerManifest|null>(null),[value,setValue]=useState<PeerProgress|null>(null),[result,setResult]=useState<PeerResult|null>(null),[error,setError]=useState("");
  const link=useRef<PeerLink|null>(null),run=useRef(0);
  const supportsDisk=typeof (window as any).showDirectoryPicker==="function";
  useEffect(()=>()=>{run.current++;link.current?.close()},[]);
  async function pair(){
    const id=++run.current;setPhase("pairing");setError("");setResult(null);
    try{
      const r=await answerOffer(offer);
      if(id!==run.current){r.link.close();return}
      link.current=r.link;setAnswer(r.token);setPhase("waiting");
      await r.link.open(5*60*1000);
      const incoming=parseManifest(await r.link.read("manifest"));
      if(id!==run.current)return;setManifest(incoming);setPhase("accept");
    }catch(e){if(id===run.current){setError(message(e));setPhase("error");link.current?.close()}}
  }
  async function accept(disk:boolean){
    if(!link.current||!manifest)return;
    const id=run.current;let root:any=null;
    try{
      if(disk){const selected=await (window as any).showDirectoryPicker({mode:"readwrite"});root=await selected.getDirectoryHandle("CopyCloud-"+link.current.id.slice(0,12),{create:true})}
      setPhase("receiving");setError("");
      const received=await receivePayload(link.current,manifest,root,p=>{if(id===run.current)setValue(p)});
      if(id===run.current){setResult(received);setPhase("done");toast.success("Received and verified")}
    }catch(e){if(id===run.current){setError(message(e));if(e instanceof DOMException&&e.name==="AbortError"&&phase==="accept")return;setPhase("error");link.current?.close()}}
  }
  function cancel(){run.current++;link.current?.close();link.current=null;setPhase("idle");setAnswer("");setManifest(null);setResult(null);setError("");setValue(null)}
  return <div className="ts-peer ts-peer-receive">
    <div className="ts-section-label"><span>01</span><strong>Pair with a sending device</strong></div>
    <h2>Receive directly.</h2><p>No cloud upload. Use the sender's private pairing link and return your response.</p>
    {phase==="idle"&&<><label>Pairing link or offer<textarea aria-label="Sender pairing link" value={offer} onChange={e=>setOffer(e.target.value)} placeholder="Paste the sender's link"/></label><button className="ts-action" disabled={!offer.trim()} onClick={()=>void pair()}>Generate response</button></>}
    {phase==="pairing"&&<p role="status">Preparing pairing response…</p>}
    {phase==="waiting"&&<><label>Copy this response back to the sender<textarea aria-label="Receiver response" readOnly value={answer}/></label><button className="ts-action" onClick={()=>void copy(answer)}><Copy size={16}/> Copy response</button><p role="status">Waiting for the sender to connect…</p></>}
    {phase==="accept"&&manifest&&<><h3>Incoming transfer</h3><p>{manifest.items.length} item(s) · {formatFileSize(manifest.bytes)}</p><ul className="ts-peer-items">{manifest.items.map(i=><li key={i.id}>{i.path} · {formatFileSize(i.size)}</li>)}</ul>{supportsDisk&&<button className="ts-action" onClick={()=>void accept(true)}>Accept and save to folder</button>}{manifest.bytes<=PEER_MEMORY_LIMIT&&<button className="ts-outline-button" onClick={()=>void accept(false)}>Accept in browser</button>}{manifest.bytes>PEER_MEMORY_LIMIT&&!supportsDisk&&<p role="alert" className="ts-error">This browser cannot stream to a folder. Receive a smaller transfer (40 MB or less), or use a supported desktop browser.</p>}</>}
    {phase==="receiving"&&<><p role="status">Receiving and verifying encrypted chunks…</p><Progress value={value}/></>}
    {phase==="done"&&result&&<><h3>Transfer complete</h3>{result.text&&<><pre className="ts-text-preview">{result.text}</pre><button className="ts-outline-button" onClick={()=>void copy(result.text)}>Copy message</button></>}{result.files.map((f,i)=><div className="ts-peer-file" key={i}><span>{f.path}</span>{f.stored?<small>Saved to folder</small>:<button className="ts-icon" aria-label={"Download "+f.name} onClick={()=>f.blob&&download(f.blob,f.name)}><Download size={17}/></button>}</div>)}</>}
    {error&&<p role="alert" className="ts-error">{error}</p>}
    {phase!=="idle"&&<button className="ts-quiet" onClick={cancel}>{phase==="done"||phase==="error"?"Receive another transfer":"Cancel"}</button>}
  </div>;
}
