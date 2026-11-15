import { useState } from "react";
import { FileText, Image as ImageIcon, X } from "lucide-react";
import JSZip from "jszip";
import { attachmentPath, uniqueZipPath, withPath, type WorkspaceFile } from "./attachmentUtils";

const LOCAL_LIMIT=40*1024*1024;
type Operation="image"|"image-pdf"|"merge-pdf"|"extract-pdf"|"split-pdf"|"pdf-image"|"metadata"|"zip"|"unzip";
const format=(name:string,extension:string)=>name.replace(/\.[^.]+$/,"")+"."+extension;
const isImage=(f:File)=>/^image\/(png|jpeg|webp)$/.test(f.type)||/\.(png|jpe?g|webp)$/i.test(f.name);
async function imageCanvas(file:File,maxWidth:number,maxHeight:number,crop:boolean){
  const bitmap=await createImageBitmap(file);
  try{
    const ratio=Math.min(1,maxWidth/bitmap.width,maxHeight/bitmap.height);
    const canvas=document.createElement("canvas");
    canvas.width=crop?Math.min(maxWidth,bitmap.width):Math.max(1,Math.round(bitmap.width*ratio));
    canvas.height=crop?Math.min(maxHeight,bitmap.height):Math.max(1,Math.round(bitmap.height*ratio));
    if(canvas.width*canvas.height>16000000)throw Error("Image exceeds the 16 megapixel processing limit.");
    const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas unavailable.");
    const scale=crop?Math.max(canvas.width/bitmap.width,canvas.height/bitmap.height):ratio;
    const w=bitmap.width*scale,h=bitmap.height*scale;
    ctx.drawImage(bitmap,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    return canvas;
  }finally{bitmap.close()}
}
function canvasBlob(canvas:HTMLCanvasElement,mime:string,quality:number){
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Image conversion failed.")),mime,quality));
}
function pages(value:string,max:number){
  const out:number[]=[];
  for(const part of value.split(",").map(x=>x.trim())){
    const m=/^(\d+)(?:-(\d+))?$/.exec(part);if(!m)throw Error("Use page numbers like 1,3-5,2.");
    const start=Number(m[1]),end=Number(m[2]||m[1]);
    if(start<1||end<start||end>max)throw Error("Page range is outside the document.");
    for(let i=start;i<=end;i++){if(out.length>=500)throw Error("Select at most 500 pages.");out.push(i-1)}
  }
  return out;
}
export default function LocalFileTools({files,onApply,onClose}:{files:WorkspaceFile[];onApply:(files:WorkspaceFile[])=>void;onClose:()=>void}){
  const [operation,setOperation]=useState<Operation>("image");
  const [mime,setMime]=useState("image/webp");
  const [quality,setQuality]=useState(.85);
  const [width,setWidth]=useState(1920);
  const [height,setHeight]=useState(1920);
  const [crop,setCrop]=useState(false);
  const [range,setRange]=useState("1");
  const [selected,setSelected]=useState(()=>files.map((_,i)=>i));
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const [output,setOutput]=useState<WorkspaceFile[]|null>(null);
  const [metadata,setMetadata]=useState<{name:string;details:string}[]>([]);
  const current=selected.map(i=>files[i]).filter(Boolean);
  async function run(){
    if(busy||!current.length)return;
    setBusy(true);setError("");setOutput(null);setMetadata([]);
    try{
      if(current.reduce((n,f)=>n+f.size,0)>LOCAL_LIMIT)throw Error("Local batch processing is limited to 40 MB in this build.");
      const result:WorkspaceFile[]=[];
      if(operation==="metadata"){
        const {sha256}=await import("../../lib/transferProtocol.mjs");
        const info=[];
        for(const f of current){let dimensions="";if(isImage(f)){try{const bitmap=await createImageBitmap(f);dimensions=" · "+bitmap.width+" × "+bitmap.height;bitmap.close()}catch{}}info.push({name:attachmentPath(f),details:f.size.toLocaleString()+" bytes · "+(f.type||"Unknown MIME")+dimensions+" · Modified "+new Date(f.lastModified).toLocaleString()+" · SHA-256 "+await sha256(await f.arrayBuffer())})}
        setMetadata(info);return;
      }else if(operation==="pdf-image"){
        if(current.length!==1||! /\.pdf$/i.test(current[0].name))throw Error("Choose one PDF.");
        const {getDocument,GlobalWorkerOptions}=await import("pdfjs-dist");
        const worker=await import("pdfjs-dist/build/pdf.worker.min.mjs?url");GlobalWorkerOptions.workerSrc=worker.default;
        const task=getDocument({data:await current[0].arrayBuffer(),isEvalSupported:false,stopAtErrors:false});
        try{const pdf=await task.promise;const selected=pages(range,pdf.numPages);if(selected.length>50)throw Error("Convert up to 50 pages at once.");
          for(const index of selected){const page=await pdf.getPage(index+1);const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(2,1800/Math.max(base.width,base.height))});const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const context=canvas.getContext("2d");if(!context)throw Error("Canvas unavailable");await page.render({canvasContext:context,viewport}).promise;const blob=await canvasBlob(canvas,"image/png",1);result.push(new File([blob],"page-"+(index+1)+".png",{type:"image/png"}));if(result.reduce((n,f)=>n+f.size,0)>LOCAL_LIMIT)throw Error("Output exceeds the local 40 MB limit. Select fewer pages.")}
        }finally{await task.destroy()}
      }else if(operation==="split-pdf"){
        if(current.length!==1||! /\.pdf$/i.test(current[0].name))throw Error("Choose one PDF.");
        const {PDFDocument}=await import("pdf-lib");const source=await PDFDocument.load(await current[0].arrayBuffer());const selected=pages(range,source.getPageCount());if(selected.length>100)throw Error("Split up to 100 pages at once.");
        for(const index of selected){const pdf=await PDFDocument.create();const [p]=await pdf.copyPages(source,[index]);pdf.addPage(p);result.push(new File([await pdf.save()],"page-"+(index+1)+".pdf",{type:"application/pdf"}));if(result.reduce((n,f)=>n+f.size,0)>LOCAL_LIMIT)throw Error("Output exceeds the local 40 MB limit. Select fewer pages.")}
      }else if(operation==="image"){
        if(current.some(f=>!isImage(f)))throw Error("Choose only PNG, JPEG or WebP images.");
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw Error("Use dimensions between 1 and 4096.");
        for(const file of current){
          const canvas=await imageCanvas(file,width,height,crop);
          const blob=await canvasBlob(canvas,mime,quality);
          if(blob.type!==mime)throw Error("This browser does not support the chosen output format.");
          const extension=mime==="image/jpeg"?"jpg":mime.split("/")[1];
          const name=format(file.name,extension);
          result.push(new File([blob],name,{type:blob.type}));
        }
      }else if(operation==="merge-pdf"||operation==="extract-pdf"||operation==="image-pdf"){
        const {PDFDocument}=await import("pdf-lib");
        const pdf=await PDFDocument.create();
        if(operation==="image-pdf"){
          if(current.some(f=>!isImage(f)))throw Error("Choose only PNG, JPEG or WebP images.");
          for(const file of current){const canvas=await imageCanvas(file,4096,4096,false);const data=await (await canvasBlob(canvas,"image/png",1)).arrayBuffer();const img=await pdf.embedPng(data);const p=pdf.addPage([img.width,img.height]);p.drawImage(img,{x:0,y:0,width:img.width,height:img.height})}
        }else{
          if(current.some(f=>!/\.pdf$/i.test(f.name)))throw Error("Choose only PDF files.");
          if(operation==="extract-pdf"&&current.length!==1)throw Error("Choose one PDF for page extraction or reordering.");
          for(const file of current){const source=await PDFDocument.load(await file.arrayBuffer());const ids=operation==="extract-pdf"?pages(range,source.getPageCount()):source.getPageIndices();if(pdf.getPageCount()+ids.length>500)throw Error("Output is limited to 500 pages.");for(const page of await pdf.copyPages(source,ids))pdf.addPage(page)}
        }
        result.push(new File([await pdf.save()],operation==="merge-pdf"?"merged.pdf":operation==="image-pdf"?"images.pdf":"extracted.pdf",{type:"application/pdf"}));
      }else if(operation==="zip"){
        const zip=new JSZip();const used=new Set<string>();
        for(const f of current)zip.file(uniqueZipPath(attachmentPath(f),used),f);
        result.push(new File([await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:3}})],"CopyCloud-files.zip",{type:"application/zip"}));
      }else{
        if(current.length!==1||!/\.zip$/i.test(current[0].name))throw Error("Select exactly one ZIP archive.");
        const zip=await JSZip.loadAsync(await current[0].arrayBuffer());
        const entries=Object.values(zip.files).filter(f=>!f.dir);
        if(entries.length>500)throw Error("Archive contains too many files.");
        let total=0;
        for(const entry of entries){
          // Inspect advertised uncompressed size before allocating. Reject missing size.
          const declared=(entry as any)._data?.uncompressedSize;
          if(!Number.isSafeInteger(declared)||declared<0||total+declared>LOCAL_LIMIT)throw Error("Archive exceeds the 40 MB extraction limit.");
          if((entry as any).unsafeOriginalName && (entry as any).unsafeOriginalName!==entry.name)throw Error("Archive contains an unsafe path.");
          const name=entry.name.split("/").at(-1)||"file";
          const chunks:Uint8Array[]=[];let emitted=0;
          const blob=await new Promise<Blob>((resolve,reject)=>{const stream=entry.internalStream("uint8array");stream.on("data",(chunk:Uint8Array)=>{emitted+=chunk.length;if(total+emitted>LOCAL_LIMIT||emitted>declared){stream.pause();reject(Error("Archive exceeds its declared size."));return}chunks.push(chunk)}).on("error",reject).on("end",()=>resolve(new Blob(chunks))).resume()});total+=blob.size;
          if(total>LOCAL_LIMIT||blob.size!==declared)throw Error("Archive size verification failed.");
          result.push(withPath(new File([blob],name),entry.name));
        }
      }
      if(result.reduce((n,f)=>n+f.size,0)>LOCAL_LIMIT)throw Error("Processed files exceed the 40 MB local limit.");
      if(!result.length)throw Error("No output files were produced.");
      setOutput(result);
    }catch(e){setError(e instanceof Error?e.message:"Processing failed.")}
    finally{setBusy(false)}
  }
  return <div className="ts-overlay" onClick={()=>{if(!busy)onClose()}}><section className="ts-modal ts-tools-modal" role="dialog" aria-modal="true" aria-label="Local file tools" onClick={e=>e.stopPropagation()}>
    <header><strong>Local file tools</strong><button className="ts-icon" aria-label="Close file tools" disabled={busy} onClick={onClose}><X size={20}/></button></header>
    <p>Files are processed on this device. Originals stay unchanged unless you replace them.</p>
    <label>Operation<select value={operation} disabled={busy} onChange={e=>{setOperation(e.target.value as Operation);setOutput(null)}}><option value="image">Compress, resize, crop, convert / remove image metadata</option><option value="merge-pdf">Merge PDFs</option><option value="extract-pdf">Extract / reorder PDF pages</option><option value="image-pdf">Images to PDF</option><option value="split-pdf">Split PDF into individual pages</option><option value="pdf-image">PDF pages to PNG</option><option value="metadata">Inspect file metadata and SHA-256</option><option value="zip">Create ZIP</option><option value="unzip">Extract ZIP</option></select></label>
    <div className="ts-tool-selection">{files.map((f,i)=><label key={i}><input type="checkbox" checked={selected.includes(i)} disabled={busy} onChange={e=>{setSelected(old=>e.target.checked?[...old,i].sort((a,b)=>a-b):old.filter(x=>x!==i));setOutput(null)}}/>{isImage(f)?<ImageIcon size={16}/>:<FileText size={16}/>}<span>{attachmentPath(f)}</span></label>)}</div>
    {operation==="image"&&<div className="ts-tool-options"><label>Format<select value={mime} onChange={e=>{setMime(e.target.value);setOutput(null)}} disabled={busy}><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select></label><label>Quality {Math.round(quality*100)}%<input type="range" min=".1" max="1" step=".05" value={quality} disabled={busy||mime==="image/png"} onChange={e=>{setQuality(Number(e.target.value));setOutput(null)}}/></label><label>Max width<input type="number" min="1" max="4096" value={width} disabled={busy} onChange={e=>{setWidth(Number(e.target.value));setOutput(null)}}/></label><label>Max height<input type="number" min="1" max="4096" value={height} disabled={busy} onChange={e=>{setHeight(Number(e.target.value));setOutput(null)}}/></label><label><input type="checkbox" checked={crop} disabled={busy} onChange={e=>{setCrop(e.target.checked);setOutput(null)}}/> Center crop</label></div>}
    {(operation==="extract-pdf"||operation==="split-pdf"||operation==="pdf-image")&&<label>Pages in desired order<input value={range} disabled={busy} onChange={e=>{setRange(e.target.value);setOutput(null)}} placeholder="1,3-5,2"/></label>}
    {error&&<p role="alert" className="ts-error">{error}</p>}
    {metadata.length>0&&<div className="ts-tool-output">{metadata.map((m,i)=><div key={i}><strong>{m.name}</strong><div style={{overflowWrap:"anywhere"}}>{m.details}</div></div>)}</div>}{output&&<div className="ts-tool-output"><strong>{output.length} processed file(s) ready</strong>{output.map((f,i)=><span key={i}>{f.name}</span>)}</div>}
    <div className="ts-tool-actions"><button className="ts-action" disabled={busy||!current.length} onClick={()=>void run()}>{busy?"Processing locally…":"Process selected files"}</button>{output&&<button className="ts-action" onClick={()=>onApply(output)}>Add output to transfer</button>}</div>
  </section></div>;
}
