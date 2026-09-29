// Reazione a catena — livelli del prototipo.
// Coordinate in metri sul piano del diorama: x orizzontale (-8..8), y verso l'alto (0 = piano del tavolo).
// rot in gradi (positivo = antiorario). "hero" è la biglia che deve finire nel cestino.

export const PARTS = {
  plank: { label: 'Asse', icon: '╱', w: 3, h: 0.22 },
  domino: { label: 'Domino', icon: '▍', w: 0.22, h: 1.4 },
  bouncer: { label: 'Molla', icon: '≀', w: 1.6, h: 0.3 },
  block: { label: 'Blocco', icon: '■', w: 0.9, h: 0.9 },
};

export const LEVELS = [
  {
    name: 'Il ponte',
    hint: 'La biglia rotola e cade contro il muro. Metti un’asse per farle scavalcare il muro.',
    par: 1,
    inv: { plank: 2 },
    statics: [
      { x: -5.6, y: 7.2, w: 4.2, h: 0.25, rot: -22 }, // scivolo di partenza
      { x: -0.2, y: 1.6, w: 0.5, h: 3.2, rot: 0 }, // muro
    ],
    dynamics: [{ type: 'ball', x: -7.2, y: 8.3, r: 0.36, hero: true }],
    goal: { x: 5.6, y: 0, w: 2.8, h: 1.3 },
  },
  {
    name: 'Effetto domino',
    hint: 'La biglia di partenza finisce nel buco. Metti un domino sul suo percorso: cadendo oltre il buco spingerà la biglia dorata.',
    par: 1,
    inv: { domino: 3 },
    statics: [
      { x: -6.6, y: 3.98, w: 3.2, h: 0.25, rot: -25 }, // scivolo
      { x: -5.55, y: 3.0, w: 2.5, h: 0.3, rot: 0 }, // mensola sinistra
      { x: -1.9, y: 3.0, w: 2.6, h: 0.3, rot: 0 }, // mensola destra (dopo il buco)
      { x: 1.83, y: 2.37, w: 5, h: 0.25, rot: -15 }, // discesa verso il cestino
    ],
    dynamics: [
      { type: 'ball', x: -7.65, y: 5.28, r: 0.33 },
      { type: 'ball', x: -2.8, y: 3.5, r: 0.33, hero: true },
    ],
    goal: { x: 5.6, y: 0, w: 2.2, h: 1.3 },
  },
  {
    name: 'Rimbalzo',
    hint: 'Il cestino è in alto. Usa la molla per far rimbalzare la biglia.',
    par: 1,
    inv: { bouncer: 1, plank: 1 },
    statics: [
      { x: -6.2, y: 9.2, w: 1.8, h: 0.25, rot: -8 }, // mensola di partenza
      { x: 5.3, y: 2.6, w: 3.4, h: 5.2, rot: 0 }, // torre con il cestino in cima
    ],
    dynamics: [{ type: 'ball', x: -6.8, y: 9.7, r: 0.36, hero: true }],
    goal: { x: 5.3, y: 5.2, w: 2.4, h: 1.2, backboard: 3 },
  },
  {
    name: 'Altalena',
    hint: 'Lascia cadere il blocco sull’altalena: più cade dall’alto, più la biglia vola. Poi deviala verso il cestino con un’asse.',
    par: 2,
    inv: { block: 1, plank: 2 },
    statics: [
      { x: -1.2, y: 0.5, w: 0.4, h: 1.0, rot: 0 }, // perno dell'altalena
    ],
    dynamics: [{ type: 'ball', x: 0.8, y: 1.6, r: 0.33, hero: true }],
    seesaws: [{ x: -1.2, y: 1.1, len: 4.4 }],
    goal: { x: 5.2, y: 0, w: 2.4, h: 1.3 },
  },
];
