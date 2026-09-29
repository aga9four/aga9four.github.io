// Rampino — prototipo: rendering 3D low-poly (three.js) sopra la fisica 2D di physics.js.
import * as THREE from 'three';
import { generate, biomeAt, BIOMES, REACH, WALL_HALF, CHUNK } from './world.js';
import { newPlayer, step, attach, detach, pickAnchor, anchorPos, DT, RADIUS } from './physics.js';

const SEED = 20260929;
const WORLD = generate(SEED, 1200);
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ed8ff, 60, 170);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);

const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ materials
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...opts });
const M = {
  rock: mat(0x8d8a85),
  crumble: mat(0x9a6b44),
  ring: mat(0xd9dde3, { metalness: 0.8, roughness: 0.3 }),
  ringHot: mat(0xffd34d, { emissive: 0xffa21a, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 }),
  jacket: mat(0xe2553e),
  pants: mat(0x2f3b55),
  skin: mat(0xf2c29b),
  helmet: mat(0xffc93c),
  pack: mat(0x3e8e5e),
  rope: mat(0xffe08a),
  wood: mat(0x8b5a35),
  flag: mat(0xe2553e, { side: THREE.DoubleSide }),
  cloud: mat(0xffffff, { roughness: 1 }),
  rail: mat(0x55606e, { metalness: 0.6, roughness: 0.4 }),
};

// ------------------------------------------------------------------ noise
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const colorOfBiome = (y, key) => {
  // sfuma tra i biomi negli ultimi 30 m
  let i = 0;
  for (let k = 0; k < BIOMES.length; k++) if (y >= BIOMES[k].from) i = k;
  const a = BIOMES[i];
  const b = BIOMES[i + 1];
  const ca = new THREE.Color(key === 'sky0' ? a.sky[0] : key === 'sky1' ? a.sky[1] : a[key]);
  if (!b) return ca;
  const t = THREE.MathUtils.clamp((y - (b.from - 30)) / 30, 0, 1);
  const cb = new THREE.Color(key === 'sky0' ? b.sky[0] : key === 'sky1' ? b.sky[1] : b[key]);
  return ca.lerp(cb, t);
};

// ------------------------------------------------------------------ parete (a blocchi)
const chunks = new Map();
function buildChunk(ci) {
  const y0 = ci * CHUNK;
  const W = 64, SX = 40, SY = 16;
  const g = new THREE.PlaneGeometry(W, CHUNK, SX, SY);
  const pos = g.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i) + y0 + CHUNK / 2;
    const side = Math.max(0, Math.abs(x) - (WALL_HALF + 3)); // i lati sporgono verso chi guarda
    const z = -2.6 + noise(x * 0.35, y * 0.35) * 1.6 + noise(x * 1.1, y * 1.1) * 0.5 + Math.min(side * 0.9, 14);
    pos.setZ(i, z);
    pos.setY(i, y);
    // strati orizzontali + chiazze (muschio, neve…) sulle parti piatte
    const strata = Math.sin(y * 0.9 + noise(x * 0.15, y * 0.05) * 5) * 0.06;
    const c = colorOfBiome(y, 'rock').offsetHSL(0, 0.04, 0.06 + strata + (noise(x * 0.8, y * 0.8) - 0.5) * 0.16 - Math.min(side, 8) * 0.01);
    const patch = noise(x * 0.22 + 40, y * 0.22) * noise(x * 0.9, y * 0.9 + 7);
    if (patch > 0.32) c.lerp(colorOfBiome(y, 'accent'), Math.min(1, (patch - 0.32) * 5));
    if (y < 10) c.lerp(new THREE.Color(0x4f8a3c), THREE.MathUtils.clamp((10 - y) / 10, 0, 1) * 0.7 * noise(x * 0.5, y * 0.5 + 3));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// ------------------------------------------------------------------ appigli, cenge, nuvole
const anchorMeshes = new Map();
function makeAnchor(a) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), a.kind === 'crumble' ? M.crumble : M.rock);
  rock.scale.set(1.2, 0.8, 0.9);
  rock.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 14), M.ring);
  ring.position.set(0, -0.35, 0.35);
  g.add(rock, ring);
  if (a.kind === 'moving') {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(a.amp * 2 + 1, 0.12, 0.12), M.rail);
    rail.position.set(a.x, a.y + 0.05, -0.6);
    scene.add(rail);
    g.userData.rail = rail;
  }
  g.userData.ring = ring;
  scene.add(g);
  return g;
}
const ledgeMeshes = new Map();
function makeLedge(l) {
  const g = new THREE.Group();
  const top = colorOfBiome(l.y, 'accent');
  const base = new THREE.Mesh(new THREE.BoxGeometry(l.w, 0.7, 3.2), mat(colorOfBiome(l.y, 'rock').offsetHSL(0, 0, -0.05)));
  base.position.y = -0.35;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(l.w + 0.1, 0.18, 3.3), mat(top));
  cap.position.y = -0.06;
  base.castShadow = base.receiveShadow = cap.receiveShadow = true;
  g.add(base, cap);
  if (l.checkpoint && !l.ground) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), M.wood);
    pole.position.set(l.w / 2 - 0.6, 1.1, 0);
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.9, -0.3), new THREE.Vector2(0, -0.6)]);
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.flag);
    flag.position.set(l.w / 2 - 0.55, 2.15, 0);
    g.add(pole, flag);
    g.userData.flag = flag;
  }
  g.position.set(l.x, l.y, -0.4);
  scene.add(g);
  return g;
}
const clouds = [];
for (let i = 0; i < 26; i++) {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + hash(i, k) * 1.6, 0), M.cloud);
    s.position.set(k * 1.6 - 2.4, hash(k, i) * 0.8, hash(i + 3, k) * 0.8);
    g.add(s);
  }
  g.position.set((hash(i, 99) - 0.5) * 90, i * 45 + hash(99, i) * 30, -18 - hash(i, 7) * 30);
  g.userData.speed = 0.3 + hash(i, 5) * 0.6;
  scene.add(g);
  clouds.push(g);
}

// ------------------------------------------------------------------ valle ai piedi della parete
{
  const vg = new THREE.PlaneGeometry(260, 140, 52, 28);
  vg.rotateX(-Math.PI / 2);
  const vp = vg.attributes.position;
  const vc = [];
  for (let i = 0; i < vp.count; i++) {
    const x = vp.getX(i), z = vp.getZ(i) + 60; // da z=-10 a z=130
    vp.setZ(i, z);
    const edge = Math.max(0, z - 4);
    const yy = -0.02 - (noise(x * 0.08, z * 0.08) - 0.5) * Math.min(edge, 30) * 0.12 - Math.max(0, z - 70) * 0.25;
    vp.setY(i, Math.min(0, yy));
    const c = new THREE.Color(0x5e9a45).offsetHSL((noise(x * 0.2, z * 0.2) - 0.5) * 0.05, 0, (noise(x * 0.5, z * 0.5) - 0.5) * 0.12);
    vc.push(c.r, c.g, c.b);
  }
  vg.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  vg.computeVertexNormals();
  const valley = new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  valley.receiveShadow = true;
  scene.add(valley);
  // pini low-poly
  const trunkG = new THREE.CylinderGeometry(0.15, 0.2, 1, 5);
  const leafG = new THREE.ConeGeometry(1, 2.2, 6);
  const leafM = [mat(0x2f6b3a), mat(0x3d7f3f), mat(0x285c34)];
  for (let i = 0; i < 90; i++) {
    const x = (hash(i, 11) - 0.5) * 120;
    const z = 2 + hash(11, i) * 55;
    if (Math.abs(x) < 7 && z < 14) continue; // radura davanti alla parete
    const s = 0.8 + hash(i, 13) * 1.4;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkG, M.wood);
    trunk.position.y = 0.5;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const l = new THREE.Mesh(leafG, leafM[(i + k) % 3]);
      l.scale.setScalar(1 - k * 0.25);
      l.position.y = 1.6 + k * 0.9;
      l.castShadow = true;
      t.add(l);
    }
    t.scale.setScalar(s);
    t.position.set(x, -0.05, z);
    t.rotation.y = hash(i, 17) * 6;
    scene.add(t);
  }
  // rocce sparse
  for (let i = 0; i < 25; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + hash(i, 21) * 0.9, 0), M.rock);
    r.position.set((hash(i, 23) - 0.5) * 80, 0, 1 + hash(23, i) * 40);
    r.castShadow = r.receiveShadow = true;
    scene.add(r);
  }
}

// ------------------------------------------------------------------ scalatore
function makeClimber() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.35, 3, 8), M.jacket);
  body.position.y = 0.05;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.22, 3, 8), M.pants);
  legs.position.y = -0.3;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), M.skin);
  head.position.y = 0.52;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.helmet);
  helmet.position.y = 0.56;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.2), M.pack);
  pack.position.set(0, 0.08, -0.24);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.35, 2, 6), M.jacket);
  arm.position.set(0.2, 0.3, 0.05);
  g.add(body, legs, head, helmet, pack, arm);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.arm = arm;
  scene.add(g);
  return g;
}
const climber = makeClimber();
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), M.rope);
rope.castShadow = true;
scene.add(rope);
const reachRing = new THREE.Mesh(new THREE.RingGeometry(REACH - 0.06, REACH, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
reachRing.position.z = 0.2;
scene.add(reachRing);

// particelle (polvere, frammenti)
const bits = [];
const bitGeo = new THREE.TetrahedronGeometry(0.12, 0);
function burst(x, y, color, n = 10, spread = 4) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(bitGeo, mat(color));
    m.position.set(x, y, 0.3);
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.8, (Math.random() - 0.2) * 2);
    m.userData.life = 1.2;
    scene.add(m);
    bits.push(m);
  }
}

// ------------------------------------------------------------------ suoni (sintetizzati)
let ac = null;
function beep(f0, f1, dur, type = 'triangle', vol = 0.12) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* audio non disponibile */ }
}
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* */ } };

// ------------------------------------------------------------------ stato di gioco
const store = (() => { try { return window.localStorage; } catch { return null; } })();
let best = +(store?.getItem('rampino.best') || 0);
let player = newPlayer(0, RADIUS);
let checkpoint = WORLD.ledges[0];
let broken = new Set();
let falls = 0;
let holding = false;
let started = false;
let lastBiome = BIOMES[0].name;
let camY = 30, camX = 0;

function toast(msg, ms = 1600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ input
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
function worldPoint(ev) {
  const ndc = new THREE.Vector2((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  ray.ray.intersectPlane(plane, p);
  return p;
}
canvas.addEventListener('pointerdown', (ev) => {
  if (!started) return;
  holding = true;
  const w = worldPoint(ev);
  const a = pickAnchor(player, WORLD.anchors, w.x, w.y, player.t, broken);
  if (a) {
    attach(player, a);
    const [ax, ay] = anchorPos(a, player.t);
    burst(ax, ay, 0xd9d2c5, 6, 2);
    beep(700, 1200, 0.08, 'square', 0.05);
    buzz(12);
  } else {
    beep(220, 160, 0.08, 'sine', 0.05);
  }
});
const release = () => {
  holding = false;
  if (player.rope) {
    detach(player);
    beep(500, 300, 0.06);
  }
};
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);

$('start').onclick = () => {
  $('intro').classList.add('hidden');
  started = true;
  beep(440, 880, 0.15);
};

// ------------------------------------------------------------------ loop
let acc = 0;
let last = performance.now();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (started) {
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      const ev = step(player, WORLD.ledges, broken, holding && !!player.rope);
      if (ev.broke) {
        const [bx, by] = anchorPos(ev.broke, player.t);
        burst(bx, by, 0x9a6b44, 14, 5);
        beep(160, 60, 0.3, 'sawtooth', 0.08);
        buzz(40);
        toast('L’appiglio si è sgretolato!');
      }
      if (ev.landed) {
        if (ev.landed.checkpoint && ev.landed !== checkpoint && ev.landed.y > checkpoint.y) {
          checkpoint = ev.landed;
          toast('Rifugio raggiunto · ' + Math.round(checkpoint.y) + ' m');
          beep(660, 990, 0.12);
          setTimeout(() => beep(990, 1320, 0.15), 110);
        } else beep(180, 120, 0.06, 'sine', 0.08);
      }
    }
    // caduta sotto l'ultimo rifugio: si riparte da lì
    if (player.y < checkpoint.y - 14) {
      falls++;
      player = newPlayer(checkpoint.x, checkpoint.y + RADIUS);
      broken = new Set([...broken].filter(() => false)); // gli appigli friabili ricrescono
      holding = false;
      toast('Caduto! Si riparte dal rifugio');
      buzz(80);
    }
  }

  // HUD
  const h = Math.max(0, Math.floor(player.y - RADIUS));
  if (h > best) {
    best = h;
    try { store?.setItem('rampino.best', String(best)); } catch { /* */ }
  }
  $('height').textContent = h + ' m';
  $('best').textContent = 'Record ' + best + ' m';
  $('falls').textContent = falls ? 'Cadute ' + falls : '';
  const b = biomeAt(player.y);
  if (b.name !== lastBiome) {
    lastBiome = b.name;
    toast(b.name, 2200);
  }

  // telecamera: segue il giocatore, larga abbastanza da vedere la portata della corda
  const needW = 2 * REACH + 4;
  const dist = Math.max(24, needW / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  camX += (player.x * 0.55 - camX) * Math.min(1, dt * 3);
  camY += (player.y + 2.5 + (player.vy > 0 ? 1.5 : 0) - camY) * Math.min(1, dt * 3.5);
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const camMin = halfH * 0.72; // in basso si vede un po' di valle, mai il vuoto
  if (camY < camMin) camY = camMin;
  camera.position.set(camX, camY - dist * 0.08, dist);
  camera.lookAt(camX, camY, 0);
  sun.position.set(camX + 12, camY + 25, 30);
  sun.target.position.set(camX, camY, 0);

  // cielo e nebbia seguono il bioma
  const sky = colorOfBiome(player.y, 'sky0');
  scene.background = sky;
  scene.fog.color.copy(colorOfBiome(player.y, 'sky1'));

  // parete: crea/rimuovi blocchi vicini
  const ci = Math.floor(camY / CHUNK);
  for (let k = ci - 2; k <= ci + 3; k++) if (k >= 0 && !chunks.has(k)) chunks.set(k, buildChunk(k));
  for (const [k, m] of chunks) if (k < ci - 3 || k > ci + 4) { scene.remove(m); m.geometry.dispose(); chunks.delete(k); }

  // appigli e cenge vicini
  const lo = camY - 45, hi = camY + 45;
  for (const a of WORLD.anchors) {
    const near = a.y > lo && a.y < hi && !broken.has(a.id);
    let m = anchorMeshes.get(a.id);
    if (near && !m) { m = makeAnchor(a); anchorMeshes.set(a.id, m); }
    if (!near && m) { scene.remove(m); if (m.userData.rail) scene.remove(m.userData.rail); anchorMeshes.delete(a.id); m = null; }
    if (m) {
      const [ax, ay] = anchorPos(a, player.t);
      m.position.set(ax, ay, 0);
      const hot = player.rope && player.rope.anchor === a;
      m.userData.ring.material = hot ? M.ringHot : M.ring;
      if (a.kind === 'crumble' && hot) m.position.x += (Math.random() - 0.5) * 0.06 * player.rope.held * 3;
    }
  }
  for (let i = 0; i < WORLD.ledges.length; i++) {
    const l = WORLD.ledges[i];
    const near = l.y > lo && l.y < hi;
    let m = ledgeMeshes.get(i);
    if (near && !m) { m = makeLedge(l); ledgeMeshes.set(i, m); }
    if (!near && m) { scene.remove(m); ledgeMeshes.delete(i); m = null; }
    if (m && m.userData.flag) m.userData.flag.rotation.y = Math.sin(now / 300 + i) * 0.35;
  }

  // scalatore
  climber.position.set(player.x, player.y, 0.3);
  if (player.rope) {
    const [ax, ay] = anchorPos(player.rope.anchor, player.t);
    const ang = Math.atan2(ax - player.x, ay - player.y);
    climber.rotation.z = -ang * 0.9;
    climber.userData.arm.rotation.z = 0.4;
    tmpA.set(player.x + Math.sin(ang) * 0.35, player.y + Math.cos(ang) * 0.35, 0.35);
    tmpB.set(ax, ay - 0.35, 0.35);
    const len = tmpA.distanceTo(tmpB);
    rope.visible = true;
    rope.position.copy(tmpA).lerp(tmpB, 0.5);
    rope.scale.set(1, len, 1);
    rope.quaternion.setFromUnitVectors(up, tmpB.clone().sub(tmpA).normalize());
  } else {
    rope.visible = false;
    climber.rotation.z += ((-player.vx * 0.04) - climber.rotation.z) * Math.min(1, dt * 6);
    climber.userData.arm.rotation.z = player.grounded ? 0.2 : 1.2;
  }
  climber.rotation.y = player.vx < -0.2 ? -0.5 : player.vx > 0.2 ? 0.5 : climber.rotation.y;
  reachRing.position.set(player.x, player.y, 0.2);
  reachRing.visible = started && !player.rope;

  // particelle e nuvole
  for (let i = bits.length - 1; i >= 0; i--) {
    const m = bits[i];
    m.userData.v.y -= 18 * dt;
    m.position.addScaledVector(m.userData.v, dt);
    m.rotation.x += dt * 6;
    m.userData.life -= dt;
    if (m.userData.life <= 0) { scene.remove(m); m.material.dispose(); bits.splice(i, 1); }
  }
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 50) c.position.x = -50;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
