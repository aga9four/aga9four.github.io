// Reazione a catena — prototipo: diorama 3D (three.js) + fisica 2D sul piano (Rapier 2D).
import * as THREE from 'three';
import * as RapierNS from 'rapier2d';
import { LEVELS, PARTS } from './levels.js';

const RAPIER = RapierNS.default || RapierNS;
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const STEP = 1 / 60;
const MAX_TIME = 20; // secondi di simulazione prima di dichiarare il tentativo fallito

// ------------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3e6d3);
scene.fog = new THREE.Fog(0xf3e6d3, 40, 90);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a7560, 1.2));
const sun = new THREE.DirectionalLight(0xffeedd, 2.4);
sun.position.set(-8, 16, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -4, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const VIEW = { x0: -8.6, x1: 8.6, y0: -0.8, y1: 10.8 };
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // distanza per far entrare tutto il diorama (lasciando spazio alle barre in alto e in basso)
  const t = Math.tan((camera.fov / 2) * DEG);
  const needH = (VIEW.y1 - VIEW.y0) * 1.28;
  const needW = VIEW.x1 - VIEW.x0 + 0.6;
  const dist = Math.max(needH / (2 * t), needW / (2 * t * camera.aspect));
  const cy = (VIEW.y0 + VIEW.y1) / 2 - 0.3;
  camera.position.set(0, cy + dist * 0.12, dist);
  camera.lookAt(0, cy, 0);
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ materiali e forme
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...o });
const M = {
  table: mat(0xc98f5a), tableEdge: mat(0xa8713f), wall: mat(0xe9dcc6, { roughness: 1 }), stone: mat(0x9aa0a8),
  wood: mat(0xd9a066), plank: mat(0x5aa7e0), plankSel: mat(0x7cc4ff, { emissive: 0x1e6fb5, emissiveIntensity: 0.5 }),
  domino: mat(0xf4f1ea), dominoSel: mat(0xfff7cc, { emissive: 0x8a6d00, emissiveIntensity: 0.4 }),
  bouncer: mat(0xe2553e), bouncerSel: mat(0xff8a73, { emissive: 0x8a2010, emissiveIntensity: 0.5 }),
  block: mat(0x6c5ce7), blockSel: mat(0x9d90ff, { emissive: 0x3a2db0, emissiveIntensity: 0.5 }),
  ball: mat(0x8e9aa6, { metalness: 0.5, roughness: 0.35 }), heavy: mat(0x3b3f47, { metalness: 0.6, roughness: 0.4 }),
  hero: mat(0xffc83d, { metalness: 0.4, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.25 }),
  basket: mat(0x2e9c6a), flag: mat(0xe2553e, { side: THREE.DoubleSide }), pivot: mat(0x55606e, { metalness: 0.5 }),
  ghost: new THREE.MeshBasicMaterial({ color: 0x2e9c6a, transparent: true, opacity: 0.15, depthWrite: false }),
};
const box = (w, h, d, m) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};
const ball = (r, m) => {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), m);
  mesh.castShadow = true;
  return mesh;
};

// ambiente fisso: tavolo, parete, qualche oggetto sullo sfondo
const env = new THREE.Group();
const table = box(26, 1, 9, M.table);
table.position.set(0, -0.5, -1);
env.add(table);
const edge = box(26.2, 0.25, 0.3, M.tableEdge);
edge.position.set(0, -0.12, 3.5);
env.add(edge);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), M.wall);
wall.position.set(0, 12, -5.5);
wall.receiveShadow = true;
env.add(wall);
for (let i = 0; i < 7; i++) {
  // "libri" sullo sfondo, per dare scala al diorama
  const h = 1.4 + ((i * 37) % 10) / 10;
  const b = box(0.5, h, 1.6, mat([0xe2553e, 0x2e9c6a, 0x5aa7e0, 0xffc83d][i % 4]));
  b.position.set(-11 + i * 0.55, h / 2, -4.2);
  env.add(b);
}
scene.add(env);

// ------------------------------------------------------------------ stato
const levelGroup = new THREE.Group();
scene.add(levelGroup);
let level = null, levelIndex = 0;
let placed = []; // { type, x, y, rot, mesh }
let selected = null;
let mode = 'edit';
let world = null, bodies = [], simTime = 0, insideTime = 0, heroBody = null;
const progress = (() => { try { return JSON.parse(localStorage.getItem('rdc.progress') || '{}'); } catch { return {}; } })();
const saveProgress = () => { try { localStorage.setItem('rdc.progress', JSON.stringify(progress)); } catch { /* */ } };

// ------------------------------------------------------------------ costruzione del livello
function partMesh(type, sel = false) {
  const p = PARTS[type];
  const m = { plank: [M.plank, M.plankSel], domino: [M.domino, M.dominoSel], bouncer: [M.bouncer, M.bouncerSel], block: [M.block, M.blockSel] }[type][sel ? 1 : 0];
  const g = new THREE.Group();
  const depth = type === 'domino' ? 0.9 : type === 'block' ? 0.9 : 1.2;
  const b = box(p.w, p.h, depth, m);
  g.add(b);
  if (type === 'bouncer') {
    // molle sotto il tappetino
    for (const sx of [-0.5, 0, 0.5]) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 4, 8), M.pivot);
      s.rotation.x = Math.PI / 2;
      s.position.set(sx, -0.22, 0);
      g.add(s);
    }
  }
  g.userData.body = b;
  return g;
}

function buildLevel(i) {
  levelIndex = i;
  level = LEVELS[i];
  levelGroup.clear();
  placed = [];
  selected = null;
  mode = 'edit';
  for (const s of level.statics) {
    const m = box(s.w, s.h, 1.4, s.h > 1 ? M.stone : M.wood);
    m.position.set(s.x, s.y, 0);
    m.rotation.z = s.rot * DEG;
    levelGroup.add(m);
  }
  const g = level.goal;
  const basket = new THREE.Group();
  const bottom = box(g.w, 0.2, 1.6, M.basket);
  bottom.position.set(0, 0.1, 0);
  const l = box(0.2, g.h, 1.6, M.basket);
  l.position.set(-g.w / 2 + 0.1, g.h / 2, 0);
  const rh = g.h + (g.backboard || 0); // tabellone dietro al cestino, come nel basket
  const r = box(0.2, rh, 1.6, M.basket);
  r.position.set(g.w / 2 - 0.1, rh / 2, 0);
  const pole = box(0.06, 1.6, 0.06, M.pivot);
  pole.position.set(g.w / 2 - 0.1, rh + 0.8, 0);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-0.8, -0.25), new THREE.Vector2(0, -0.5)])), M.flag);
  flag.position.set(g.w / 2 - 0.12, rh + 1.6, 0);
  basket.add(bottom, l, r, pole, flag);
  if (g.stand) {
    const st = box(0.5, g.y, 0.5, M.pivot);
    st.position.set(0, -g.y / 2, 0);
    basket.add(st);
  }
  basket.position.set(g.x, g.y, 0);
  basket.userData.flag = flag;
  levelGroup.add(basket);
  levelGroup.userData.basket = basket;
  for (const s of level.seesaws || []) {
    const pv = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 3), M.pivot);
    pv.position.set(s.x, s.y - 0.55, 0);
    pv.castShadow = true;
    levelGroup.add(pv);
  }
  resetDynamicsView();
  renderInventory();
  $('lvName').textContent = `${i + 1}. ${level.name}`;
  updateInfo();
  setMode('edit');
  toast(level.hint, 4200);
}

// le parti mobili del livello (biglie, altalena) nella posizione di partenza
let dynViews = [];
function resetDynamicsView() {
  for (const v of dynViews) levelGroup.remove(v);
  dynViews = [];
  for (const d of level.dynamics) {
    const m = ball(d.r, d.hero ? M.hero : d.heavy ? M.heavy : M.ball);
    m.position.set(d.x, d.y, 0);
    levelGroup.add(m);
    dynViews.push(m);
  }
  for (const s of level.seesaws || []) {
    const m = box(s.len, 0.22, 1.2, M.wood);
    m.position.set(s.x, s.y, 0);
    levelGroup.add(m);
    dynViews.push(m);
  }
  for (const p of placed) {
    p.mesh.position.set(p.x, p.y, 0);
    p.mesh.rotation.set(0, 0, p.rot * DEG);
  }
}

function usedCount(type) {
  return placed.filter((p) => p.type === type).length;
}
function renderInventory() {
  const inv = $('inv');
  inv.innerHTML = '';
  for (const [type, n] of Object.entries(level.inv)) {
    const p = PARTS[type];
    const b = document.createElement('button');
    b.className = 'part';
    const left = n - usedCount(type);
    b.innerHTML = `<b>${p.icon}</b><small>${p.label}</small><i>×${left}</i>`;
    b.disabled = left <= 0 || mode !== 'edit';
    b.onclick = () => addPart(type);
    inv.appendChild(b);
  }
}
function updateInfo() {
  const st = progress[levelIndex] ? ' · ' + '★'.repeat(progress[levelIndex]) : '';
  $('lvInfo').textContent = `Pezzi usati ${placed.length} · obiettivo ≤ ${level.par}${st}`;
}

// ------------------------------------------------------------------ modifica
function addPart(type) {
  if (mode !== 'edit' || usedCount(type) >= (level.inv[type] || 0)) return;
  const p = { type, x: 0, y: 5, rot: type === 'plank' ? -15 : 0, mesh: partMesh(type) };
  levelGroup.add(p.mesh);
  placed.push(p);
  select(p);
  resetDynamicsView();
  renderInventory();
  updateInfo();
  toast('Trascina il pezzo dove vuoi, poi ruotalo con le frecce', 2200);
}
function select(p) {
  if (selected) swapMat(selected, false);
  selected = p;
  if (p) swapMat(p, true);
  $('selTools').classList.toggle('hidden', !p || mode !== 'edit');
}
function swapMat(p, sel) {
  const nm = partMesh(p.type, sel);
  levelGroup.remove(p.mesh);
  p.mesh = nm;
  nm.position.set(p.x, p.y, 0);
  nm.rotation.z = p.rot * DEG;
  levelGroup.add(nm);
}
$('rotL').onclick = () => { if (selected) { selected.rot += 15; resetDynamicsView(); } };
$('rotR').onclick = () => { if (selected) { selected.rot -= 15; resetDynamicsView(); } };
$('del').onclick = () => {
  if (!selected) return;
  levelGroup.remove(selected.mesh);
  placed = placed.filter((p) => p !== selected);
  select(null);
  renderInventory();
  updateInfo();
};

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
function worldPoint(ev) {
  const ndc = new THREE.Vector2((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const v = new THREE.Vector3();
  ray.ray.intersectPlane(plane, v);
  return v;
}
let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (mode !== 'edit') return;
  const w = worldPoint(ev);
  let best = null, bd = Infinity;
  for (const p of placed) {
    const r = Math.max(PARTS[p.type].w, PARTS[p.type].h) / 2 + 0.5;
    const d = Math.hypot(p.x - w.x, p.y - w.y);
    if (d < r && d < bd) { bd = d; best = p; }
  }
  select(best);
  if (best) drag = { p: best, dx: best.x - w.x, dy: best.y - w.y };
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const w = worldPoint(ev);
  drag.p.x = Math.round((w.x + drag.dx) * 10) / 10;
  drag.p.y = Math.max(0.2, Math.round((w.y + drag.dy) * 10) / 10);
  drag.p.mesh.position.set(drag.p.x, drag.p.y, 0);
});
window.addEventListener('pointerup', () => { drag = null; });

// ------------------------------------------------------------------ simulazione
function fixedBox(w, x, y, hw, hh, rot, opts = {}) {
  const b = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(rot));
  const c = RAPIER.ColliderDesc.cuboid(hw, hh).setFriction(opts.friction ?? 0.6).setRestitution(opts.restitution ?? 0.1);
  if (opts.bouncy) c.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
  w.createCollider(c, b);
  return b;
}
function buildWorld() {
  const w = new RAPIER.World({ x: 0, y: -9.81 });
  const list = [];
  fixedBox(w, 0, -0.5, 14, 0.5, 0); // tavolo
  fixedBox(w, -9.6, 6, 0.5, 8, 0); // bordi invisibili
  fixedBox(w, 9.6, 6, 0.5, 8, 0);
  for (const s of level.statics) fixedBox(w, s.x, s.y, s.w / 2, s.h / 2, s.rot * DEG);
  const g = level.goal;
  fixedBox(w, g.x, g.y + 0.1, g.w / 2, 0.1, 0);
  fixedBox(w, g.x - g.w / 2 + 0.1, g.y + g.h / 2, 0.1, g.h / 2, 0);
  const rh = g.h + (g.backboard || 0);
  fixedBox(w, g.x + g.w / 2 - 0.1, g.y + rh / 2, 0.1, rh / 2, 0, { restitution: 0 });
  if (g.stand) fixedBox(w, g.x, g.y / 2, 0.25, g.y / 2, 0);
  level.dynamics.forEach((d, i) => {
    const b = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(d.x, d.y).setCcdEnabled(true));
    w.createCollider(RAPIER.ColliderDesc.ball(d.r).setDensity(d.heavy ? 8 : 2).setFriction(0.4).setRestitution(0.25), b);
    list.push({ body: b, mesh: dynViews[i] });
    if (d.hero) heroBody = b;
  });
  (level.seesaws || []).forEach((s, k) => {
    const pivot = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, s.y));
    const b = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(s.x, s.y));
    w.createCollider(RAPIER.ColliderDesc.cuboid(s.len / 2, 0.11).setDensity(1).setFriction(0.7), b);
    w.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), pivot, b, true);
    list.push({ body: b, mesh: dynViews[level.dynamics.length + k] });
  });
  for (const p of placed) {
    const pd = PARTS[p.type];
    const rot = p.rot * DEG;
    if (p.type === 'plank') fixedBox(w, p.x, p.y, pd.w / 2, pd.h / 2, rot, { friction: 0.35 });
    else if (p.type === 'bouncer') fixedBox(w, p.x, p.y, pd.w / 2, pd.h / 2, rot, { restitution: 1.15, bouncy: true, friction: 0.2 });
    else {
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y).setRotation(rot));
      w.createCollider(RAPIER.ColliderDesc.cuboid(pd.w / 2, pd.h / 2).setDensity(p.type === 'block' ? 5 : 1).setFriction(0.5).setRestitution(0.05), b);
      list.push({ body: b, mesh: p.mesh });
    }
  }
  return { w, list };
}

/** Vero se la biglia dorata è ferma dentro il cestino. */
function heroInside() {
  if (!heroBody) return false;
  const t = heroBody.translation();
  const g = level.goal;
  return Math.abs(t.x - g.x) < g.w / 2 - 0.15 && t.y > g.y + 0.1 && t.y < g.y + g.h + 0.2;
}

function setMode(m) {
  mode = m;
  $('play').textContent = m === 'edit' ? '▶ Via' : '■ Stop';
  $('play').classList.toggle('stop', m !== 'edit');
  if (m !== 'edit') select(null);
  renderInventory();
}
function startSim() {
  select(null);
  const built = buildWorld();
  world = built.w;
  bodies = built.list;
  simTime = 0;
  insideTime = 0;
  setMode('play');
}
function stopSim() {
  if (world) world.free();
  world = null;
  bodies = [];
  heroBody = null;
  resetDynamicsView();
  setMode('edit');
}
$('play').onclick = () => (mode === 'edit' ? startSim() : stopSim());

function stepSim() {
  world.step();
  simTime += STEP;
  for (const o of bodies) {
    const t = o.body.translation();
    o.mesh.position.set(t.x, t.y, 0);
    o.mesh.rotation.z = o.body.rotation();
  }
  if (heroInside()) insideTime += STEP; else insideTime = 0;
  if (insideTime > 0.6) return 'win';
  if (simTime > MAX_TIME) return 'timeout';
  if (heroBody && heroBody.translation().y < -3) return 'lost';
  return null;
}

function win() {
  const n = placed.length;
  const stars = n <= level.par ? 3 : n <= level.par + 1 ? 2 : 1;
  progress[levelIndex] = Math.max(progress[levelIndex] || 0, stars);
  saveProgress();
  confetti();
  beep(660, 990, 0.12); setTimeout(() => beep(990, 1320, 0.2), 120);
  setMode('done');
  const next = levelIndex + 1 < LEVELS.length;
  showPanel(`<h2>Ce l’hai fatta!</h2><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
    <p>${n} pezzi usati · obiettivo ≤ ${level.par}</p>
    <div class="row"><button id="pRetry">Riprova</button>${next ? '<button class="go" id="pNext">Livello successivo</button>' : '<button class="go" id="pMenu">Livelli</button>'}</div>`);
  $('pRetry').onclick = () => { hidePanel(); stopSim(); };
  if (next) $('pNext').onclick = () => { hidePanel(); stopSim(); buildLevel(levelIndex + 1); };
  else $('pMenu').onclick = () => { hidePanel(); stopSim(); showMenu(); };
}

// ------------------------------------------------------------------ effetti
const confettiBits = [];
function confetti() {
  const g = level.goal;
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: [0xe2553e, 0x2e9c6a, 0x5aa7e0, 0xffc83d][i % 4], side: THREE.DoubleSide }));
    m.position.set(g.x, g.y + g.h + 0.5, 0.5);
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 7, 4 + Math.random() * 6, (Math.random() - 0.5) * 4);
    m.userData.life = 2.2;
    scene.add(m);
    confettiBits.push(m);
  }
}
let ac = null;
function beep(f0, f1, dur, type = 'triangle', vol = 0.12) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* */ }
}

// ------------------------------------------------------------------ interfaccia
function toast(msg, ms = 1800) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}
function showPanel(html) { const p = $('panel'); p.innerHTML = html; p.classList.remove('hidden'); }
function hidePanel() { $('panel').classList.add('hidden'); }
function showMenu() {
  showPanel(`<h2>Livelli</h2><div class="grid">${LEVELS.map((l, i) => `<button class="lv" data-i="${i}"><b>${i + 1}. ${l.name}</b><small>${progress[i] ? '★'.repeat(progress[i]) : 'da fare'}</small></button>`).join('')}</div>
    <div class="row"><button id="pClose">Chiudi</button></div>`);
  $('panel').querySelectorAll('.lv').forEach((b) => (b.onclick = () => { hidePanel(); stopSim(); buildLevel(+b.dataset.i); }));
  $('pClose').onclick = hidePanel;
}
$('menuBtn').onclick = showMenu;
$('hintBtn').onclick = () => toast(level.hint, 4200);

// ------------------------------------------------------------------ loop
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'play' && world) {
    acc += dt;
    while (acc >= STEP && mode === 'play') {
      acc -= STEP;
      const r = stepSim();
      if (r === 'win') win();
      else if (r) { toast(r === 'timeout' ? 'Non ancora… cambia qualcosa e riprova' : 'La biglia è caduta! Riprova'); stopSim(); }
    }
  } else acc = 0;
  const basket = levelGroup.userData.basket;
  if (basket) basket.userData.flag.rotation.y = Math.sin(now / 350) * 0.3;
  for (let i = confettiBits.length - 1; i >= 0; i--) {
    const m = confettiBits[i];
    m.userData.v.y -= 9 * dt;
    m.position.addScaledVector(m.userData.v, dt);
    m.rotation.x += dt * 8; m.rotation.y += dt * 5;
    if ((m.userData.life -= dt) <= 0) { scene.remove(m); confettiBits.splice(i, 1); }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ avvio
await RAPIER.init();
$('loading').classList.add('hidden');
const firstTodo = LEVELS.findIndex((_, i) => !progress[i]);
buildLevel(firstTodo >= 0 ? firstTodo : 0);
requestAnimationFrame(frame);

// Strumento di prova (per verificare che ogni livello sia risolvibile)
window.__rc = {
  levels: LEVELS,
  load: (i) => { stopSim(); buildLevel(i); },
  place: (type, x, y, rot = 0) => { const p = { type, x, y, rot, mesh: partMesh(type) }; levelGroup.add(p.mesh); placed.push(p); resetDynamicsView(); return placed.length; },
  clear: () => { for (const p of placed) levelGroup.remove(p.mesh); placed = []; resetDynamicsView(); },
  simulate: (maxSeconds = MAX_TIME) => {
    const built = buildWorld();
    world = built.w; bodies = built.list; simTime = 0; insideTime = 0;
    let r = null, maxX = -99, trace = [];
    while (!r && simTime < maxSeconds) {
      r = stepSim();
      if (heroBody) { const t = heroBody.translation(); maxX = Math.max(maxX, t.x); if (Math.round(simTime * 60) % 30 === 0) trace.push([+t.x.toFixed(2), +t.y.toFixed(2)]); }
    }
    const hero = heroBody ? heroBody.translation() : null;
    stopSim();
    return { result: r || 'timeout', t: +simTime.toFixed(2), hero: hero && [+hero.x.toFixed(2), +hero.y.toFixed(2)], trace };
  },
};
