// Offline app shell only. Never cache transfer payloads, API responses or signed URLs.
const CACHE="copycloud-shell-v8";
const SHELL="/__cc_offline_shell__";
const STATIC=/^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|mjs|woff2?|svg|png)$/;
const ICONS=["/logo.png","/favicon.ico","/site.webmanifest","/web-app-manifest-192x192.png","/web-app-manifest-512x512.png"];
const ROUTES=new Set(["/","/workspace","/send","/receive","/retrieve","/history","/about","/features","/how-it-works","/getting-started","/faq","/status"]);
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const response=await fetch("/",{cache:"reload",credentials:"same-origin"});
    if(!response.ok)throw Error("App shell unavailable");
    const html=await response.clone().text();
    if(!html.includes('id="root"'))throw Error("Not a CopyCloud shell");
    const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map(m=>m[1]);
    await cache.put(SHELL,response);
    const manifest=await fetch("/offline-assets.json",{cache:"reload"});
    if(manifest.ok){const core=await manifest.json();if(Array.isArray(core))for(const file of core)if(typeof file==="string"&&STATIC.test(file))assets.push(file)}
    await cache.addAll([...new Set(assets)]);
    await Promise.allSettled(ICONS.map(path=>cache.add(path)));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith("copycloud-")&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
  if(request.mode==="navigate"&&ROUTES.has(url.pathname)){
    event.respondWith(fetch(request).catch(async()=>await caches.match(SHELL)||new Response("CopyCloud is offline.",{status:503})));
    return;
  }
  if(STATIC.test(url.pathname)&&!url.search){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(request);if(cached)return cached;
      const response=await fetch(request);
      if(response.ok)await cache.put(request,response.clone());
      return response;
    })());
  }
});
