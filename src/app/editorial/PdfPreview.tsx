import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, Minus, Plus, RotateCcw } from "lucide-react";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({url,name}:{url:string;name:string}) {
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null);
  const [page,setPage]=useState(1);
  const [zoom,setZoom]=useState(1);
  const [width,setWidth]=useState(0);
  const [loading,setLoading]=useState(true);
  const [rendering,setRendering]=useState(false);
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  const frame=useRef<HTMLDivElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const element=frame.current;
    if(!element)return;
    const observer=new ResizeObserver(([entry])=>setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    let cancelled=false;
    setDocument(null);setPage(1);setZoom(1);setError("");setLoading(true);
    const controller=new AbortController();
    let task: ReturnType<typeof getDocument>|undefined;
    async function load(){
      try{
        const response=await fetch(url,{signal:controller.signal});
        if(!response.ok)throw Error("Could not download the PDF ("+response.status+").");
        const data=await response.arrayBuffer();
        if(cancelled)return;
        task=getDocument({data,isEvalSupported:false,stopAtErrors:false});
        const pdf=await task.promise;
        if(cancelled)return;
        setDocument(pdf);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Could not read this PDF.")}
      finally{if(!cancelled)setLoading(false)}
    }
    void load();
    return()=>{cancelled=true;controller.abort();if(task)void task.destroy().catch(()=>{})};
  },[url,attempt]);
  useEffect(()=>{
    if(!document||!width||!canvas.current)return;
    let cancelled=false;
    let task:RenderTask|undefined;
    setRendering(true);setError("");
    async function render(){
      try{
        const pdfPage=await document!.getPage(page);
        if(cancelled||!canvas.current)return;
        const base=pdfPage.getViewport({scale:1});
        const scale=Math.min(2,Math.max(.15,(width-32)/base.width))*zoom;
        const viewport=pdfPage.getViewport({scale});
        const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(10000000/(viewport.width*viewport.height)));
        // Render to a fresh offscreen canvas so rapid navigation cannot collide.
        const buffer=window.document.createElement("canvas");
        buffer.width=Math.max(1,Math.ceil(viewport.width*ratio));buffer.height=Math.max(1,Math.ceil(viewport.height*ratio));
        const context=buffer.getContext("2d",{alpha:false});
        if(!context)throw Error("Canvas rendering is unavailable.");
        task=pdfPage.render({canvasContext:context,viewport,transform:[ratio,0,0,ratio,0,0]});
        await task.promise;
        if(cancelled||!canvas.current)return;
        const target=canvas.current;
        target.width=buffer.width;target.height=buffer.height;target.style.width=viewport.width+"px";target.style.height=viewport.height+"px";
        target.getContext("2d")?.drawImage(buffer,0,0);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Could not render this page.")}
      finally{if(!cancelled)setRendering(false)}
    }
    void render();
    return()=>{cancelled=true;task?.cancel()};
  },[document,page,zoom,width]);
  return <div className="ts-pdf">
    <div className="ts-pdf-tools">
      <div className="ts-pdf-group"><button className="ts-icon" aria-label="Previous page" disabled={page<=1||!document} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span aria-live="polite">{document?page+" / "+document.numPages:"— / —"}</span><button className="ts-icon" aria-label="Next page" disabled={!document||page>=document.numPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div>
      <div className="ts-pdf-group"><button className="ts-icon" aria-label="Zoom out" disabled={!document||zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,z-.25))}><Minus size={17}/></button><button className="ts-pdf-zoom" disabled={!document} onClick={()=>setZoom(1)} title="Fit to width">{Math.round(zoom*100)}%</button><button className="ts-icon" aria-label="Zoom in" disabled={!document||zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.25))}><Plus size={17}/></button></div>
      <a className="ts-icon" aria-label="Open original PDF" href={url} target="_blank" rel="noopener noreferrer" download={name}><Download size={18}/></a>
    </div>
    <div className="ts-pdf-frame" ref={frame} aria-busy={loading||rendering}>
      {(loading||rendering)&&!error&&<div className="ts-pdf-status"><LoaderCircle size={24} className="ts-pdf-spinner"/><span>{loading?"Opening PDF…":"Rendering page…"}</span></div>}
      {error&&<div className="ts-pdf-status" role="alert"><FileText size={32}/><strong>Unable to preview this PDF</strong><span>{error}</span><button className="ts-quiet" onClick={()=>setAttempt(a=>a+1)}><RotateCcw size={16}/> Retry</button><a href={url} target="_blank" rel="noopener noreferrer" className="ts-link">Open original PDF</a></div>}
      <div className="ts-pdf-sheet" hidden={loading||!!error||!document}><canvas ref={canvas} aria-label={"PDF page "+page}/></div>
    </div>
  </div>;
}
