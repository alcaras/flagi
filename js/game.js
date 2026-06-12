// Flagi game rules — pure logic, no DOM. Runs in the browser and in Node
// (sim.js) alike.
//
// Board cells: Map of "q,r" -> { owner, cap }
//   owner: 0 = neutral, 1..n = player
//   cap:   0 = ordinary land, p = player p's capital (a captured capital
//          becomes ordinary land, as in the original)

import { key, neighborsOf, hexagonKeys, cornerKeys, orbitOf, setExtraLinks } from './hex.js';

// Deterministic RNG for simulations and seeded games.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cloneBoard(board) {
  const b = new Map();
  for (const [k, c] of board) b.set(k, { owner: c.owner, cap: c.cap, tower: c.tower });
  return b;
}

export function countOwned(board, p) {
  let n = 0;
  for (const c of board.values()) if (c.owner === p) n++;
  return n;
}

// Every cell of player p reachable from their capital through their own cells.
export function connectedComponent(board, p, capitalKey) {
  const comp = new Set();
  const capCell = board.get(capitalKey);
  if (!capCell || capCell.owner !== p) return comp;
  comp.add(capitalKey);
  const stack = [capitalKey];
  while (stack.length) {
    const k = stack.pop();
    for (const nk of neighborsOf(k)) {
      if (comp.has(nk)) continue;
      const c = board.get(nk);
      if (c && c.owner === p) { comp.add(nk); stack.push(nk); }
    }
  }
  return comp;
}

// Cells of p no longer connected to their capital revert to neutral.
// Returns the list of lost cell keys.
export function pruneDisconnected(board, p, capitalKey) {
  const comp = connectedComponent(board, p, capitalKey);
  const lost = [];
  for (const [k, c] of board) {
    if (c.owner === p && !comp.has(k)) {
      c.owner = 0;
      c.cap = 0;
      lost.push(k);
    }
  }
  return lost;
}

export class Game {
  // players: array of display names; seat i (0-based) is player i+1 and
  // starts at corner i of the hexagon.
  // winCondition: 'domination' (classic — last flag standing) or 'majority'
  // (hold majorityPct of ALL board hexes through one full round).
  // terrain: 'open' (classic) or 'broken' (impassable hexes, mirrored 6-fold).
  // towers: place 3 symmetric watchtowers; holding any grants a 3rd move
  // per turn (capped at one extra regardless of towers held).
  // scenario: a hand-authored map (see scenarios.js) with its own cells,
  // capitals, tower sites, and ferry links; overrides radius/terrain.
  constructor({ radius = 6, players, rng = Math.random,
                winCondition = 'domination', majorityPct = 0.6,
                terrain = 'open', towers = false, scenario = null }) {
    this.radius = radius;
    this.rng = rng;
    this.winCondition = winCondition;
    this.scenario = scenario;
    this.n = players.length;
    this.playerNames = players.slice();

    // adjacency extras (ferries) are global module state — set before any
    // connectivity work, cleared when the next game starts
    setExtraLinks(scenario ? scenario.links : []);

    this.board = new Map();
    this.capitalOf = new Array(this.n + 1).fill(null);
    this.towerKeys = [];

    if (scenario) {
      for (const k of scenario.cells) {
        this.board.set(k, { owner: 0, cap: 0, tower: false });
      }
      for (let i = 0; i < this.n; i++) {
        const k = scenario.capitals[i];
        this.board.set(k, { owner: i + 1, cap: i + 1, tower: false });
        this.capitalOf[i + 1] = k;
      }
      if (towers) {
        for (const k of scenario.towers) {
          const c = this.board.get(k);
          if (c) { c.tower = true; this.towerKeys.push(k); }
        }
      }
    } else {
      for (const k of hexagonKeys(radius)) {
        this.board.set(k, { owner: 0, cap: 0, tower: false });
      }
      const corners = cornerKeys(radius);
      for (let i = 0; i < this.n; i++) {
        const k = corners[i];
        this.board.set(k, { owner: i + 1, cap: i + 1, tower: false });
        this.capitalOf[i + 1] = k;
      }
      // three watchtowers, each equidistant from its two flanking capitals
      if (towers) {
        const s = Math.max(1, Math.round(radius / 3));
        for (const [q, r] of [[2 * s, -s], [-s, 2 * s], [-s, -s]]) {
          const k = key(q, r);
          const c = this.board.get(k);
          if (c) { c.tower = true; this.towerKeys.push(k); }
        }
      }
      if (terrain === 'broken') this.carveTerrain();
    }

    this.inPlay = new Array(this.n).fill(true);
    this.timeOfDeath = new Array(this.n).fill(0);
    this.eliminated = 0;
    this.victory = 0; // winning player, or 0 while the game runs

    this.turn = 0;
    this.subt = 0; // each player makes two moves per turn

    this.turnOrder = Array.from({ length: this.n }, (_, i) => i + 1);
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
    this.activePlayer = this.turnOrder[0];

    // 0 when playing classic domination; otherwise the hex count to win
    this.majorityTarget = winCondition === 'majority'
      ? Math.ceil(majorityPct * this.board.size) : 0;
    // player who ended their turn at/above the target and wins if still
    // there when their next turn arrives
    this.pendingMajority = 0;

    this.counts = new Array(this.n).fill(0);
    this.recount();
    this.history = [];
  }

  // Remove ~12% of the board as impassable terrain. Cells are removed in
  // whole 60°-rotation orbits so all six players face an identical map, and
  // only if the rest of the board stays fully connected.
  carveTerrain() {
    const protect = new Set(this.towerKeys);
    for (let p = 1; p <= this.n; p++) {
      const ck = this.capitalOf[p];
      protect.add(ck);
      for (const nk of neighborsOf(ck)) protect.add(nk);
    }
    const target = Math.round(this.board.size * 0.12);
    let removed = 0;
    let attempts = 0;
    while (removed < target && attempts < 300) {
      attempts++;
      const candidates = [...this.board.keys()].filter(k => !protect.has(k));
      const k = candidates[Math.floor(this.rng() * candidates.length)];
      const orbit = orbitOf(k);
      if (orbit.some(o => protect.has(o) || !this.board.has(o))) continue;
      const saved = orbit.map(o => [o, this.board.get(o)]);
      for (const o of orbit) this.board.delete(o);
      if (this.boardConnected()) removed += orbit.length;
      else for (const [o, c] of saved) this.board.set(o, c);
    }
  }

  boardConnected() {
    const start = this.board.keys().next().value;
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      for (const nk of neighborsOf(k)) {
        if (!seen.has(nk) && this.board.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    return seen.size === this.board.size;
  }

  // Two moves per turn; a held watchtower grants a third (never more).
  moveLimit(p) {
    for (const t of this.towerKeys) {
      const c = this.board.get(t);
      if (c && c.owner === p) return 3;
    }
    return 2;
  }

  recount() {
    this.counts.fill(0);
    for (const c of this.board.values()) {
      if (c.owner > 0) this.counts[c.owner - 1]++;
    }
  }

  roll() {
    return 1 + Math.floor(this.rng() * 6);
  }

  isValidMove(k, p) {
    const cell = this.board.get(k);
    if (!cell || cell.owner === p) return false;
    const comp = connectedComponent(this.board, p, this.capitalOf[p]);
    for (const nk of neighborsOf(k)) if (comp.has(nk)) return true;
    return false;
  }

  validMoves(p) {
    const comp = connectedComponent(this.board, p, this.capitalOf[p]);
    const out = [];
    for (const [k, cell] of this.board) {
      if (cell.owner === p) continue;
      for (const nk of neighborsOf(k)) {
        if (comp.has(nk)) { out.push(k); break; }
      }
    }
    return out;
  }

  // Resolve the active player's move on cell k (assumed valid).
  // Returns an event object describing what happened, for the UI/log.
  makeMove(k) {
    const p = this.activePlayer;
    const cell = this.board.get(k);
    const ev = { player: p, k, tower: cell.tower };

    if (cell.owner === 0) {
      cell.owner = p;
      ev.type = 'claim';
    } else if (cell.cap > 0) {
      const enemy = cell.owner;
      ev.type = 'capital';
      ev.enemy = enemy;
      ev.roll = this.roll();
      ev.need = 6;
      if (ev.roll === 6) {
        ev.captured = true;
        cell.owner = p;
        cell.cap = 0;
        ev.absorbed = [];
        for (const [kk, c] of this.board) {
          if (c.owner === enemy) { c.owner = p; c.cap = 0; ev.absorbed.push(kk); }
        }
        this.inPlay[enemy - 1] = false;
        this.timeOfDeath[enemy - 1] = this.turn;
        this.eliminated++;
        ev.eliminatedPlayer = enemy;
      } else {
        ev.captured = false;
      }
    } else {
      const enemy = cell.owner;
      ev.type = 'attack';
      ev.enemy = enemy;
      ev.roll = this.roll();
      const pc = this.counts[p - 1];
      const ec = this.counts[enemy - 1];
      ev.need = pc > ec ? 3 : pc === ec ? 4 : 5;
      if (ev.roll >= ev.need) {
        ev.captured = true;
        cell.owner = p;
        ev.pruned = pruneDisconnected(this.board, enemy, this.capitalOf[enemy]);
      } else {
        ev.captured = false;
      }
    }

    this.recount();
    return ev;
  }

  advanceTurn() {
    if (this.victory) return;
    if (this.eliminated >= this.n - 1) {
      this.victory = this.inPlay.findIndex(Boolean) + 1;
      return;
    }
    if (this.pendingMajority &&
        (this.counts[this.pendingMajority - 1] < this.majorityTarget ||
         !this.inPlay[this.pendingMajority - 1])) {
      this.pendingMajority = 0; // cut back below the line
    }
    const mover = this.activePlayer;
    this.subt++;
    if (this.subt >= this.moveLimit(mover) || !this.inPlay[mover - 1]) {
      this.subt = 0;
      if (this.majorityTarget && !this.pendingMajority &&
          this.inPlay[mover - 1] &&
          this.counts[mover - 1] >= this.majorityTarget) {
        this.pendingMajority = mover;
      }
      do {
        this.turn++;
        this.activePlayer = this.turnOrder[this.turn % this.n];
      } while (!this.inPlay[this.activePlayer - 1]);
      if (this.pendingMajority === this.activePlayer &&
          this.counts[this.activePlayer - 1] >= this.majorityTarget) {
        this.victory = this.activePlayer; // held through a full round
      }
    }
    this.history.push(this.counts.slice());
  }

  // Player p quits: their land reverts to neutral and they are eliminated.
  resign(p) {
    if (!this.inPlay[p - 1]) return;
    for (const c of this.board.values()) {
      if (c.owner === p) { c.owner = 0; c.cap = 0; }
    }
    this.inPlay[p - 1] = false;
    this.timeOfDeath[p - 1] = this.turn;
    this.eliminated++;
    this.recount();
    if (this.eliminated >= this.n - 1) {
      this.victory = this.inPlay.findIndex(Boolean) + 1;
    } else if (p === this.activePlayer) {
      this.subt = 1;
      this.advanceTurn();
    }
  }
}
