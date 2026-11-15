import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BUCKET="copycloud-v2";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
const HASH=/^[0-9a-f]{64}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const hash=s=>createHash("sha256").update(s).digest("hex");
const configured=()=>process.env.CC_V2_ENABLED==="true"&&process.env.CC_V2_SUPABASE_URL&&process.env.CC_V2_SUPABASE_SERVICE_ROLE_KEY&&process.env.CC_V2_SUPABASE_ANON_KEY&&process.env.CC_V2_RATE_SECRET;
const db=()=>createClient(process.env.CC_V2_SUPABASE_URL,process.env.CC_V2_SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const fail=(res,status,error)=>res.status(status).json({error});
const good=(res,data)=>res.status(200).json(data);
const isToken=t=>typeof t==="string"&&TOKEN.test(t);
const isId=t=>typeof t==="string"&&UUID.test(t);
function matches(a,b){if(typeof a!=="string"||typeof b!=="string")return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function validateObjects(id,objects){
  if(!Array.isArray(objects)||objects.length<1||objects.length>650)return null;
  let size=0,manifest=0;const seen=new Set();
  for(const o of objects){
    if(!o||typeof o.path!=="string"||!Number.isSafeInteger(o.bytes)||o.bytes<28||o.bytes>1048604||seen.has(o.path))return null;
    const p=o.path.split("/");
    if(p[0]!==id)return null;
    if(p.length===2&&p[1]==="manifest")manifest++;
    else if(p.length!==3||!UUID.test(p[1])||!/^(0|[1-9][0-9]{0,3})$/.test(p[2]))return null;
    seen.add(o.path);size+=o.bytes;
  }
  return manifest===1&&size<=44040192?size:null;
}
async function rateLimit(client,req,action,max){
  // Only the platform-supplied forwarding header is used; unknown clients share a bucket.
  const ip=String(req.headers["x-vercel-forwarded-for"]||"unknown").split(",")[0].trim().slice(0,128);
  const key=createHmac("sha256",process.env.CC_V2_RATE_SECRET).update(ip+"|"+action).digest("hex");
  const slot=Math.floor(Date.now()/60000);
  const {data,error}=await client.rpc("cc_v2_rate_limit",{p_subject:key,p_slot:slot,p_limit:max});
  if(error)throw Error("Rate limiter unavailable");
  return data===true;
}
async function ownerRow(client,id,owner){
  if(!isId(id)||!isToken(owner))return null;
  const {data,error}=await client.from("cc_v2_transfers").select("*").eq("id",id).eq("owner_hash",hash(owner)).maybeSingle();
  if(error)throw Error("Database unavailable");
  return data;
}
function active(row){return row&&row.state!=="revoked"&&Date.parse(row.expires_at)>Date.now()}
function requested(row,paths){
  if(!Array.isArray(paths)||!paths.length||paths.length>20||new Set(paths).size!==paths.length)return null;
  const allowed=new Map(row.objects.map(o=>[o.path,o]));
  return paths.every(p=>typeof p==="string"&&allowed.has(p))?paths.map(p=>allowed.get(p)):null;
}
async function removeTransfer(client,row){
  // Retain the database record if removal fails so cleanup can retry.
  for(let i=0;i<row.objects.length;i+=100){
    const {error}=await client.storage.from(BUCKET).remove(row.objects.slice(i,i+100).map(o=>o.path));
    if(error)return false;
  }
  // Outstanding signed upload tokens expire after two hours. Retain revoked
  // rows until then so cleanup can remove late uploads instead of orphaning them.
  if(Date.now()-Date.parse(row.created_at)<2*60*60*1000)return true;
  const {error}=await client.from("cc_v2_transfers").delete().eq("id",row.id);
  return !error;
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Referrer-Policy","no-referrer");
  if(req.method==="GET"){
    if(!configured()||!process.env.CRON_SECRET||!matches(req.headers.authorization,"Bearer "+process.env.CRON_SECRET))return fail(res,403,"Forbidden");
    try{
      const client=db();const now=new Date().toISOString();
      const {data,error}=await client.from("cc_v2_transfers").select("id,objects,created_at").or("expires_at.lt."+now+",state.eq.revoked").limit(50);
      if(error)throw Error("Cleanup query failed");
      let removed=0;for(const row of data||[]){if(await removeTransfer(client,row))removed++}
      await client.from("cc_v2_grants").delete().lt("expires_at",now);
      await client.from("cc_v2_rate").delete().lt("slot",Math.floor(Date.now()/60000)-2880);
      return good(res,{processed:removed,pending:(data||[]).length-removed});
    }catch{return fail(res,503,"Cleanup unavailable")}
  }
  if(req.method!=="POST")return fail(res,405,"Method not allowed");
  const body=req.body||{};
  if(typeof body!=="object"||Array.isArray(body))return fail(res,400,"Invalid request");
  const action=body.action;
  if(action==="status"){
    if(!configured())return good(res,{enabled:false});
    try{const {error}=await db().from("cc_v2_transfers").select("id").limit(1);return good(res,error?{enabled:false}:{enabled:true,url:process.env.CC_V2_SUPABASE_URL,anonKey:process.env.CC_V2_SUPABASE_ANON_KEY})}catch{return good(res,{enabled:false})}
  }
  if(!configured())return fail(res,503,"Private cloud transfer is not enabled.");
  // Browser requests are same-origin; no CORS grant for arbitrary websites.
  const origin=req.headers.origin;const host=req.headers.host;
  if(origin&&host){try{if(new URL(origin).host!==host)return fail(res,403,"Invalid origin")}catch{return fail(res,403,"Invalid origin")}}
  const limits={create:5,upload:80,finalize:12,claim:10,download:90,revoke:10,ownerStatus:15};
  if(!Object.hasOwn(limits,action))return fail(res,400,"Unknown action");
  try{
    const client=db();
    if(!await rateLimit(client,req,action,limits[action])){res.setHeader("Retry-After","60");return fail(res,429,"Too many requests. Try again in a minute.")}
    if(action==="create"){
      const {id,code,accessHash,ownerHash,minutes,maxClaims,objects}=body;
      const size=isId(id)?validateObjects(id,objects):null;
      if(!size||typeof code!=="string"||!CODE.test(code)||typeof accessHash!=="string"||!HASH.test(accessHash)||typeof ownerHash!=="string"||!HASH.test(ownerHash)||![15,60,360,1440].includes(minutes)||!Number.isInteger(maxClaims)||maxClaims<1||maxClaims>100)return fail(res,400,"Invalid transfer metadata");
      const {error}=await client.rpc("cc_v2_reserve",{p_id:id,p_code:code,p_access_hash:accessHash,p_owner_hash:ownerHash,p_minutes:minutes,p_size:size,p_objects:objects,p_max_claims:maxClaims});
      if(error?.code==="23505")return fail(res,409,"Code collision. Try again.");
      if(error)return fail(res,409,"Unable to reserve transfer. Storage quota or reservation conflict.");
      return good(res,{id,code});
    }
    if(action==="claim"){
      if(typeof body.code!=="string"||!CODE.test(body.code)||!isToken(body.access))return fail(res,400,"Enter a valid code and access key.");
      const grant=randomBytes(32).toString("base64url");
      const {data,error}=await client.rpc("cc_v2_claim",{p_code:body.code,p_access_hash:hash(body.access),p_grant_hash:hash(grant)});
      if(error)throw Error("Claim failed");
      const row=data?.[0];if(!row)return fail(res,404,"Transfer unavailable, expired, revoked or access limit reached.");
      return good(res,{id:row.id,grant,expiresAt:row.expires_at,createdAt:row.created_at});
    }
    if(action==="download"){
      if(!isToken(body.grant)||!isId(body.id))return fail(res,400,"Invalid grant");
      const {data:grant,error:gError}=await client.from("cc_v2_grants").select("transfer_id,expires_at").eq("token_hash",hash(body.grant)).eq("transfer_id",body.id).gt("expires_at",new Date().toISOString()).maybeSingle();
      if(gError)throw Error("Grant query failed");if(!grant)return fail(res,403,"Download session expired.");
      const {data:row,error}=await client.from("cc_v2_transfers").select("*").eq("id",body.id).maybeSingle();
      if(error)throw Error("Transfer query failed");if(!active(row)||row.state!=="ready")return fail(res,404,"Transfer unavailable.");
      const paths=requested(row,body.paths);if(!paths)return fail(res,400,"Invalid object request");
      const seconds=Math.min(60,Math.floor((Math.min(Date.parse(row.expires_at),Date.parse(grant.expires_at))-Date.now())/1000));
      if(seconds<1)return fail(res,403,"Download session expired.");
      const {data:signed,error:sError}=await client.storage.from(BUCKET).createSignedUrls(paths.map(p=>p.path),seconds);
      if(sError||!signed||signed.some(s=>!s.signedUrl))throw Error("Download authorization failed");
      return good(res,{objects:signed.map(s=>({path:s.path,url:s.signedUrl}))});
    }
    const row=await ownerRow(client,body.id,body.owner);
    if(!row)return fail(res,404,"Transfer unavailable.");
    if(action==="revoke"){
      const {error}=await client.from("cc_v2_transfers").update({state:"revoked"}).eq("id",row.id);
      if(error)throw Error("Revocation failed");
      const removed=await removeTransfer(client,row);
      return good(res,{revoked:true,cleanupPending:!removed});
    }
    if(action==="ownerStatus")return good(res,{state:row.state,expiresAt:row.expires_at,claims:row.claims,maxClaims:row.max_claims});
    if(!active(row))return fail(res,404,"Transfer expired or revoked.");
    if(action==="finalize"){
      const {data,error}=await client.rpc("cc_v2_finalize",{p_id:row.id,p_owner_hash:hash(body.owner)});
      if(error)throw Error("Finalize failed");
      return data?good(res,{ready:true,expiresAt:row.expires_at}):fail(res,409,"Some chunks are missing. Resume upload.");
    }
    if(row.state!=="uploading")return fail(res,409,"Transfer is not accepting uploads.");
    const paths=requested(row,body.paths);if(!paths)return fail(res,400,"Invalid object request");
    const {data:existing,error}=await client.rpc("cc_v2_object_status",{p_id:row.id});
    if(error)throw Error("Object status unavailable");
    const present=new Map((existing||[]).map(o=>[o.path,Number(o.bytes)]));
    const objects=[];
    for(const p of paths){
      if(present.has(p.path)){
        if(present.get(p.path)!==p.bytes)return fail(res,409,"Uploaded object has incorrect size.");
        objects.push({path:p.path,uploaded:true});continue;
      }
      const {data,error}=await client.storage.from(BUCKET).createSignedUploadUrl(p.path,{upsert:false});
      if(error||!data?.token)throw Error("Upload authorization failed");
      objects.push({path:p.path,token:data.token,uploaded:false});
    }
    return good(res,{objects});
  }catch{return fail(res,503,"Transfer service unavailable. Try again.")}
}
