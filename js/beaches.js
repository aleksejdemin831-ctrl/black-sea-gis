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
        
        // Маркеры станций (кружочки с температурой)
        addOmegaStationMarkers();

        // Изолинии температуры (по переключателю)
        if (document.getElementById('omegaIsolinesToggle')?.checked) addOmegaIsolines();
        renderOmegaStationList();
    });
}

function omegaTempColor(t) {
    // Простая шкала 20..26 °C
    const n = Math.max(0, Math.min(1, (t - 20) / 6));
    const r = Math.round(60 + 195 * n);
    const g = Math.round(180 - 90 * n);
    const b = Math.round(220 - 160 * n);
    return `rgb(${r},${g},${b})`;
}

function clearOmegaStationMarkers() {
    if (!omegaBayMap) return;
    omegaStationMarks.forEach(pm => omegaBayMap.geoObjects.remove(pm));
    omegaStationMarks = [];
}

function addOmegaStationMarkers() {
    if (!omegaBayMap || !OMEGA_DATA) return;
    clearOmegaStationMarkers();
    const pts = getOmegaSurfacePoints();
    pts.forEach(f => {
        const p = f.properties || {};
        const t = p.T;
        const sn = omegaStationNum(p['Имя станции']);
        if (t == null || !f.geometry?.coordinates) return;
        const [lon, lat] = f.geometry.coordinates;

        const color = omegaTempColor(t);
        const content = `
            <div style="
                width:38px;height:38px;border-radius:50%;
                background:${color};
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                border:2px solid rgba(255,255,255,.9);
                box-shadow:0 6px 14px rgba(0,0,0,.25);
                font-family:'Courier New',monospace;
                color:#0b1628;
                line-height:1;
            ">
                <div style="font-size:9px;font-weight:800;opacity:.8">№${sn}</div>
                <div style="font-size:12px;font-weight:900">${(+t).toFixed(1)}</div>
            </div>
        `;

        const pm = new ymaps.Placemark([lat, lon], {
            balloonContentHeader: `<b>Станция ${sn}</b>`,
            balloonContentBody: `<div style="font-size:12px"><b>${(+t).toFixed(1)}°C</b>${p.S != null ? ` · S: ${p.S} PSU` : ''}</div>`
        }, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
            iconImageSize: [38, 38],
            iconImageOffset: [-19, -19],
            iconContentLayout: ymaps.templateLayoutFactory.createClass(content),
            iconContentOffset: [-19, -19],
            zIndex: 2000
        });

        omegaBayMap.geoObjects.add(pm);
        omegaStationMarks.push(pm);
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
        const medal = i === 0 ? '🥇' : i === 1 ? '' : i === 2 ? '' : `<span style="color:var(--text3)">${i + 1}</span>`;
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
