// ===== БУХТА ОМЕГА: полевые измерения 17.06.2026 (пункт 9) =====

function omegaStationNum(name) {
  return String(name).split('|')[0].replace(/\s*(.*)/, '').trim();
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
  for (let i = 0; i < h; i++)
    for (let j = 0; j < w; j++) {
      const t = grid[i][j];
      if (t == null) continue;
      const n = Math.max(0, Math.min(1, (t - 20) / 6));
      ctx.fillStyle = 'rgba(' + Math.round(255 * n) + ',' + Math.round(180 * (1 - n)) + ',' + Math.round(80 * (1 - n)) + ',0.35)';
      ctx.fillRect(j, i, 1, 1);
    }
  // Изолинии 21–25 °C
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
            const px = (x === j + 0.5 ? j + t : j);
            const py = (y === i + 0.5 ? i + t : i);
            if (!started) { ctx.moveTo(px, py); started = true; }
            else ctx.lineTo(px, py);
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
    return '<div class="omega-st-item"><span class="st-num">Ст. ' + sn + '</span> <span class="st-t">' + p.T + '°C</span><br>S: ' + (p.S != null ? p.S + ' PSU' : '—') + ' · ' + p['Глубина места'] + '</div>';
  }).join('');
}

let omegaStationLayoutCls = null;
function getOmegaStationLayout() {
  if (omegaStationLayoutCls) return omegaStationLayoutCls;
  omegaStationLayoutCls = ymaps.templateLayoutFactory.createClass(
    '<div style="display:flex;align-items:center;gap:4px;cursor:pointer" title="Станция {{ properties.num }}">' +
      '<div style="width:26px;height:26px;border-radius:50%;background:#10b981;border:2px solid #fff;color:#fff;font:700 12px/22px Segoe UI,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.45)">{{ properties.num }}</div>' +
      '<div style="background:rgba(11,22,40,.88);border:1px solid #10b981;color:#e0e6f0;font:700 10px Segoe UI,sans-serif;padding:2px 6px;border-radius:6px;white-space:nowrap">{{ properties.tLabel }}</div>' +
    '</div>'
  );
  return omegaStationLayoutCls;
}

function initOmegaBayMap() {
  if (!OMEGA_DATA || !window.ymaps) return;
  const el = document.getElementById('omegaBayMap');
  if (omegaBayMap) { omegaBayMap.destroy(); omegaBayMap = null; }
  omegaStationMarks = [];
  omegaIsolineLayer = null;

  ymaps.ready(() => {
    omegaBayMap = new ymaps.Map(el, { center: [44.5972, 33.4435], zoom: 16, controls: ['zoomControl', 'typeSelector'] });

    // СТАНЦИИ С ПОДПИСЯМИ «номер: температура °C» (как в примерах наставника)
    const byStation = {};
    OMEGA_DATA.features.forEach(f => {
      const n = omegaStationNum(f.properties['Имя станции']);
      (byStation[n] = byStation[n] || []).push(f);
    });
    Object.keys(byStation).sort((a, b) => +a - +b).forEach(num => {
      const feats = byStation[num];
      const surf = feats.find(f => f.properties['Слой'] === 'Поверхностный');
      const base = surf || feats[0];
      const [lon, lat] = base.geometry.coordinates;
      const rows = feats.map(f =>
        '<tr><td style="border:1px solid #ccc;padding:2px 6px">' + f.properties['Слой'] + '</td>' +
        '<td style="border:1px solid #ccc;padding:2px 6px"><b>' + f.properties.T + '°C</b></td>' +
        '<td style="border:1px solid #ccc;padding:2px 6px">' + (f.properties.S != null ? f.properties.S + ' PSU' : '—') + '</td>' +
        '<td style="border:1px solid #ccc;padding:2px 6px">' + (f.properties['Время'] || '') + '</td></tr>'
      ).join('');
      const pm = new ymaps.Placemark([lat, lon], {
        num: num,
        tLabel: (surf && surf.properties.T != null) ? surf.properties.T + '°C' : '',
        balloonContent:
          '<div style="font:12px Segoe UI,sans-serif"><b>Станция ' + num + '</b><br>' +
          '<span style="color:#10b981;font-weight:700">Полевые измерения 17.06.2026 · прибор ТМА-21 · не модель и не демо</span><br>' +
          '<i>' + base.properties['Положение станции'] + '</i><br>' +
          'Глубина места: ' + base.properties['Глубина места'] + ' · дно: ' + base.properties['Тип дна'] +
          '<table style="border-collapse:collapse;margin-top:6px"><tr style="background:#eef2f7"><th style="border:1px solid #ccc;padding:2px 6px">Слой</th><th style="border:1px solid #ccc;padding:2px 6px">T</th><th style="border:1px solid #ccc;padding:2px 6px">S</th><th style="border:1px solid #ccc;padding:2px 6px">Время</th></tr>' + rows + '</table></div>'
      }, {
        iconLayout: getOmegaStationLayout(),
        iconOffset: [-13, -13],
        iconShape: { type: 'Rectangle', coordinates: [[-14, -14], [60, 14]] }
      });
      omegaBayMap.geoObjects.add(pm);
      omegaStationMarks.push(pm);
    });

    if (document.getElementById('omegaIsolinesToggle') && document.getElementById('omegaIsolinesToggle').checked) addOmegaIsolines();
    renderOmegaStationList();
  });
}

function addOmegaIsolines() {
  if (!omegaBayMap || !OMEGA_DATA) return;
  removeOmegaIsolines();
  const pts = getOmegaSurfacePoints();
  if (pts.length < 3) return;
  const r = createOmegaIsolineCanvas(pts);
  omegaIsolineLayer = new ymaps.GeoObject({
    geometry: { type: 'Rectangle', coordinates: r.bounds },
    properties: { balloonContent: 'Интерполяция T (поверхностный слой), изолинии 21–25 °C' }
  }, {
    fillImageHref: r.canvas.toDataURL('image/png'),
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
  const t = document.getElementById('omegaIsolinesToggle');
  if (t && t.checked) addOmegaIsolines();
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

// ===== СПИСОК ПЛЯЖЕЙ =====
function buildBeachList() {
  const el = document.getElementById('beachList');
  el.innerHTML = '';
  BEACHES.forEach(b => {
    const d = document.createElement('div');
    d.className = 'beach-item' + (b.id === S.currentBeach ? ' current' : '') + (b.fieldData ? ' field-data' : '');
    d.dataset.id = b.id;
    d.dataset.nm = b.name.toLowerCase();
    const t = getTemp(b);
    d.innerHTML =
      '<div><div class="beach-name">' + b.name + '</div><div class="beach-region">' + b.region + ' | ' + b.sea + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<span class="beach-temp tp ' + tempClass(t) + '" id="bt-' + b.id + '">' + t + '°C</span>' +
        (b.fieldData
          ? '<button class="btn btn-accent btn-sm" onclick="event.stopPropagation();showOmegaBay(' + b.id + ')" title="Карта бухты с полевыми данными"><i class="fas fa-flask"></i></button>'
          : '<button class="btn btn-warm btn-sm" onclick="event.stopPropagation();selectBeach(' + b.id + ')" title="График"><i class="fas fa-chart-line"></i></button>') +
      '</div>';
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
  document.getElementById('graphPanelTitle').textContent = 'Временной ряд — ' + b.name;
  updateGraph();
  updateProfile();
}

function getTemp(b) {
  const ft = getOmegaTempForBeach(b);
  if (ft != null) return ft;
  if (S.currentLayer === 'satellite' && NC_DATA && NC_DATA.sat_temps && NC_DATA.sat_temps[b.name] != null) return NC_DATA.sat_temps[b.name].toFixed(1);
  if (S.currentLayer === 'model3d' && NC_DATA && NC_DATA.m3d_temps && NC_DATA.m3d_temps[b.name] != null) return NC_DATA.m3d_temps[b.name].toFixed(1);
  if ((S.currentLayer === 'daily' || S.currentLayer === 'salinity' || S.currentLayer === 'currents') && NC_DATA && NC_DATA.daily_temps && NC_DATA.daily_temps[b.name] != null) return NC_DATA.daily_temps[b.name].toFixed(1);
  if (NC_DATA && NC_DATA.sat_temps && NC_DATA.sat_temps[b.name] != null) return NC_DATA.sat_temps[b.name].toFixed(1);
  if (NC_DATA && NC_DATA.m3d_temps && NC_DATA.m3d_temps[b.name] != null) return NC_DATA.m3d_temps[b.name].toFixed(1);
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
        balloonContentBody: '<div style="font:12px Segoe UI,sans-serif">' + b.region + '<br><b style="font-size:16px">' + t + '°C</b><br>' + '★'.repeat(Math.round(b.rating)) + ' ' + b.rating + '</div><br>' +
          '<a onclick="showForecast(' + b.id + ')" style="cursor:pointer;color:#0077b6;margin-right:8px">Прогноз</a>' +
          '<a onclick="showDesc(' + b.id + ')" style="cursor:pointer;color:#0077b6">Описание</a>'
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
  if (!b || b.fieldData) return;
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
  const st = NC_DATA.sat_temps && NC_DATA.sat_temps[b.name], mt = NC_DATA.m3d_temps && NC_DATA.m3d_temps[b.name], dt = NC_DATA.daily_temps && NC_DATA.daily_temps[b.name];
  document.getElementById('descContent').innerHTML =
    '<div class="modal-title">' + b.name + '</div>' +
    '<div class="desc-block"><h5>Описание</h5><p>' + b.desc + '</p></div>' +
    '<div class="desc-block"><h5>Как доехать</h5><p>' + b.how + '</p></div>' +
    '<div class="desc-block"><h5>Что рядом</h5><p>' + b.near.split(', ').map(n => '<span class="tag">' + n + '</span>').join(' ') + '</p></div>' +
    '<div class="desc-block"><h5>Рейтинг</h5><p>' + '★'.repeat(Math.round(b.rating)) + '☆'.repeat(5 - Math.round(b.rating)) + ' ' + b.rating + '/5.0</p></div>' +
    '<div class="desc-block"><h5>Температура</h5><p>Спутник: <b>' + (st != null ? st.toFixed(1) + '°' : '—') + '</b> · 3D: <b>' + (mt != null ? mt.toFixed(1) + '°' : '—') + '</b> · Daily: <b>' + (dt != null ? dt.toFixed(1) + '°' : '—') + '</b></p></div>';
  openModal('descModal');
}

// ===== РЕЙТИНГ =====
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
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    return '<div class="ranking-item"><div class="ranking-medal">' + medal + '</div><div style="flex:1"><div style="font-size:11px;font-weight:600">' + b.name + ' <span style="color:var(--text3)">(' + b.count + ')</span></div><div class="ranking-bar"><div class="ranking-fill" style="width:' + score + '%;background:' + barColor + '"></div></div></div><div style="font-size:12px;font-weight:700">' + b.avg.toFixed(1) + '</div></div>';
  }).join('');
}

function pickStar(n) {
  S.rating = n;
  document.querySelectorAll('#starPick i').forEach((e, i) => e.classList.toggle('on', i < n));
}

function submitReview() {
  const t = document.getElementById('reviewText') && document.getElementById('reviewText').value.trim();
  if (!t || !S.rating) return;
  const b = BEACHES.find(x => x.id === S.currentBeach);
  S.reviews.push({ beachId: S.currentBeach, beachName: b ? b.name : '', rating: S.rating, text: t, date: new Date().toLocaleDateString('ru-RU') });
  localStorage.setItem('bs_reviews', JSON.stringify(S.reviews));
  document.getElementById('reviewText').value = '';
  S.rating = 0;
  pickStar(0);
  renderRanking();
}
