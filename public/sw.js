const CACHE="copycloud-motion-v2";
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE));});
self.addEventListener("activate",e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith("copycloud-")&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener("fetch",e=>{
 const r=e.request,u=new URL(r.url);if(r.method!=="GET"||u.origin!==self.location.origin||u.pathname.startsWith("/api/"))return;
 if(r.mode==="navigate"){e.respondWith((async()=>{try{const response=await fetch(r);if(response.ok&&response.headers.get("content-type")?.includes("text/html")&&!u.search){const c=await caches.open(CACHE);await c.put("/",response.clone());}return response;}catch{return await caches.match("/")||new Response("CopyCloud is offline. Reconnect to transfer content.",{status:503,headers:{"Content-Type":"text/plain"}});}})());return;}
 if(u.pathname.startsWith("/assets/")||["image","font","script","style"].includes(r.destination)){e.respondWith((async()=>{const c=await caches.open(CACHE);const old=await c.match(r);if(old)return old;const response=await fetch(r);if(response.ok)await c.put(r,response.clone());return response;})());}
});