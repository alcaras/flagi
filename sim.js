#!/usr/bin/env node
// Headless AI-vs-AI simulator — port of the original's --console batch mode.
// Usage: node sim.js [games] [seed] [majority] [terrain] [towers]
// e.g.   node sim.js 50
//        node sim.js 40 7 majority terrain towers

import { Game, mulberry32 } from './js/game.js';
import { AI_NAMES, createAI } from './js/ai.js';

const args = process.argv.slice(2);
const nums = args.filter(a => /^\d+$/.test(a)).map(Number);
const flags = new Set(args.filter(a => !/^\d+$/.test(a)));
const games = nums[0] ?? 20;
const seed = nums[1] ?? 42;
const opts = {
  winCondition: flags.has('majority') ? 'majority' : 'domination',
  terrain: flags.has('terrain') ? 'broken' : 'open',
  towers: flags.has('towers'),
};
const rng = mulberry32(seed);

const score = {};
const plays = {};
const wins = {};
for (const n of AI_NAMES) { score[n] = 0; plays[n] = 0; wins[n] = 0; }

let totalTurns = 0;

for (let g = 0; g < games; g++) {
  // shuffle the full pool and seat the first six
  const pool = AI_NAMES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const names = pool.slice(0, 6);

  const game = new Game({ players: names, rng, ...opts });
  const ais = names.map((n, i) => createAI(n, i + 1, rng));

  let guard = 0;
  while (!game.victory) {
    if (++guard > 500000) throw new Error(`game ${g} did not terminate`);
    const p = game.activePlayer;
    const mv = ais[p - 1].resolveMove(game);
    if (!game.isValidMove(mv, p)) {
      throw new Error(`game ${g}: invalid move ${mv} by ${names[p - 1]} (player ${p})`);
    }
    game.makeMove(mv);
    game.advanceTurn();
  }
  totalTurns += game.turn;

  // Placements: winner, then survivors by holdings, then the dead in
  // reverse order of death.
  const others = [];
  for (let p = 1; p <= game.n; p++) if (p !== game.victory) others.push(p);
  others.sort((a, b) => {
    const aAlive = game.inPlay[a - 1];
    const bAlive = game.inPlay[b - 1];
    if (aAlive !== bAlive) return aAlive ? -1 : 1;
    if (aAlive) return game.counts[b - 1] - game.counts[a - 1];
    return game.timeOfDeath[b - 1] - game.timeOfDeath[a - 1];
  });
  const order = [game.victory, ...others];

  order.forEach((p, idx) => {
    const n = names[p - 1];
    plays[n]++;
    score[n] += game.n - idx; // 6 points for 1st, down to 1 for last
    if (idx === 0) wins[n]++;
  });
}

console.log(`${games} games (${opts.winCondition}` +
  `${opts.terrain === 'broken' ? ', terrain' : ''}` +
  `${opts.towers ? ', towers' : ''}), avg ${(totalTurns / games).toFixed(1)} turns/game\n`);
console.log('avg-place-pts  wins  games  ai');
const rows = AI_NAMES
  .map(n => [n, plays[n] ? score[n] / plays[n] : 0])
  .sort((a, b) => b[1] - a[1]);
for (const [n, avg] of rows) {
  console.log(`${avg.toFixed(2).padStart(12)}  ${String(wins[n]).padStart(4)}  ${String(plays[n]).padStart(5)}  ${n}`);
}
