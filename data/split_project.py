import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS_DIR = os.path.join(BASE, "js")
os.makedirs(JS_DIR, exist_ok=True)

# ===== 1. state.js — глобальные переменные =====
state_js = r"""
// Глобальное состояние приложения
let BEACHES = [];
let NC_DATA = null;
let OMEGA_DATA = null;

const S = {
    currentBeach: 9, // Пляж Омега по умолчанию
    currentLayer: 'satellite',
    tempData: [],
    reviews: JSON.parse(localStorage.getItem('bs_reviews') || '[]'),
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth() + 1,
    omegaLoaded: false,
    map: null,
    placemarks: {},
    rating: 0
};

let omegaBayMap = null, omegaStationMarks = [], omegaIsolineLayer = null;
let mapLayer = null, currentArrows = [], routeLine = null, awardPlacemarks = [];
let scene3d, camera3d, renderer3d, mesh3d, beachMarkers3d = [], animId3d = null;
let curDepthIdx3d = 0, zScale = 8;

const LAYER_IMGS = {
    satellite: 'https://via.placeholder.com/800x600/000033/00b4d8?text=GHRSST+Satellite',
    model3d: 'https://via.placeholder.com/800x600/003300/22c55e?text=BAMS+3D',
    daily: 'https://via.placeholder.com/800x600/330000/FF9800?text=BAMS+Daily',
    salinity: 'https://via.placeholder.com/800x600/000033/00b4d8?text=Salinity'
};
"""

# ===== 2. utils.js — вспомогательные функции =====
utils_js = r"""
function showMessage(msg) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:8px 20px;border-radius:20px;z-index:10000;font-size:12px;animation:fadeIn .3s';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3000);
}

function switchTab(el, name) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
    if (name === 'profile') updateProfile();
    if (name === 'export') renderSeasonal();
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function openModal(id) { document.getElementById(id).classList.add('show'); }

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 900) { sb.classList.toggle('hidden-mobile'); }
    else { sb.classList.toggle('hidden'); }
}

function toggleTheme() {
    document.body.classList.toggle('light');
    localStorage.setItem('bs_theme', document.body.classList.contains('light') ? 'light' : 'dark');
}

function showSources() { openModal('sourcesModal'); }

function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

async function ensurePlotly() {
    if (window.Plotly) return;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}
"""

# ===== 3. data-loader.js — загрузка данных =====
data_loader_js = r"""
async function loadCoreData() {
    try {
        const beachesRes = await fetch('data/beaches.json');
        if (beachesRes.ok) BEACHES = await beachesRes.json();
    } catch (e) { console.warn("Не удалось загрузить beaches.json", e); }

    try {
        const response = await fetch('data/nc_data.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        NC_DATA = await response.json();
        console.log("✅ Живые данные МГИ загружены из data/nc_data.json");

        const badge = document.getElementById('dataModeBadge');
        if (badge && NC_DATA.model_daily?.date) {
            badge.textContent = `График: реальные данные · Слои: модель (${NC_DATA.model_daily.date})`;
            badge.className = 'data-mode-badge field';
        }
    } catch (error) {
        console.warn("nc_data.json не загружен, используются демо-данные:", error);
        const badge = document.getElementById('dataModeBadge');
        if (badge) {
            badge.textContent = 'График: демо · Слои: модель';
            badge.className = 'data-mode-badge demo';
        }
    }
}

async function loadOmegaData() {
    try {
        const r = await fetch('data/DATA_17062026.geojson');
        OMEGA_DATA = await r.json();
        S.omegaLoaded = true;
        console.log("✅ Полевые данные Омеги загружены");
    } catch (e) { console.warn('Omega geojson не загружен:', e); }
}
"""

# ===== 4. beaches.js — пляжи, Омега, рейтинг =====
beaches_js = r"""
// ===== OMEGA BAY =====
function omegaStationNum(name) {
    return String(name).split('|')[0].replace(/\s*\(.*\)/, '').trim();
}

function getOmegaSurfacePoints() {
    if (!OMEGA_DATA) return [];
    return OMEGA_DATA.features.filter(f =>
        f.properties['Слой'] === 'Поверхностный' && f.properties.T != null
    );
}

function getOmegaAvgTemp() {
    const pts = getOmegaSurfacePoints();
    if (!pts.length) return null;
    return pts.reduce((a, f) => a + f.properties.T, 0) / pts.length;
}

function getOmegaTempForBeach(b) {
    if (b.fieldData && S.omegaLoaded) {
        const t = getOmegaAvgTemp();
        return t != null ? t.toFixed(1) : '--';
    }
    return null;
}

function idwTemp(lat, lon, pts, p = 2) {
    let num = 0, den = 0;
    for (const f of pts) {
        const t = f.properties.T, [flon, flat] = f.geometry.coordinates;
        const d = Math.hypot(lat - flat, lon - flon);
        if (d < 1e-8) return t;
        const w = 1 / Math.pow(d, p);
        num += w * t; den += w;
    }
    return den ? num / den : null;
}

function createOmegaIsolineCanvas(pts) {
    const lats = pts.map(f => f.geometry.coordinates[1]);
    const lons = pts.map(f => f.geometry.coordinates[0]);
    const minLat = Math.min(...lats) - 0.0008, maxLat = Math.max(...lats) + 0.0008;
    const minLon = Math.min(...lons) - 0.0008, maxLon = Math.max(...lons) + 0.0008;
    const w = 240, h = 240, canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const grid = [];
    for (let i = 0; i < h; i++) {
        grid[i] = [];
        for (let j = 0; j < w; j++) {
            const lat = maxLat - (maxLat - minLat) * i / (h - 1);
            const lon = minLon + (maxLon - minLon) * j / (w - 1);
            grid[i][j] = idwTemp(lat, lon, pts);
        }
    }
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < h; i++)
        for (let j = 0; j < w; j++) {
            const t = grid[i][j];
            if (t == null) continue;
            const n = Math.max(0, Math.min(1, (t - 20) / 6));
            ctx.fillStyle = `rgba(${Math.round(255 * n)},${Math.round(180 * (1 - n))},${Math.round(80 * (1 - n))},0.35)`;
            ctx.fillRect(j, i, 1, 1);
        }
    const levels = [21, 22, 23, 24, 25];
    ctx.lineWidth = 1.5;
    levels.forEach(lv => {
        ctx.strokeStyle = lv >= 24 ? 'rgba(255,107,53,.85)' : 'rgba(0,180,216,.75)';
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < h - 1; i++)
            for (let j = 0; j < w - 1; j++) {
                const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j];
                if (a == null || b == null || c == null) continue;
                const edges = [[a, b, j + 0.5, i], [a, c, j, i + 0.5]];
                edges.forEach(([v1, v2, x, y]) => {
                    if ((v1 - lv) * (v2 - lv) < 0) {
                        const t = (lv - v1) / (v2 - v1);
                        const px = (j + (x === j + 0.5 ? t : 0)) * w / w;
                        const py = (i + (y === i + 0.5 ? t : 0)) * h / h;
                        if (!started) { ctx.moveTo(px * w, py * h); started = true; }
                        else ctx.lineTo(px * w, py * h);
                    }
                });
            }
        if (started) ctx.stroke();
    });
    return { canvas, bounds: [[minLat, minLon], [maxLat, maxLon]] };
}

function renderOmegaStationList() {
    const el = document.getElementById('omegaStationList');
    if (!el || !OMEGA_DATA) return;
    el.innerHTML = getOmegaSurfacePoints().map(f => {
        const p = f.properties;
        const sn = omegaStationNum(p['Имя станции']);
        return `<div class="omega-st-item">
            <div class="st-num">Станция ${sn}</div>
            <div class="st-t">${p.T}°C</div>
            <div style="color:var(--text3);margin-top:2px">S: ${p.S != null ? p.S + ' PSU' : '—'} · ${p['Глубина места']}</div>
        </div>`;
    }).join('');
}

function initOmegaBayMap() {
    if (!OMEGA_DATA || !window.ymaps) return;
    const el = document.getElementById('omegaBayMap');
    if (omegaBayMap) { omegaBayMap.destroy(); omegaBayMap = null; }
    omegaStationMarks = [];
    omegaIsolineLayer = null;
    ymaps.ready(() => {
        omegaBayMap = new ymaps.Map(el, { center: [44.5972, 33.4435], zoom: 16, controls: ['zoomControl', 'typeSelector'] });
        const pts = getOmegaSurfacePoints();
        pts.forEach(f => {
            const p = f.properties, [lon, lat] = f.geometry.coordinates;
            const sn = omegaStationNum(p['Имя станции']);
            const label = `${sn}: ${p.T}°C`;
            const pm = new ymaps.Placemark([lat, lon], {
                balloonContentHeader: `<b>Станция ${sn}</b>`,
                balloonContentBody: `<div style="font-size:12px;line-height:1.6"><b>T:</b> ${p.T} °C<br><b>S:</b> ${p.S != null ? p.S + ' PSU' : '—'}<br><b>Слой:</b> ${p['Слой']}<br><b>Глубина:</b> ${p['Глубина места']}<br><b>Дно:</b> ${p['Тип дна']}<br><b>Время:</b> ${p['Время']}</div>`
            }, {
                iconLayout: 'default#imageWithContent',
                iconImageHref: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                iconImageSize: [1, 1],
                iconContentLayout: ymaps.templateLayoutFactory.createClass(
                    `<div style="background:linear-gradient(135deg,#ff6b35,#f7931e);color:#fff;padding:4px 10px;border-radius:14px;font-size:12px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);white-space:nowrap;font-family:Segoe UI,sans-serif">${label}</div>`
                ),
                iconContentOffset: [-30, -14]
            });
            omegaBayMap.geoObjects.add(pm);
            omegaStationMarks.push(pm);
        });
        if (document.getElementById('omegaIsolinesToggle')?.checked) addOmegaIsolines();
        renderOmegaStationList();
    });
}

function addOmegaIsolines() {
    if (!omegaBayMap || !OMEGA_DATA) return;
    removeOmegaIsolines();
    const pts = getOmegaSurfacePoints();
    if (pts.length < 3) return;
    const { canvas, bounds } = createOmegaIsolineCanvas(pts);
    omegaIsolineLayer = new ymaps.GeoObject({
        geometry: { type: 'Rectangle', coordinates: bounds },
        properties: { balloonContent: 'Интерполяция T (поверхностный слой), изолинии 21–25 °C' }
    }, {
        fillImageHref: canvas.toDataURL('image/png'),
        fillOpacity: 0.75,
        strokeColor: '#00000000',
        interactivityModel: 'default#transparent'
    });
    omegaBayMap.geoObjects.add(omegaIsolineLayer);
}

function removeOmegaIsolines() {
    if (omegaBayMap && omegaIsolineLayer) {
        omegaBayMap.geoObjects.remove(omegaIsolineLayer);
        omegaIsolineLayer = null;
    }
}

function toggleOmegaIsolines() {
    if (document.getElementById('omegaIsolinesToggle')?.checked) addOmegaIsolines();
    else removeOmegaIsolines();
}

function showOmegaBay(id) {
    S.currentBeach = id;
    document.querySelectorAll('.beach-item').forEach(e => e.classList.toggle('current', +e.dataset.id === id));
    openModal('omegaModal');
    setTimeout(initOmegaBayMap, 150);
}

function closeOmegaBay() {
    closeModal('omegaModal');
    if (omegaBayMap) { omegaBayMap.destroy(); omegaBayMap = null; }
}

// ===== BEACHES LIST =====
function buildBeachList() {
    const el = document.getElementById('beachList');
    el.innerHTML = '';
    BEACHES.forEach(b => {
        const d = document.createElement('div');
        d.className = 'beach-item' + (b.id === S.currentBeach ? ' current' : '') + (b.fieldData ? ' field-data' : '');
        d.dataset.id = b.id;
        d.dataset.nm = b.name.toLowerCase();
        const t = getTemp(b);
        d.innerHTML = `<div>
            <div class="beach-name">${b.name}</div>
            <div class="beach-region">${b.region} | ${b.sea}</div>
        </div>
        <div style="display:flex;align-items:center;gap:5px">
            <span class="beach-temp tp ${tempClass(t)}" id="bt-${b.id}">${t}°C</span>
            ${b.fieldData
                ? `<button class="btn btn-sm btn-accent" onclick="event.stopPropagation();showOmegaBay(${b.id})" style="margin:0;width:auto" title="Карта бухты"><i class="fas fa-map-location-dot"></i></button>`
                : `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();showDesc(${b.id})" style="margin:0;width:auto"><i class="fas fa-circle-info"></i></button>
                   <button class="btn btn-sm btn-warm" onclick="event.stopPropagation();showForecast(${b.id})" style="margin:0;width:auto"><i class="fas fa-chart-line"></i></button>`}
        </div>`;
        d.onclick = () => selectBeach(b.id);
        el.appendChild(d);
    });
}

function tempClass(t) {
    const f = parseFloat(t);
    return f > 20 ? 'warm' : f > 14 ? 'mid' : 'cold';
}

function filterBeaches(q) {
    q = q.toLowerCase();
    document.querySelectorAll('.beach-item').forEach(e => {
        e.style.display = e.dataset.nm.includes(q) ? 'flex' : 'none';
    });
}

function selectBeach(id) {
    S.currentBeach = id;
    document.querySelectorAll('.beach-item').forEach(e => e.classList.toggle('current', +e.dataset.id === id));
    const b = BEACHES.find(x => x.id === id);
    if (!b) return;
    if (b.fieldData) { showOmegaBay(id); return; }
    document.getElementById('currentBeachName').textContent = b.name;
    if (document.getElementById('reviewFormBeach')) document.getElementById('reviewFormBeach').textContent = b.name;
    if (S.map) S.map.panTo([b.lat, b.lon], { duration: 800, zoom: Math.max(S.map.getZoom(), 10) });
    if (S.placemarks[id]) S.placemarks[id].balloon.open();
    if (!document.getElementById('graphPanel').classList.contains('open')) document.getElementById('graphPanel').classList.add('open');
    document.getElementById('graphPanelTitle').textContent = `Временной ряд — ${b.name}`;
    updateGraph();
    updateProfile();
}

function getTemp(b) {
    const ft = getOmegaTempForBeach(b);
    if (ft != null) return ft;
    if (S.currentLayer === 'satellite' && NC_DATA.sat_temps?.[b.name] != null) return NC_DATA.sat_temps[b.name].toFixed(1);
    if (S.currentLayer === 'model3d' && NC_DATA.m3d_temps?.[b.name] != null) return NC_DATA.m3d_temps[b.name].toFixed(1);
    if ((S.currentLayer === 'daily' || S.currentLayer === 'salinity' || S.currentLayer === 'currents') && NC_DATA.daily_temps?.[b.name] != null) return NC_DATA.daily_temps[b.name].toFixed(1);
    if (NC_DATA.sat_temps?.[b.name] != null) return NC_DATA.sat_temps[b.name].toFixed(1);
    if (NC_DATA.m3d_temps?.[b.name] != null) return NC_DATA.m3d_temps[b.name].toFixed(1);
    if (S.tempData.length > 0) return S.tempData[S.tempData.length - 1].temp.toFixed(1);
    return '--';
}

function updateFloatingTemp() {
    const b = BEACHES.find(x => x.id === S.currentBeach);
    if (b) document.getElementById('currentTemp').textContent = getTemp(b);
}

function updateAllTemps() {
    BEACHES.forEach(b => {
        const t = getTemp(b);
        const el = document.getElementById('bt-' + b.id);
        if (el) { el.textContent = t + '°C'; el.className = 'beach-temp tp ' + tempClass(t); }
        if (b.fieldData) return;
        if (S.placemarks[b.id]) {
            S.placemarks[b.id].properties.set({
                balloonContentBody: `<div style="text-align:center">
                    <div style="color:#8899b0;font-size:11px">${b.region}</div>
                    <div style="font-size:28px;font-weight:700;font-family:Courier New;color:#ff6b35;margin:4px 0">${t}°C</div>
                    <div style="color:#f7931e;margin-bottom:6px">${'★'.repeat(Math.round(b.rating))} ${b.rating}</div>
                    <div style="display:flex;gap:4px;justify-content:center">
                        <button onclick="window.selectBeach(${b.id})" style="background:#00b4d8;border:none;padding:5px 10px;border-radius:20px;color:#fff;cursor:pointer;font-size:10px">График</button>
                        <button onclick="window.showForecast(${b.id})" style="background:#ff6b35;border:none;padding:5px 10px;border-radius:20px;color:#fff;cursor:pointer;font-size:10px">Прогноз</button>
                        <button onclick="window.showDesc(${b.id})" style="background:#556680;border:none;padding:5px 10px;border-radius:20px;color:#fff;cursor:pointer;font-size:10px">Описание</button>
                    </div>
                </div>`
            });
            updateMarkerColor(b.id, t);
        }
    });
    renderRanking();
    refreshAwards();
    updateFloatingTemp();
}

function updateMarkerColor(id, t) {
    const b = BEACHES.find(x => x.id === id);
    if (b?.fieldData) return;
    const tf = parseFloat(t);
    let p = 'islands#yellowIcon';
    if (tf < 12) p = 'islands#blueIcon';
    else if (tf < 16) p = 'islands#greenIcon';
    else if (tf < 20) p = 'islands#yellowIcon';
    else if (tf < 24) p = 'islands#orangeIcon';
    else p = 'islands#redIcon';
    if (S.placemarks[id]) S.placemarks[id].options.set('preset', p);
}

function showDesc(id) {
    const b = BEACHES.find(x => x.id === id);
    if (!b) return;
    if (b.fieldData) { showOmegaBay(id); return; }
    const st = NC_DATA.sat_temps?.[b.name], mt = NC_DATA.m3d_temps?.[b.name], dt = NC_DATA.daily_temps?.[b.name];
    document.getElementById('descContent').innerHTML = `
        <div class="modal-title">${b.name}</div>
        <div class="desc-block"><h5>Описание</h5><p>${b.desc}</p></div>
        <div class="desc-block"><h5>Как доехать</h5><p>${b.how}</p></div>
        <div class="desc-block"><h5>Что рядом</h5><p>${b.near.split(', ').map(n => `<span class="tag">${n}</span>`).join(' ')}</p></div>
        <div class="desc-block"><h5>Рейтинг</h5><p><span style="color:#f7931e">${'★'.repeat(Math.round(b.rating))}${'☆'.repeat(5 - Math.round(b.rating))}</span> ${b.rating}/5.0</p></div>
        <div class="src-card"><h4>Температура</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;margin-top:6px">
                <div style="background:var(--bg);padding:8px;border-radius:6px"><div style="font-size:9px;color:var(--text3)">Спутник</div><div style="font-size:16px;font-weight:700;font-family:Courier New;color:#00b4d8">${st != null ? st.toFixed(1) + '°' : '—'}</div></div>
                <div style="background:var(--bg);padding:8px;border-radius:6px"><div style="font-size:9px;color:var(--text3)">3D</div><div style="font-size:16px;font-weight:700;font-family:Courier New;color:#22c55e">${mt != null ? mt.toFixed(1) + '°' : '—'}</div></div>
                <div style="background:var(--bg);padding:8px;border-radius:6px"><div style="font-size:9px;color:var(--text3)">Daily</div><div style="font-size:16px;font-weight:700;font-family:Courier New;color:#FF9800">${dt != null ? dt.toFixed(1) + '°' : '—'}</div></div>
            </div>
        </div>`;
    openModal('descModal');
}

// ===== RANKING =====
function renderRanking() {
    const el = document.getElementById('rankingList');
    if (!el) return;
    const ratings = {};
    BEACHES.forEach(b => { ratings[b.id] = { name: b.name, avg: b.rating, count: 0 }; });
    S.reviews.forEach(r => {
        if (ratings[r.beachId]) {
            ratings[r.beachId].avg = ((ratings[r.beachId].avg * ratings[r.beachId].count + r.rating) / (ratings[r.beachId].count + 1));
            ratings[r.beachId].count++;
        }
    });
    const ranked = Object.values(ratings).sort((a, b) => b.avg - a.avg);
    el.innerHTML = ranked.map((b, i) => {
        const score = (b.avg / 5 * 100).toFixed(0);
        const barColor = b.avg >= 4.5 ? '#22c55e' : b.avg >= 3.5 ? '#eab308' : '#06b6d8';
        const medal = i === 0 ? '' : i === 1 ? '' : i === 2 ? '🥉' : `<span style="color:var(--text3)">${i + 1}</span>`;
        const bid = BEACHES.find(x => x.name === b.name)?.id;
        return `<div class="ranking-item" onclick="selectBeach(${bid})">
            <div class="ranking-medal">${medal}</div>
            <div style="flex:1">
                <div style="font-size:11px;font-weight:600">${b.name} <span style="color:var(--text3);font-size:9px">(${b.count})</span></div>
                <div class="ranking-bar"><div class="ranking-fill" style="width:${score}%;background:${barColor}"></div></div>
            </div>
            <div style="text-align:right">
                <div style="font-size:14px;font-weight:700;font-family:Courier New;color:${barColor}">${b.avg.toFixed(1)}</div>
                <div style="font-size:9px;color:var(--text3)">${score}%</div>
            </div>
        </div>`;
    }).join('');
}

function pickStar(n) {
    S.rating = n;
    document.querySelectorAll('#starPick i').forEach((e, i) => e.classList.toggle('on', i < n));
}

function submitReview() {
    const t = document.getElementById('reviewText')?.value?.trim();
    if (!t || !S.rating) return;
    const b = BEACHES.find(x => x.id === S.currentBeach);
    S.reviews.push({ beachId: S.currentBeach, beachName: b?.name || '', rating: S.rating, text: t, date: new Date().toLocaleDateString('ru-RU') });
    localStorage.setItem('bs_reviews', JSON.stringify(S.reviews));
    document.getElementById('reviewText').value = '';
    S.rating = 0;
    pickStar(0);
    renderRanking();
}
"""

# ===== 5. map.js — карта и слои =====
map_js = r"""
function updateLayerInfo() {
    const el = document.getElementById('layerInfoBar');
    if (!el) return;
    const info = {
        satellite: { src: 'GHRSST', date: '20.09.2021', unit: '°C' },
        model3d: { src: 'BAMS 1km', date: 'анализ', unit: '°C' },
        daily: { src: 'BAMS daily', date: NC_DATA.model_daily?.date || 'суточный', unit: '°C' },
        salinity: { src: 'BAMS daily', date: 'so', unit: 'PSU' },
        currents: { src: 'BAMS daily', date: 'uo/vo', unit: 'м/с' }
    };
    const i = info[S.currentLayer] || info.satellite;
    el.innerHTML = `<b>${i.src}</b> · ${i.date} · ${i.unit}`;
}

function initMap() {
    ymaps.ready(() => {
        S.map = new ymaps.Map("map", { center: [43, 36.5], zoom: 6, controls: ["zoomControl", "typeSelector"] });
        BEACHES.forEach(b => {
            const t = getTemp(b);
            if (b.fieldData) {
                const pm = new ymaps.Placemark([b.lat, b.lon], {
                    balloonContentHeader: `<b style="color:#10b981">🧪 ${b.name}</b>`,
                    balloonContentBody: `<div style="text-align:center">
                        <span style="display:inline-block;font-size:9px;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,.15);color:#10b981;margin-bottom:6px">Полевые измерения 17.06.2026 · ТМА-21</span>
                        <div style="font-size:28px;font-weight:700;font-family:Courier New;color:#ff6b35;margin:4px 0">${t}°C</div>
                        <div style="color:#8899b0;font-size:11px;margin-bottom:8px">средняя T поверхностного слоя</div>
                        <button onclick="window.showOmegaBay(${b.id})" style="background:#10b981;border:none;padding:8px 16px;border-radius:20px;color:#fff;cursor:pointer;font-size:12px;font-weight:600">Карта бухты Омега</button>
                    </div>`
                }, {
                    iconLayout: 'default#imageWithContent',
                    iconImageHref: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                    iconImageSize: [44, 44],
                    iconImageOffset: [-22, -22],
                    iconContentLayout: ymaps.templateLayoutFactory.createClass(
                        `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid #fff;box-shadow:0 0 16px rgba(16,185,129,.6);animation:omegaPulse 2s infinite"></div>`
                    ),
                    iconContentOffset: [-22, -22],
                    zIndex: 1000
                });
                pm.events.add('click', () => showOmegaBay(b.id));
                S.map.geoObjects.add(pm);
                S.placemarks[b.id] = pm;
                return;
            }
            const pm = new ymaps.Placemark([b.lat, b.lon], {
                balloonContentHeader: `<b style="color:#00b4d8">${b.name}</b>`,
                balloonContentBody: `<div style="text-align:center">
                    <div style="color:#8899b0;font-size:11px">${b.region}</div>
                    <div style="font-size:28px;font-weight:700;font-family:Courier New;color:#ff6b35;margin:4px 0">${t}°C</div>
                    <div style="color:#f7931e;margin-bottom:6px">${'★'.repeat(Math.round(b.rating))} ${b.rating}</div>
                    <div style="display:flex;gap:4px;justify-content:center">
                        <button onclick="window.selectBeach(${b.id})" style="background:#00b4d8;border:none;padding:5px 10px;border-radius:20px;color:#fff;cursor:pointer;font-size:10px">График</button>
                        <button onclick="window.showForecast(${b.id})" style="background:#ff6b35;border:none;padding:5px 10px;border-radius:20px;color:#fff;cursor:pointer;font-size:10px">Прогноз</button>
                        <button onclick="window.showDesc(${b.id})" style="background:#556680;border:none;padding:5px 10px;border-radius:20px;color:#fff;cursor:pointer;font-size:10px">Описание</button>
                    </div>
                </div>`
            }, { preset: "islands#orangeIcon" });
            S.map.geoObjects.add(pm);
            S.placemarks[b.id] = pm;
        });
        setTimeout(updateAllTemps, 300);
    });
}

function quickLayer(name) {
    S.currentLayer = name;
    document.querySelectorAll('.map-layer-bar button').forEach(b => b.classList.remove('on'));
    const map = { satellite: 'lSat', model3d: 'l3d', daily: 'lDaily' };
    if (map[name]) document.getElementById(map[name]).classList.add('on');
    showMapImage(name);
    updateAllTemps();
    updateLayerInfo();
    hideCurrents();
    if (name === 'currents') { showMapImage('daily'); showCurrents(); updateLayerInfo(); }
}

function showMapImage(name) {
    if (name === 'salinity') { showSalinity(); return; }
    if (name === 'currents') return;
    if (mapLayer) { S.map.geoObjects.remove(mapLayer); mapLayer = null; }
    const imgs = { satellite: LAYER_IMGS.satellite, model3d: LAYER_IMGS.model3d, daily: LAYER_IMGS.daily };
    const labels = { satellite: 'GHRSST', model3d: 'BAMS 1km', daily: 'BAMS daily' };
    const data = { satellite: NC_DATA.satellite, model3d: NC_DATA.model3d, daily: NC_DATA.model_daily };
    if (!data[name]) return;
    mapLayer = new ymaps.GeoObject({
        geometry: { type: 'Rectangle', coordinates: data[name].bounds },
        properties: { balloonContent: labels[name] }
    }, { fillImageHref: imgs[name], fillOpacity: 1, strokeColor: '#00000000' });
    S.map.geoObjects.add(mapLayer);
}

function toggleLayer(name) { quickLayer(name); }

function showSalinity() {
    if (mapLayer) { S.map.geoObjects.remove(mapLayer); mapLayer = null; }
    mapLayer = new ymaps.GeoObject({
        geometry: { type: 'Rectangle', coordinates: NC_DATA.salinity_bounds },
        properties: { balloonContent: 'Солёность' }
    }, { fillImageHref: LAYER_IMGS.salinity, fillOpacity: .8, strokeColor: '#00000000' });
    S.map.geoObjects.add(mapLayer);
}

function showCurrents() {
    hideCurrents();
    if (!NC_DATA.currents || !NC_DATA.currents.length) return;
    NC_DATA.currents.forEach(c => {
        const pm = new ymaps.Placemark([c.lat, c.lon], {}, {
            iconLayout: 'default#image',
            iconImageHref: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M8,0 L10,6 L16,8 L10,10 L8,16 L6,10 L0,8 L6,6 Z" fill="rgba(0,182,212,.6)"/></svg>`),
            iconImageSize: [16, 16],
            iconImageOffset: [-8, -8]
        });
        S.map.geoObjects.add(pm);
        currentArrows.push(pm);
    });
}

function hideCurrents() {
    currentArrows.forEach(pm => S.map.geoObjects.remove(pm));
    currentArrows = [];
}

function updateDepth(source, idx) {
    idx = +idx;
    const data = NC_DATA.model_daily;
    if (!data?.depths) return;
    const depth = data.depths[idx];
    const label = depth < 1 ? `${Math.round(depth * 1000)} м` : `${depth.toFixed(1)} м`;
    document.getElementById('depthLabelDaily').textContent = label;
    if (data.depth_images?.[idx]) {
        const grid = data.depth_images[idx];
        const h = grid.length, w = grid[0].length;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(w, h);
        for (let i = 0; i < h; i++)
            for (let j = 0; j < w; j++) {
                const t = grid[i][j], pi = ((h - 1 - i) * w + j) * 4;
                if (t == null) { img.data[pi + 3] = 0; }
                else {
                    const n = Math.max(0, Math.min(1, (t - 2) / 23));
                    let r, g, b;
                    if (n < .25) { r = 0; g = 255 * (n / .25); b = 255; }
                    else if (n < .5) { r = 0; g = 255; b = 255 * (1 - (n - .25) / .25); }
                    else if (n < .75) { r = 255 * ((n - .5) / .25); g = 255; b = 0; }
                    else { r = 255; g = 255 * (1 - (n - .75) / .25); b = 0; }
                    img.data[pi] = r; img.data[pi + 1] = g; img.data[pi + 2] = b; img.data[pi + 3] = 180;
                }
            }
        ctx.putImageData(img, 0, 0);
        if (mapLayer) { S.map.geoObjects.remove(mapLayer); mapLayer = null; }
        mapLayer = new ymaps.GeoObject({
            geometry: { type: 'Rectangle', coordinates: data.bounds },
            properties: { balloonContent: `BAMS daily — ${label}` }
        }, { fillImageHref: canvas.toDataURL('image/png'), fillOpacity: 1, strokeColor: '#00000000' });
        S.map.geoObjects.add(mapLayer);
    }
}

function toggleRoute() {
    const btn = document.getElementById('routeBtn');
    if (routeLine) { S.map.geoObjects.remove(routeLine); routeLine = null; btn.classList.remove('on'); return; }
    btn.classList.add('on');
    const coords = [...BEACHES].sort((a, b) => a.lon - b.lon).map(b => [b.lat, b.lon]);
    ymaps.ready(() => {
        routeLine = new ymaps.Polyline(coords, {}, { strokeColor: '#00b4d8', strokeWidth: 3, strokeOpacity: .7, strokeStyle: '8 4' });
        S.map.geoObjects.add(routeLine);
    });
}

function refreshAwards() {
    if (!ymaps || !ymaps.templateLayoutFactory || !S.map) return;
    awardPlacemarks.forEach(pm => S.map.geoObjects.remove(pm));
    awardPlacemarks = [];
    const top = [...BEACHES].sort((a, b) => b.rating - a.rating).slice(0, 3);
    const colors = ['#f59e0b', '#94a3b8', '#cd7f32'];
    const glows = ['rgba(245,158,11,.4)', 'rgba(148,163,184,.4)', 'rgba(205,127,50,.4)'];
    top.forEach((b, i) => {
        const pm = new ymaps.Placemark([b.lat + .06, b.lon - 0.06], {
            balloonContent: `<div style="text-align:center"><b style="color:#00b4d8">${b.name}</b><br>Рейтинг: ${b.rating} | T: ${getTemp(b)}°C</div>`
        }, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
            iconImageSize: [36, 36],
            iconContentOffset: [-18, -18],
            iconContentLayout: ymaps.templateLayoutFactory.createClass(
                `<div style="width:36px;height:36px;border-radius:50%;background:${colors[i]};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;border:2px solid ${glows[i]};box-shadow:0 0 12px ${glows[i]},0 2px 8px rgba(0,0,0,.3);cursor:pointer;transition:transform .2s;animation:floatAward${i} 3s ease-in-out infinite" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">${i + 1}</div>`
            )
        });
        S.map.geoObjects.add(pm);
        awardPlacemarks.push(pm);
    });
}
"""

# ===== 6. charts.js — графики, календарь, экспорт =====
charts_js = r"""
async function updateGraph() {
    await ensurePlotly();
    if (S.tempData.length === 0) return;
    const b = BEACHES.find(x => x.id === S.currentBeach);
    if (!b) return;
    const sorted = [...S.tempData].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
    const dates = sorted.map(d => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`);
    const temps = sorted.map(d => d.temp);
    Plotly.newPlot('temperatureGraph', [{
        x: dates, y: temps, type: 'scatter', mode: 'lines+markers',
        marker: { color: temps.map(t => t > 20 ? '#ff6b35' : t > 14 ? '#eab308' : '#00b4d8'), size: 4 },
        line: { color: '#00b4d8', width: 1.5 },
        fill: 'tozeroy', fillcolor: 'rgba(0,182,212,.08)'
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#e0e6f0', size: 10 },
        xaxis: { tickangle: -45, tickfont: { size: 8 }, gridcolor: '#1e3050' },
        yaxis: { title: '°C', gridcolor: '#1e3050' },
        margin: { t: 10, l: 40, r: 10, b: 50 }
    }, { responsive: true, displayModeBar: false });
}

function exportChart(id, fmt) {
    ensurePlotly().then(() => Plotly.downloadImage(id, { format: fmt, width: 1200, height: 600, filename: `blacksea_${id}` }));
}

function toggleGraphPanel() {
    document.getElementById('graphPanel').classList.toggle('open');
    if (document.getElementById('graphPanel').classList.contains('open')) updateGraph();
}

async function showForecast(id) {
    await ensurePlotly();
    const b = BEACHES.find(x => x.id === id);
    if (!b) return;
    const trend = NC_DATA.forecast_trend?.[b.name];
    let baseTemp, slope, label;
    if (trend) { baseTemp = trend.last_temp; slope = trend.slope; label = `Тренд: ${slope >= 0 ? '+' : ''}${slope.toFixed(2)} °C/день`; }
    else { baseTemp = parseFloat(getTemp(b)); slope = 0; label = 'Нет данных тренда'; }
    const times = [], temps = [], lo = [], hi = [];
    const now = new Date();
    const ch = now.getHours() + now.getMinutes() / 60;
    for (let i = 0; i <= 48; i += 3) {
        const d = new Date(now.getTime() + i * 3600000);
        times.push(d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
        const dc = Math.sin(((ch + i) % 24 - 6) * Math.PI / 12) * 0.8;
        const tv = slope * (i / 24);
        const t = baseTemp + dc + tv;
        temps.push(+t.toFixed(1));
        lo.push(+(t - 1).toFixed(1));
        hi.push(+(t + 1).toFixed(1));
    }
    document.getElementById('forecastTitle').innerHTML = `Прогноз — ${b.name}<br><span style="font-size:12px;color:var(--text2);font-weight:400">${label}</span>`;
    Plotly.newPlot('forecastChart', [
        { x: times, y: hi, type: 'scatter', mode: 'lines', showlegend: false, line: { color: 'rgba(0,182,212,.2)', width: 0 } },
        { x: times, y: lo, type: 'scatter', mode: 'lines', name: 'Неопределённость', fill: 'tonexty', fillcolor: 'rgba(0,182,212,.12)', line: { color: 'rgba(0,182,212,.2)', width: 0 } },
        { x: times, y: temps, type: 'scatter', mode: 'lines+markers', name: 'Прогноз', marker: { color: '#00b4d8', size: 7 }, line: { color: '#00b4d8', width: 2 } }
    ], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#e0e6f0', size: 10 },
        xaxis: { tickangle: -45, tickfont: { size: 8 }, gridcolor: '#1e3050' },
        yaxis: { title: '°C', gridcolor: '#1e3050' },
        margin: { t: 30, l: 40, r: 10, b: 50 }
    }, { responsive: true, displayModeBar: false });
    openModal('forecastModal');
}

async function showStatsTable() {
    await ensurePlotly();
    const st = NC_DATA.sat_temps || {}, mt = NC_DATA.m3d_temps || {}, dt = NC_DATA.daily_temps || {};
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="padding:8px;text-align:left;border-bottom:2px solid var(--border);color:var(--accent)">Пляж</th><th style="padding:8px;text-align:left;border-bottom:2px solid var(--border);color:var(--accent)">Спутник</th><th style="padding:8px;text-align:left;border-bottom:2px solid var(--border);color:var(--accent)">3D</th><th style="padding:8px;text-align:left;border-bottom:2px solid var(--border);color:var(--accent)">Daily</th><th style="padding:8px;text-align:left;border-bottom:2px solid var(--border);color:var(--accent)">⭐</th></tr></thead><tbody>';
    BEACHES.forEach(b => {
        html += `<tr>
            <td style="padding:7px 8px;font-weight:600;border-bottom:1px solid var(--border)">${b.name}</td>
            <td style="padding:7px 8px;color:#00b4d8;font-family:Courier New;border-bottom:1px solid var(--border)">${st[b.name] != null ? st[b.name].toFixed(1) + '°' : '—'}</td>
            <td style="padding:7px 8px;color:#22c55e;font-family:Courier New;border-bottom:1px solid var(--border)">${mt[b.name] != null ? mt[b.name].toFixed(1) + '°' : '—'}</td>
            <td style="padding:7px 8px;color:#FF9800;font-family:Courier New;border-bottom:1px solid var(--border)">${dt[b.name] != null ? dt[b.name].toFixed(1) + '°' : '—'}</td>
            <td style="padding:7px 8px;color:#f7931e;border-bottom:1px solid var(--border)">${b.rating}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('statsTable').innerHTML = html;
    Plotly.newPlot('statsChart', [
        { x: BEACHES.map(b => b.name), y: BEACHES.map(b => st[b.name] || 0), type: 'bar', name: 'Спутник', marker: { color: '#00b4d8' } },
        { x: BEACHES.map(b => b.name), y: BEACHES.map(b => mt[b.name] || 0), type: 'bar', name: '3D', marker: { color: '#22c55e' } },
        { x: BEACHES.map(b => b.name), y: BEACHES.map(b => dt[b.name] || 0), type: 'bar', name: 'Daily', marker: { color: '#FF9800' } }
    ], {
        barmode: 'group', paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#e0e6f0', size: 10 },
        xaxis: { tickangle: -45 }, yaxis: { title: '°C', gridcolor: '#1e3050' },
        legend: { font: { size: 10 } }, margin: { t: 20, l: 40, r: 10, b: 70 }
    }, { responsive: true, displayModeBar: false });
    openModal('statsModal');
}

function buildCompareSelects() {
    const o = BEACHES.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    document.getElementById('compareBeach1').innerHTML = o;
    document.getElementById('compareBeach2').innerHTML = o;
    document.getElementById('compareBeach2').selectedIndex = 4;
}

async function updateCompare() {
    await ensurePlotly();
    const id1 = +document.getElementById('compareBeach1').value, id2 = +document.getElementById('compareBeach2').value;
    const b1 = BEACHES.find(b => b.id === id1), b2 = BEACHES.find(b => b.id === id2);
    if (!b1 || !b2) return;
    const p1 = NC_DATA.vertical_profiles_3d?.find(p => p.name === b1.name), p2 = NC_DATA.vertical_profiles_3d?.find(p => p.name === b2.name);
    if (!p1 || !p2) return;
    const v1 = p1.temps.filter(t => t != null && t > .1), d1 = p1.depths.slice(0, v1.length);
    const v2 = p2.temps.filter(t => t != null && t > .1), d2 = p2.depths.slice(0, v2.length);
    Plotly.newPlot('compareChart', [
        { x: v1, y: d1.map(d => -d), type: 'scatter', mode: 'lines+markers', name: b1.name, line: { color: '#00b4d8', width: 2 }, marker: { size: 4 } },
        { x: v2, y: d2.map(d => -d), type: 'scatter', mode: 'lines+markers', name: b2.name, line: { color: '#ff6b35', width: 2 }, marker: { size: 4 } }
    ], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#e0e6f0', size: 10 },
        xaxis: { title: '°C', gridcolor: '#1e3050' }, yaxis: { title: 'Глубина (м)', gridcolor: '#1e3050' },
        legend: { font: { size: 10 } }, margin: { t: 20, l: 50, r: 10, b: 50 }
    }, { responsive: true, displayModeBar: false });
}

function showCompare() { openModal('compareModal'); updateCompare(); }

function buildDepthCompareSelects() {
    const o = BEACHES.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    document.getElementById('compareDepth1').innerHTML = o;
    document.getElementById('compareDepth2').innerHTML = o;
    document.getElementById('compareDepth2').selectedIndex = 4;
}

async function updateDepthCompare() {
    await ensurePlotly();
    const id1 = +document.getElementById('compareDepth1').value, id2 = +document.getElementById('compareDepth2').value;
    const b1 = BEACHES.find(b => b.id === id1), b2 = BEACHES.find(b => b.id === id2);
    if (!b1 || !b2) return;
    const src = document.getElementById('profileSource')?.value || 'daily';
    const profs = src === '3d' ? NC_DATA.vertical_profiles_3d : NC_DATA.vertical_profiles_daily;
    const p1 = profs?.find(p => p.name === b1.name), p2 = profs?.find(p => p.name === b2.name);
    if (!p1 || !p2) return;
    const v1 = p1.temps.filter(t => t != null && t > 0), d1 = p1.depths.slice(0, v1.length);
    const v2 = p2.temps.filter(t => t != null && t > 0), d2 = p2.depths.slice(0, v2.length);
    Plotly.newPlot('depthCompareChart', [
        { x: v1, y: d1.map(d => -d), type: 'scatter', mode: 'lines+markers', name: b1.name, line: { color: '#00b4d8', width: 2 }, marker: { size: 4 } },
        { x: v2, y: d2.map(d => -d), type: 'scatter', mode: 'lines+markers', name: b2.name, line: { color: '#ff6b35', width: 2 }, marker: { size: 4 } }
    ], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#e0e6f0', size: 10 },
        xaxis: { title: '°C', gridcolor: '#1e3050' }, yaxis: { title: 'Глубина (м)', gridcolor: '#1e3050' },
        legend: { font: { size: 10 } }, margin: { t: 10, l: 50, r: 10, b: 40 }
    }, { responsive: true, displayModeBar: false });
}

async function updateProfile() {
    await ensurePlotly();
    const source = document.getElementById('profileSource').value;
    const b = BEACHES.find(x => x.id === S.currentBeach);
    if (!b) return;
    const profs = source === '3d' ? NC_DATA.vertical_profiles_3d : NC_DATA.vertical_profiles_daily;
    const prof = profs?.find(p => p.name === b.name);
    if (!prof) return;
    const vt = prof.temps.filter(t => t != null && t > 0), vd = prof.depths.slice(0, vt.length);
    Plotly.newPlot('profileChart', [{
        x: vt, y: vd.map(d => -d), type: 'scatter', mode: 'lines+markers',
        marker: { color: vt.map(t => t > 20 ? '#ff6b35' : t > 14 ? '#eab308' : '#00b4d8'), size: 4 },
        line: { color: '#00b4d8', width: 2 }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#e0e6f0', size: 10 },
        xaxis: { title: '°C', gridcolor: '#1e3050' }, yaxis: { title: 'Глубина (м)', gridcolor: '#1e3050' },
        margin: { t: 10, l: 50, r: 10, b: 40 }
    }, { responsive: true, displayModeBar: false });
    updateDepthCompare();
}

// ===== CALENDAR =====
function initCalendar() { renderCalendar(); }

function renderCalendar() {
    const y = S.calYear, m = S.calMonth;
    document.getElementById('calMonth').textContent = new Date(y, m - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const allData = {};
    S.tempData.forEach(p => {
        const k = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
        allData[k] = p.temp;
    });
    if (NC_DATA.root_nc) NC_DATA.root_nc.forEach(item => {
        const temps = Object.values(item.temps).filter(v => v != null);
        if (temps.length > 0) {
            const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
            const d = item.date;
            allData[`${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`] = Math.round(avg * 10) / 10;
        }
    });
    const g = document.getElementById('calendarGrid');
    g.innerHTML = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="cal-h">${d}</div>`).join('');
    const fd = new Date(y, m - 1, 1).getDay(), dim = new Date(y, m, 0).getDate(), sd = fd === 0 ? 6 : fd - 1;
    for (let i = 0; i < sd; i++) g.innerHTML += '<div class="cal-d" style="opacity:.15"></div>';
    for (let d = 1; d <= dim; d++) {
        const k = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, t = allData[k];
        let bg = '', cs = '';
        if (t != null) {
            bg = t > 20 ? 'rgba(255,107,53,.15)' : t > 14 ? 'rgba(234,179,8,.15)' : 'rgba(0,182,212,.15)';
            cs = t > 20 ? '#ff6b35' : t > 14 ? '#eab308' : '#00b4d8';
        }
        g.innerHTML += `<div class="cal-d${t != null ? ' has' : ''}" style="background:${bg}">
            <div style="font-size:9px;color:var(--text3)">${d}</div>
            ${t != null ? `<div class="ct" style="color:${cs}">${t.toFixed(0)}°</div>` : ''}
        </div>`;
    }
}

function calNav(dir) {
    S.calMonth += dir;
    if (S.calMonth > 12) { S.calMonth = 1; S.calYear++; }
    if (S.calMonth < 1) { S.calMonth = 12; S.calYear--; }
    renderCalendar();
}

// ===== EXPORT =====
function exportCSV() {
    let csv = 'Дата,Температура\n';
    S.tempData.forEach(d => csv += `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')},${d.temp}\n`);
    download(csv, 'blacksea_temperature.csv', 'text/csv');
}

function exportJSON() {
    download(JSON.stringify(S.tempData, null, 2), 'blacksea_data.json', 'application/json');
}

function exportSeasonal() {
    const s = NC_DATA.seasonal || {};
    let csv = 'Месяц,Средняя,Мин,Макс,Кол-во\n';
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    months.forEach((m, i) => {
        if (s[i + 1]) csv += `${m},${s[i + 1].avg},${s[i + 1].min},${s[i + 1].max},${s[i + 1].count}\n`;
    });
    download(csv, 'blacksea_seasonal.csv', 'text/csv');
}

function renderSeasonal() {
    ensurePlotly().then(() => {
        const s = NC_DATA.seasonal || {};
        const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        Plotly.newPlot('seasonalChart', [{
            x: months, y: months.map((_, i) => s[i + 1]?.avg || null), type: 'scatter', mode: 'lines+markers',
            fill: 'tozeroy', fillcolor: 'rgba(0,182,212,.15)',
            line: { color: '#00b4d8', width: 2 },
            marker: { size: 8, color: months.map((_, i) => { const t = s[i + 1]?.avg || 0; return t > 20 ? '#ff6b35' : t > 14 ? '#eab308' : '#00b4d8'; }) },
            name: 'Средняя T',
            text: months.map((_, i) => s[i + 1] ? `${s[i + 1].avg}°` : ''),
            textposition: 'top center'
        }], {
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            font: { color: '#e0e6f0', size: 10 },
            xaxis: { gridcolor: '#1e3050' }, yaxis: { title: '°C', gridcolor: '#1e3050' },
            margin: { t: 20, l: 40, r: 10, b: 30 }
        }, { responsive: true, displayModeBar: false });
    });
}

// ===== LOADED NC =====
function renderLoadedNc() {
    const nc = NC_DATA.root_nc;
    if (!nc || nc.length === 0) return;
    const el = document.getElementById('loadedNcList');
    if (!el) return;
    el.innerHTML = nc.map(item => {
        const t = Object.entries(item.temps).filter(([, v]) => v != null).map(([k, v]) => `<span class="tag">${k}: ${v.toFixed(1)}°C</span>`).join(' ');
        return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 8px;margin-bottom:4px;font-size:10px">
            <div style="font-weight:600;color:var(--accent)">${item.filename}</div>
            <div style="color:var(--text3)">${item.date}</div>
            <div style="margin-top:3px">${t}</div>
        </div>`;
    }).join('');
}

// ===== DEMO =====
function loadDemo() {
    S.tempData = [
        { temp: 25.1, year: 1981, month: 9, day: 1 }, { temp: 24.8, year: 1981, month: 9, day: 2 },
        { temp: 24.4, year: 1981, month: 9, day: 3 }, { temp: 24.3, year: 1981, month: 9, day: 4 },
        { temp: 24.6, year: 1981, month: 9, day: 6 }, { temp: 23.7, year: 1981, month: 9, day: 11 },
        { temp: 22.5, year: 1981, month: 9, day: 18 }, { temp: 22.7, year: 1981, month: 10, day: 1 },
        { temp: 21.3, year: 1981, month: 10, day: 4 }, { temp: 19.9, year: 1981, month: 10, day: 18 },
        { temp: 18.0, year: 1981, month: 11, day: 1 }, { temp: 17.0, year: 1981, month: 11, day: 13 },
        { temp: 14.5, year: 1981, month: 11, day: 20 }, { temp: 13.4, year: 1981, month: 12, day: 2 },
        { temp: 12.9, year: 1981, month: 12, day: 15 }, { temp: 11.9, year: 1981, month: 12, day: 31 },
        { temp: 12.0, year: 1982, month: 1, day: 1 }, { temp: 10.4, year: 1982, month: 1, day: 11 },
        { temp: 9.9, year: 1982, month: 1, day: 16 }, { temp: 9.6, year: 1982, month: 1, day: 17 },
        { temp: 8.9, year: 1982, month: 2, day: 11 }, { temp: 8.6, year: 1982, month: 2, day: 14 },
        { temp: 8.7, year: 1982, month: 3, day: 1 }, { temp: 10.4, year: 1982, month: 3, day: 15 },
        { temp: 14.8, year: 1982, month: 4, day: 19 }, { temp: 13.0, year: 1982, month: 5, day: 1 },
        { temp: 15.1, year: 1982, month: 5, day: 14 }, { temp: 19.4, year: 1982, month: 5, day: 24 },
        { temp: 20.3, year: 1982, month: 5, day: 31 }, { temp: 22.5, year: 1982, month: 7, day: 1 },
        { temp: 25.0, year: 1982, month: 7, day: 28 }, { temp: 25.7, year: 1982, month: 8, day: 26 },
        { temp: 25.4, year: 1982, month: 9, day: 1 }, { temp: 22.9, year: 1982, month: 9, day: 20 },
        { temp: 21.8, year: 1982, month: 10, day: 1 }, { temp: 19.4, year: 1982, month: 10, day: 20 },
        { temp: 18.0, year: 1982, month: 11, day: 1 }, { temp: 15.1, year: 1982, month: 11, day: 15 },
        { temp: 13.5, year: 1982, month: 12, day: 1 }, { temp: 11.0, year: 1982, month: 12, day: 31 }
    ];
    if (NC_DATA.dat_records?.length > 0) S.tempData = [...S.tempData, ...NC_DATA.dat_records].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
    const badge = document.getElementById('dataModeBadge');
    if (badge) { badge.textContent = 'График: демо (1981–2016) · Слои: модель'; badge.className = 'data-mode-badge demo'; }
    buildBeachList();
    updateAllTemps();
}
"""

# ===== 7. three.js — 3D визуализация =====
three_js = r"""
function tempToColor3d(t, tmin, tmax) {
    if (t == null || t <= 0) return null;
    const n = Math.max(0, Math.min(1, (t - tmin) / (tmax - tmin)));
    let r, g, b;
    if (n < .25) { r = 0; g = Math.round(255 * (n / .25)); b = 255; }
    else if (n < .5) { r = 0; g = 255; b = Math.round(255 * (1 - (n - .25) / .25)); }
    else if (n < .75) { r = Math.round(255 * ((n - .5) / .25)); g = 255; b = 0; }
    else { r = 255; g = Math.round(255 * (1 - (n - .75) / .25)); b = 0; }
    return new THREE.Color(r / 255, g / 255, b / 255);
}

function open3D() { openModal('modal3d'); if (!scene3d) init3D(); update3D(); }
function close3D() { closeModal('modal3d'); if (animId3d) { cancelAnimationFrame(animId3d); animId3d = null; } }

function init3D() {
    const cont = document.getElementById('container3d');
    const canvas = document.getElementById('canvas3d');
    const w = cont.clientWidth, h = cont.clientHeight;
    canvas.width = w; canvas.height = h;
    scene3d = new THREE.Scene();
    scene3d.background = new THREE.Color(0x0a0e1a);
    camera3d = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    camera3d.position.set(0, 40, 60);
    camera3d.lookAt(0, 0, 0);
    renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer3d.setSize(w, h);
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const amb = new THREE.AmbientLight(0xffffff, 0.6); scene3d.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(20, 40, 30); scene3d.add(dir);
    const dir2 = new THREE.DirectionalLight(0x4488cc, 0.3); dir2.position.set(-20, 20, -10); scene3d.add(dir2);
    const axes = new THREE.AxesHelper(15); axes.visible = false; scene3d.add(axes);
    let dragging = false, prevX = 0, prevY = 0, camTheta = 0.5, camPhi = 0.8, camDist = 70;
    function updateCam() {
        camera3d.position.set(camDist * Math.sin(camPhi) * Math.cos(camTheta), camDist * Math.cos(camPhi), camDist * Math.sin(camPhi) * Math.sin(camTheta));
        camera3d.lookAt(0, -2, 0);
    }
    updateCam();
    function onDown(e) { dragging = true; const p = e.touches ? e.touches[0] : e; prevX = p.clientX; prevY = p.clientY; }
    function onMove(e) {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - prevX, dy = p.clientY - prevY;
        camTheta -= dx * 0.005;
        camPhi = Math.max(0.1, Math.min(1.5, camPhi - dy * 0.005));
        prevX = p.clientX; prevY = p.clientY;
        updateCam();
    }
    function onUp() { dragging = false; }
    function onWheel(e) { camDist = Math.max(15, Math.min(150, camDist + e.deltaY * 0.05)); updateCam(); e.preventDefault(); }
    canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp); canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false }); canvas.addEventListener('touchmove', onMove, { passive: false }); canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', () => {
        if (!renderer3d) return;
        const c2 = document.getElementById('container3d');
        if (!c2) return;
        const w2 = c2.clientWidth, h2 = c2.clientHeight;
        camera3d.aspect = w2 / h2; camera3d.updateProjectionMatrix();
        renderer3d.setSize(w2, h2);
    });
}

function update3D() {
    const src = document.getElementById('src3d')?.value || 'daily';
    const data = src === '3d' ? NC_DATA.model3d : NC_DATA.model_daily;
    if (!data || !data.sst) return;
    if (scene3d && mesh3d) { scene3d.remove(mesh3d); mesh3d.geometry.dispose(); mesh3d.material.dispose(); mesh3d = null; }
    if (scene3d) { beachMarkers3d.forEach(m => scene3d.remove(m)); beachMarkers3d = []; }
    const grid = data.depth_images ? data.depth_images[0] : data.sst;
    if (!grid) return;
    const slider = document.getElementById('depthSlider3d');
    const maxIdx = data.depth_images ? data.depth_images.length - 1 : 0;
    slider.max = maxIdx;
    const depths = data.depths;
    if (depths && depths[curDepthIdx3d] != null) {
        const d = depths[curDepthIdx3d];
        document.getElementById('depthLabel3d').textContent = d < 1 ? Math.round(d * 1000) + ' м' : d.toFixed(1) + ' м';
    }
    build3DSurface(grid, data.lats, data.lons);
    BEACHES.forEach(b => {
        const sg = new THREE.SphereGeometry(0.5, 8, 8);
        const sm = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
        const m = new THREE.Mesh(sg, sm);
        const lat = data.lats[0], lon = data.lons[0];
        const latR = (b.lat - lat) / (data.lats[data.lats.length - 1] - lat);
        const lonR = (b.lon - lon) / (data.lons[data.lons.length - 1] - lon);
        m.position.set((lonR - 0.5) * 80, 2, (-latR + 0.5) * 60);
        scene3d.add(m); beachMarkers3d.push(m);
        m.userData = { name: b.name };
    });
    animate3D();
}

function build3DSurface(grid, lats, lons) {
    if (mesh3d) { scene3d.remove(mesh3d); mesh3d.geometry.dispose(); mesh3d.material.dispose(); }
    const rows = grid.length, cols = grid[0].length;
    const geo = new THREE.PlaneGeometry(80, 60, cols - 1, rows - 1);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tMin = 2, tMax = 25;
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const idx = i * cols + j;
            if (idx >= pos.count) break;
            const t = grid[i][j];
            if (t != null && t > 0) {
                const h = t * (zScale / 5);
                pos.setZ(idx, h);
                const c = tempToColor3d(t, tMin, tMax);
                if (c) { colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b; }
                else { pos.setZ(idx, 0); colors[idx * 3] = 0.04; colors[idx * 3 + 1] = 0.06; colors[idx * 3 + 2] = 0.1; }
            } else {
                pos.setZ(idx, 0);
                colors[idx * 3] = 0.04; colors[idx * 3 + 1] = 0.06; colors[idx * 3 + 2] = 0.1;
            }
        }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, shininess: 60, transparent: true, opacity: 0.92 });
    mesh3d = new THREE.Mesh(geo, mat);
    mesh3d.rotation.x = -Math.PI / 2;
    scene3d.add(mesh3d);
}

function update3DDepth(idx) {
    curDepthIdx3d = idx;
    const src = document.getElementById('src3d')?.value || 'daily';
    const data = src === '3d' ? NC_DATA.model3d : NC_DATA.model_daily;
    if (!data) return;
    const depths = data.depths;
    if (depths && depths[idx] != null) {
        const d = depths[idx];
        document.getElementById('depthLabel3d').textContent = d < 1 ? Math.round(d * 1000) + ' м' : d.toFixed(1) + ' м';
    }
    const grid = data.depth_images ? data.depth_images[idx] : data.sst;
    if (!grid) return;
    build3DSurface(grid, data.lats, data.lons);
}

function update3DZScale(v) { zScale = v; if (curDepthIdx3d != null) update3DDepth(curDepthIdx3d); }

function animate3D() {
    if (!scene3d || !renderer3d) return;
    animId3d = requestAnimationFrame(animate3D);
    renderer3d.render(scene3d, camera3d);
}
"""

# ===== Запись файлов =====
files = {
    'state.js': state_js,
    'utils.js': utils_js,
    'data-loader.js': data_loader_js,
    'beaches.js': beaches_js,
    'map.js': map_js,
    'charts.js': charts_js,
    'three.js': three_js,
}

for name, content in files.items():
    path = os.path.join(JS_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"✅ Создан {path}")

print("\n🎉 Все JS-модули созданы! Теперь нужно обновить index.html.")
