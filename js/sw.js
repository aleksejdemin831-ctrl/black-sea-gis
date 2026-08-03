const CACHE='blacksea-gis-v4';
const ASSETS=[
  './',
  './index.html',
  './js/state.js',
  './js/utils.js',
  './js/data-loader.js',
  './data/beaches.json',
  './data/nc_data.json',
  './data/DATA_17062026.geojson',
  './data/satellite.png',
  './data/model3d.png',
  './data/daily.png',
  './data/salinity.png'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(nr=>{if(nr.ok){const c=nr.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c))}return nr}).catch(()=>caches.match('./index.html'))))});
