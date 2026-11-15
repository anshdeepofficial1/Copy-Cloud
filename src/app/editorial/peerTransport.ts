import { randomToken, toBase64Url, fromBase64Url, importTransferKey, encryptChunk, decryptChunk, sha256, safeRelativePath } from "../../lib/transferProtocol.mjs";
import { attachmentPath, type WorkspaceFile } from "./attachmentUtils";

export type PeerMode="direct"|"nearby";
type Offer={v:1;id:string;mode:PeerMode;key:string;sdp:string;expires:number};
type Answer={v:1;id:string;sdp:string;proof:string};
type Frame={kind:string;bytes:Uint8Array};
type Item={id:number;kind:"text"|"file";name:string;path:string;size:number;mime:string};
export type PeerManifest={items:Item[];bytes:number};
export type PeerProgress={done:number;total:number;speed:number;eta:number|null};
export type PeerResult={text:string;files:{name:string;path:string;blob?:Blob;stored:boolean}[]};
const enc=new TextEncoder(),dec=new TextDecoder();
const CHUNK=32*1024,MAX_FRAME=48*1024;
export const PEER_MEMORY_LIMIT=40*1024*1024;
export const PEER_MAX_BYTES=2*1024*1024*1024;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const delay=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
function encode(value:unknown){return toBase64Url(enc.encode(JSON.stringify(value)))}
function decode(value:string,fragment?:string){
  let v=value.trim();if(fragment&&v.includes("#"+fragment+"="))v=v.split("#"+fragment+"=")[1].split("&")[0];
  if(v.length>60000)throw Error("Pairing token is too long.");
  try{return JSON.parse(dec.decode(fromBase64Url(v)))}catch{throw Error("Invalid pairing token. Copy the complete token.")}
}
async function hmac(secret:string,value:string){
  const key=await crypto.subtle.importKey("raw",fromBase64Url(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(value))));
}
async function verifyHmac(secret:string,value:string,signature:string){
  const key=await crypto.subtle.importKey("raw",fromBase64Url(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,fromBase64Url(signature),enc.encode(value));
}
function connection(mode:PeerMode){
  if(typeof RTCPeerConnection==="undefined")throw Error("WebRTC is not supported by this browser.");
  // Nearby uses host candidates only. Internet mode uses STUN, never a paid relay.
  return new RTCPeerConnection({iceServers:mode==="nearby"?[]:[{urls:"stun:stun.cloudflare.com:3478"}]});
}
async function gather(pc:RTCPeerConnection){
  const start=Date.now();
  while(pc.iceGatheringState!=="complete"&&Date.now()-start<12000)await delay(100);
  const sdp=pc.localDescription?.sdp;
  if(!sdp||!sdp.includes("a=candidate:"))throw Error("No network candidates found. Check your network and try again.");
  return sdp;
}
export class PeerLink{
  pc:RTCPeerConnection;id:string;secret:string;mode:PeerMode;role:"sender"|"receiver";
  channel:RTCDataChannel|null=null;
  private key:Promise<CryptoKey>;
  private sendSeq=0;private recvSeq=0;private queue:Frame[]=[];private error:Error|null=null;
  private chain=Promise.resolve();
  constructor(pc:RTCPeerConnection,offer:Pick<Offer,"id"|"key"|"mode">,role:"sender"|"receiver"){
    this.pc=pc;this.id=offer.id;this.secret=offer.key;this.mode=offer.mode;this.role=role;this.key=importTransferKey(offer.key);
    pc.addEventListener("connectionstatechange",()=>{if(["failed","closed"].includes(pc.connectionState))this.fail("Connection lost. Pair the devices again to retry.")});
  }
  attach(channel:RTCDataChannel){
    this.channel=channel;channel.binaryType="arraybuffer";
    channel.addEventListener("message",event=>{
      this.chain=this.chain.then(()=>this.decodeFrame(event.data)).catch(()=>this.fail("Encrypted frame could not be authenticated."));
    });
    channel.addEventListener("close",()=>this.fail("Peer disconnected."));
    channel.addEventListener("error",()=>this.fail("Data channel failed."));
  }
  private fail(message:string){if(!this.error)this.error=Error(message)}
  close(){this.fail("Transfer canceled or closed.");try{this.channel?.close()}catch{}this.pc.close()}
  async open(timeout=90000){
    const start=Date.now();
    while(this.channel?.readyState!=="open"){if(this.error)throw this.error;if(Date.now()-start>timeout)throw Error("Connection timed out. Check both devices are online and retry pairing.");await delay(80)}
  }
  private async decodeFrame(value:unknown){
    if(!(value instanceof ArrayBuffer)||value.byteLength<4||value.byteLength>MAX_FRAME+2048)throw Error("Invalid frame");
    const data=new Uint8Array(value),length=new DataView(value).getUint32(0);
    if(length<1||length>512||4+length>=data.length)throw Error("Invalid header");
    const h=JSON.parse(dec.decode(data.slice(4,4+length)));
    if(typeof h.kind!=="string"||!/^[a-z]{3,12}$/.test(h.kind)||h.seq!==this.recvSeq++||typeof h.iv!=="string")throw Error("Invalid sequence");
    const direction=this.role==="sender"?"receiver":"sender";
    const bytes=await decryptChunk(await this.key,data.slice(4+length),h.iv,{transferId:this.id,itemId:direction+":"+h.kind,index:h.seq});
    if(this.queue.length>=8)throw Error("Peer sent too many unacknowledged frames");
    this.queue.push({kind:h.kind,bytes});
  }
  async send(kind:string,bytes:Uint8Array){
    if(bytes.length>MAX_FRAME)throw Error("Frame is too large.");
    await this.open();if(this.error)throw this.error;
    const seq=this.sendSeq++;
    const {iv,ciphertext}=await encryptChunk(await this.key,bytes,{transferId:this.id,itemId:this.role+":"+kind,index:seq});
    const header=enc.encode(JSON.stringify({kind,seq,iv})),frame=new Uint8Array(4+header.length+ciphertext.length);
    new DataView(frame.buffer).setUint32(0,header.length);frame.set(header,4);frame.set(ciphertext,4+header.length);
    const start=Date.now();
    while(this.channel!.bufferedAmount>128*1024){if(this.error||Date.now()-start>30000)throw Error("Connection stalled.");await delay(20)}
    this.channel!.send(frame);
  }
  async json(kind:string,value:unknown){await this.send(kind,enc.encode(JSON.stringify(value)))}
  async read(kind:string,timeout=90000){
    const start=Date.now();
    while(!this.queue.length){if(this.error)throw this.error;if(Date.now()-start>timeout)throw Error("Peer did not respond. Retry pairing.");await delay(20)}
    const frame=this.queue.shift()!;
    if(frame.kind==="cancel")throw Error("Peer canceled the transfer.");
    if(frame.kind!==kind)throw Error("Unexpected transfer frame.");
    return frame.bytes;
  }
}
export async function makeOffer(mode:PeerMode){
  const pc=connection(mode),offer:Offer={v:1,id:crypto.randomUUID(),mode,key:randomToken(),sdp:"",expires:Date.now()+15*60*1000};
  const link=new PeerLink(pc,offer,"sender");
  try{link.attach(pc.createDataChannel("copycloud-v1",{ordered:true}));await pc.setLocalDescription(await pc.createOffer());offer.sdp=await gather(pc);return{link,token:encode(offer),expires:offer.expires}}
  catch(e){link.close();throw e}
}
export async function answerOffer(input:string){
  const offer=decode(input,"ccp") as Offer;
  if(offer?.v!==1||typeof offer.id!=="string"||!/^[0-9a-f-]{36}$/.test(offer.id)||!["direct","nearby"].includes(offer.mode)||typeof offer.key!=="string"||!TOKEN.test(offer.key)||typeof offer.sdp!=="string"||offer.sdp.length>40000||!Number.isFinite(offer.expires)||offer.expires<Date.now()||offer.expires>Date.now()+16*60*1000)throw Error("Pairing offer is invalid or expired.");
  const pc=connection(offer.mode),link=new PeerLink(pc,offer,"receiver");
  pc.addEventListener("datachannel",e=>{if(!link.channel&&e.channel.label==="copycloud-v1")link.attach(e.channel);else e.channel.close()});
  try{
    await pc.setRemoteDescription({type:"offer",sdp:offer.sdp});
    await pc.setLocalDescription(await pc.createAnswer());
    const sdp=await gather(pc);
    const answer:Answer={v:1,id:offer.id,sdp,proof:await hmac(offer.key,offer.id+"|"+sdp)};
    return{link,token:encode(answer),mode:offer.mode}
  }catch(e){link.close();throw e}
}
export async function applyAnswer(link:PeerLink,input:string){
  const answer=decode(input) as Answer;
  if(answer?.v!==1||answer.id!==link.id||typeof answer.sdp!=="string"||answer.sdp.length>40000||typeof answer.proof!=="string"||!TOKEN.test(answer.proof)||!await verifyHmac(link.secret,link.id+"|"+answer.sdp,answer.proof))throw Error("Pairing response could not be authenticated.");
  await link.pc.setRemoteDescription({type:"answer",sdp:answer.sdp});
  await link.open();
}
export function peerOfferLink(token:string){const u=new URL("/receive",location.origin);u.hash="ccp="+token;return u.toString()}
export function peerFragment(){return new URLSearchParams(location.hash.slice(1)).get("ccp")||""}
function progress(done:number,total:number,start:number):PeerProgress{
  const speed=done/Math.max(1,(performance.now()-start)/1000);
  return{done,total,speed,eta:speed>0?Math.max(0,(total-done)/speed):null}
}
export function makePayload(text:string,files:WorkspaceFile[]){
  if(files.length>100)throw Error("Direct transfers currently support up to 100 attachments.");
  const payload:Blob[]=[],items:Item[]=[];
  if(text.trim()){
    const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
    if(blob.size>256*1024)throw Error("Message is limited to 256 KB.");
    items.push({id:0,kind:"text",name:"CopyCloud-message.txt",path:"CopyCloud-message.txt",size:blob.size,mime:blob.type});payload.push(blob)
  }
  const used=new Set<string>();
  for(const f of files){
    const path=attachmentPath(f);
    if(used.has(path))throw Error("Two attachments have the same folder path. Rename one before pairing.");
    used.add(path);items.push({id:items.length,kind:"file",name:f.name,path,size:f.size,mime:f.type||"application/octet-stream"});payload.push(f);
  }
  const bytes=payload.reduce((n,b)=>n+b.size,0);
  if(!items.length||bytes>PEER_MAX_BYTES)throw Error("Direct payload exceeds the 2 GB safety limit.");
  const manifest:PeerManifest={items,bytes};
  if(enc.encode(JSON.stringify(manifest)).length>MAX_FRAME)throw Error("Attachment metadata is too large.");
  return{manifest,payload}
}
export function parseManifest(bytes:Uint8Array):PeerManifest{
  const m=JSON.parse(dec.decode(bytes)) as PeerManifest;
  if(!Array.isArray(m?.items)||m.items.length<1||m.items.length>101||!Number.isSafeInteger(m.bytes)||m.bytes<0||m.bytes>PEER_MAX_BYTES)throw Error("Invalid peer manifest.");
  let total=0,texts=0;const paths=new Set<string>();
  m.items.forEach((i,index)=>{
    if(!i||i.id!==index||!["text","file"].includes(i.kind)||typeof i.name!=="string"||typeof i.mime!=="string"||i.mime.length>200||!Number.isSafeInteger(i.size)||i.size<0||i.size>PEER_MAX_BYTES||safeRelativePath(i.path).split("/").at(-1)!==i.name)throw Error("Invalid peer attachment.");
    if(i.kind==="text"){if(++texts>1||i.size>256*1024)throw Error("Invalid message.")}
    else{if(paths.has(i.path))throw Error("Duplicate peer attachment path.");paths.add(i.path)}
    total+=i.size;
  });
  if(total!==m.bytes)throw Error("Peer size mismatch.");
  return m;
}
export async function sendPayload(link:PeerLink,payload:ReturnType<typeof makePayload>,onProgress:(p:PeerProgress)=>void,paused:()=>boolean){
  await link.json("manifest",payload.manifest);
  await link.read("accept",5*60*1000);
  let done=0;const start=performance.now();
  onProgress(progress(done,payload.manifest.bytes,start));
  for(const [index,blob] of payload.payload.entries()){
    for(let offset=0,chunk=0;offset<blob.size||chunk===0;offset+=CHUNK,chunk++){
      while(paused()){if(link.channel?.readyState!=="open")throw Error("Peer disconnected.");await delay(100)}
      const bytes=new Uint8Array(await blob.slice(offset,offset+CHUNK).arrayBuffer());
      const hash=enc.encode(await sha256(bytes)),frame=new Uint8Array(8+64+bytes.length);
      const view=new DataView(frame.buffer);view.setUint32(0,index);view.setUint32(4,chunk);frame.set(hash,8);frame.set(bytes,72);
      await link.send("chunk",frame);
      const ack=JSON.parse(dec.decode(await link.read("ack",120000)));
      if(ack.item!==index||ack.chunk!==chunk)throw Error("Peer acknowledgment mismatch.");
      done+=bytes.length;onProgress(progress(done,payload.manifest.bytes,start));
    }
  }
  await link.json("complete",{bytes:done});await link.read("done",120000);
}
async function fileWriter(root:any,path:string){
  const parts=safeRelativePath(path).split("/");const name=parts.pop()!;let dir=root;
  for(const p of parts)dir=await dir.getDirectoryHandle(p,{create:true});
  const handle=await dir.getFileHandle(name,{create:true});return handle.createWritable();
}
export async function receivePayload(link:PeerLink,manifest:PeerManifest,root:any,onProgress:(p:PeerProgress)=>void):Promise<PeerResult>{
  if(!root&&manifest.bytes>PEER_MEMORY_LIMIT)throw Error("Use a supported browser and select a destination folder for transfers above 40 MB.");
  let activeWriter:any=null,done=0,text="";const files:PeerResult["files"]=[],start=performance.now();
  await link.json("accept",{});
  try{
    for(const item of manifest.items){
      const parts:Uint8Array[]=[];
      if(root&&item.kind==="file")activeWriter=await fileWriter(root,item.path);
      let received=0;
      for(let index=0;received<item.size||index===0;index++){
        // A sender may pause; keep the connection available for ten minutes.
        const frame=await link.read("chunk",10*60*1000);
        if(frame.length<72||frame.length>CHUNK+72)throw Error("Invalid chunk size.");
        const header=new DataView(frame.buffer,frame.byteOffset,frame.byteLength);
        if(header.getUint32(0)!==item.id||header.getUint32(4)!==index)throw Error("Unexpected attachment sequence.");
        const bytes=frame.slice(72),expected=Math.min(CHUNK,item.size-received);
        if(bytes.length!==expected||await sha256(bytes)!==dec.decode(frame.slice(8,72)))throw Error("Chunk integrity check failed.");
        if(activeWriter)await activeWriter.write(bytes);else parts.push(bytes);
        received+=bytes.length;done+=bytes.length;
        await link.json("ack",{item:item.id,chunk:index});onProgress(progress(done,manifest.bytes,start));
      }
      if(activeWriter){await activeWriter.close();activeWriter=null;files.push({name:item.name,path:item.path,stored:true})}
      else{const blob=new Blob(parts,{type:item.mime});if(item.kind==="text")text=await blob.text();else files.push({name:item.name,path:item.path,blob,stored:false})}
    }
    const complete=JSON.parse(dec.decode(await link.read("complete")));
    if(complete.bytes!==manifest.bytes||done!==manifest.bytes)throw Error("Transfer size mismatch.");
    await link.json("done",{});return{text,files};
  }catch(e){if(activeWriter)try{await activeWriter.abort()}catch{}throw e}
}
