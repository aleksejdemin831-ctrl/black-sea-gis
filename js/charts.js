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
