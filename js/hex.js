// Axial hex coordinates (pointy-top cells). Cells are addressed by string
// keys "q,r" so they can be used in Maps and Sets directly.

export const DIRS = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
];

export const key = (q, r) => q + ',' + r;
export const parseKey = (k) => k.split(',').map(Number);

const neighborCache = new Map();

export function neighborsOf(k) {
  let n = neighborCache.get(k);
  if (!n) {
    const [q, r] = parseKey(k);
    n = DIRS.map(([dq, dr]) => key(q + dq, r + dr));
    neighborCache.set(k, n);
  }
  return n;
}

// All cells of a hexagon-shaped board with the given radius (0 = single cell).
export function hexagonKeys(radius) {
  const keys = [];
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius);
    const hi = Math.min(radius, -q + radius);
    for (let r = lo; r <= hi; r++) keys.push(key(q, r));
  }
  return keys;
}

// The six corners of the hexagon board, in clockwise order starting NE.
export function cornerKeys(radius) {
  return [
    key(radius, -radius), // NE
    key(radius, 0),       // E
    key(0, radius),       // SE
    key(-radius, radius), // SW
    key(-radius, 0),      // W
    key(0, -radius),      // NW
  ];
}

// Rotate an axial coordinate 60° around the board center.
export function rotate60(q, r) {
  return [-r, q + r];
}

// All distinct positions a cell visits under 60° rotations — used to keep
// generated features (terrain) identical for all six players.
export function orbitOf(k) {
  let [q, r] = parseKey(k);
  const out = new Set([key(q, r)]);
  for (let i = 0; i < 5; i++) {
    [q, r] = rotate60(q, r);
    out.add(key(q, r));
  }
  return [...out];
}

export function toPixel(k, size) {
  const [q, r] = parseKey(k);
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}

// SVG polygon points for a pointy-top hex centered at (cx, cy).
export function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(
      (cx + size * Math.cos(a)).toFixed(2) + ',' +
      (cy + size * Math.sin(a)).toFixed(2)
    );
  }
  return pts.join(' ');
}
