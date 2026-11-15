import { useEffect,useRef,useState } from "react";
import { Camera, Image, X } from "lucide-react";
import jsQR from "jsqr";
function decode(source:CanvasImageSource,width:number,height:number){
  const canvas=document.createElement("canvas"),scale=Math.min(1,1600/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("Canvas unavailable");
  ctx.drawImage(source,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);
  return jsQR(data.data,data.width,data.height,{inversionAttempts:"attemptBoth"})?.data||"";
}
export default function QrScanner({onResult,onClose}:{onResult:(value:string)=>void;onClose:()=>void}){
  const [error,setError]=useState(""),[active,setActive]=useState(false),[busy,setBusy]=useState(false);
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
  const stop=()=>{if(timer.current)clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null};
  useEffect(()=>()=>{mounted.current=false;stop()},[]);
  function finish(value:string){stop();setActive(false);onResult(value)}
  async function start(){
    setError("");setBusy(true);try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error("Camera access is unavailable. Choose a QR image instead.");
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}});
      if(!mounted.current){media.getTracks().forEach(t=>t.stop());return}
      stream.current=media;setActive(true);if(!video.current)throw Error("Camera preview unavailable");video.current.srcObject=media;await video.current.play();
      const tick=()=>{if(!mounted.current||!stream.current||!video.current)return;try{const v=video.current;if(v.readyState>=2){const value=decode(v,v.videoWidth,v.videoHeight);if(value){finish(value);return}}}catch{}timer.current=setTimeout(tick,300)};tick();
    }catch(e){stop();setActive(false);setError(e instanceof Error?e.message:"Camera could not start.")}finally{if(mounted.current)setBusy(false)}
  }
  async function read(file:File){
    stop();setActive(false);setBusy(true);setError("");
    try{if(file.size>20*1024*1024)throw Error("QR images are limited to 20 MB.");const bitmap=await createImageBitmap(file);try{const value=decode(bitmap,bitmap.width,bitmap.height);if(!value)throw Error("No QR code detected. Choose a clear image.");finish(value)}finally{bitmap.close()}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Could not read QR image.")}finally{if(mounted.current)setBusy(false)}
  }
  return <div className="ts-overlay" onClick={onClose}><section className="ts-modal ts-qr-scanner" role="dialog" aria-modal="true" aria-label="Scan QR code" onClick={e=>e.stopPropagation()}><header><strong>Scan a CopyCloud QR</strong><button className="ts-icon" aria-label="Close scanner" onClick={onClose}><X size={20}/></button></header><video ref={video} hidden={!active} muted playsInline autoPlay/><p>Camera processing stays in this browser. No camera access until you start scanning.</p>{!active&&<button className="ts-action" disabled={busy} onClick={()=>void start()}><Camera size={18}/> Start camera</button>}<label className="ts-outline-button"><Image size={16}/> Choose QR image<input type="file" accept="image/*" hidden disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void read(f)}}/></label>{error&&<p role="alert" className="ts-error">{error}</p>}</section></div>;
}
