// Hand-authored scenario maps. Maps are drawn in odd-r offset rows and
// parsed to axial keys.
//
// Legend: '#' land · capital letters = capitals · 'T' = watchtower site
// (used only when towers are enabled) · digits 1-6 = ferry endpoints (land
// cells; each digit appears exactly twice and links its two cells across
// the sea for movement AND capital connectivity).

import { key } from './hex.js';

const ISLES_MAP = [
  //          1111111111222
  //0123456789012345678901
  '             ####     ', // northern Scotland
  '            ######    ',
  '            ##E###    ', // Edinburgh
  '     #      #####     ',
  '   ###2    2####      ', // Belfast — Stranraer ferry (2)
  '  ##D###    ####      ', // Dublin
  '  ######    ####      ',
  '  ##T##    #####      ', // tower: central Ireland
  '   ##1    1##Y###     ', // Dublin — Holyhead ferry (1) · York
  '   #3      #######    ', // Rosslare ferry (3)
  '          #####T###   ', // tower: central England
  '          #########   ',
  '          6###L#5#4   ', // Penzance (6) · London · Portsmouth (5) · Dover (4)
  '                      ', // the Channel
  '   3#6##     5##4###  ', // Brittany (3, 6) · Le Havre (5) · Calais (4)
  '  ##R##########P###   ', // Rennes · Paris
  '   ####T#########     ', // tower: central France
  '    ####   ######     ',
];

function parseMap(rows, capitalOrder) {
  const cells = [];
  const capitals = {};
  const towers = [];
  const ferryEnds = {};
  rows.forEach((row, r) => {
    for (let col = 0; col < row.length; col++) {
      const ch = row[col];
      if (ch === ' ') continue;
      const q = col - (r - (r & 1)) / 2;
      const k = key(q, r);
      cells.push(k);
      if (ch >= '1' && ch <= '6') (ferryEnds[ch] ??= []).push(k);
      else if (ch === 'T') towers.push(k);
      else if (ch !== '#') capitals[ch] = k;
    }
  });
  return {
    cells,
    capitals: capitalOrder.map(ch => capitals[ch]),
    towers,
    links: Object.values(ferryEnds).filter(p => p.length === 2),
  };
}

export const SCENARIOS = {
  isles: {
    id: 'isles',
    name: 'The Isles',
    capitalNames: ['Dublin', 'Edinburgh', 'York', 'London', 'Rennes', 'Paris'],
    ...parseMap(ISLES_MAP, ['D', 'E', 'Y', 'L', 'R', 'P']),
  },
};
