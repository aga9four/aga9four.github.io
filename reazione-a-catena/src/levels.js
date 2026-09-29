// Reazione a catena — livelli del prototipo.
// Coordinate in metri sul piano del diorama: x orizzontale (-8..8), y verso l'alto (0 = piano del tavolo).
// rot in gradi (positivo = antiorario). "hero" è la biglia che deve finire nel cestino.

export const PARTS = {
  plank: { label: 'Asse', icon: '╱', w: 3, h: 0.22 },
  domino: { label: 'Domino', icon: '▍', w: 0.22, h: 1.1 },
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
    goal: { x: 5.6, y: 0, w: 2.2, h: 1.3 },
  },
  {
    name: 'Effetto domino',
    hint: 'La biglia di partenza si ferma contro il gradino. Fai arrivare la spinta fino alla biglia dorata con i domino.',
    par: 5,
    inv: { domino: 7 },
    statics: [
      { x: -6.6, y: 6.2, w: 3.2, h: 0.25, rot: -30 }, // scivolo
      { x: -1.6, y: 3.0, w: 9.8, h: 0.3, rot: 0 }, // mensola
      { x: -3.9, y: 3.32, w: 0.3, h: 0.34, rot: 0 }, // gradino che ferma la biglia
    ],
    dynamics: [
      { type: 'ball', x: -7.6, y: 7.2, r: 0.33 },
      { type: 'ball', x: 3.05, y: 3.5, r: 0.33, hero: true },
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
    goal: { x: 5.3, y: 5.2, w: 2.4, h: 1.2 },
  },
  {
    name: 'Altalena',
    hint: 'Fai cadere qualcosa di pesante sul lato sinistro dell’altalena: la biglia dorata volerà.',
    par: 2,
    inv: { plank: 2, block: 1 },
    statics: [
      { x: -5.8, y: 8.0, w: 3.6, h: 0.25, rot: -18 }, // scivolo alto
      { x: -1.2, y: 0.5, w: 0.4, h: 1.0, rot: 0 }, // perno dell'altalena (solo grafica sotto)
    ],
    dynamics: [
      { type: 'ball', x: -7.3, y: 8.8, r: 0.4, heavy: true },
      { type: 'ball', x: 0.8, y: 1.6, r: 0.33, hero: true },
    ],
    seesaws: [{ x: -1.2, y: 1.1, len: 4.4 }],
    goal: { x: 5.4, y: 3.6, w: 2.2, h: 1.2, stand: true },
  },
];
