// ===== КАРТА И СЛОИ =====

function updateLayerInfo() {
    const el = document.getElementById('layerInfoBar');
    if (!el) return;
    
    const info = {
        satellite: { 
            src: 'GHRSST SST', 
            date: NC_DATA?.satellite?.date || '20.09.2021', 
            unit: '°C',
            desc: 'Спутник, ~1 км'
        },
        model3d: { 
            src: 'BAMS 1km', 
            date: NC_DATA?.model3d?.date || 'Анализ', 
            unit: '°C',
            desc: '3D модель, поверхность'
        },
        daily: { 
            src: 'BAMS daily', 
            date: NC_DATA?.model_daily?.date || 'Суточный', 
            unit: '°C',
            desc: 'Модель, ~2.4 км'
        },
        salinity: { 
            src: 'BAMS daily', 
            date: NC_DATA?.model_daily?.date || 'so', 
            unit: 'PSU',
            desc: 'Солёность, ~2.4 км'
        },
        currents: { 
            src: 'BAMS daily', 
            date: NC_DATA?.model_daily?.date || 'uo/vo', 
            unit: 'м/с',
            desc: 'Течения, ~2.4 км'
        }
    };
    
    const i = info[S.currentLayer] || info.satellite;
    el.innerHTML = `
        <b>${i.src}</b> · 
        <span style="color:var(--text2)">${i.date}</span> · 
        <span style="color:var(--accent);font-weight:700">${i.unit}</span>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">${i.desc}</div>
    `;
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
                        <button onclick="window.showOmegaBay(${b.id})" style="background:#10b981;border:none;padding:8px 16px;border-radius:20px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;margin-top:8px">Карта бухты Омега</button>
                    </div>`
                }, {
                    iconLayout: 'default#imageWithContent',
                    iconImageHref: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                    iconImageSize: [44, 44],
                    iconImageOffset: [-22, -22],
                    iconContentLayout: ymaps.templateLayoutFactory.createClass(
                        `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;font-weight:800;border:3px solid #fff;box-shadow:0 0 16px rgba(16,185,129,.6);animation:omegaPulse 2s infinite;color:#fff;line-height:1">
                            <div style="font-size:13px">${t}</div>
                            <div style="font-size:9px;opacity:.85">°C</div>
                        </div>`
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
    updateLayerInfo(); // Обновляем подпись (Пункт 5)
    
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
    
    // Для PNG-слоёв границы должны соответствовать НЕ центрам ячеек сетки,
    // а внешним границам пикселей (т.е. +/− половина шага по lat/lon).
    // Иначе слой "чуть-чуть съезжает" относительно подложки.
    function calcBoundsFromAxes(ds) {
        const lats = ds?.lats, lons = ds?.lons;
        if (!Array.isArray(lats) || !Array.isArray(lons) || lats.length < 2 || lons.length < 2) return null;
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLon = Math.min(...lons), maxLon = Math.max(...lons);
        const latStep = Math.abs(lats[1] - lats[0]) || 0;
        const lonStep = Math.abs(lons[1] - lons[0]) || 0;
        return [
            [minLat - latStep / 2, minLon - lonStep / 2],
            [maxLat + latStep / 2, maxLon + lonStep / 2]
        ];
    }

    // Приоритет:
    // 1) расчёт по осям (самый точный для пиксельной картинки),
    // 2) сохранённые bounds (если вдруг осей нет),
    // 3) запасной вариант из общего файла.
    const bounds = calcBoundsFromAxes(data[name]) ||
        (name === 'satellite' ? NC_DATA.sat_bounds : name === 'model3d' ? NC_DATA.m3d_bounds : NC_DATA.daily_bounds) ||
        data[name].bounds;
    if (!bounds) return;

    mapLayer = new ymaps.GeoObject({
        geometry: { type: 'Rectangle', coordinates: bounds },
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
    const maxIdx = Math.max(0, data.depths.length - 1);
    if (!Number.isFinite(idx)) idx = 0;
    if (idx < 0) idx = 0;
    if (idx > maxIdx) idx = maxIdx;

    // Подправляем сам слайдер, чтобы он не уходил в "пустые" глубины
    const slider = document.getElementById('depthSliderDaily');
    if (slider) {
        slider.max = String(maxIdx);
        if (+slider.value !== idx) slider.value = String(idx);
    }

    const depth = data.depths[idx];
    if (depth == null) return;
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
