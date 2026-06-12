// Hand-authored scenario maps. Maps are drawn in odd-r offset rows and
// parsed to axial keys.
//
// Legend: '#' land · capital letters = capitals · 'T' = watchtower site
// (used only when towers are enabled) · digits 1-6 = ferry endpoints (land
// cells; each digit appears exactly twice and links its two cells across
// the sea for movement AND capital connectivity).

import { key } from './hex.js';

const ISLES_MAP = [
  //   1111111111222222
  //01234567890123456789012345
  '                ###       ', // Caithness — northern tip of Scotland
  '               ####       ',
  '              #####       ',
  '             ######       ', // the Highlands
  '             ######       ',
  '              #####       ',
  '              ###E#       ', // central belt — Edinburgh on the east coast
  '        ##     ####       ', // Antrim · the borders
  '      ###2   2####        ', // Belfast (2) — North Channel — Stranraer (2)
  '     #####     ###        ',
  '     ####D     ####       ', // Dublin on the Irish Sea
  '     #T###1    #Y##       ', // tower: Athlone · Dún Laoghaire (1) · York
  '     #####    1#####      ', // Holyhead (1) on Anglesey, Wales
  '      ##3     ########    ', // Rosslare (3) · the Midlands
  '             ####T#####   ', // tower: the Midlands · East Anglia
  '             ####L####    ', // London
  '          6####5##4       ', // Penzance (6) · Portsmouth (5) · Dover (4)
  '                          ', // the Channel
  '                    4###  ', // Calais (4)
  '                5   ##### ', // Cherbourg (5) on the Cotentin · Picardy
  '       3####6  #########  ', // Roscoff (3) · St-Malo (6) · Normandy
  '     ###R#####T#####P###  ', // Brittany · Rennes · tower: Le Mans · Paris
  '      ######  ########    ', // the Loire · Île-de-France
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
