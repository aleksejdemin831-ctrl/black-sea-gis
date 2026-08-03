// Вспомогательные функции

function showMessage(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:8px 20px;border-radius:20px;z-index:10000;font-size:12px;animation:fadeIn .3s;max-width:90%;text-align:center';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3500);
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

// ===== ЦВЕТОВАЯ ШКАЛА И РЕНДЕР СЕТОК (общие для карты и 3D) =====

// Шкала как в легенде: <12 синий … >24 красный (n нормировано 2..25 °C)
function tempColorRGB(t) {
  const n = Math.max(0, Math.min(1, (t - 2) / 23));
  let r, g, b;
  if (n < .25) { r = 0; g = 255 * (n / .25); b = 255; }
  else if (n < .5) { r = 0; g = 255; b = 255 * (1 - (n - .25) / .25); }
  else if (n < .75) { r = 255 * ((n - .5) / .25); g = 255; b = 0; }
  else { r = 255; g = 255 * (1 - (n - .75) / .25); b = 0; }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// Сине-красная шкала для солёности (PSU, ~5..22)
function salColorRGB(s) {
  const n = Math.max(0, Math.min(1, (s - 5) / 17));
  return [Math.round(255 * n), Math.round(120 * (1 - n)), Math.round(255 * (1 - n))];
}

// grid[i][j]: i=0 — МИНИМАЛЬНАЯ широта (юг), j=0 — минимальная долгота.
// null = суша/нет данных (прозрачно).
function buildGridCanvas(grid, alpha, colorFn) {
  colorFn = colorFn || tempColorRGB; alpha = alpha == null ? 200 : alpha;
  const h = grid.length, w = grid[0].length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < h; i++)
    for (let j = 0; j < w; j++) {
      const t = grid[i][j], pi = ((h - 1 - i) * w + j) * 4;
      if (t == null) { img.data[pi + 3] = 0; continue; }
      const [r, g, b] = colorFn(t);
      img.data[pi] = r; img.data[pi + 1] = g; img.data[pi + 2] = b; img.data[pi + 3] = alpha;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Интерполяция ОБРАТНЫМИ расстояниями (IDW) по точечным данным.
// points: [{lat, lon, t}], bounds: [[minLat,minLon],[maxLat,maxLon]]
function buildIdwCanvas(points, bounds, size, alpha) {
  size = size || 220; alpha = alpha == null ? 170 : alpha;
  const minLat = bounds[0][0], minLon = bounds[0][1], maxLat = bounds[1][0], maxLon = bounds[1][1];
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++) {
      const lat = maxLat - (maxLat - minLat) * i / (size - 1); // i=0 — верх (север)
      const lon = minLon + (maxLon - minLon) * j / (size - 1);
      let num = 0, den = 0, exact = null;
      for (const p of points) {
        const d = Math.hypot(lat - p.lat, (lon - p.lon) * Math.cos(lat * Math.PI / 180));
        if (d < 1e-6) { exact = p.t; break; }
        const wgt = 1 / (d * d);
        num += wgt * p.t; den += wgt;
      }
      const t = exact != null ? exact : (den ? num / den : null);
      const pi = (i * size + j) * 4;
      if (t == null) { img.data[pi + 3] = 0; continue; }
      const [r, g, b] = tempColorRGB(t);
      img.data[pi] = r; img.data[pi + 1] = g; img.data[pi + 2] = b; img.data[pi + 3] = alpha;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

function formatDepthM(d) {
  return d < 1 ? Math.round(d * 1000) + ' м' : d.toFixed(1) + ' м';
}
