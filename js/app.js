/* ============================================================
 * 积木三视图乐园 · app.js  v2 — 全面修复版
 * 纯正方体堆叠 · 三视图教学 · 自定义搭建 · 手机+电脑
 * ============================================================ */
(function () {
'use strict';

/* ---------- 全局配置 ---------- */
var GRID_W = 4, GRID_D = 4, MAX_H = 4, CUBE_SIZE = 1;
var Coordinates = window.SanviewCoordinates;
var SectionGeometry = window.SanviewSectionGeometry;

if (!Coordinates || typeof Coordinates.generateAdaptiveStructure !== 'function' ||
    !SectionGeometry || typeof SectionGeometry.boxPlanePolygon !== 'function') {
  throw new Error('三视图核心模块版本不一致，请刷新页面后重试。');
}

var LAYER_COLORS = [
  0xE86F3D, 0xD99A34, 0x65A85A, 0x2E918B,
  0x3F7FBE, 0x7568A9, 0xB75F86, 0x8B6C55
];

var soundOn = true;
var MODE = 'learn';
var cubes = new Map();
var practiceMode = 'draw';
var practiceAnswer = null;
var practiceDrawn = null;
var challengeAnswer = null;
var challengeMatch = { front: false, left: false, top: false };
var difficulty = 1;
var learnDifficulty = 0;
var buildTool = 'add';
var buildHistory = [];
var score = { win: 0, total: 0 };
var DIFFICULTY_NAMES = ['简单', '中等', '困难', '挑战'];

/* ============================================================
 * Three.js 场景
 * ============================================================ */
var renderer, scene, camera, controls, raycaster;
var renderRequested = true;
var basePlane, baseLines, cubeGroup;
var cubeGeometry, cubeEdgeGeometry, cubeMaterials, cubeEdgeMaterial;
var directionLabels = [];
var highlightMesh = null; // hover 高亮
var buildPadCollapsed = false;
var sectionState = { enabled: false, azimuth: 0, elevation: 0, position: 24, flipped: false, preset: 'x' };
var sectionPlane, sectionKeepNormal, sectionGuide, sectionArrow, sectionCap, sectionOutline;
var sectionCapTriangles = 0, sectionCapUpdateQueued = false;

function cameraFrustumSize() {
  return Math.max(8, Math.max(GRID_W, GRID_D, MAX_H) * 1.55 + 2);
}

function initThree() {
  var container = document.getElementById('three-container');
  var w = container.clientWidth, h = container.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  var frustum = cameraFrustumSize(), aspect = w / h;
  camera = new THREE.OrthographicCamera(
    -frustum * aspect / 2,
    frustum * aspect / 2,
    frustum / 2,
    -frustum / 2,
    0.1,
    100
  );
  var initialView = getViewPosition('iso');
  camera.position.set(initialView.pos[0], initialView.pos[1], initialView.pos[2]);
  camera.lookAt(initialView.target[0], initialView.target[1], initialView.target[2]);

  scene.add(new THREE.AmbientLight(0xFFF5EE, 0.8));
  var dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(6, 10, 4);
  scene.add(dir);
  var dir2 = new THREE.DirectionalLight(0xFFEEDD, 0.4);
  dir2.position.set(-5, 4, -6);
  scene.add(dir2);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.target.set(initialView.target[0], initialView.target[1], initialView.target[2]);
  controls.minDistance = 2.5;
  controls.maxDistance = 18;
  controls.minZoom = 0.65;
  controls.maxZoom = 2.4;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.addEventListener('start', function () {
    document.querySelectorAll('.vb').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === 'iso');
      button.setAttribute('aria-pressed', String(button.dataset.view === 'iso'));
    });
    setDirectionGuideVisibility('iso');
  });

  raycaster = new THREE.Raycaster();
  cubeGroup = new THREE.Group();
  scene.add(cubeGroup);
  initCubeResources();
  initSectionResources();

  buildBase();
  addDirectionLabels();
  window.addEventListener('resize', onResize);
}

function buildBase() {
  if (basePlane) { scene.remove(basePlane); basePlane.geometry.dispose(); basePlane.material.dispose(); }
  if (baseLines) { scene.remove(baseLines); baseLines.geometry.dispose(); baseLines.material.dispose(); }
  if (highlightMesh) { scene.remove(highlightMesh); highlightMesh.geometry.dispose(); highlightMesh.material.dispose(); }
  var geo = new THREE.PlaneGeometry(GRID_W, GRID_D);
  var mat = new THREE.MeshBasicMaterial({ color: 0xFFF8EE, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  basePlane = new THREE.Mesh(geo, mat);
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.set(GRID_W / 2, -0.01, GRID_D / 2);
  basePlane.name = 'base';
  scene.add(basePlane);

  var pts = [];
  for (var i = 0; i <= GRID_W; i++) {
    pts.push(new THREE.Vector3(i, 0, 0), new THREE.Vector3(i, 0, GRID_D));
  }
  for (var j = 0; j <= GRID_D; j++) {
    pts.push(new THREE.Vector3(0, 0, j), new THREE.Vector3(GRID_W, 0, j));
  }
  var lgeo = new THREE.BufferGeometry().setFromPoints(pts);
  var lmat = new THREE.LineBasicMaterial({ color: 0xDDBB88, linewidth: 1 });
  baseLines = new THREE.LineSegments(lgeo, lmat);
  scene.add(baseLines);

  // 高亮框（半透明，hover时显示）
  var hgeo = new THREE.BoxGeometry(CUBE_SIZE * 0.96, CUBE_SIZE * 0.96, CUBE_SIZE * 0.96);
  var hmat = new THREE.MeshBasicMaterial({ color: 0xFFD166, transparent: true, opacity: 0.45, depthTest: false });
  highlightMesh = new THREE.Mesh(hgeo, hmat);
  highlightMesh.visible = false;
  highlightMesh.renderOrder = 999;
  highlightMesh.material.depthTest = false;
  scene.add(highlightMesh);
}

function initCubeResources() {
  cubeGeometry = new THREE.BoxGeometry(CUBE_SIZE * 0.94, CUBE_SIZE * 0.94, CUBE_SIZE * 0.94);
  cubeEdgeGeometry = new THREE.EdgesGeometry(cubeGeometry);
  cubeMaterials = LAYER_COLORS.map(function (color) {
    return new THREE.MeshLambertMaterial({ color: color });
  });
  cubeEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x4A3520, linewidth: 1 });
}

/* ---------- 任意平面剖切 ---------- */
function emptyGeometry() {
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  return geometry;
}

function initSectionResources() {
  sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  sectionKeepNormal = new THREE.Vector3(1, 0, 0);

  sectionCap = new THREE.Mesh(emptyGeometry(), new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  }));
  sectionCap.name = 'section-cap';
  sectionCap.renderOrder = 5;
  scene.add(sectionCap);

  sectionOutline = new THREE.LineSegments(emptyGeometry(), new THREE.LineBasicMaterial({ color: 0x513b2f }));
  sectionOutline.name = 'section-outline';
  sectionOutline.renderOrder = 6;
  scene.add(sectionOutline);

  sectionGuide = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xd85b3d, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
  );
  sectionGuide.name = 'section-guide';
  sectionGuide.renderOrder = 4;
  scene.add(sectionGuide);

  sectionArrow = new THREE.ArrowHelper(sectionKeepNormal, new THREE.Vector3(), 1.2, 0xd85b3d, 0.28, 0.16);
  sectionArrow.name = 'section-direction';
  scene.add(sectionArrow);
  setSectionObjectVisibility(false);
}

function setSectionObjectVisibility(visible) {
  sectionGuide.visible = visible;
  sectionArrow.visible = visible;
  sectionCap.visible = visible && sectionCapTriangles > 0;
  sectionOutline.visible = visible && sectionCapTriangles > 0;
}

function sectionBaseNormal() {
  var azimuth = THREE.MathUtils.degToRad(sectionState.azimuth);
  var elevation = THREE.MathUtils.degToRad(sectionState.elevation);
  var horizontal = Math.cos(elevation);
  return new THREE.Vector3(
    horizontal * Math.cos(azimuth),
    Math.sin(elevation),
    horizontal * Math.sin(azimuth)
  ).normalize();
}

function sectionRange(normal) {
  return Math.abs(normal.x) * GRID_W / 2 + Math.abs(normal.y) * MAX_H / 2 + Math.abs(normal.z) * GRID_D / 2 + 0.1;
}

function sectionPoint(baseNormal) {
  var center = new THREE.Vector3(GRID_W / 2, MAX_H / 2, GRID_D / 2);
  return center.addScaledVector(baseNormal, sectionRange(baseNormal) * sectionState.position / 100);
}

function syncSectionMaterials() {
  var clipping = sectionState.enabled ? [sectionPlane] : null;
  cubeMaterials.concat([cubeEdgeMaterial, highlightMesh.material]).forEach(function (material) {
    material.clippingPlanes = clipping;
    material.needsUpdate = true;
  });
}

function cubeSectionPolygon(mesh) {
  var half = CUBE_SIZE * 0.47;
  var corners = [
    [-half, -half, -half], [half, -half, -half],
    [-half, half, -half], [half, half, -half],
    [-half, -half, half], [half, -half, half],
    [-half, half, half], [half, half, half]
  ].map(function (corner) {
    return new THREE.Vector3(corner[0], corner[1], corner[2]).applyMatrix4(mesh.matrixWorld);
  });
  var polygon = SectionGeometry.boxPlanePolygon(
    corners.map(function (point) { return [point.x, point.y, point.z]; }),
    [sectionPlane.normal.x, sectionPlane.normal.y, sectionPlane.normal.z],
    sectionPlane.constant
  );
  return {
    center: polygon.center ? new THREE.Vector3(polygon.center[0], polygon.center[1], polygon.center[2]) : null,
    points: polygon.points.map(function (point) {
      return new THREE.Vector3(point[0], point[1], point[2]);
    })
  };
}

function replaceSectionGeometry(object, positions, colors) {
  var previous = object.geometry;
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  object.geometry = geometry;
  previous.dispose();
}

function updateSectionCap() {
  sectionCapUpdateQueued = false;
  if (!sectionState.enabled) {
    sectionCapTriangles = 0;
    setSectionObjectVisibility(false);
    return;
  }

  var positions = [], colors = [], outlines = [];
  cubeGroup.updateMatrixWorld(true);
  cubes.forEach(function (cube) {
    var polygon = cubeSectionPolygon(cube.mesh);
    if (!polygon.points) return;
    var color = new THREE.Color(cube.color).lerp(new THREE.Color(0xffffff), 0.34);
    for (var i = 0; i < polygon.points.length; i++) {
      var next = polygon.points[(i + 1) % polygon.points.length];
      [polygon.center, polygon.points[i], next].forEach(function (point) {
        positions.push(point.x, point.y, point.z);
        colors.push(color.r, color.g, color.b);
      });
      outlines.push(
        polygon.points[i].x, polygon.points[i].y, polygon.points[i].z,
        next.x, next.y, next.z
      );
    }
  });

  replaceSectionGeometry(sectionCap, positions, colors);
  replaceSectionGeometry(sectionOutline, outlines);
  sectionCapTriangles = positions.length / 9;
  sectionCap.position.copy(sectionKeepNormal).multiplyScalar(0.0015);
  sectionOutline.position.copy(sectionCap.position);
  setSectionObjectVisibility(true);
  renderRequested = true;
}

function requestSectionCapUpdate() {
  if (!sectionState.enabled || sectionCapUpdateQueued) return;
  sectionCapUpdateQueued = true;
  requestAnimationFrame(updateSectionCap);
}

function syncSectionControls() {
  var position = document.getElementById('section-position');
  if (!position) return;
  position.value = String(sectionState.position);
  document.getElementById('section-azimuth').value = String(sectionState.azimuth);
  document.getElementById('section-elevation').value = String(sectionState.elevation);
  document.getElementById('section-position-value').textContent = sectionState.position + '%';
  document.getElementById('section-azimuth-value').textContent = sectionState.azimuth + '°';
  document.getElementById('section-elevation-value').textContent = sectionState.elevation + '°';
  document.getElementById('section-flip').setAttribute('aria-pressed', String(sectionState.flipped));
  document.querySelectorAll('[data-section-preset]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.sectionPreset === sectionState.preset));
  });
}

function updateSectionPlane() {
  if (!sectionPlane) return;
  var baseNormal = sectionBaseNormal();
  var point = sectionPoint(baseNormal);
  sectionKeepNormal.copy(baseNormal).multiplyScalar(sectionState.flipped ? -1 : 1);
  // Three.js discards the negative half-space, so the plane normal points to the retained side.
  sectionPlane.setFromNormalAndCoplanarPoint(sectionKeepNormal, point);

  var guideSize = Math.max(GRID_W, GRID_D, MAX_H) * 2.25;
  sectionGuide.position.copy(point);
  sectionGuide.scale.set(guideSize, guideSize, 1);
  sectionGuide.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), baseNormal);
  sectionArrow.position.copy(point);
  sectionArrow.setDirection(sectionKeepNormal);
  sectionArrow.setLength(Math.max(1.1, guideSize * 0.18), 0.28, 0.16);
  syncSectionControls();
  updateSectionCap();
  renderRequested = true;
}

function setSectionEnabled(enabled) {
  sectionState.enabled = Boolean(enabled);
  var panel = document.getElementById('section-panel');
  var toggle = document.getElementById('section-toggle');
  panel.hidden = !sectionState.enabled;
  toggle.setAttribute('aria-pressed', String(sectionState.enabled));
  toggle.title = sectionState.enabled ? '关闭剖切' : '开启剖切';
  toggle.setAttribute('aria-label', toggle.title);
  document.querySelector('.stage').classList.toggle('section-panel-open', sectionState.enabled);
  if (sectionState.enabled) setSizeEditorOpen(false);
  syncSectionMaterials();
  updateSectionPlane();
  if (!sectionState.enabled) setSectionObjectVisibility(false);
}

function setSectionPreset(name) {
  var presets = {
    x: [0, 0],
    y: [0, 90],
    z: [90, 0],
    diagonal: [45, 35]
  };
  if (!presets[name]) return;
  sectionState.preset = name;
  sectionState.azimuth = presets[name][0];
  sectionState.elevation = presets[name][1];
  updateSectionPlane();
}

function setupSectionControls() {
  document.getElementById('section-toggle').addEventListener('click', function () {
    setSectionEnabled(!sectionState.enabled);
  });
  document.getElementById('section-close').addEventListener('click', function () { setSectionEnabled(false); });
  document.querySelectorAll('[data-section-preset]').forEach(function (button) {
    button.addEventListener('click', function () { setSectionPreset(this.dataset.sectionPreset); });
  });
  [['section-position', 'position'], ['section-azimuth', 'azimuth'], ['section-elevation', 'elevation']].forEach(function (entry) {
    document.getElementById(entry[0]).addEventListener('input', function () {
      sectionState[entry[1]] = parseInt(this.value, 10);
      if (entry[1] !== 'position') sectionState.preset = 'custom';
      updateSectionPlane();
    });
  });
  document.getElementById('section-flip').addEventListener('click', function () {
    sectionState.flipped = !sectionState.flipped;
    updateSectionPlane();
  });
  document.getElementById('section-reset').addEventListener('click', function () {
    sectionState.position = 0;
    sectionState.flipped = false;
    setSectionPreset('x');
  });
  syncSectionControls();
}

/* ---------- 方向标签（前/后/左/右） ---------- */
function makeLabelSprite(text, bgColor) {
  var canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  var ctx = canvas.getContext('2d');
  // Compact ground marker: direction stays readable without covering the model.
  ctx.fillStyle = bgColor;
  roundedRect(ctx, 6, 6, 116, 52, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.82)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 6, 6, 116, 52, 10);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.82, depthTest: true, depthWrite: false });
  var sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.72, 0.36, 1);
  return sprite;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function addDirectionLabels() {
  directionLabels.forEach(function (label) {
    scene.remove(label);
    if (label.material.map) label.material.map.dispose();
    label.material.dispose();
  });
  directionLabels = [];
  // 小学三视图采用观察者方位：前方观察位在 +Z，朝 -Z 看。
  var cx = GRID_W / 2, cz = GRID_D / 2;
  var colors = { '前': 'rgba(255,123,84,0.9)', '后': 'rgba(142,142,142,0.85)', '左': 'rgba(77,150,255,0.9)', '右': 'rgba(81,207,102,0.9)' };
  var dirs = [
    { direction: 'front', text: '前', x: cx, y: 0.16, z: GRID_D + 0.62 },
    { direction: 'back', text: '后', x: cx, y: 0.16, z: -0.62 },
    { direction: 'left', text: '左', x: -0.62, y: 0.16, z: cz },
    { direction: 'right', text: '右', x: GRID_W + 0.62, y: 0.16, z: cz }
  ];
  dirs.forEach(function (d) {
    var key = Object.keys(colors).find(function (k) { return d.text.startsWith(k); });
    var sp = makeLabelSprite(d.text, colors[key] || 'rgba(100,100,100,0.8)');
    sp.position.set(d.x, d.y, d.z);
    sp.userData = { isLabel: true, direction: d.direction };
    scene.add(sp);
    directionLabels.push(sp);
  });
}

function setDirectionGuideVisibility(viewName) {
  var visibleDirections = {
    front: ['front'],
    left: ['left'],
    top: ['front', 'back', 'left', 'right'],
    iso: ['front', 'back', 'left', 'right']
  }[viewName] || [];
  directionLabels.forEach(function (label) {
    label.visible = visibleDirections.indexOf(label.userData.direction) !== -1;
  });
  renderRequested = true;
}

function onResize() {
  var container = document.getElementById('three-container');
  if (!container) return;
  var w = container.clientWidth, h = container.clientHeight;
  if (w === 0 || h === 0) return;
  var frustum = cameraFrustumSize(), aspect = w / h;
  camera.left = -frustum * aspect / 2;
  camera.right = frustum * aspect / 2;
  camera.top = frustum / 2;
  camera.bottom = -frustum / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderRequested = true;
}

function clampDimension(value) {
  return Math.max(3, Math.min(8, parseInt(value, 10) || 4));
}

function setSizeEditorOpen(open) {
  if (open && sectionState.enabled) setSectionEnabled(false);
  var form = document.getElementById('size-form');
  var toggle = document.getElementById('size-toggle');
  form.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}

function applyDimensions(size) {
  size = clampDimension(size);
  document.querySelectorAll('.size-options button').forEach(function (button) {
    var active = parseInt(button.dataset.size, 10) === size;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (size === GRID_W && size === MAX_H && size === GRID_D) {
    setSizeEditorOpen(false);
    return;
  }

  var previous = snapshotBuild();
  GRID_W = size;
  MAX_H = size;
  GRID_D = size;
  clearCubes();
  buildBase();
  addDirectionLabels();
  updateSectionPlane();
  controls.maxDistance = Math.max(18, Math.max(GRID_W, GRID_D, MAX_H) * 4);
  onResize();
  document.querySelector('#size-toggle strong').textContent = String(size);
  setSizeEditorOpen(false);

  if (MODE === 'learn') {
    loadRandomObservation();
  } else if (MODE === 'practice') {
    if (practiceMode === 'challenge') newChallenge();
    else newPractice();
  } else {
    previous.forEach(function (c) {
      if (Coordinates.inBounds(c[0], c[1], c[2], GRID_W, GRID_D, MAX_H)) addCube(c[0], c[1], c[2], false);
    });
    buildHistory = [];
    afterBuildAction();
    flyTo('iso');
  }
}

/* ---------- 方块管理 ---------- */
function cubeColor(y) { return LAYER_COLORS[Math.min(y, LAYER_COLORS.length - 1)]; }

function addCube(x, y, z, animate) {
  if (!Coordinates.inBounds(x, y, z, GRID_W, GRID_D, MAX_H)) return null;
  var key = x + ',' + y + ',' + z;
  if (cubes.has(key)) return null;

  var materialIndex = Math.min(y, cubeMaterials.length - 1);
  var mesh = new THREE.Mesh(cubeGeometry, cubeMaterials[materialIndex]);
  var line = new THREE.LineSegments(cubeEdgeGeometry, cubeEdgeMaterial);
  mesh.add(line);

  var center = Coordinates.gridCenter(x, y, z);
  mesh.position.set(center.x, center.y, center.z);
  mesh.name = 'cube';
  mesh.userData = { x: x, y: y, z: z };
  cubeGroup.add(mesh);
  cubes.set(key, { x: x, y: y, z: z, mesh: mesh, color: cubeColor(y) });

  if (animate !== false) {
    mesh.scale.set(0.01, 0.01, 0.01);
    mesh.position.y += 2.2;
    animateIn(mesh, center.x, center.y, center.z);
  }
  requestSectionCapUpdate();
  return cubes.get(key);
}

function animateIn(mesh, tx, ty, tz) {
  var sy = mesh.position.y, t = 0, dur = 350, start = null;
  function step(ts) {
    if (!start) start = ts;
    t = Math.min(1, (ts - start) / dur);
    var e = 1 - Math.pow(1 - t, 3);
    mesh.position.y = sy + (ty - sy) * e;
    mesh.scale.setScalar(0.01 + 0.99 * e);
    requestSectionCapUpdate();
    renderRequested = true;
    if (t < 1) requestAnimationFrame(step);
    else { mesh.position.set(tx, ty, tz); mesh.scale.setScalar(1); requestSectionCapUpdate(); }
  }
  requestAnimationFrame(step);
}

function removeCube(x, y, z, animate) {
  var key = x + ',' + y + ',' + z;
  var c = cubes.get(key);
  if (!c) return;
  cubes.delete(key);
  requestSectionCapUpdate();
  if (animate !== false) {
    var mesh = c.mesh, sy = mesh.position.y, t = 0, dur = 220, start = null;
    function step(ts) {
      if (!start) start = ts;
      t = Math.min(1, (ts - start) / dur);
      var e = t * t;
      mesh.position.y = sy - 2 * e;
      mesh.scale.setScalar(1 - 0.9 * e);
      renderRequested = true;
      if (t < 1) requestAnimationFrame(step);
      else cubeGroup.remove(mesh);
    }
    requestAnimationFrame(step);
  } else { cubeGroup.remove(c.mesh); }
}

function clearCubes() {
  var keys = Array.from(cubes.keys());
  keys.forEach(function (k) { var c = cubes.get(k); if (c) cubeGroup.remove(c.mesh); });
  cubes.clear();
  highlightMesh.visible = false;
  requestSectionCapUpdate();
  renderRequested = true;
}

function columnHeight(x, z) {
  var top = 0;
  for (var y = 0; y < MAX_H; y++) {
    if (cubes.has(x + ',' + y + ',' + z)) top = y + 1;
  }
  return top;
}

/* ============================================================
 * 三视图计算（顺序与 DOM grid 一致：行优先）
 * ============================================================ */
function computeViews() {
  return Coordinates.computeViews(cubes, GRID_W, GRID_D, MAX_H);
}

function computeStructureViews(structure) {
  var structureMap = new Map();
  structure.forEach(function (cube) {
    structureMap.set(cube[0] + ',' + cube[1] + ',' + cube[2], {
      x: cube[0], y: cube[1], z: cube[2], color: cubeColor(cube[1])
    });
  });
  return Coordinates.computeViews(structureMap, GRID_W, GRID_D, MAX_H);
}

function viewMask(views) {
  return {
    front: views.front.map(function (value) { return value !== null; }),
    left: views.left.map(function (value) { return value !== null; }),
    top: views.top.map(function (value) { return value !== null; })
  };
}

/* ---------- DOM 网格渲染 ---------- */
function makeGrid(el, cols, rows) {
  el.innerHTML = '';
  el.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  for (var i = 0; i < cols * rows; i++) {
    var div = document.createElement('div');
    div.className = 'cell';
    div.dataset.index = i;
    el.appendChild(div);
  }
  return el.children;
}

function makeInteractiveGrid(el, viewName, cols, rows) {
  el.innerHTML = '';
  el.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  for (var i = 0; i < cols * rows; i++) {
    var row = Math.floor(i / cols) + 1;
    var col = (i % cols) + 1;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell';
    button.dataset.index = i;
    button.setAttribute('aria-label', viewName + '第 ' + row + ' 行第 ' + col + ' 列，未涂色');
    button.setAttribute('aria-pressed', 'false');
    el.appendChild(button);
  }
  return el.children;
}

function renderViews(mode) {
  var views = computeViews();
  if (mode === 'learn' || mode === 'build') {
    renderStatic('grid-front', views.front, GRID_W, MAX_H);
    renderStatic('grid-left', views.left, GRID_D, MAX_H);
    renderStatic('grid-top', views.top, GRID_W, GRID_D);
    var three = [ countView(views.front), countView(views.left), countView(views.top) ];
    var labels = ['从前面能看到 <b>' + three[0] + '</b> 个正方形',
                  '从左面能看到 <b>' + three[1] + '</b> 个正方形',
                  '从上面能看到 <b>' + three[2] + '</b> 个正方形'];
    setInfo(labels);
  } else if (mode === 'practice') {
    renderInteractive('grid-front', 'front', GRID_W, MAX_H);
    renderInteractive('grid-left', 'left', GRID_D, MAX_H);
    renderInteractive('grid-top', 'top', GRID_W, GRID_D);
  } else if (mode === 'challenge') {
    renderMask('grid-front', challengeAnswer.front, GRID_W, MAX_H, '#d85b3d');
    renderMask('grid-left', challengeAnswer.left, GRID_D, MAX_H, '#247c78');
    renderMask('grid-top', challengeAnswer.top, GRID_W, GRID_D, '#e5b84b');
  }
}

function renderStatic(id, data, cols, rows) {
  var cells = makeGrid(document.getElementById(id), cols, rows);
  for (var i = 0; i < data.length; i++) {
    if (data[i] !== null) {
      cells[i].classList.add('filled');
      cells[i].style.background = '#' + data[i].toString(16).padStart(6, '0');
    }
  }
}

function renderMask(id, data, cols, rows, color) {
  var cells = makeGrid(document.getElementById(id), cols, rows);
  for (var i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    cells[i].classList.add('filled');
    cells[i].style.background = color;
  }
}

function renderInteractive(id, viewName, cols, rows) {
  var names = { front: '正视图', left: '左视图', top: '俯视图' };
  var cells = makeInteractiveGrid(document.getElementById(id), names[viewName], cols, rows);
  for (var i = 0; i < cells.length; i++) {
    cells[i].addEventListener('click', function () {
      this.classList.remove('miss', 'wrong');
      this.style.outline = '';
      this.style.borderColor = '';
      this.classList.toggle('filled');
      this.style.background = this.classList.contains('filled') ? '#FF9F43' : '';
      this.setAttribute('aria-pressed', String(this.classList.contains('filled')));
      this.setAttribute('aria-label', this.getAttribute('aria-label').replace(/，(未涂色|已涂色)$/, this.classList.contains('filled') ? '，已涂色' : '，未涂色'));
      if (practiceDrawn) {
        updateDrawnFromDOM();
        updateStatusSummary();
      }
    });
  }
}

function countView(data) { var n = 0; data.forEach(function (v) { if (v !== null) n++; }); return n; }

function updateDrawnFromDOM() {
  practiceDrawn = {
    front: readGrid('grid-front'),
    left: readGrid('grid-left'),
    top: readGrid('grid-top')
  };
}

function readGrid(id) {
  var cells = document.getElementById(id).children, arr = [];
  for (var i = 0; i < cells.length; i++) arr.push(cells[i].classList.contains('filled'));
  return arr;
}

function setInfo(labels) {
  document.getElementById('info-front').innerHTML = labels[0];
  document.getElementById('info-left').innerHTML  = labels[1];
  document.getElementById('info-top').innerHTML   = labels[2];
}

/* ============================================================
 * 视角切换
 * ============================================================ */
function getViewPosition(viewName) {
  var cx = GRID_W / 2, cy = MAX_H / 2, cz = GRID_D / 2;
  var span = Math.max(GRID_W, GRID_D, MAX_H);
  var distance = Math.max(10, span * 2.65);
  var views = {
    iso:   { pos: [cx + distance * .62, cy + distance * .48, cz + distance * .62], target: [cx, cy * .72, cz], up: [0, 1, 0] },
    front: { pos: [cx, cy, cz + distance], target: [cx, cy, cz], up: [0, 1, 0] },
    left:  { pos: [cx - distance, cy, cz], target: [cx, cy, cz], up: [0, 1, 0] },
    top:   { pos: [cx, cy + distance, cz], target: [cx, 0, cz], up: [0, 0, -1] }
  };
  return views[viewName];
}
var camAnim = null;

function flyTo(viewName) {
  var v = getViewPosition(viewName);
  if (!v) return;
  setDirectionGuideVisibility(viewName);
  document.querySelectorAll('.vb').forEach(function (b) {
    var active = b.dataset.view === viewName;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  var cardMap = { front: 'card-front', left: 'card-left', top: 'card-top' };
  var card = cardMap[viewName] ? document.getElementById(cardMap[viewName]) : null;
  if (card) { card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
  if (camAnim) cancelAnimationFrame(camAnim);
  var fp = camera.position.clone(), ft = controls.target.clone(), fu = camera.up.clone();
  var tp = new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]);
  var tt = new THREE.Vector3(v.target[0], v.target[1], v.target[2]);
  var tu = new THREE.Vector3(v.up[0], v.up[1], v.up[2]);
  var start = null, dur = 680;
  function step(ts) {
    if (!start) start = ts;
    var t = Math.min(1, (ts - start) / dur);
    var e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(fp, tp, e);
    controls.target.lerpVectors(ft, tt, e);
    camera.up.lerpVectors(fu, tu, e).normalize();
    controls.update();
    renderRequested = true;
    if (t < 1) camAnim = requestAnimationFrame(step);
    else camAnim = null;
  }
  camAnim = requestAnimationFrame(step);
}

/* ============================================================
 * 交互拾取
 * ============================================================ */
var pDown = null, pTime = 0;

function isBuildLikeMode() {
  return MODE === 'build' || (MODE === 'practice' && practiceMode === 'challenge');
}

function setupPicking() {
  var el = renderer.domElement;
  el.addEventListener('contextmenu', function (e) {
    if (isBuildLikeMode()) e.preventDefault();
  });
  el.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && isBuildLikeMode() && (e.button === 0 || e.button === 2)) {
      selectBuildTool(e.button === 2 ? 'remove' : 'add', false);
    }
    pDown = { x: e.clientX, y: e.clientY, button: e.button };
    pTime = Date.now();
  });
  el.addEventListener('pointerup', function (e) {
    if (!pDown) return;
    var dx = e.clientX - pDown.x, dy = e.clientY - pDown.y, dt = Date.now() - pTime;
    var sameButton = pDown.button === e.button;
    pDown = null;
    if (sameButton && Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 1200) {
      handleTap(e);
    }
  });
  // hover 高亮
  el.addEventListener('pointermove', function (e) {
    if (!isBuildLikeMode()) { highlightMesh.visible = false; renderRequested = true; return; }
    var target = getBuildTarget(e);
    if (!target) { highlightMesh.visible = false; renderRequested = true; return; }
    highlightMesh.material.color.setHex(buildTool === 'add' ? 0xF2A65A : 0xD95D4F);
    var center = Coordinates.gridCenter(target.x, target.y, target.z);
    highlightMesh.position.set(center.x, center.y, center.z);
    highlightMesh.visible = true;
    renderRequested = true;
  });
}

function getBuildHit(e) {
  var rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  ), camera);
  // Intersect cube meshes only. Recursive hits include decorative edge lines,
  // which do not carry a face normal and used to offset blocks incorrectly.
  var hits = raycaster.intersectObjects(cubeGroup.children, false);
  var baseHits = raycaster.intersectObject(basePlane);
  if (sectionState.enabled) {
    hits = hits.filter(function (hit) { return sectionPlane.distanceToPoint(hit.point) >= -0.01; });
    baseHits = baseHits.filter(function (hit) { return sectionPlane.distanceToPoint(hit.point) >= -0.01; });
  }

  var cubeHit = null;
  if (hits.length > 0) {
    var mesh = hits[0].object;
    var normal = hits[0].face.normal.clone().transformDirection(mesh.matrixWorld);
    cubeHit = {
      kind: 'cube',
      x: mesh.userData.x,
      y: mesh.userData.y,
      z: mesh.userData.z,
      normal: { x: Math.round(normal.x), y: Math.round(normal.y), z: Math.round(normal.z) },
      distance: hits[0].distance
    };
  }
  var baseHit = null;
  if (baseHits.length > 0) {
    var p = baseHits[0].point, gx = Math.floor(p.x), gz = Math.floor(p.z);
    if (gx >= 0 && gx < GRID_W && gz >= 0 && gz < GRID_D) {
      baseHit = { kind: 'base', x: gx, y: 0, z: gz, distance: baseHits[0].distance };
    }
  }
  if (cubeHit && baseHit) return cubeHit.distance < baseHit.distance ? cubeHit : baseHit;
  return cubeHit || baseHit;
}

function getBuildTarget(e) {
  var hit = getBuildHit(e);
  if (!hit) return null;
  if (buildTool === 'remove') {
    return hit.kind === 'cube' ? { x: hit.x, y: hit.y, z: hit.z } : null;
  }
  var target = hit.kind === 'cube' ? Coordinates.adjacent(hit, hit.normal) : hit;
  return Coordinates.inBounds(target.x, target.y, target.z, GRID_W, GRID_D, MAX_H) ? target : null;
}

function handleTap(e) {
  if (!isBuildLikeMode()) return;
  var target = getBuildTarget(e);
  if (!target) return;
  var before = snapshotBuild(), changed;
  if (buildTool === 'add') changed = !!addCube(target.x, target.y, target.z);
  else changed = !!cubes.get(target.x + ',' + target.y + ',' + target.z);
  if (buildTool === 'remove' && changed) removeCube(target.x, target.y, target.z);
  if (!changed) return;
  buildHistory.push(before);
  afterBuildAction();
  playSound(buildTool === 'add' ? 'place' : 'pop');
}

function snapshotBuild() {
  return Array.from(cubes.values()).map(function (c) { return [c.x, c.y, c.z]; });
}

function restoreBuild(snapshot) {
  clearCubes();
  snapshot.forEach(function (c) { addCube(c[0], c[1], c[2], false); });
  afterBuildAction();
}

function applyBuildAt(x, z) {
  var tool = arguments.length > 2 ? arguments[2] : buildTool;
  var height = columnHeight(x, z);
  if (tool === 'add' && height < MAX_H) {
    buildHistory.push(snapshotBuild());
    addCube(x, height, z);
  } else if (tool === 'remove' && height > 0) {
    buildHistory.push(snapshotBuild());
    removeCube(x, height - 1, z);
  } else {
    return;
  }
  afterBuildAction();
  playSound(tool === 'add' ? 'place' : 'pop');
}

function afterBuildAction() {
  if (MODE === 'practice' && practiceMode === 'challenge') {
    renderViews('challenge');
    updateChallengeProgress(false);
  } else {
    renderViews('build');
  }
  updateBuildCount();
  renderBuildPad();
}

/* ============================================================
 * 音效 + 语音
 * ============================================================ */
var audioCtx = null;
var voiceLibrary = window.SanviewVoiceLibrary || {};
var voicePlayer = null;
var lastVoiceVariant = {};
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
  if (!soundOn || !audioCtx) return;
  ensureAudio();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  if (type === 'place') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(523, now);
    osc.frequency.setValueAtTime(784, now + 0.08);
    gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now); osc.stop(now + 0.2);
  } else if (type === 'pop') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
    gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now); osc.stop(now + 0.12);
  } else if (type === 'win') {
    [523, 659, 784, 1047].forEach(function (f, i) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.25, now + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
      o.start(now + i * 0.12); o.stop(now + i * 0.12 + 0.32);
    });
  }
}

function stopVoice() {
  if (voicePlayer) {
    voicePlayer.pause();
    voicePlayer.currentTime = 0;
    voicePlayer = null;
  }
  try { window.speechSynthesis.cancel(); } catch (error) {}
}

function browserSpeak(text) {
  if (!soundOn) return;
  try {
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function speakKey(key, fallbackText) {
  if (!soundOn) return;
  var variants = voiceLibrary[key] || [];
  if (!variants.length || typeof Audio === 'undefined') {
    browserSpeak(fallbackText || key);
    return;
  }
  var index = Math.floor(Math.random() * variants.length);
  if (variants.length > 1 && index === lastVoiceVariant[key]) index = (index + 1) % variants.length;
  lastVoiceVariant[key] = index;
  var entry = variants[index];
  stopVoice();
  var player = new Audio(entry.path);
  voicePlayer = player;
  player.preload = 'auto';
  player.volume = 0.92;
  var fellBack = false;
  function fallback() {
    if (fellBack) return;
    fellBack = true;
    if (voicePlayer === player) voicePlayer = null;
    browserSpeak(entry.text || fallbackText || key);
  }
  player.addEventListener('error', fallback, { once: true });
  var playback = player.play();
  if (playback && playback.catch) playback.catch(fallback);
}

/* ============================================================
 * 学习模式
 * ============================================================ */
function randomSupportedStructure(level) {
  return Coordinates.generateAdaptiveStructure(GRID_W, GRID_D, MAX_H, level);
}

function loadRandomObservation(announce) {
  clearCubes();
  var struct = randomSupportedStructure(learnDifficulty);
  struct.forEach(function (c) { addCube(c[0], c[1], c[2], false); });
  renderViews('learn');
  updateStatusSummary();
  setHintVisible(true);
  flyTo('iso');
  if (announce === true) speakKey('observe_new');
}

function setHintVisible(v) {
  document.getElementById('hint').classList.toggle('hidden', !v);
}

function updateStatusSummary() {
  var text;
  if (MODE === 'learn') {
    text = '观察 · ' + DIFFICULTY_NAMES[learnDifficulty] + ' · 空间 ' + GRID_W;
  } else if (MODE === 'practice' && practiceMode === 'draw') {
    var completed = 0;
    if (practiceDrawn) {
      ['front', 'left', 'top'].forEach(function (view) {
        if (practiceDrawn[view].some(function (value) { return value; })) completed++;
      });
    }
    text = '画视图 · ' + DIFFICULTY_NAMES[difficulty] + ' · 已绘制 ' + completed + '/3';
  } else if (MODE === 'practice') {
    var matched = ['front', 'left', 'top'].filter(function (view) { return challengeMatch[view]; }).length;
    text = '还原积木 · ' + DIFFICULTY_NAMES[difficulty] + ' · 匹配 ' + matched + '/3';
  } else {
    text = '自由搭建 · 空间 ' + GRID_W + ' · ' + cubes.size + ' 块';
  }
  document.getElementById('hint').textContent = text;
  setHintVisible(true);
}

/* ============================================================
 * 练习模式
 * ============================================================ */
function randomPracticeStructure() {
  return randomSupportedStructure(difficulty);
}

function newPractice(announce) {
  clearCubes();
  var struct = randomPracticeStructure();
  struct.forEach(function (c) { addCube(c[0], c[1], c[2], false); });

  practiceAnswer = viewMask(computeViews());
  practiceDrawn = { front: [], left: [], top: [] };
  renderViews('practice');
  updateStatusSummary();
  flyTo('iso');
  if (announce === true) speakKey('draw_new');
}

function checkPractice() {
  if (!practiceAnswer) return;
  updateDrawnFromDOM();
  var answer = practiceAnswer, allCorrect = true, firstFail = null;

  [['grid-front', 'front'], ['grid-left', 'left'], ['grid-top', 'top']].forEach(function (pair) {
    var cells = document.getElementById(pair[0]).children;
    var ans = answer[pair[1]], drew = practiceDrawn[pair[1]];
    for (var i = 0; i < cells.length; i++) {
      // 清除上次标记
      cells[i].classList.remove('miss', 'wrong', 'correct-mark');
      cells[i].style.outline = '';
      cells[i].style.borderColor = '';
      var fill = cells[i].classList.contains('filled');
      if (ans[i] && !fill) {
        cells[i].classList.add('miss'); cells[i].style.background = '#FF6B6B';
        allCorrect = false; if (!firstFail) firstFail = pair[1];
      } else if (!ans[i] && fill) {
        cells[i].classList.add('wrong'); cells[i].style.background = '#FF6B6B';
        allCorrect = false; if (!firstFail) firstFail = pair[1];
      } else if (ans[i] && fill) {
        cells[i].style.outline = '3px solid #51CF66';
      }
    }
  });

  score.total++;
  if (allCorrect) {
    score.win++;
    playSound('win');
    speakKey('draw_success');
    showWinOverlay();
    document.getElementById('hint').textContent = '🎉 太厉害了！全对！';
  } else {
    playSound('pop');
    if (firstFail) speakKey('draw_retry_' + firstFail);
    document.getElementById('hint').textContent = '😊 还有小错误，看看红色格子，改一改再试试～';
  }
  updateScore();
}

function showAnswer() {
  if (!practiceAnswer) return;
  var map = { front: 'grid-front', left: 'grid-left', top: 'grid-top' };
  Object.keys(map).forEach(function (k) {
    var cells = document.getElementById(map[k]).children;
    practiceAnswer[k].forEach(function (v, i) {
      cells[i].classList.remove('miss', 'wrong');
      cells[i].style.outline = '';
      cells[i].style.borderColor = '';
      if (v) { cells[i].classList.add('filled'); cells[i].style.background = '#51CF66'; }
      else { cells[i].classList.remove('filled'); cells[i].style.background = ''; }
      cells[i].setAttribute('aria-pressed', String(v));
      cells[i].setAttribute('aria-label', cells[i].getAttribute('aria-label').replace(/，(未涂色|已涂色)$/, v ? '，已涂色' : '，未涂色'));
    });
  });
  updateDrawnFromDOM();
  updateStatusSummary();
  speakKey('answer_reveal');
}

function clearDrawing() {
  ['grid-front', 'grid-left', 'grid-top'].forEach(function (id) {
    var cells = document.getElementById(id).children;
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove('filled', 'miss', 'wrong');
      cells[i].style.background = '';
      cells[i].style.outline = '';
      cells[i].style.borderColor = '';
      cells[i].setAttribute('aria-pressed', 'false');
      cells[i].setAttribute('aria-label', cells[i].getAttribute('aria-label').replace(/，(未涂色|已涂色)$/, '，未涂色'));
    }
  });
  practiceDrawn = { front: [], left: [], top: [] };
  updateStatusSummary();
  speakKey('drawing_reset');
}

function sameMask(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (var i = 0; i < left.length; i++) {
    if (Boolean(left[i]) !== Boolean(right[i])) return false;
  }
  return true;
}

function newChallenge(announce) {
  clearCubes();
  buildHistory = [];
  challengeAnswer = viewMask(computeStructureViews(randomPracticeStructure()));
  challengeMatch = { front: false, left: false, top: false };
  renderViews('challenge');
  ensureBuildPad();
  document.getElementById('build-pad').hidden = false;
  renderBuildPad();
  updateChallengeProgress(false);
  updateBuildCount();
  flyTo('iso');
  if (announce === true) speakKey('challenge_new');
}

function updateChallengeProgress(showErrors) {
  if (!challengeAnswer) return false;
  var current = viewMask(computeViews());
  var labels = [];
  ['front', 'left', 'top'].forEach(function (view) {
    var matched = sameMask(current[view], challengeAnswer[view]);
    challengeMatch[view] = matched;
    var card = document.getElementById('card-' + view);
    card.classList.toggle('win', matched);
    card.classList.toggle('fail', Boolean(showErrors && !matched));
    labels.push(matched ? '<b>已匹配</b>' : (showErrors ? '还不一致，继续调整' : '目标投影'));
  });
  setInfo(labels);
  updateStatusSummary();
  return challengeMatch.front && challengeMatch.left && challengeMatch.top;
}

function checkChallenge() {
  score.total++;
  if (updateChallengeProgress(true)) {
    score.win++;
    playSound('win');
    speakKey('challenge_success');
    showWinOverlay('challenge');
  } else {
    playSound('pop');
    speakKey('challenge_retry');
  }
  updateScore();
}

function updateScore() {
  var el = document.getElementById('score-text');
  if (el) el.textContent = '⭐ ' + score.win + '/' + score.total;
}

/* ============================================================
 * 胜利弹窗
 * ============================================================ */
function showWinOverlay(kind) {
  var challenge = kind === 'challenge';
  var overlay = document.getElementById('overlay');
  overlay.innerHTML = '<div class="win-box" role="dialog" aria-modal="true" aria-labelledby="win-title">' +
    '<div class="big" id="win-emoji" aria-hidden="true">✓</div>' +
    '<div class="msg" id="win-title">' + (challenge ? '三幅视图全部匹配' : '三幅视图全部画对') + '</div>' +
    '<div class="sub" id="win-sub">已完成 ' + score.win + ' 题</div>' +
    '<div class="dialog-actions"><button class="again" id="win-again">再来一题</button>' +
    '<button class="again secondary" id="win-close">关闭</button></div></div>';
  overlay.classList.add('show');
  document.getElementById('win-again').addEventListener('click', function () {
    hideWinOverlay();
    if (challenge) newChallenge(true);
    else newPractice(true);
  });
  document.getElementById('win-close').addEventListener('click', hideWinOverlay);
  overlay.onclick = function (event) { if (event.target === overlay) hideWinOverlay(); };
  document.getElementById('win-again').focus();
  confettiBurst();
}

function hideWinOverlay() {
  var overlay = document.getElementById('overlay');
  overlay.classList.remove('show', 'tutorial-overlay');
  overlay.innerHTML = '';
  overlay.onclick = null;
}

var tutorialStep = 0;
var activeTutorialKey = 'learn';
var TUTORIALS = {
  learn: [
    { target: '#stage-toolbar', title: '选择合适的观察难度', text: '点击左右箭头循环切换简单、中等、困难和挑战；换一组会生成新的立体结构。' },
    { target: '#view-btns', title: '从三个方向观察', text: '依次切到前、左、上，看看立体结构在每个方向留下什么形状。' },
    { target: '.views-panel', title: '对照三视图', text: '正视图、左视图和俯视图会随结构同步变化，先看轮廓，再比较各行各列。' }
  ],
  draw: [
    { target: '#practice-switcher-slot', title: '当前任务是画视图', text: '给定左侧立体结构，在右侧三张网格中画出它的正视图、左视图和俯视图。' },
    { target: '.views-panel', title: '点击格子作答', text: '点击格子进行涂色；三个视图都完成后点击检查，红色格子表示需要修改。' },
    { target: '#stage-toolbar', title: '控制题目与反馈', text: '可切换难度、换新题、查看答案或重画。答案适合卡住时学习，不计作独立完成。' }
  ],
  challenge: [
    { target: '#practice-switcher-slot', title: '当前任务是还原积木', text: '右侧给出目标三视图，你需要在左侧搭出一个投影完全一致的结构。' },
    { target: '#build-pad', title: '使用俯视搭建盘', text: '每个格子代表一列积木。电脑左键增加、右键减少；手机先选择增加或减少。' },
    { target: '.views-panel', title: '观察匹配进度', text: '每次搭建后系统都会比较三幅投影。三个视图全部匹配即可通过，不要求坐标与原题唯一解完全相同。' }
  ],
  build: [
    { target: '#three-container', title: '自由搭建立体结构', text: '直接点击底座或方块表面增加积木，拖动空白处可以旋转观察。' },
    { target: '#build-pad', title: '精确调整每一列', text: '俯视搭建盘中的数字表示该列高度，电脑右键可减少最上方一块。' },
    { target: '#stage-toolbar', title: '撤销和清空', text: '撤销可恢复上一步，清空后也能立即撤销；手机端保留增加和减少两个操作按钮。' }
  ]
};

function currentTutorialKey() {
  if (MODE === 'practice') return practiceMode;
  return MODE;
}

function clearTutorialTarget() {
  document.querySelectorAll('.tutorial-target').forEach(function (element) {
    element.classList.remove('tutorial-target');
  });
}

function rememberTutorial() {
  try { window.localStorage.setItem('sanview-tutorial-seen-' + activeTutorialKey, '1'); } catch (error) {}
}

function closeTutorial() {
  clearTutorialTarget();
  rememberTutorial();
  stopVoice();
  hideWinOverlay();
}

function renderTutorialStep() {
  clearTutorialTarget();
  var tutorialSteps = TUTORIALS[activeTutorialKey];
  var step = tutorialSteps[tutorialStep];
  var target = document.querySelector(step.target);
  if (target) target.classList.add('tutorial-target');
  var overlay = document.getElementById('overlay');
  overlay.innerHTML = '<section class="tutorial-box" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">' +
    '<div class="tutorial-progress" aria-label="教程进度">' +
    tutorialSteps.map(function (_, index) { return '<i class="' + (index === tutorialStep ? 'active' : '') + '"></i>'; }).join('') +
    '</div><span class="tutorial-count">' + (tutorialStep + 1) + ' / ' + tutorialSteps.length + '</span>' +
    '<h2 id="tutorial-title">' + step.title + '</h2><p>' + step.text + '</p>' +
    '<div class="tutorial-actions"><button type="button" class="tutorial-skip" id="tutorial-skip">跳过</button>' +
    '<div><button type="button" class="tutorial-prev" id="tutorial-prev"' + (tutorialStep === 0 ? ' disabled' : '') + '>上一步</button>' +
    '<button type="button" class="tutorial-next" id="tutorial-next">' + (tutorialStep === tutorialSteps.length - 1 ? '完成' : '下一步') + '</button></div></div></section>';
  overlay.classList.add('show', 'tutorial-overlay');
  overlay.onclick = null;
  document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);
  document.getElementById('tutorial-prev').addEventListener('click', function () {
    if (tutorialStep > 0) { tutorialStep--; renderTutorialStep(); }
  });
  document.getElementById('tutorial-next').addEventListener('click', function () {
    if (tutorialStep === tutorialSteps.length - 1) closeTutorial();
    else { tutorialStep++; renderTutorialStep(); }
  });
  document.getElementById('tutorial-next').focus();
  speakKey('tutorial_' + activeTutorialKey + '_' + (tutorialStep + 1), step.title + '。' + step.text);
}

function openTutorial() {
  activeTutorialKey = currentTutorialKey();
  tutorialStep = 0;
  renderTutorialStep();
}

function maybeShowTutorial() {
  if (new URLSearchParams(window.location.search).get('test') === '1') return;
  activeTutorialKey = currentTutorialKey();
  var seen = false;
  try { seen = window.localStorage.getItem('sanview-tutorial-seen-' + activeTutorialKey) === '1'; } catch (error) {}
  if (!seen) openTutorial();
}

/* ============================================================
 * 彩带
 * ============================================================ */
function confettiBurst() {
  var wrap = document.getElementById('confetti-canvas-wrap');
  var canvas = document.getElementById('confetti-canvas');
  wrap.style.display = 'block';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var ctx = canvas.getContext('2d');
  var colors = ['#FF8C42', '#FF6B9D', '#4D96FF', '#2BCBBA', '#FFD166', '#A78BFA'];
  var parts = [], frames = 0;
  for (var i = 0; i < 100; i++) {
    parts.push({
      x: Math.random() * canvas.width, y: -30 - Math.random() * 300,
      w: 6 + Math.random() * 8, h: 6 + Math.random() * 8,
      vy: 2 + Math.random() * 4, vx: -1 + Math.random() * 2,
      rot: Math.random() * Math.PI, vr: -0.12 + Math.random() * 0.24,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
  function draw() {
    frames++; ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(function (p) {
      p.y += p.vy; p.x += p.vx + Math.sin(frames * 0.05 + p.rot) * 0.6; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (parts.some(function (p) { return p.y < canvas.height + 40; }) && frames < 400) requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); wrap.style.display = 'none'; }
  }
  draw();
}

/* ============================================================
 * 搭建模式
 * ============================================================ */
function difficultyControlMarkup(id, value, label) {
  return '<div class="difficulty-control" role="group" aria-label="' + label + '">' +
    '<span>难度</span>' +
    '<button type="button" class="difficulty-step" data-difficulty="' + id + '" data-step="-1" aria-label="降低难度">‹</button>' +
    '<strong id="' + id + '">' + DIFFICULTY_NAMES[value] + '</strong>' +
    '<button type="button" class="difficulty-step" data-difficulty="' + id + '" data-step="1" aria-label="提高难度">›</button>' +
    '</div>';
}

function bindDifficultyControl(id, getValue, onChange) {
  function refresh() {
    var value = getValue();
    var label = document.getElementById(id);
    if (label) label.textContent = DIFFICULTY_NAMES[value];
  }
  document.querySelectorAll('[data-difficulty="' + id + '"]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = (getValue() + parseInt(this.dataset.step, 10) + DIFFICULTY_NAMES.length) % DIFFICULTY_NAMES.length;
      onChange(next);
      refresh();
    });
  });
  refresh();
}

function practiceSwitcherMarkup() {
  return '<div class="practice-switcher" role="group" aria-label="练习类型">' +
    '<button type="button" data-practice-mode="draw" aria-pressed="' + (practiceMode === 'draw') + '">画视图</button>' +
    '<button type="button" data-practice-mode="challenge" aria-pressed="' + (practiceMode === 'challenge') + '">还原积木</button>' +
    '</div>';
}

function bindPracticeSwitcher() {
  document.querySelectorAll('[data-practice-mode]').forEach(function (button) {
    var active = button.dataset.practiceMode === practiceMode;
    button.classList.toggle('active', active);
    button.addEventListener('click', function () {
      if (this.dataset.practiceMode === practiceMode) return;
      practiceMode = this.dataset.practiceMode;
      setupPracticeMode();
    });
  });
}

function buildToolsMarkup(includeChallengeActions) {
  var actions = includeChallengeActions ?
    '<button class="tbtn teal" id="challenge-new">新题</button><button class="tbtn primary" id="challenge-check">检查</button>' : '';
  return actions +
    '<span class="build-input-hint desktop-input-hint">左键增加 · 右键减少</span>' +
    '<span class="build-input-hint mobile-input-hint">选择工具后轻点</span>' +
    '<div class="tool-segment mobile-build-tools" role="group" aria-label="搭建工具">' +
    '<button class="tbtn add on" id="tool-add"><span aria-hidden="true">＋</span> 增加</button>' +
    '<button class="tbtn remove" id="tool-remove"><span aria-hidden="true">−</span> 减少</button>' +
    '</div>' +
    '<button class="tbtn ghost icon-btn" id="tool-undo" aria-label="撤销" title="撤销">↶</button>' +
    '<button class="tbtn ghost icon-btn" id="tool-clear" aria-label="清空" title="清空">×</button>' +
    '<span class="cube-count" id="cube-count">0 块</span>';
}

function bindBuildToolbar() {
  document.getElementById('tool-add').addEventListener('click', function () { selectBuildTool('add', true); });
  document.getElementById('tool-remove').addEventListener('click', function () { selectBuildTool('remove', true); });
  document.getElementById('tool-undo').addEventListener('click', function () {
    if (!buildHistory.length) return;
    restoreBuild(buildHistory.pop());
    playSound('pop');
  });
  document.getElementById('tool-clear').addEventListener('click', function () {
    if (!cubes.size) return;
    buildHistory.push(snapshotBuild());
    clearCubes();
    afterBuildAction();
    speakKey('build_cleared');
  });
  ensureBuildPad();
  renderBuildPad();
}

function setupBuildToolbar() {
  var t = document.getElementById('stage-toolbar');
  t.innerHTML = buildToolsMarkup(false);
  bindBuildToolbar();
}

function selectBuildTool(tool, announce) {
  buildTool = tool === 'remove' ? 'remove' : 'add';
  var addButton = document.getElementById('tool-add');
  var removeButton = document.getElementById('tool-remove');
  if (addButton) addButton.classList.toggle('on', buildTool === 'add');
  if (removeButton) removeButton.classList.toggle('on', buildTool === 'remove');
  renderBuildPad();
  if (announce) speakKey(buildTool === 'add' ? 'tool_add' : 'tool_remove');
}

function ensureBuildPad() {
  var existing = document.getElementById('build-pad');
  if (existing) { existing.hidden = false; return; }
  var pad = document.createElement('section');
  pad.id = 'build-pad';
  pad.className = 'build-pad';
  pad.innerHTML = '<div class="build-pad-title"><b>俯视搭建盘</b><div><span>后 ↑</span><button type="button" id="build-pad-collapse" aria-label="收起俯视搭建盘" aria-expanded="true">−</button></div></div>' +
    '<div class="build-pad-grid" id="build-pad-grid"></div>' +
    '<div class="build-pad-axis"><span>左</span><span>前 ↓</span><span>右</span></div>';
  document.querySelector('.stage').appendChild(pad);
  document.getElementById('build-pad-collapse').addEventListener('click', function () {
    buildPadCollapsed = !buildPadCollapsed;
    pad.classList.toggle('collapsed', buildPadCollapsed);
    this.textContent = buildPadCollapsed ? '▦' : '−';
    this.setAttribute('aria-expanded', String(!buildPadCollapsed));
    this.setAttribute('aria-label', buildPadCollapsed ? '展开俯视搭建盘' : '收起俯视搭建盘');
  });
}

function renderBuildPad() {
  var grid = document.getElementById('build-pad-grid');
  if (!grid) return;
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = 'repeat(' + GRID_W + ', 1fr)';
  for (var z = 0; z < GRID_D; z++) {
    for (var x = 0; x < GRID_W; x++) {
      var height = columnHeight(x, z);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'build-cell' + (height ? ' occupied' : '');
      button.dataset.x = x;
      button.dataset.z = z;
      button.setAttribute('aria-label', '第 ' + (z + 1) + ' 排第 ' + (x + 1) + ' 列，' + height + ' 块');
      button.innerHTML = '<span>' + (height || '·') + '</span>';
      bindBuildCell(button);
      grid.appendChild(button);
    }
  }
}

function bindBuildCell(button) {
  var press = null;
  button.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  button.addEventListener('pointerdown', function (event) {
    press = { x: event.clientX, y: event.clientY, time: Date.now(), button: event.button, pointerType: event.pointerType };
  });
  button.addEventListener('pointerup', function (event) {
    if (!press || press.button !== event.button) return;
    var dx = event.clientX - press.x, dy = event.clientY - press.y;
    var duration = Date.now() - press.time;
    var tool = press.pointerType === 'mouse' ? (event.button === 2 ? 'remove' : 'add') : buildTool;
    press = null;
    if (Math.abs(dx) >= 10 || Math.abs(dy) >= 10 || duration >= 1200) return;
    event.preventDefault();
    selectBuildTool(tool, false);
    applyBuildAt(parseInt(this.dataset.x, 10), parseInt(this.dataset.z, 10), tool);
  });
  button.addEventListener('click', function (event) {
    if (event.detail !== 0) return;
    selectBuildTool('add', false);
    applyBuildAt(parseInt(this.dataset.x, 10), parseInt(this.dataset.z, 10), 'add');
  });
}

function updateBuildCount() {
  var n = cubes.size;
  var el = document.getElementById('cube-count');
  if (el) el.textContent = n + ' 块';
  var undo = document.getElementById('tool-undo');
  if (undo) undo.disabled = buildHistory.length === 0;
  updateStatusSummary();
}

function clearViewFeedback() {
  ['front', 'left', 'top'].forEach(function (view) {
    document.getElementById('card-' + view).classList.remove('win', 'fail');
  });
}

function setupPracticeMode() {
  var toolbar = document.getElementById('stage-toolbar');
  var switcherSlot = document.getElementById('practice-switcher-slot');
  var viewBtns = document.getElementById('view-btns');
  var buildPad = document.getElementById('build-pad');
  switcherSlot.hidden = false;
  switcherSlot.innerHTML = practiceSwitcherMarkup();
  bindPracticeSwitcher();
  clearViewFeedback();

  if (practiceMode === 'draw') {
    if (buildPad) buildPad.hidden = true;
    toolbar.innerHTML = difficultyControlMarkup('practice-difficulty', difficulty, '画视图难度') +
      '<button class="tbtn teal" id="practice-new">新题</button>' +
      '<button class="tbtn primary" id="practice-check">检查</button>' +
      '<button class="tbtn tool" id="practice-answer">答案</button>' +
      '<button class="tbtn ghost" id="practice-clear">重画</button>' +
      '<span class="stars" id="score-text">' + score.win + '/' + score.total + '</span>';
    bindDifficultyControl('practice-difficulty', function () { return difficulty; }, function (value) {
      difficulty = value;
      newPractice();
    });
    document.getElementById('practice-new').addEventListener('click', function () { newPractice(true); });
    document.getElementById('practice-check').addEventListener('click', checkPractice);
    document.getElementById('practice-answer').addEventListener('click', showAnswer);
    document.getElementById('practice-clear').addEventListener('click', clearDrawing);
    viewBtns.style.display = 'none';
    newPractice();
    maybeShowTutorial();
    return;
  }

  toolbar.innerHTML = difficultyControlMarkup('challenge-difficulty', difficulty, '还原积木难度') + buildToolsMarkup(true);
  bindDifficultyControl('challenge-difficulty', function () { return difficulty; }, function (value) {
    difficulty = value;
    newChallenge();
  });
  bindBuildToolbar();
  document.getElementById('challenge-new').addEventListener('click', function () { newChallenge(true); });
  document.getElementById('challenge-check').addEventListener('click', checkChallenge);
  viewBtns.style.display = '';
  newChallenge();
  maybeShowTutorial();
}

/* ============================================================
 * 模式切换
 * ============================================================ */
function setMode(mode) {
  MODE = mode;
  document.querySelectorAll('.tab').forEach(function (t) {
    var active = t.dataset.mode === mode;
    t.classList.toggle('active', active);
    t.setAttribute('aria-pressed', String(active));
  });

  var toolbar = document.getElementById('stage-toolbar');
  var viewBtns = document.getElementById('view-btns');
  var buildPad = document.getElementById('build-pad');
  var switcherSlot = document.getElementById('practice-switcher-slot');

  // 先隐藏/清理不需要的元素
  switcherSlot.hidden = mode !== 'practice';
  if (mode !== 'practice') switcherSlot.innerHTML = '';
  if (buildPad) buildPad.hidden = mode !== 'build';
  clearViewFeedback();

  if (mode === 'learn') {
    toolbar.innerHTML = difficultyControlMarkup('learn-difficulty', learnDifficulty, '随机观察难度') +
      '<button class="tbtn primary" id="learn-random">换一组</button>';
    bindDifficultyControl('learn-difficulty', function () { return learnDifficulty; }, function (value) {
      learnDifficulty = value;
      loadRandomObservation();
    });
    document.getElementById('learn-random').addEventListener('click', function () { loadRandomObservation(true); });
    viewBtns.style.display = '';
    loadRandomObservation();
  } else if (mode === 'practice') {
    setupPracticeMode();
  } else if (mode === 'build') {
    buildHistory = [];
    buildTool = 'add';
    clearCubes();
    setupBuildToolbar();
    viewBtns.style.display = '';
    renderViews('build');
    updateBuildCount();
    flyTo('iso');
  }
  if (mode !== 'practice') maybeShowTutorial();
}

/* ============================================================
 * 动画循环
 * ============================================================ */
function animate() {
  requestAnimationFrame(animate);
  var controlsChanged = controls.update();
  if (!renderRequested && !controlsChanged) return;
  renderer.render(scene, camera);
  renderRequested = false;
}

function installTestApi() {
  if (new URLSearchParams(window.location.search).get('test') !== '1') return;
  window.SanviewDebug = {
    getState: function () {
      return {
        mode: MODE,
        practiceMode: practiceMode,
        challengeMatch: challengeMatch,
        dimensions: [GRID_W, MAX_H, GRID_D],
        buildTool: buildTool,
        cubes: Array.from(cubes.values()).map(function (cube) {
          return {
            x: cube.x, y: cube.y, z: cube.z,
            world: [cube.mesh.position.x, cube.mesh.position.y, cube.mesh.position.z]
          };
        }),
        camera: {
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
          up: [camera.up.x, camera.up.y, camera.up.z],
          orthographic: camera.isOrthographicCamera === true
        },
        section: {
          enabled: sectionState.enabled,
          preset: sectionState.preset,
          position: sectionState.position,
          azimuth: sectionState.azimuth,
          elevation: sectionState.elevation,
          flipped: sectionState.flipped,
          keepNormal: [sectionKeepNormal.x, sectionKeepNormal.y, sectionKeepNormal.z],
          plane: [sectionPlane.normal.x, sectionPlane.normal.y, sectionPlane.normal.z, sectionPlane.constant],
          capTriangles: sectionCapTriangles
        },
        views: computeViews()
      };
    },
    project: function (x, y, z) {
      var point = new THREE.Vector3(x, y, z).project(camera);
      var rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + (point.x + 1) * rect.width / 2,
        y: rect.top + (1 - point.y) * rect.height / 2
      };
    },
    canvasPixels: function () {
      renderer.render(scene, camera);
      var gl = renderer.getContext();
      var width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      var pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      var visible = 0;
      for (var i = 3; i < pixels.length; i += 16) if (pixels[i] > 0) visible++;
      return { width: width, height: height, visibleSamples: visible };
    }
  };
}

/* ============================================================
 * 初始化
 * ============================================================ */
function init() {
  initThree();
  setupPicking();
  setupSectionControls();

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { setMode(this.dataset.mode); });
  });

  document.querySelectorAll('.vb').forEach(function (b) {
    b.addEventListener('click', function () {
      flyTo(this.dataset.view);
      if (this.dataset.view !== 'iso') speakKey('view_' + this.dataset.view);
    });
  });

  document.getElementById('size-toggle').addEventListener('click', function () {
    setSizeEditorOpen(this.getAttribute('aria-expanded') !== 'true');
  });
  document.getElementById('size-close').addEventListener('click', function () { setSizeEditorOpen(false); });
  document.querySelectorAll('.size-options button').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    button.addEventListener('click', function () {
      applyDimensions(this.dataset.size);
    });
  });

  var fullscreenButton = document.getElementById('fullscreen-btn');
  var stage = document.querySelector('.stage');
  function updateFullscreenButton(active) {
    fullscreenButton.title = active ? '退出全屏' : '全屏显示';
    fullscreenButton.setAttribute('aria-label', fullscreenButton.title);
    setTimeout(onResize, 50);
  }
  function setFallbackFullscreen(active) {
    stage.classList.toggle('is-expanded', active);
    document.body.classList.toggle('stage-expanded', active);
    updateFullscreenButton(active);
  }
  fullscreenButton.addEventListener('click', function () {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (stage.classList.contains('is-expanded')) {
      setFallbackFullscreen(false);
    } else if (stage.requestFullscreen) {
      var request = stage.requestFullscreen();
      if (request && request.catch) request.catch(function () { setFallbackFullscreen(true); });
    } else {
      setFallbackFullscreen(true);
    }
  });
  document.addEventListener('fullscreenchange', function () {
    updateFullscreenButton(document.fullscreenElement === stage);
  });

  document.getElementById('sound-btn').addEventListener('click', function () {
    soundOn = !soundOn;
    this.textContent = soundOn ? '◖))' : '◖×';
    this.title = soundOn ? '关闭声音' : '打开声音';
    this.setAttribute('aria-label', this.title);
    if (soundOn) { ensureAudio(); speakKey('sound_on'); }
    else stopVoice();
  });

  // 音频需用户手势，在首次交互时初始化
  document.addEventListener('pointerdown', ensureAudio, { once: true });
  document.getElementById('help-btn').addEventListener('click', openTutorial);
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (document.getElementById('overlay').classList.contains('tutorial-overlay')) closeTutorial();
    else if (sectionState.enabled) setSectionEnabled(false);
  });

  setMode('learn');
  installTestApi();
  animate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }

})();
