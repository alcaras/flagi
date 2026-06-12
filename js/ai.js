// AI personalities ported from the 2005 FlagiAI.py, adapted from the 8-neighbor
// square grid to 6-neighbor hexes, plus newer additions (marshal). Each AI gets
// resolveMove(game) and returns the cell key it wants to play.

import { neighborsOf } from './hex.js';
import { cloneBoard, countOwned, pruneDisconnected } from './game.js';

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

class AIBase {
  constructor(me) {
    this.me = me;
  }
  // 4/3/2 odds factor from the original: how favorable an attack on `enemy` is.
  factor(game, enemy) {
    const myc = game.counts[this.me - 1];
    const enc = game.counts[enemy - 1];
    return myc > enc ? 4 : myc === enc ? 3 : 2;
  }
  // How many cells `enemy` loses if cell k stops being theirs (the cut value).
  cutLoss(game, k, enemy) {
    const b = cloneBoard(game.board);
    const before = countOwned(b, enemy);
    const c = b.get(k);
    c.owner = 0;
    c.cap = 0;
    pruneDisconnected(b, enemy, game.capitalOf[enemy]);
    return before - countOwned(b, enemy);
  }
  // Friendly or neutral neighbors of k.
  links(game, k) {
    let n = 0;
    for (const nk of neighborsOf(k)) {
      const c = game.board.get(nk);
      if (c && (c.owner === this.me || c.owner === 0)) n++;
    }
    return n;
  }
  isSafe(game, nk) {
    const c = game.board.get(nk);
    return !c || c.owner === 0 || c.owner === this.me;
  }
  // How much I lose if my cell k falls.
  threatValue(game, k) {
    const c = game.board.get(k);
    if (c.cap === this.me) return game.counts[this.me - 1] * 6;
    return this.cutLoss(game, k, this.me);
  }
  // My cells adjacent to an enemy whose loss costs more than themselves.
  threatened(game) {
    const out = [];
    for (const [k, c] of game.board) {
      if (c.owner !== this.me) continue;
      let dangers = 0;
      for (const nk of neighborsOf(k)) if (!this.isSafe(game, nk)) dangers++;
      if (!dangers) continue;
      const v = this.threatValue(game, k);
      if (v > 1) out.push([k, v]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out;
  }
  // How much of my territory still falls if I play moveK but then lose sqK.
  defAnalysis(game, moveK, sqK) {
    const b = cloneBoard(game.board);
    const before = countOwned(b, this.me);
    const mc = b.get(moveK);
    mc.owner = this.me;
    mc.cap = 0;
    const sc = b.get(sqK);
    sc.owner = 0;
    sc.cap = 0;
    pruneDisconnected(b, this.me, game.capitalOf[this.me]);
    return before - countOwned(b, this.me);
  }
}

// rvalid: out of all valid moves, randomly choose one.
class RValid extends AIBase {
  resolveMove(game) {
    return pick(game.validMoves(this.me), game.rng);
  }
}

// renemy: stick with a randomly chosen enemy; attack them when possible,
// otherwise make any valid move.
class REnemy extends AIBase {
  constructor(me) {
    super(me);
    this.enemy = 0;
  }
  pickEnemy(game) {
    const alive = [];
    for (let i = 1; i <= game.n; i++) {
      if (i !== this.me && game.inPlay[i - 1]) alive.push(i);
    }
    this.enemy = pick(alive, game.rng);
  }
  resolveMove(game) {
    if (!this.enemy || !game.inPlay[this.enemy - 1]) this.pickEnemy(game);
    const moves = game.validMoves(this.me);
    const enemyMoves = moves.filter(k => game.board.get(k).owner === this.enemy);
    return enemyMoves.length ? pick(enemyMoves, game.rng) : pick(moves, game.rng);
  }
}

// repeace: like renemy, but prefers peaceful expansion unless it leads the
// board and outweighs its chosen enemy.
class REnemyPeace extends REnemy {
  myRank(game) {
    const mine = game.counts[this.me - 1];
    let rank = 1;
    for (let i = 0; i < game.n; i++) {
      if (i !== this.me - 1 && game.counts[i] > mine) rank++;
    }
    return rank;
  }
  resolveMove(game) {
    if (!this.enemy || !game.inPlay[this.enemy - 1]) this.pickEnemy(game);
    const moves = game.validMoves(this.me);
    const white = moves.filter(k => game.board.get(k).owner === 0);
    const enemyMoves = moves.filter(k => game.board.get(k).owner === this.enemy);
    if (enemyMoves.length) {
      const peaceful = white.length &&
        (game.counts[this.me - 1] <= game.counts[this.enemy - 1] || this.myRank(game) !== 1);
      return peaceful ? pick(white, game.rng) : pick(enemyMoves, game.rng);
    }
    if (white.length) return pick(white, game.rng);
    return pick(moves, game.rng);
  }
}

// bider: expand peacefully while possible; once boxed in, pick a target —
// the strongest attackable enemy if someone is already down and we aren't
// leading, otherwise the weakest attackable enemy.
class Bider extends AIBase {
  constructor(me) {
    super(me);
    this.enemy = 0;
    this.ndown = 0;
  }
  pickEnemy(game, moves) {
    const attackable = new Array(game.n + 1).fill(0);
    for (const k of moves) {
      const o = game.board.get(k).owner;
      if (o > 0) attackable[o]++;
    }
    let leader = 1;
    for (let i = 2; i <= game.n; i++) {
      if (game.counts[i - 1] > game.counts[leader - 1]) leader = i;
    }
    const preferBig = game.eliminated >= 1 && leader !== this.me;
    let best = 0;
    for (let i = 1; i <= game.n; i++) {
      if (!attackable[i]) continue;
      if (!best) { best = i; continue; }
      const better = preferBig
        ? game.counts[i - 1] > game.counts[best - 1]
        : game.counts[i - 1] < game.counts[best - 1];
      if (better) best = i;
    }
    this.enemy = best;
  }
  resolveMove(game) {
    if (this.ndown !== game.eliminated) {
      this.ndown = game.eliminated;
      this.enemy = 0;
    }
    if (this.enemy && !game.inPlay[this.enemy - 1]) this.enemy = 0;
    const moves = game.validMoves(this.me);
    const white = moves.filter(k => game.board.get(k).owner === 0);
    if (white.length) return pick(white, game.rng);
    if (!this.enemy) this.pickEnemy(game, moves);
    let enemyMoves = moves.filter(k => game.board.get(k).owner === this.enemy);
    if (!enemyMoves.length) {
      this.pickEnemy(game, moves);
      enemyMoves = moves.filter(k => game.board.get(k).owner === this.enemy);
    }
    return enemyMoves.length ? pick(enemyMoves, game.rng) : pick(moves, game.rng);
  }
}

// cutter: peaceful moves chosen by how linked they are to friendly/neutral
// land; otherwise the attack that disconnects the most enemy territory;
// capital strikes valued at 6x the victim's holdings.
class Cutter extends AIBase {
  choiceLinks(game, list) {
    let max = -1;
    let top = [];
    for (const k of list) {
      const s = this.links(game, k);
      if (s > max) { max = s; top = [k]; }
      else if (s === max) top.push(k);
    }
    return pick(top, game.rng);
  }
  resolveMove(game) {
    const moves = game.validMoves(this.me);
    const white = [];
    const black = [];
    const kill = [];
    for (const k of moves) {
      const c = game.board.get(k);
      if (c.owner === 0) white.push(k);
      else if (c.cap > 0) kill.push(k);
      else black.push(k);
    }

    let myMove = pick(moves, game.rng);
    let maxUtil = 0;
    if (white.length) {
      maxUtil = 6; // a peaceful claim is worth 6
      myMove = this.choiceLinks(game, white);
    }
    if (black.length) {
      const scored = black
        .map(k => [k, this.cutLoss(game, k, game.board.get(k).owner) *
                      this.factor(game, game.board.get(k).owner)])
        .sort((a, b) => b[1] - a[1]);
      maxUtil = scored[0][1];
      if (scored[0][1] > 6 || !white.length) {
        const top = scored.filter(s => s[1] === scored[0][1]).map(s => s[0]);
        myMove = this.choiceLinks(game, top);
      }
    }
    if (kill.length) {
      let killScore = 0;
      let killMove = kill[0];
      for (const k of kill) {
        const v = 6 * game.counts[game.board.get(k).owner - 1];
        if (v > killScore) { killScore = v; killMove = k; }
      }
      if (killScore > maxUtil) myMove = killMove;
    }
    return myMove;
  }
}

// holistic: scores every valid move on offense (cutter-style damage, claims
// worth 9, capitals worth 6x holdings) plus defense (reinforcing own cells
// whose loss would disconnect territory).
class Holistic extends AIBase {
  offensiveScore(game, k) {
    const c = game.board.get(k);
    if (c.owner === 0) return 9;
    if (c.cap > 0) return 6 * game.counts[c.owner - 1];
    return this.cutLoss(game, k, c.owner) * this.factor(game, c.owner);
  }
  findFactor(game, k) {
    const c = game.board.get(k);
    if (c.owner === 0) return 6;
    if (c.cap > 0) return 1;
    return this.factor(game, c.owner);
  }
  defensiveScore(game, k, thr) {
    let max = 0;
    const nbs = neighborsOf(k);
    for (const [sq, v] of thr) {
      if (!nbs.includes(sq)) continue;
      const ds = (v - this.defAnalysis(game, k, sq)) * this.findFactor(game, k);
      if (ds > max) max = ds;
    }
    return max;
  }
  resolveMove(game) {
    const moves = game.validMoves(this.me);
    const thr = this.threatened(game);
    let best = -Infinity;
    let top = [];
    for (const k of moves) {
      const s = this.offensiveScore(game, k) + this.defensiveScore(game, k, thr);
      if (s > best) { best = s; top = [k]; }
      else if (s === best) top.push(k);
    }
    return pick(top, game.rng);
  }
}

// marshal (2026): expected-value player. Scores every move in expected hexes —
// capture probability times territory swing, minus likely retaliation — with
// leader-targeting politics, majority-threshold awareness, capital-lottery EV,
// and watchtower tempo valuation.
class Marshal extends AIBase {
  captureProb(game, enemy) {
    return this.factor(game, enemy) / 6;
  }
  // Expected hexes saved by garrisoning next to an exposed cut.
  coverValue(game, k, thr) {
    let max = 0;
    const nbs = neighborsOf(k);
    for (const [sq, v] of thr) {
      if (!nbs.includes(sq)) continue;
      const saved = v - this.defAnalysis(game, k, sq);
      if (saved > max) max = saved;
    }
    return max;
  }
  holdsTower(game, p) {
    for (const t of game.towerKeys) {
      const c = game.board.get(t);
      if (c && c.owner === p) return true;
    }
    return false;
  }
  resolveMove(game) {
    const moves = game.validMoves(this.me);
    const thr = this.threatened(game);

    let leader = 0;
    let leaderCount = -1;
    for (let i = 1; i <= game.n; i++) {
      if (i === this.me || !game.inPlay[i - 1]) continue;
      if (game.counts[i - 1] > leaderCount) { leaderCount = game.counts[i - 1]; leader = i; }
    }
    const iHaveTower = game.towerKeys.length && this.holdsTower(game, this.me);

    let best = -Infinity;
    let top = [];
    for (const k of moves) {
      const c = game.board.get(k);
      let s;
      if (c.owner === 0) {
        // a certain hex, shaped well
        s = 1 + 0.08 * this.links(game, k);
      } else if (c.cap > 0) {
        // the capital lottery: 1/6 of their whole empire, plus elimination value
        s = (game.counts[c.owner - 1] + 2) / 6;
      } else {
        // expected swing minus the likely give-back when they retake
        const p = this.captureProb(game, c.owner);
        s = p * (1 + this.cutLoss(game, k, c.owner)) - 0.8;
      }
      if (c.owner > 0) {
        if (c.owner === leader) s *= 1.3;
        if (game.majorityTarget &&
            game.counts[c.owner - 1] >= game.majorityTarget * 0.85) s *= 1.8;
      }
      s += this.coverValue(game, k, thr);
      if (c.tower) {
        if (!iHaveTower) s += 3;            // tempo for me
        if (c.owner > 0) s += 1.5;          // tempo denied to them
      }
      if (s > best) { best = s; top = [k]; }
      else if (s === best) top.push(k);
    }
    return pick(top, game.rng);
  }
}

export const AI_TYPES = {
  rvalid: RValid,
  renemy: REnemy,
  repeace: REnemyPeace,
  bider: Bider,
  cutter: Cutter,
  holistic: Holistic,
  marshal: Marshal,
};

export const AI_NAMES = Object.keys(AI_TYPES);

// Resolve "any" to a concrete personality (like the original's ai:anyai).
export function resolveAIName(name, rng = Math.random) {
  return name === 'any' ? pick(AI_NAMES, rng) : name;
}

export function createAI(name, seat, rng = Math.random) {
  const Type = AI_TYPES[resolveAIName(name, rng)];
  return new Type(seat);
}
