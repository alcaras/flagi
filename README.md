# Flagi — Hex Edition

A small war of flags. Browser port of a game invented on paper circa the
mid-'90s and first implemented in Python/Tkinter in 2005 — now on a hexagonal
board with **6 players**, one capital at each corner. Single human player vs
five AI personalities.

**Play it: open `index.html` via any static server** (ES modules don't load
from `file://`):

```sh
npm run serve        # python3 http.server on :8123
open http://localhost:8123
```

## Rules

- Two moves per turn. A move targets any hex connected to your capital
  through your own land (6-neighbor adjacency).
- Open land is claimed for free.
- Attacking enemy land rolls a d6: capture on 3+ if you hold more land than
  the defender, 4+ if equal, 5+ if less.
- Enemy land cut off from its capital reverts to neutral.
- Capitals fall only on a 6 — and yield the victim's entire empire,
  eliminating them. Last flag standing wins.

## Optional variants (start screen)

- **Broken ground** — ~12% of the board is impassable terrain, removed in
  60°-rotation orbits so all six players face an identical map.
- **Watchtowers** — three towers, each equidistant from its two flanking
  capitals. Hold any tower for a third move per turn (capped at one extra).
- **Majority victory** — win by holding 60% of all board hexes through one
  full round, instead of total domination. Cut the leader below the line
  before their turn comes around again.

## AI personalities

Six ported from the 2005 `FlagiAI.py`, plus one new, each presented as a
ruler type:

| ruler | internal | plays like |
|---|---|---|
| Pretender | `rvalid` | claims land at whim |
| Warlord | `renemy` | wars on one rival without mercy |
| Consul | `repeace` | keeps the peace until power favors them |
| Regent | `bider` | bides their time, then turns on the weak |
| Strategos | `cutter` | severs supply lines for maximum ruin |
| Emperor | `holistic` | weighs conquest and defense alike |
| Imperator | `marshal` | new (2026): expected-value play, leader-targeting politics, watchtower awareness |

In benchmarks the Emperor still edges classic games; the Imperator leads
when variants are on.

## Simulator

Headless AI-vs-AI batch runs (the rules regression check):

```sh
node sim.js 50 [seed] [majority] [terrain] [towers]
```

## URL params

`?auto` skip start screen · `?spectate` all-AI game · `?fast` top speed ·
`?terrain` `?towers` `?win=majority` preset variants.

## Layout

- `js/hex.js` — axial hex math
- `js/game.js` — rules engine (DOM-free; shared by browser and Node)
- `js/ai.js` — AI personalities
- `js/ui.js` — SVG board, roster, dispatches log
- `sim.js` — headless batch simulator
