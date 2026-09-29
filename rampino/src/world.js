// Rampino — generazione della montagna (deterministica, nessuna dipendenza dal rendering).
// Il mondo è un piano verticale (x, y): x = orizzontale, y = altezza in metri.

export const REACH = 10; // lunghezza massima della corda (m)
export const WALL_HALF = 9; // metà larghezza della parete giocabile (m)
export const CHUNK = 24; // altezza di un blocco di generazione (m)
export const CHECKPOINT_EVERY = 60; // un rifugio con bandiera ogni tot metri

export const BIOMES = [
  { from: 0, name: 'Bosco', sky: [0x9ed8ff, 0xe8f6ff], rock: 0x8c8878, accent: 0x4a8a3c },
  { from: 120, name: 'Falesia', sky: [0xffc98f, 0xffeedd], rock: 0xa0765a, accent: 0x6b4a36 },
  { from: 300, name: 'Ghiacciaio', sky: [0xbfe3ff, 0xf5fbff], rock: 0x9fb6c8, accent: 0xe8f4ff },
  { from: 520, name: 'Tempesta', sky: [0x55607a, 0xa9b2c6], rock: 0x5c6273, accent: 0x9aa3b8 },
  { from: 800, name: 'Cima', sky: [0x2a2f5a, 0xff9f7a], rock: 0x8a8fb0, accent: 0xffffff },
];

export function biomeAt(y) {
  let b = BIOMES[0];
  for (const x of BIOMES) if (y >= x.from) b = x;
  return b;
}

/** Generatore pseudo-casuale riproducibile (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Appiglio: { id, x, y, kind: 'rock' | 'crumble' | 'moving', phase, amp }
 * Cengia (dove si può stare in piedi): { x, y, w, checkpoint }
 */
export function generate(seed, upTo) {
  const r = rng(seed);
  const anchors = [];
  const ledges = [{ x: 0, y: 0, w: 2 * WALL_HALF + 4, checkpoint: true, ground: true }];
  let id = 0;
  // percorso principale: ogni appiglio raggiungibile dal precedente
  let x = 0;
  let y = 4.5;
  let nextCheckpoint = CHECKPOINT_EVERY;
  while (y < upTo) {
    const diff = Math.min(1, y / 700); // difficoltà cresce con l'altezza
    const kind =
      y > 520 && r() < 0.25 ? 'moving' : y > 120 && r() < 0.18 + diff * 0.15 ? 'crumble' : 'rock';
    anchors.push({ id: id++, x, y, kind, phase: r() * Math.PI * 2, amp: kind === 'moving' ? 1.5 + r() * 1.5 : 0, main: true });
    // un appiglio "esca" ogni tanto, per scegliere e sbagliare
    if (r() < 0.55) {
      const dx = (r() < 0.5 ? -1 : 1) * (3 + r() * 4);
      const ax = clamp(x + dx, -WALL_HALF, WALL_HALF);
      anchors.push({ id: id++, x: ax, y: y + (r() - 0.3) * 3, kind: r() < 0.3 && y > 120 ? 'crumble' : 'rock', phase: r() * 6.28, amp: 0, main: false });
    }
    // cengia di riposo / rifugio
    if (y >= nextCheckpoint) {
      ledges.push({ x: clamp(x + (r() - 0.5) * 4, -WALL_HALF + 2, WALL_HALF - 2), y: y + 2.2, w: 4.5, checkpoint: true });
      nextCheckpoint += CHECKPOINT_EVERY;
    } else if (r() < 0.12) {
      ledges.push({ x: clamp(x + (r() - 0.5) * 8, -WALL_HALF + 1.5, WALL_HALF - 1.5), y: y + 1.5 + r() * 2, w: 2 + r() * 1.5, checkpoint: false });
    }
    // passo successivo: più distante in alto
    const dy = 3.2 + r() * (1.6 + diff * 2.4);
    let dx = (r() - 0.5) * (6 + diff * 6);
    if (Math.abs(x + dx) > WALL_HALF) dx = -dx;
    // la distanza resta sotto la portata della corda, con margine
    const maxD = REACH * 0.78;
    const nx = clamp(x + dx, -WALL_HALF, WALL_HALF);
    let sx = nx - x;
    let sy = dy;
    const d = Math.hypot(sx, sy);
    if (d > maxD) {
      sx *= maxD / d;
      sy *= maxD / d;
    }
    x += sx;
    y += sy;
  }
  return { anchors, ledges };
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
