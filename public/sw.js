const CACHE="sisp-static-v3";
const ROOT="/SispDemandas/";
const ASSETS=[ROOT,`${ROOT}offline.html`,`${ROOT}manifest.webmanifest`,`${ROOT}branding/icon-192.png`,`${ROOT}branding/icon-512.png`];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||event.request.url.includes("firestore.googleapis.com")||event.request.url.includes("googleapis.com"))return;event.respondWith(fetch(event.request).then(response=>{if(response.ok&&new URL(event.request.url).origin===self.location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match(event.request).then(response=>response||caches.match(`${ROOT}offline.html`))))});
