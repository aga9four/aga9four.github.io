// Rampino — fisica dello scalatore: punto materiale + corda (vincolo di distanza) + cenge.
// Passo fisso, deterministica: la stessa sequenza di comandi dà sempre lo stesso risultato.
import { REACH, WALL_HALF } from './world.js';

export const G = 22; // gravità (m/s²), un po' più forte del reale: più "gioco"
export const DT = 1 / 120;
export const RADIUS = 0.45;
const AIR = 0.12; // attrito dell'aria
const MAX_SPEED = 34;
const REEL_SPEED = 3.2; // m/s di corda recuperata tenendo premuto
const MIN_ROPE = 1.6;
const CRUMBLE_TIME = 1.2; // secondi prima che un appiglio friabile si stacchi

export function newPlayer(x = 0, y = RADIUS) {
  return {
    x, y, vx: 0, vy: 0,
    rope: null, // { anchor, len }
    grounded: true,
    t: 0,
  };
}

/** Posizione attuale di un appiglio (quelli mobili oscillano). */
export function anchorPos(a, t) {
  if (a.kind !== 'moving') return [a.x, a.y];
  return [a.x + Math.sin(t * 0.9 + a.phase) * a.amp, a.y];
}

/** Sceglie l'appiglio da agganciare: raggiungibile, il più vicino al punto toccato. */
export function pickAnchor(p, anchors, tx, ty, t, broken) {
  let best = null;
  let bestD = Infinity;
  for (const a of anchors) {
    if (broken.has(a.id)) continue;
    const [ax, ay] = anchorPos(a, t);
    if (Math.abs(ay - p.y) > REACH + 1) continue;
    const dist = Math.hypot(ax - p.x, ay - p.y);
    if (dist > REACH || dist < 0.8) continue;
    const dTouch = Math.hypot(ax - tx, ay - ty);
    if (dTouch < bestD) {
      bestD = dTouch;
      best = a;
    }
  }
  return bestD < 4.5 ? best : null;
}

export function attach(p, a) {
  const [ax, ay] = anchorPos(a, p.t);
  p.rope = { anchor: a, len: Math.max(MIN_ROPE, Math.hypot(ax - p.x, ay - p.y)), held: 0 };
  p.grounded = false;
}

export function detach(p) {
  p.rope = null;
}

/**
 * Un passo di simulazione. `reel` = true mentre si tiene premuto (recupera corda).
 * Restituisce eventi: { landed, broke, crumbling }
 */
export function step(p, ledges, broken, reel) {
  const ev = { landed: null, broke: null };
  p.t += DT;
  if (!p.grounded) {
    p.vy -= G * DT;
    p.vx -= p.vx * AIR * DT;
    p.vy -= p.vy * AIR * DT * 0.5;
  }
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > MAX_SPEED) {
    p.vx *= MAX_SPEED / sp;
    p.vy *= MAX_SPEED / sp;
  }
  let nx = p.x + p.vx * DT;
  let ny = p.y + p.vy * DT;

  // corda: vincolo di distanza massima (la corda non spinge, tira soltanto)
  if (p.rope) {
    const a = p.rope.anchor;
    p.rope.held += DT;
    if (a.kind === 'crumble' && p.rope.held > CRUMBLE_TIME) {
      broken.add(a.id);
      ev.broke = a;
      p.rope = null;
    } else {
      if (reel) p.rope.len = Math.max(MIN_ROPE, p.rope.len - REEL_SPEED * DT);
      const [ax, ay] = anchorPos(a, p.t);
      const dx = nx - ax;
      const dy = ny - ay;
      const d = Math.hypot(dx, dy);
      if (d > p.rope.len) {
        const k = p.rope.len / d;
        nx = ax + dx * k;
        ny = ay + dy * k;
        // togli la componente di velocità lungo la corda (verso l'esterno)
        const ux = dx / d;
        const uy = dy / d;
        const vr = p.vx * ux + p.vy * uy;
        if (vr > 0) {
          p.vx -= vr * ux;
          p.vy -= vr * uy;
        }
        p.grounded = false;
      }
    }
  }

  // pareti laterali della via
  const lim = WALL_HALF + 2.5;
  if (nx < -lim) { nx = -lim; p.vx = Math.abs(p.vx) * 0.3; }
  if (nx > lim) { nx = lim; p.vx = -Math.abs(p.vx) * 0.3; }

  // cenge: si atterra solo dall'alto
  const wasGrounded = p.grounded;
  p.grounded = false;
  for (const l of ledges) {
    if (nx < l.x - l.w / 2 - 0.1 || nx > l.x + l.w / 2 + 0.1) continue;
    const top = l.y;
    if (p.y - RADIUS >= top - 0.05 && ny - RADIUS <= top && p.vy <= 0) {
      ny = top + RADIUS;
      if (!wasGrounded) ev.landed = l;
      p.vy = 0;
      p.vx *= 0.8; // attrito del terreno
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
      p.grounded = true;
      break;
    }
  }

  p.x = nx;
  p.y = ny;
  return ev;
}

