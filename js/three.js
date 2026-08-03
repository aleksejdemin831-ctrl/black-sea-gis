function tempToColor3d(t, tmin, tmax) {
    if (t == null || t <= 0) return null;
    const n = Math.max(0, Math.min(1, (t - tmin) / (tmax - tmin)));
    let r, g, b;
    if (n < .25) { r = 0; g = Math.round(255 * (n / .25)); b = 255; }
    else if (n < .5) { r = 0; g = 255; b = Math.round(255 * (1 - (n - .25) / .25)); }
    else if (n < .75) { r = Math.round(255 * ((n - .5) / .25)); g = 255; b = 0; }
    else { r = 255; g = Math.round(255 * (1 - (n - .75) / .25)); b = 0; }
    return new THREE.Color(r / 255, g / 255, b / 255);
}

function open3D() {
    openModal('modal3d');
    // Важно: модалка до openModal() имеет display:none, и clientWidth/clientHeight могут быть 0.
    // Поэтому инициализацию/ресайз 3D делаем на следующем кадре.
    requestAnimationFrame(() => {
        if (!scene3d) init3D();
        // init3D может отложиться, если размеры контейнера ещё 0
        if (!scene3d) {
            setTimeout(() => { if (scene3d) { resize3D(); update3D(); } }, 120);
            return;
        }
        resize3D();
        update3D();
    });
}
function close3D() { closeModal('modal3d'); if (animId3d) { cancelAnimationFrame(animId3d); animId3d = null; } }

function ensureLatLonForGrid(data, grid) {
    // GitHub Pages часто хостит "облегчённый" nc_data.json без lats/lons.
    // Чтобы 3D не падал, генерируем оси из bounds и размеров сетки.
    if (!data || !grid || !data.bounds) return;
    const rows = grid.length, cols = grid[0]?.length || 0;
    if (!rows || !cols) return;
    if (Array.isArray(data.lats) && data.lats.length === rows && Array.isArray(data.lons) && data.lons.length === cols) return;

    const [[minLat, minLon], [maxLat, maxLon]] = data.bounds;
    data.lats = Array.from({ length: rows }, (_, i) => maxLat - (maxLat - minLat) * (i / (rows - 1 || 1)));
    data.lons = Array.from({ length: cols }, (_, j) => minLon + (maxLon - minLon) * (j / (cols - 1 || 1)));
}

function getBoundsFor3D(data, grid) {
    if (data?.bounds) return data.bounds;
    // fallback: если bounds нет, берём из lats/lons
    if (Array.isArray(data?.lats) && Array.isArray(data?.lons) && data.lats.length && data.lons.length) {
        const minLat = Math.min(...data.lats), maxLat = Math.max(...data.lats);
        const minLon = Math.min(...data.lons), maxLon = Math.max(...data.lons);
        return [[minLat, minLon], [maxLat, maxLon]];
    }
    // совсем запасной вариант
    if (grid) return [[0, 0], [1, 1]];
    return null;
}

function resize3D() {
    if (!renderer3d || !camera3d) return;
    const cont = document.getElementById('container3d');
    const canvas = document.getElementById('canvas3d');
    if (!cont || !canvas) return;
    const w = cont.clientWidth, h = cont.clientHeight;
    if (!w || !h) return;
    canvas.width = w; canvas.height = h;
    camera3d.aspect = w / h;
    camera3d.updateProjectionMatrix();
    renderer3d.setSize(w, h);
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function init3D() {
    const cont = document.getElementById('container3d');
    const canvas = document.getElementById('canvas3d');
    if (!cont || !canvas) return;
    const w = cont.clientWidth, h = cont.clientHeight;
    // Если модалка ещё не успела разложиться — подождём чуть-чуть.
    if (w < 10 || h < 10) {
        setTimeout(init3D, 60);
        return;
    }
    canvas.width = w; canvas.height = h;
    scene3d = new THREE.Scene();
    scene3d.background = new THREE.Color(0x0a0e1a);
    camera3d = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    camera3d.position.set(0, 40, 60);
    camera3d.lookAt(0, 0, 0);
    renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer3d.setSize(w, h);
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const amb = new THREE.AmbientLight(0xffffff, 0.6); scene3d.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(20, 40, 30); scene3d.add(dir);
    const dir2 = new THREE.DirectionalLight(0x4488cc, 0.3); dir2.position.set(-20, 20, -10); scene3d.add(dir2);
    const axes = new THREE.AxesHelper(15); axes.visible = false; scene3d.add(axes);
    let dragging = false, prevX = 0, prevY = 0, camTheta = 0.5, camPhi = 0.8, camDist = 70;
    function updateCam() {
        camera3d.position.set(camDist * Math.sin(camPhi) * Math.cos(camTheta), camDist * Math.cos(camPhi), camDist * Math.sin(camPhi) * Math.sin(camTheta));
        camera3d.lookAt(0, -2, 0);
    }
    updateCam();
    function onDown(e) { dragging = true; const p = e.touches ? e.touches[0] : e; prevX = p.clientX; prevY = p.clientY; }
    function onMove(e) {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - prevX, dy = p.clientY - prevY;
        camTheta -= dx * 0.005;
        camPhi = Math.max(0.1, Math.min(1.5, camPhi - dy * 0.005));
        prevX = p.clientX; prevY = p.clientY;
        updateCam();
    }
    function onUp() { dragging = false; }
    function onWheel(e) { camDist = Math.max(15, Math.min(150, camDist + e.deltaY * 0.05)); updateCam(); e.preventDefault(); }
    canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp); canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false }); canvas.addEventListener('touchmove', onMove, { passive: false }); canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', () => {
        resize3D();
    });
}

function update3D() {
    if (!scene3d || !renderer3d) return;
    const src = document.getElementById('src3d')?.value || 'daily';
    const data = src === '3d' ? NC_DATA.model3d : NC_DATA.model_daily;
    if (!data) return;
    if (scene3d && mesh3d) { scene3d.remove(mesh3d); mesh3d.geometry.dispose(); mesh3d.material.dispose(); mesh3d = null; }
    if (scene3d) { beachMarkers3d.forEach(m => scene3d.remove(m)); beachMarkers3d = []; }
    const grid = data.depth_images?.[0] || data.sst || NC_DATA.model_daily?.depth_images?.[0] || NC_DATA.model_daily?.sst;
    if (!grid) return;

    ensureLatLonForGrid(data, grid);

    const slider = document.getElementById('depthSlider3d');
    const maxIdx = data.depth_images ? data.depth_images.length - 1 : 0;
    slider.max = maxIdx;
    const depths = data.depths;
    if (depths && depths[curDepthIdx3d] != null) {
        const d = depths[curDepthIdx3d];
        document.getElementById('depthLabel3d').textContent = d < 1 ? Math.round(d * 1000) + ' м' : d.toFixed(1) + ' м';
    }
    build3DSurface(grid, data.lats, data.lons);

    const bnd = getBoundsFor3D(data, grid);
    const [[minLat, minLon], [maxLat, maxLon]] = bnd || [[0, 0], [1, 1]];
    BEACHES.forEach(b => {
        const sg = new THREE.SphereGeometry(0.5, 8, 8);
        const sm = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
        const m = new THREE.Mesh(sg, sm);
        const latR = (b.lat - minLat) / (maxLat - minLat || 1);
        const lonR = (b.lon - minLon) / (maxLon - minLon || 1);
        m.position.set((lonR - 0.5) * 80, 2, (-(latR) + 0.5) * 60);
        scene3d.add(m); beachMarkers3d.push(m);
        m.userData = { name: b.name };
    });
    animate3D();
}

function build3DSurface(grid, lats, lons) {
    if (!scene3d) return;
    if (mesh3d) { scene3d.remove(mesh3d); mesh3d.geometry.dispose(); mesh3d.material.dispose(); }
    const rows = grid.length, cols = grid[0].length;
    const geo = new THREE.PlaneGeometry(80, 60, cols - 1, rows - 1);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const valid = [];
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const t = grid[i][j];
            if (t != null && t > 0) valid.push(t);
        }
    }
    const tMin = valid.length ? Math.min(...valid) : 0;
    const tMax = valid.length ? Math.max(...valid) : 1;
    const tRange = Math.max(0.001, tMax - tMin);
    const heightScale = zScale * 9;

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const idx = i * cols + j;
            if (idx >= pos.count) break;
            const t = grid[i][j];
            if (t != null && t > 0) {
                const rel = (t - tMin) / tRange;
                const h = rel * heightScale;
                pos.setZ(idx, h);
                const c = tempToColor3d(t, tMin, tMax);
                if (c) { colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b; }
                else { pos.setZ(idx, 0); colors[idx * 3] = 0.04; colors[idx * 3 + 1] = 0.06; colors[idx * 3 + 2] = 0.1; }
            } else {
                pos.setZ(idx, 0);
                colors[idx * 3] = 0.04; colors[idx * 3 + 1] = 0.06; colors[idx * 3 + 2] = 0.1;
            }
        }
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, shininess: 90, transparent: true, opacity: 0.95 });
    mesh3d = new THREE.Mesh(geo, mat);
    mesh3d.rotation.x = -Math.PI / 2;
    mesh3d.position.y = -2;
    scene3d.add(mesh3d);
}

function update3DDepth(idx) {
    if (!scene3d || !renderer3d) return;
    curDepthIdx3d = idx;
    const src = document.getElementById('src3d')?.value || 'daily';
    const data = src === '3d' ? NC_DATA.model3d : NC_DATA.model_daily;
    if (!data) return;
    const depths = data.depths;
    if (depths && depths[idx] != null) {
        const d = depths[idx];
        document.getElementById('depthLabel3d').textContent = d < 1 ? Math.round(d * 1000) + ' м' : d.toFixed(1) + ' м';
    }
    const grid = data.depth_images?.[idx] || data.sst || NC_DATA.model_daily?.depth_images?.[idx] || NC_DATA.model_daily?.sst;
    if (!grid) return;
    ensureLatLonForGrid(data, grid);
    build3DSurface(grid, data.lats, data.lons);
}

function update3DZScale(v) { zScale = v; if (curDepthIdx3d != null) update3DDepth(curDepthIdx3d); }

function animate3D() {
    if (!scene3d || !renderer3d) return;
    animId3d = requestAnimationFrame(animate3D);
    renderer3d.render(scene3d, camera3d);
}
