import { createClient } from "@supabase/supabase-js";
let cached=null,until=0;
async function check(url,key,table){
  if(!url||!key)return "not_configured";
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
  try{const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await client.from(table).select(table==="clips"?"code":"id",{head:true}).limit(1).abortSignal(controller.signal);return error?"degraded":"operational"}catch{return "degraded"}finally{clearTimeout(timer)}
}
export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  res.setHeader("Cache-Control","public, max-age=30, s-maxage=30");
  if(cached&&Date.now()<until)return res.status(200).json(cached);
  const [ordinary,privateCloud]=await Promise.all([
    check(process.env.SUPABASE_URL||"https://luunzeonlmzvmewaucqj.supabase.co",process.env.SUPABASE_ANON_KEY,"clips"),
    process.env.CC_V2_ENABLED==="true"?check(process.env.CC_V2_SUPABASE_URL,process.env.CC_V2_SUPABASE_SERVICE_ROLE_KEY,"cc_v2_transfers"):Promise.resolve("not_configured")
  ]);
  cached={website:"operational",ordinaryCloud:ordinary,privateCloud,direct:"network_dependent",checkedAt:new Date().toISOString()};until=Date.now()+30000;
  return res.status(200).json(cached);
}
