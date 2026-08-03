// Загрузка данных + бейдж «демо / реальные данные» (пункт 6 из отзыва)

async function loadCoreData() {
  // Пляжи
  try {
    const beachesRes = await fetch('data/beaches.json');
    if (beachesRes.ok) {
      BEACHES = await beachesRes.json();
      console.log('✅ Пляжи загружены из data/beaches.json');
    }
  } catch (e) { console.warn('Не удалось загрузить beaches.json', e); }

  // Данные МГИ
  try {
    const response = await fetch('data/nc_data.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    NC_DATA = await response.json();
    S.ncLoaded = true;
    S.ncDate = (NC_DATA.model_daily && NC_DATA.model_daily.date) || (NC_DATA.satellite && NC_DATA.satellite.date) || null;
    console.log('✅ Данные МГИ загружены из data/nc_data.json' + (S.ncDate ? ' (' + S.ncDate + ')' : ''));
  } catch (error) {
    console.warn('nc_data.json не загружен:', error);
    S.ncLoaded = false;
  }
  syncDepthSliders();
  updateDataModeBadge();
}

async function loadOmegaData() {
  try {
    const r = await fetch('data/DATA_17062026.geojson');
    OMEGA_DATA = await r.json();
    S.omegaLoaded = true;
    console.log('✅ Полевые данные Омеги загружены');
  } catch (e) { console.warn('Omega geojson не загружен:', e); }
}

// Синхронизируем слайдеры глубины с реальным числом уровней в данных
function syncDepthSliders() {
  const d = NC_DATA && NC_DATA.model_daily;
  if (!d || !d.depths) return;
  const n = (d.depth_images && d.depth_images.length) ? d.depth_images.length : d.depths.length;
  const s1 = document.getElementById('depthSliderDaily');
  if (s1) s1.max = Math.max(0, n - 1);
}

// Единая функция бейджа: график (демо 1981–2016) и слои (МГИ) — раздельно
function updateDataModeBadge() {
  const badge = document.getElementById('dataModeBadge');
  if (!badge) return;
  const graph = S.graphDemo ? 'График: демо (1981–2016)' : 'График: —';
  const layers = S.ncLoaded
    ? 'Слои: реальные данные МГИ' + (S.ncDate ? ' (' + S.ncDate + ')' : '')
    : 'Слои: нет данных МГИ (запустите export_nc_to_json.py)';
  badge.textContent = graph + ' · ' + layers;
  badge.className = 'data-mode-badge ' + (S.ncLoaded ? 'field' : 'demo');
}
