// Browser UI for Flagi: start screen, SVG hex board, roster, dice, dispatches.

import { Game } from './game.js';
import { AI_NAMES, resolveAIName, createAI } from './ai.js';
import { toPixel, hexPoints, parseKey, hexagonKeys } from './hex.js';

const SEATS = [
  { color: '#e04b3a', name: 'Crimson' },
  { color: '#f2c632', name: 'Gold' },
  { color: '#48ad5e', name: 'Moss' },
  { color: '#4583e8', name: 'Azure' },
  { color: '#a45fe0', name: 'Violet' },
  { color: '#ee8330', name: 'Amber' },
];

const SPEEDS = [
  { ms: 600, label: 'SLOW' },
  { ms: 260, label: 'NORMAL' },
  { ms: 80, label: 'FAST' },
];

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state

let game = null;
let ais = [];           // per seat: AI instance or null for the human
let humanSeat = 1;      // 1-based, matches game player numbers
let displayNames = [];  // per seat, e.g. "Dominik" or "Cutter"
let validSet = null;
let timer = 0;
let speedIdx = 1;

// URL params: ?auto starts immediately, ?spectate runs an all-AI game,
// ?fast begins at top speed. Handy for testing and for watching the machines.
const params = new URLSearchParams(location.search);
const SPECTATE = params.has('spectate');

// remembered start-screen choices
const setup = {
  name: 'Player',
  seat: 1,
  radius: 6,
  win: 'domination',
  terrain: 'open',
  towers: false,
  aiChoice: SEATS.map(() => 'any'),
};
if (params.get('win') === 'majority') setup.win = 'majority';
if (params.has('terrain')) setup.terrain = 'broken';
if (params.has('towers')) setup.towers = true;

// player colors as CSS vars, single source of truth here
SEATS.forEach((s, i) =>
  document.documentElement.style.setProperty(`--p${i + 1}`, s.color));

$('logo-flags').innerHTML = SEATS
  .map(s => `<span style="color:${s.color}">⚑</span>`).join('');

// ------------------------------------------------------------ start screen

function showStartScreen() {
  clearTimeout(timer);
  const card = $('overlay-card');
  card.innerHTML = `
    <div class="ov-title">FLAGI</div>
    <div class="ov-flags">${SEATS.map(s => `<span style="color:${s.color}">⚑</span>`).join('')}</div>
    <div class="ov-sub">a small war of flags</div>

    <div class="ov-section">Your Command</div>
    <div class="ov-row">
      <input type="text" id="su-name" maxlength="18" value="${setup.name}">
      <div class="chips" id="su-chips"></div>
    </div>

    <div class="ov-section">Opposing Forces</div>
    <div id="su-opps"></div>

    <div class="ov-section">Theater</div>
    <div class="ov-row">
      <select id="su-radius">
        <option value="5">Small — 91 hexes</option>
        <option value="6">Standard — 127 hexes</option>
        <option value="7">Grand — 169 hexes</option>
      </select>
      <select id="su-terrain">
        <option value="open">Open field — classic</option>
        <option value="broken">Broken ground — impassable terrain</option>
      </select>
    </div>
    <div class="ov-row">
      <select id="su-towers">
        <option value="0">No watchtowers</option>
        <option value="1">3 watchtowers — hold one for a 3rd move</option>
      </select>
      <select id="su-win">
        <option value="domination">Total domination — classic</option>
        <option value="majority">Majority — hold 60% for a full round</option>
      </select>
    </div>

    <button class="btn ov-start" id="su-start">TO WAR</button>

    <div class="ov-rules">
      <b>How it goes:</b> two moves per turn. Claim any open hex linked to your
      capital ⚑. Attacking enemy land takes a die roll — <b>3+</b> if you hold
      more land than they do, <b>4+</b> if equal, <b>5+</b> if less. Cut an
      enemy's land off from their capital and it goes free. Capitals fall only
      on a <b>6</b> — and yield the victim's entire empire. Last flag standing wins.
    </div>`;

  const chips = $('su-chips');
  SEATS.forEach((s, i) => {
    const c = document.createElement('button');
    c.className = 'chip' + (setup.seat === i + 1 ? ' sel' : '');
    c.style.setProperty('--c', s.color);
    c.title = s.name;
    c.onclick = () => { setup.seat = i + 1; renderChips(); renderOpps(); };
    chips.appendChild(c);
  });

  function renderChips() {
    [...chips.children].forEach((c, i) =>
      c.classList.toggle('sel', setup.seat === i + 1));
  }

  function renderOpps() {
    const box = $('su-opps');
    box.innerHTML = '';
    SEATS.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'opp-row';
      row.innerHTML = `<div class="pennant" style="--c:${s.color}"></div>`;
      if (i + 1 === setup.seat) {
        row.innerHTML += `<div class="who"><b>YOU</b> — ${s.name}</div><div class="who">commander-in-chief</div>`;
      } else {
        row.innerHTML += `<div class="who">${s.name}</div>`;
        const sel = document.createElement('select');
        sel.innerHTML = `<option value="any">any (surprise me)</option>` +
          AI_NAMES.map(n => `<option value="${n}">${n}</option>`).join('');
        sel.value = setup.aiChoice[i];
        sel.onchange = () => { setup.aiChoice[i] = sel.value; };
        row.appendChild(sel);
      }
      box.appendChild(row);
    });
  }
  renderOpps();

  $('su-radius').value = String(setup.radius);
  $('su-radius').onchange = (e) => { setup.radius = parseInt(e.target.value, 10); };
  $('su-terrain').value = setup.terrain;
  $('su-terrain').onchange = (e) => { setup.terrain = e.target.value; };
  $('su-towers').value = setup.towers ? '1' : '0';
  $('su-towers').onchange = (e) => { setup.towers = e.target.value === '1'; };
  $('su-win').value = setup.win;
  $('su-win').onchange = (e) => { setup.win = e.target.value; };
  $('su-name').onchange = (e) => { setup.name = e.target.value.trim() || 'Player'; };
  $('su-start').onclick = () => {
    setup.name = $('su-name').value.trim() || 'Player';
    startGame();
  };
  $('overlay').classList.add('open');
}

// --------------------------------------------------------------- game setup

function startGame() {
  $('overlay').classList.remove('open');
  humanSeat = setup.seat;

  displayNames = [];
  ais = [];
  for (let i = 0; i < SEATS.length; i++) {
    if (!SPECTATE && i + 1 === humanSeat) {
      displayNames.push(setup.name);
      ais.push(null);
    } else {
      const type = resolveAIName(setup.aiChoice[i], Math.random);
      displayNames.push(type.charAt(0).toUpperCase() + type.slice(1));
      ais.push(createAI(type, i + 1));
    }
  }

  game = new Game({
    radius: setup.radius,
    players: displayNames,
    winCondition: setup.win,
    terrain: setup.terrain,
    towers: setup.towers,
  });
  lastPending = 0;
  document.documentElement.style.setProperty('--me', SEATS[humanSeat - 1].color);

  buildBoard();
  buildRoster();
  $('log').innerHTML = '';
  $('die-face').textContent = '·';
  $('die-text').textContent = 'No engagements yet.';
  $('btn-resign').disabled = false;

  logSys(`Hostilities commence. Order of play: ${
    game.turnOrder.map(p => nameOf(p)).join(' → ')}.`);

  step();
}

// ------------------------------------------------------------- board (SVG)

const cellEls = new Map();
const starEls = new Map();

function buildBoard() {
  const svg = $('board');
  svg.innerHTML = '';
  cellEls.clear();
  starEls.clear();

  const size = 24;
  const frame = hexagonKeys(game.radius); // full footprint incl. carved terrain
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const k of frame) {
    const { x, y } = toPixel(k, size);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pad = size * 1.35;
  svg.setAttribute('viewBox',
    `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ` +
    `${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`);

  for (const k of frame) {
    const { x, y } = toPixel(k, size);
    const poly = document.createElementNS(SVGNS, 'polygon');
    if (game.board.has(k)) {
      poly.setAttribute('points', hexPoints(x, y, size * 0.94));
      poly.setAttribute('class', 'cell o0');
      poly.dataset.key = k;
      poly.addEventListener('click', () => onCellClick(k));
      cellEls.set(k, poly);
    } else {
      // impassable terrain: a recessed void in the table
      poly.setAttribute('points', hexPoints(x, y, size * 0.86));
      poly.setAttribute('class', 'cell void');
    }
    svg.appendChild(poly);
  }
  // watchtower marks
  for (const k of game.towerKeys) {
    const { x, y } = toPixel(k, size);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', x.toFixed(1));
    t.setAttribute('y', y.toFixed(1));
    t.setAttribute('class', 'tower-mark');
    t.textContent = '♜';
    svg.appendChild(t);
  }
  // capital stars drawn above the cells
  for (let p = 1; p <= game.n; p++) {
    const k = game.capitalOf[p];
    const { x, y } = toPixel(k, size);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', x.toFixed(1));
    t.setAttribute('y', y.toFixed(1));
    t.setAttribute('class', 'cap-star');
    t.textContent = '★';
    svg.appendChild(t);
    starEls.set(k, t);
  }
}

// ----------------------------------------------------------------- roster

function buildRoster() {
  const roster = $('roster');
  roster.innerHTML = '';
  for (let i = 0; i < game.n; i++) {
    const seat = document.createElement('div');
    seat.className = 'seat';
    seat.id = `seat-${i + 1}`;
    seat.style.setProperty('--c', SEATS[i].color);
    const kind = ais[i] ? 'AI' : 'YOU';
    seat.innerHTML = `
      <span class="marker"></span>
      <div class="pennant"></div>
      <div class="name">${displayNames[i]} <span class="kind">· ${kind}</span></div>
      <div class="count">1</div>
      <div class="bar">${game.majorityTarget
        ? `<span class="tick" style="left:${(100 * game.majorityTarget / game.board.size).toFixed(1)}%"></span>`
        : ''}<i></i></div>`;
    roster.appendChild(seat);
  }
}

// ----------------------------------------------------------------- render

function nameOf(p) { return displayNames[p - 1]; }

function tag(p) {
  return `<span class="tag" style="--c:${SEATS[p - 1].color}">${nameOf(p)}</span>`;
}

function render() {
  for (const [k, el] of cellEls) {
    const c = game.board.get(k);
    let cls = `cell o${c.owner}`;
    if (validSet && validSet.has(k)) cls += ' valid';
    el.setAttribute('class', cls);
  }
  for (const [k, el] of starEls) {
    el.style.display = game.board.get(k).cap > 0 ? '' : 'none';
  }

  const total = game.board.size;
  const movesLeft = game.victory
    ? 0 : game.moveLimit(game.activePlayer) - game.subt;
  for (let i = 0; i < game.n; i++) {
    const seat = $(`seat-${i + 1}`);
    seat.classList.toggle('dead', !game.inPlay[i]);
    seat.classList.toggle('active', !game.victory && game.activePlayer === i + 1);
    seat.classList.toggle('alert', game.pendingMajority === i + 1);
    seat.querySelector('.count').textContent = game.counts[i];
    seat.querySelector('.bar i').style.width =
      `${(100 * game.counts[i] / total).toFixed(1)}%`;
    seat.querySelector('.marker').textContent =
      (!game.victory && game.activePlayer === i + 1) ? '▶'.repeat(movesLeft) : '';
  }

  if (game.victory) {
    $('hud-turn').textContent = `TURN ${game.turn} — ${nameOf(game.victory).toUpperCase()} PREVAILS`;
  } else {
    $('hud-turn').textContent =
      `TURN ${game.turn} — ${nameOf(game.activePlayer).toUpperCase()} (${movesLeft} move${movesLeft > 1 ? 's' : ''})`;
  }

  $('board').classList.toggle('human',
    !game.victory && !ais[game.activePlayer - 1]);
}

// ------------------------------------------------------------------- log

function log(html) {
  const el = document.createElement('div');
  el.className = 'entry';
  el.innerHTML = html;
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
}

function logSys(text) {
  const el = document.createElement('div');
  el.className = 'entry sys';
  el.textContent = text;
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
}

function coords(k) {
  const [q, r] = parseKey(k);
  return `⟨${q},${r}⟩`;
}

function showDie(ev) {
  const die = $('die-face');
  die.textContent = ev.roll;
  die.classList.remove('rolling');
  void die.offsetWidth; // restart animation
  die.classList.add('rolling');
  const who = `${nameOf(ev.player)} vs ${nameOf(ev.enemy)}`;
  const need = ev.type === 'capital' ? 'needed 6' : `needed ${ev.need}+`;
  $('die-text').innerHTML =
    `${who}<br>rolled <b>${ev.roll}</b> (${need}) — ${ev.captured ? 'captured' : 'repelled'}`;
}

function narrate(ev) {
  const gotTower = ev.tower && (ev.type === 'claim' || ev.captured);
  if (ev.type === 'claim') {
    log(`${tag(ev.player)} takes open land at ${coords(ev.k)}.`);
    if (gotTower) logSys(`${nameOf(ev.player)} mans the watchtower — three moves a turn.`);
    return;
  }
  showDie(ev);
  if (ev.type === 'attack') {
    if (ev.captured) {
      let extra = '';
      if (ev.pruned && ev.pruned.length) {
        extra = ` <b>${ev.pruned.length}</b> ${nameOf(ev.enemy)} hex${ev.pruned.length > 1 ? 'es' : ''} cut off and lost.`;
      }
      log(`${tag(ev.player)} storms ${nameOf(ev.enemy)} at ${coords(ev.k)} — rolls <b>${ev.roll}</b> (needed ${ev.need}+). Land taken.${extra}`);
      if (gotTower) logSys(`The watchtower changes hands — ${nameOf(ev.player)} gains a third move.`);
    } else {
      log(`${tag(ev.player)} attacks ${nameOf(ev.enemy)} at ${coords(ev.k)} — rolls <b>${ev.roll}</b> (needed ${ev.need}+). Repelled.`);
    }
  } else if (ev.type === 'capital') {
    if (ev.captured) {
      log(`${tag(ev.player)} rolls a <b>6</b>! The ${nameOf(ev.enemy)} capital falls — their whole empire changes flags.`);
      logSys(`${nameOf(ev.enemy)} has been eliminated.`);
    } else {
      log(`${tag(ev.player)} assaults the ${nameOf(ev.enemy)} capital — rolls <b>${ev.roll}</b>. The capital proudly repels the attack.`);
    }
  }
}

let lastPending = 0;

// Announce majority-threshold crossings (and being cut back under the line).
function checkMajority() {
  if (!game.majorityTarget) return;
  const p = game.pendingMajority || 0;
  if (p === lastPending) return;
  if (p) {
    const pct = Math.round(100 * game.counts[p - 1] / game.board.size);
    logSys(`⚠ ${nameOf(p)} holds ${pct}% of the theater. Cut them below ` +
      `${Math.round(100 * game.majorityTarget / game.board.size)}% before their next turn, or the war is over.`);
  } else if (!game.victory) {
    logSys(`${nameOf(lastPending)} has been cut back below the line.`);
  }
  lastPending = p;
}

function animate(ev) {
  const el = cellEls.get(ev.k);
  if (!el) return;
  if (ev.type === 'claim' || ev.captured) {
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 400);
  } else {
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 800);
  }
}

// -------------------------------------------------------------- game loop

function isHumanTurn() {
  return game && !game.victory && !ais[game.activePlayer - 1];
}

function step() {
  clearTimeout(timer);
  validSet = null;
  if (game.victory) {
    render();
    logSys(`${nameOf(game.victory)} has conquered the board.`);
    setTimeout(showVictory, 900);
    return;
  }
  const p = game.activePlayer;
  if (ais[p - 1]) {
    render();
    timer = setTimeout(() => {
      const mv = ais[p - 1].resolveMove(game);
      const ev = game.makeMove(mv);
      game.advanceTurn();
      render();
      animate(ev);
      narrate(ev);
      checkMajority();
      step();
    }, SPEEDS[speedIdx].ms);
  } else {
    validSet = new Set(game.validMoves(p));
    render();
  }
}

function onCellClick(k) {
  if (!isHumanTurn()) return;
  const cell = game.board.get(k);
  if (cell.owner === humanSeat) {
    logSys('You already hold that land.');
    return;
  }
  if (!validSet.has(k)) {
    logSys('That hex is not connected to your capital.');
    return;
  }
  const ev = game.makeMove(k);
  game.advanceTurn();
  render();
  animate(ev);
  narrate(ev);
  checkMajority();
  step();
}

// ---------------------------------------------------------------- victory

function showVictory() {
  // survivors (majority wins leave some) rank above the dead, by holdings;
  // the dead rank by how long they lasted
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

  const byMajority = game.majorityTarget && game.eliminated < game.n - 1;
  const winPct = Math.round(100 * game.counts[game.victory - 1] / game.board.size);
  const won = game.victory === humanSeat;
  const title = SPECTATE
    ? `${nameOf(game.victory).toUpperCase()} WINS`
    : won ? 'VICTORY' : 'DEFEAT';
  const card = $('overlay-card');
  card.innerHTML = `
    <div class="ov-title" style="color:${SEATS[game.victory - 1].color}">
      ${title}</div>
    <div class="ov-sub">${nameOf(game.victory)} ${byMajority
      ? `claims majority dominion — ${winPct}% of the theater —`
      : 'rules the board'} after ${game.turn} turns</div>
    <div class="ov-placements">
      ${order.map((p, i) => `
        <div class="opp-row">
          <div class="pos">${i + 1}.</div>
          <div class="pennant" style="--c:${SEATS[p - 1].color}"></div>
          <div class="who"><b>${nameOf(p)}</b>${!SPECTATE && p === humanSeat ? ' — you' : ''}</div>
        </div>`).join('')}
    </div>
    <button class="btn ov-start" id="ov-again">ONCE MORE</button>`;
  $('ov-again').onclick = showStartScreen;
  $('overlay').classList.add('open');
}

// ---------------------------------------------------------------- buttons

$('btn-new').onclick = showStartScreen;

$('btn-speed').onclick = () => {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  $('btn-speed').textContent = `TEMPO: ${SPEEDS[speedIdx].label}`;
};

$('btn-resign').onclick = () => {
  if (!game || game.victory || !game.inPlay[humanSeat - 1]) return;
  logSys(`${nameOf(humanSeat)} resigns the field. The machines fight on.`);
  game.resign(humanSeat);
  $('btn-resign').disabled = true;
  step();
};

// ------------------------------------------------------------------- init

if (params.has('fast')) {
  speedIdx = 2;
  $('btn-speed').textContent = `TEMPO: ${SPEEDS[speedIdx].label}`;
}
if (params.has('auto') || SPECTATE) startGame();
else showStartScreen();
