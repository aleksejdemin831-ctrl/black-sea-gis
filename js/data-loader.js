// Загрузка данных

function gridShape(grid) {
    if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) return [0, 0];
    return [grid.length, grid[0].length];
}

function ncDataTooCoarse(data) {
    if (!data) return true;
    const [rows, cols] = gridShape(data?.model_daily?.depth_images?.[0] || data?.model_daily?.sst);
    const [rows3d, cols3d] = gridShape(data?.model3d?.sst);
    return rows < 10 || cols < 10 || rows3d < 10 || cols3d < 10;
}

async function loadJsonIfExists(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
    return res.json();
}

async function loadCoreData() {
    // Загрузка пляжей
    try {
        const beachesRes = await fetch('data/beaches.json');
        if (beachesRes.ok) {
            BEACHES = await beachesRes.json();
            console.log('✅ Пляжи загружены из data/beaches.json');
        }
    } catch (e) {
        console.warn("Не удалось загрузить beaches.json", e);
    }

    // Загрузка данных МГИ
    try {
        NC_DATA = await loadJsonIfExists('data/nc_data.json');
        console.log("✅ Живые данные МГИ загружены из data/nc_data.json");

        // Если основной JSON слишком упрощённый (как 3x3), берём более полную версию из проекта.
        if (ncDataTooCoarse(NC_DATA)) {
            try {
                const fallbackPath = encodeURI('Новая папка/data_v8.json');
                const fallback = await loadJsonIfExists(fallbackPath);
                if (!ncDataTooCoarse(fallback)) {
                    NC_DATA = fallback;
                    console.log("✅ Подключена расширенная сетка для 3D из Новая папка/data_v8.json");
                }
            } catch (fallbackError) {
                console.warn("Не удалось загрузить расширенную сетку data_v8.json:", fallbackError);
            }
        }

        // Подтягиваем точные геопривязки для PNG-слоёв (чтобы картинки не "съезжали").
        // В config.json лежат реальные bounds для подготовленных изображений.
        try {
            const cfgPath = encodeURI('Новая папка/config.json');
            const cfg = await loadJsonIfExists(cfgPath);
            if (cfg && typeof cfg === 'object') {
                if (Array.isArray(cfg.sat_bounds)) NC_DATA.sat_bounds = cfg.sat_bounds;
                if (Array.isArray(cfg.m3d_bounds)) NC_DATA.m3d_bounds = cfg.m3d_bounds;
                if (Array.isArray(cfg.daily_bounds)) NC_DATA.daily_bounds = cfg.daily_bounds;

                // Подстрахуем вложенные объекты, если они есть (map.js часто читает *.bounds)
                if (NC_DATA.satellite && Array.isArray(cfg.sat_bounds)) NC_DATA.satellite.bounds = cfg.sat_bounds;
                if (NC_DATA.model3d && Array.isArray(cfg.m3d_bounds)) NC_DATA.model3d.bounds = cfg.m3d_bounds;
                if (NC_DATA.model_daily && Array.isArray(cfg.daily_bounds)) NC_DATA.model_daily.bounds = cfg.daily_bounds;
            }
        } catch (e) {
            console.warn("Не удалось загрузить config.json (bounds для PNG):", e);
        }

        // Синхронизация слайдера глубины BAMS daily с реальным числом горизонтов,
        // чтобы не было ошибок при выборе глубин, которых нет в данных.
        try {
            const depths = NC_DATA?.model_daily?.depths;
            const slider = document.getElementById('depthSliderDaily');
            if (slider && Array.isArray(depths) && depths.length) {
                slider.max = Math.max(0, depths.length - 1);
                if (+slider.value > +slider.max) slider.value = slider.max;
                // Обновим подпись сразу (сама картинка слоя рисуется в map.js)
                const d0 = depths[+slider.value];
                const labelEl = document.getElementById('depthLabelDaily');
                if (labelEl && d0 != null) {
                    labelEl.textContent = d0 < 1 ? `${Math.round(d0 * 1000)} м` : `${d0.toFixed(1)} м`;
                }
            }
        } catch (e) {
            console.warn('Не удалось синхронизировать depthSliderDaily:', e);
        }

        // Обновление бейджа (пункт 6 из отзыва)
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
    // Загрузка полевых данных Омеги (пункт 9 из отзыва)
    try {
        const r = await fetch('data/DATA_17062026.geojson');
        OMEGA_DATA = await r.json();
        S.omegaLoaded = true;
        console.log("✅ Полевые данные Омеги загружены");
    } catch (e) { 
        console.warn('Omega geojson не загружен:', e); 
    }
}
