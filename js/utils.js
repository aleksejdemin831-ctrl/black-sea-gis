// Вспомогательные функции

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

function closeModal(id) { 
    document.getElementById(id).classList.remove('show'); 
}

function openModal(id) { 
    document.getElementById(id).classList.add('show'); 
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 900) { 
        sb.classList.toggle('hidden-mobile'); 
    } else { 
        sb.classList.toggle('hidden'); 
    }
}

function toggleTheme() {
    document.body.classList.toggle('light');
    localStorage.setItem('bs_theme', document.body.classList.contains('light') ? 'light' : 'dark');
}

function showSources() { 
    openModal('sourcesModal'); 
}

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