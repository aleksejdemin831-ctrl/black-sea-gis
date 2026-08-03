// ===== 3D ВИЗУАЛИЗАЦИЯ (исправлено: чёрный экран) =====

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
  if (!scene3d) init3D();
  setTimeout(resize3D, 60);
  update3D();
}

function close3D() {
  closeModal('modal3d');
  if (animId3d) { cancelAnimationFrame(animId3d); animId3d = null; }
}

function resize3D() {
  const c = document.getElementById('container3d');
  if (!c || !renderer3d || !camera3d) return;
  const w = c.clientWidth, h = c.clientHeight;
  if (w < 10 || h < 10) return;
  renderer3d.setSize(w, h);
  camera3d.aspect = w / h;
  camera3d.updateProjectionMatrix();
}

function init3D() {
  const cont = document.getElementById('container3d');
  const canvas = document.getElementById('canvas3d');
  const w = cont.clientWidth || 800, h = cont.clientHeight || 500;
  canvas.width = w; canvas.height = h;
  scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0x0a0e1a);
  camera3d = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
  renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer3d.setSize(w, h);
  renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  scene3d.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(20, 40, 30); scene3d.add(dir);
  const dir2 = new THREE.DirectionalLight(0x4488cc, 0.3); dir2.position.set(-20, 20, -10); scene3d.add(dir2);

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
    camTheta -= (p.clientX - prevX) * 0.005;
    camPhi = Math.max(0.1, Math.min(1.5, camPhi - (p.clientY - prevY) * 0.005));
    prevX = p.clientX; prevY = p.clientY;
    updateCam();
  }
  function onUp() { dragging = false; }
  function onWheel(e) { camDist = Math.max(15, Math.min(150, camDist + e.deltaY * 0.05)); updateCam(); e.preventDefault(); }
  canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp); canvas.addEventListener('mouseleave', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false }); canvas.addEventListener('touchmove', onMove, { passive: false }); canvas.addEventListener('touchend', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', resize3D);
  animate3D(); // рендер-цикл стартует сразу, чтобы не было чёрного экрана
}

// Безопасные lats/lons: если в данных их нет, берём из bounds
function get3DExtent(data) {
  const bounds = data.bounds || [[40, 27], [47, 42]];
  return {
    lats: (data.lats && data.lats.length > 1) ? data.lats : [bounds[0][0], bounds[1][0]],
    lons: (data.lons && data.lons.length > 1) ? data.lons : [bounds[0][1], bounds[1][1]]
  };
}

function update3D() {
  if (!scene3d) return;
  const src = document.getElementById('src3d') ? document.getElementById('src3d').value : 'daily';
  const data = src === '3d' ? NC_DATA.model3d : NC_DATA.model_daily;
  if (!data) return;
  const grid = data.depth_images ? data.depth_images[curDepthIdx3d] || data.depth_images[0] : data.sst;
  if (!grid || !grid.length) { showMessage('3D: в nc_data.json нет сетки. Запустите scripts/export_nc_to_json.py'); return; }

  const slider = document.getElementById('depthSlider3d');
  if (slider && data.depth_images) slider.max = data.depth_images.length - 1;
  if (data.depths && data.depths[curDepthIdx3d] != null)
    document.getElementById('depthLabel3d').textContent = formatDepthM(data.depths[curDepthIdx3d]);

  build3DSurface(grid);

  // Маркеры пляжей — отдельно, с защитой от падения
  beachMarkers3d.forEach(m => scene3d.remove(m)); beachMarkers3d = [];
  try {
    const ext = get3DExtent(data);
    const lat0 = ext.lats[0], lat1 = ext.lats[ext.lats.length - 1];
    const lon0 = ext.lons[0], lon1 = ext.lons[ext.lons.length - 1];
    BEACHES.forEach(b => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: b.fieldData ? 0x10b981 : 0xff6b35 }));
      const latR = (b.lat - lat0) / (lat1 - lat0), lonR = (b.lon - lon0) / (lon1 - lon0);
      m.position.set((lonR - 0.5) * 80, 2, (-latR + 0.5) * 60);
      m.userData = { name: b.name };
      scene3d.add(m); beachMarkers3d.push(m);
    });
  } catch (e) { console.warn('3D маркеры:', e); }
  animate3D();
}

function build3DSurface(grid) {
  if (mesh3d) { scene3d.remove(mesh3d); mesh3d.geometry.dispose(); mesh3d.material.dispose(); }
  const rows = grid.length, cols = grid[0].length;
  const geo = new THREE.PlaneGeometry(80, 60, cols - 1, rows - 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const idx = i * cols + j;
      if (idx >= pos.count) break;
      // row 0 сетки = юг, а PlaneGeometry row 0 = верх → зеркалим
      const t = grid[rows - 1 - i][j];
      if (t != null && t > 0) {
        pos.setZ(idx, t * (zScale / 5));
        const c = tempToColor3d(t, 2, 25);
        if (c) { colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b; }
      } else {
        pos.setZ(idx, 0);
        colors[idx * 3] = 0.04; colors[idx * 3 + 1] = 0.06; colors[idx * 3 + 2] = 0.1;
      }
    }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  mesh3d = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, shininess: 60, transparent: true, opacity: 0.92 }));
  mesh3d.rotation.x = -Math.PI / 2;
  scene3d.add(mesh3d);
}

function update3DDepth(idx) {
  curDepthIdx3d = idx;
  const src = document.getElementById('src3d') ? document.getElementById('src3d').value : 'daily';
  const data = src === '3d' ? NC_DATA.model3d : NC_DATA.model_daily;
  if (!data) return;
  if (data.depths && data.depths[idx] != null)
    document.getElementById('depthLabel3d').textContent = formatDepthM(data.depths[idx]);
  const grid = data.depth_images ? data.depth_images[idx] : data.sst;
  if (!grid) { showMessage('Для этой глубины нет сетки в nc_data.json'); return; }
  build3DSurface(grid);
}

function update3DZScale(v) { zScale = v; update3DDepth(curDepthIdx3d); }

function animate3D() {
  if (!scene3d || !renderer3d) return;
  if (animId3d) cancelAnimationFrame(animId3d);
  const loop = () => { animId3d = requestAnimationFrame(loop); renderer3d.render(scene3d, camera3d); };
  loop();
}
