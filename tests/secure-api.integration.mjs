import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import handler from "../api/secure-transfer.js";
import {generateCode,randomToken,importTransferKey,encryptChunk,decryptChunk,fromBase64Url,toBase64Url} from "../src/lib/transferProtocol.mjs";
const hash=s=>createHash("sha256").update(s).digest("hex");
const url=process.env.CC_V2_SUPABASE_URL;
const service=process.env.CC_V2_SUPABASE_SERVICE_ROLE_KEY;
const anon=process.env.CC_V2_SUPABASE_ANON_KEY;
const enabled=process.env.CC_V2_ENABLED==="true"&&url&&service&&anon;
async function call(action,body={},method="POST"){
  let status=200,value;
  const req={method,body:{action,...body},headers:{"x-vercel-forwarded-for":"127.0.0.1",authorization:method==="GET"?"Bearer "+process.env.CRON_SECRET:undefined}};
  const res={setHeader(){},status(n){status=n;return this},json(x){value=x;return this}};
  await handler(req,res);return{status,value};
}
test("private storage, encrypted upload, atomic one-time access, revocation and cleanup",{skip:!enabled},async()=>{
  const admin=createClient(url,service),publicClient=createClient(url,anon);
  const id=randomUUID(),code=generateCode(),access=randomToken(),owner=randomToken(),secret=randomToken();
  const key=await importTransferKey(secret),plain=new TextEncoder().encode('{"version":2,"name":"integration","description":"","text":"private test","items":[]}');
  const sealed=await encryptChunk(key,plain,{transferId:id,itemId:"manifest",index:0});
  const blob=new Blob([fromBase64Url(sealed.iv),sealed.ciphertext],{type:"application/octet-stream"});
  const path=id+"/manifest";
  try{
    assert.equal((await call("status")).value.enabled,true);
    assert.equal((await call("create",{id,code,accessHash:hash(access),ownerHash:hash(owner),minutes:60,maxClaims:1,objects:[{path,bytes:blob.size}]})).status,200);
    const denied=await publicClient.from("cc_v2_transfers").select("*");
    assert.ok(denied.error||denied.data.length===0);
    const authorization=await call("upload",{id,owner,paths:[path]});
    assert.equal(authorization.status,200,JSON.stringify(authorization.value));
    const uploaded=await publicClient.storage.from("copycloud-v2").uploadToSignedUrl(path,authorization.value.objects[0].token,blob,{contentType:"application/octet-stream",upsert:false});
    assert.equal(uploaded.error,null,uploaded.error?.message);
    const unauthorized=await publicClient.storage.from("copycloud-v2").download(path);assert.ok(unauthorized.error);
    assert.equal((await call("finalize",{id,owner})).status,200);
    assert.equal((await call("claim",{code,access:randomToken()})).status,404);
    const claim=await call("claim",{code,access});assert.equal(claim.status,200);
    assert.equal((await call("claim",{code,access})).status,404);
    const signed=await call("download",{id,grant:claim.value.grant,paths:[path]});assert.equal(signed.status,200);
    const response=await fetch(signed.value.objects[0].url);assert.equal(response.status,200);
    const data=new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(await decryptChunk(key,data.slice(12),toBase64Url(data.slice(0,12)),{transferId:id,itemId:"manifest",index:0}),plain);
    assert.equal((await call("revoke",{id,owner})).status,200);
    assert.equal((await call("download",{id,grant:claim.value.grant,paths:[path]})).status,404);
    const past=new Date(Date.now()-3*60*60*1000).toISOString();
    assert.equal((await admin.from("cc_v2_transfers").update({expires_at:past}).eq("id",id)).error,null);
    assert.equal((await call("",{},"GET")).status,200);
    const row=await admin.from("cc_v2_transfers").select("id").eq("id",id).maybeSingle();assert.equal(row.data,null);
    const missing=await admin.storage.from("copycloud-v2").download(path);assert.ok(missing.error);
  }finally{await admin.storage.from("copycloud-v2").remove([path]);await admin.from("cc_v2_transfers").delete().eq("id",id)}
});
