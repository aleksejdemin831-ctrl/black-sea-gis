// ===== КАРТА И СЛОИ =====
// Пункт 5 из отзыва: подпись источника, даты и единиц на каждом слое

function updateLayerInfo() {
  const el = document.getElementById('layerInfoBar');
  if (!el) return;
  const info = {
    satellite: { src: 'GHRSST SST', date: NC_DATA && NC_DATA.satellite && NC_DATA.satellite.date || '20.09.2021', unit: '°C', desc: 'Спутник, ~1 км, skin SST' },
    model3d:   { src: 'BAMS 1km',   date: NC_DATA && NC_DATA.model3d && NC_DATA.model3d.date || 'Анализ', unit: '°C', desc: '3D модель, поверхность' },
    daily:     { src: 'BAMS daily', date: NC_DATA && NC_DATA.model_daily && NC_DATA.model_daily.date || 'Суточный', unit: '°C', desc: 'Модель, ~2.4 км' },
    salinity:  { src: 'BAMS daily', date: NC_DATA && NC_DATA.salinity && NC_DATA.salinity.date || 'so', unit: 'PSU', desc: 'Солёность, ~2.4 км' },
    currents:  { src: 'BAMS daily', date: NC_DATA && NC_DATA.model_daily && NC_DATA.model_daily.date || 'uo/vo', unit: 'м/с', desc: 'Течения, ~2.4 км' }
  };
  const i = info[S.currentLayer] || info.satellite;
  el.innerHTML = '<b>' + i.src + '</b> · ' + i.date + ' · ' + i.unit + '<br><span style="font-size:10px;color:var(--text3)">' + i.desc + '</span>';
}

function removeMapLayer() {
  if (mapLayer && S.map) { S.map.geoObjects.remove(mapLayer); mapLayer = null; }
}

function initMap() {
  ymaps.ready(() => {
    S.map = new ymaps.Map('map', { center: [43, 36.5], zoom: 6, controls: ['zoomControl', 'typeSelector'] });

    BEACHES.forEach(b => {
      const t = getTemp(b);
      if (b.fieldData) {
        // Заметная точка «Пляж Омега» (пункт 9): зелёный пульсирующий маркер + подпись
        const pm = new ymaps.Placemark([b.lat, b.lon], {
          balloonContentHeader: '<b>🧪 ' + b.name + '</b>',
          balloonContentBody: '<div style="font:12px Segoe UI,sans-serif"><span style="color:#10b981;font-weight:700">Полевые измерения 17.06.2026 · ТМА-21</span><br>Средняя T поверхностного слоя: <b>' + t + '°C</b><br>13 станций, бухта Круглая (Севастополь)</div>',
          hintContent: 'Пляж Омега — полевые измерения 17.06.2026'
        }, {
          iconLayout: 'default#imageWithContent',
          iconImageHref: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
          iconImageSize: [44, 44],
          iconImageOffset: [-22, -22],
          iconContentLayout: ymaps.templateLayoutFactory.createClass(
            '<div style="position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 6px rgba(16,185,129,.35);animation:omegaPulse 2s infinite;cursor:pointer" title="Полевые данные 17.06.2026"></div>' +
            '<div style="position:absolute;left:26px;top:-10px;white-space:nowrap;background:rgba(16,185,129,.9);color:#fff;font:700 10px Segoe UI,sans-serif;padding:2px 7px;border-radius:8px">ОМЕГА · 17.06.2026</div>'
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
        balloonContentHeader: '<b>' + b.name + '</b>',
        balloonContentBody: '<div style="font:12px Segoe UI,sans-serif">' + b.region + '<br><b style="font-size:16px">' + t + '°C</b><br>' + '★'.repeat(Math.round(b.rating)) + ' ' + b.rating + '</div><br>' +
          '<a onclick="showForecast(' + b.id + ')" style="cursor:pointer;color:#0077b6;margin-right:8px">Прогноз</a>' +
          '<a onclick="showDesc(' + b.id + ')" style="cursor:pointer;color:#0077b6">Описание</a>',
        hintContent: b.name
      }, { preset: 'islands#orangeIcon' });
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

  hideCurrents();
  if (name === 'currents') { showCurrents(); }
  else { showMapImage(name); }
  updateAllTemps();
  updateLayerInfo();
}

// Слой температуры: реальная сетка из nc_data.json, а если её нет —
// честная IDW-интерполяция по точечным температурам пляжей (НЕ выдуманные данные)
function showMapImage(name) {
  if (name === 'salinity') { showSalinity(); return; }
  if (name === 'currents') return;
  removeMapLayer();
  const key = { satellite: 'satellite', model3d: 'model3d', daily: 'model_daily' }[name];
  const data = NC_DATA && NC_DATA[key];
  if (!data || !data.bounds) return;

  const grid = data.depth_images ? data.depth_images[0] : data.sst;
  let canvas = null, note = '';
  if (grid && grid.length > 1 && grid[0] && grid[0].length > 1) {
    canvas = buildGridCanvas(grid, 200);
  } else {
    const temps = { satellite: NC_DATA.sat_temps, model3d: NC_DATA.m3d_temps, daily: NC_DATA.daily_temps }[name] || {};
    const pts = Object.entries(temps).map(([nm, t]) => {
      const b = BEACHES.find(x => x.name === nm);
      return b ? { lat: b.lat, lon: b.lon, t: t } : null;
    }).filter(Boolean);
    if (pts.length >= 3) { canvas = buildIdwCanvas(pts, data.bounds); note = ' (интерполяция по точкам)'; }
  }
  if (!canvas) {
    showMessage('Слой «' + name + '»: в data/nc_data.json нет сетки. Запустите scripts/export_nc_to_json.py');
    return;
  }
  const labels = { satellite: 'GHRSST', model3d: 'BAMS 1km', daily: 'BAMS daily' };
  mapLayer = new ymaps.GeoObject({
    geometry: { type: 'Rectangle', coordinates: data.bounds },
    properties: { balloonContent: labels[name] + note }
  }, { fillImageHref: canvas.toDataURL('image/png'), fillOpacity: 0.85, strokeColor: '#00000000' });
  S.map.geoObjects.add(mapLayer);
}

function toggleLayer(name) { quickLayer(name); }

// Солёность: только если в nc_data.json есть реальная сетка sss
function showSalinity() {
  removeMapLayer();
  const sal = NC_DATA && NC_DATA.salinity;
  if (!sal || !sal.sss || !sal.bounds) {
    showMessage('Солёность: в data/nc_data.json нет сетки so. Запустите scripts/export_nc_to_json.py');
    return;
  }
  mapLayer = new ymaps.GeoObject({
    geometry: { type: 'Rectangle', coordinates: sal.bounds },
    properties: { balloonContent: 'Солёность (PSU), ' + (sal.date || '') }
  }, { fillImageHref: buildGridCanvas(sal.sss, 200, salColorRGB).toDataURL('image/png'), fillOpacity: .8, strokeColor: '#00000000' });
  S.map.geoObjects.add(mapLayer);
}

// Течения: только если в nc_data.json есть массив currents [{lat,lon,u,v}]
function showCurrents() {
  hideCurrents();
  if (!NC_DATA || !NC_DATA.currents || !NC_DATA.currents.length) {
    showMessage('Течения: в data/nc_data.json нет uo/vo. Запустите scripts/export_nc_to_json.py');
    return;
  }
  NC_DATA.currents.forEach(c => {
    const ang = Math.atan2(c.v, c.u) * 180 / Math.PI;
    const speed = Math.hypot(c.u, c.v);
    const pm = new ymaps.Placemark([c.lat, c.lon], { hintContent: speed.toFixed(2) + ' м/с' }, {
      iconLayout: 'default#image',
      iconImageHref: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g transform="rotate(' + ang + ' 8 8)"><path d="M1 8 H11 M11 8 L7 4 M11 8 L7 12" stroke="#00b4d8" stroke-width="2" fill="none"/></g></svg>'),
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

// Слайдер глубины BAMS daily: рисуем срез из depth_images
function updateDepth(source, idx) {
  idx = +idx;
  const data = NC_DATA && NC_DATA.model_daily;
  if (!data || !data.depths) return;
  const depth = data.depths[idx];
  if (depth == null) return;
  document.getElementById('depthLabelDaily').textContent = formatDepthM(depth);

  const grid = data.depth_images && data.depth_images[idx];
  if (!grid) {
    showMessage('Для глубины ' + formatDepthM(depth) + ' нет сетки depth_images в nc_data.json. Обновите данные скриптом.');
    return;
  }
  removeMapLayer();
  mapLayer = new ymaps.GeoObject({
    geometry: { type: 'Rectangle', coordinates: data.bounds },
    properties: { balloonContent: 'BAMS daily — ' + formatDepthM(depth) }
  }, { fillImageHref: buildGridCanvas(grid, 180).toDataURL('image/png'), fillOpacity: 1, strokeColor: '#00000000' });
  S.map.geoObjects.add(mapLayer);
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
  if (!window.ymaps || !ymaps.templateLayoutFactory || !S.map) return;
  awardPlacemarks.forEach(pm => S.map.geoObjects.remove(pm));
  awardPlacemarks = [];
  const top = [...BEACHES].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const colors = ['#f59e0b', '#94a3b8', '#cd7f32'];
  top.forEach((b, i) => {
    const pm = new ymaps.Placemark([b.lat + .06, b.lon - 0.06], {
      balloonContent: '<b>' + b.name + '</b><br>Рейтинг: ' + b.rating + ' | T: ' + getTemp(b) + '°C'
    }, {
      iconLayout: 'default#imageWithContent',
      iconImageHref: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      iconImageSize: [36, 36],
      iconContentOffset: [-18, -18],
      iconContentLayout: ymaps.templateLayoutFactory.createClass(
        '<div style="width:36px;height:36px;border-radius:50%;background:' + colors[i] + ';color:#fff;font:700 16px/36px Segoe UI,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.4)">' + (i + 1) + '</div>'
      )
    });
    S.map.geoObjects.add(pm);
    awardPlacemarks.push(pm);
  });
}
