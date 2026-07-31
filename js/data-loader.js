// Загрузка данных

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
        const response = await fetch('data/nc_data.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        NC_DATA = await response.json();
        console.log("✅ Живые данные МГИ загружены из data/nc_data.json");

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