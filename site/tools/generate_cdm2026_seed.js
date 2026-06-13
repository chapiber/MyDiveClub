/**
 * Génère site/apps/cdm2026/data/cdm2026.json — usage one-shot / skill update.
 * Sources : matchcalendar.football, fwctimes.com (CEST), franceinfo (TV).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TEAMS = {
  MEX: { name: 'Mexique', flagIso: 'mx', group: 'A' },
  KOR: { name: 'Corée du Sud', flagIso: 'kr', group: 'A' },
  RSA: { name: 'Afrique du Sud', flagIso: 'za', group: 'A' },
  CZE: { name: 'République tchèque', flagIso: 'cz', group: 'A' },
  CAN: { name: 'Canada', flagIso: 'ca', group: 'B' },
  BIH: { name: 'Bosnie-Herzégovine', flagIso: 'ba', group: 'B' },
  SUI: { name: 'Suisse', flagIso: 'ch', group: 'B' },
  QAT: { name: 'Qatar', flagIso: 'qa', group: 'B' },
  BRA: { name: 'Brésil', flagIso: 'br', group: 'C' },
  MAR: { name: 'Maroc', flagIso: 'ma', group: 'C' },
  SCO: { name: 'Écosse', flagIso: 'gb-sct', group: 'C' },
  HTI: { name: 'Haïti', flagIso: 'ht', group: 'C' },
  USA: { name: 'États-Unis', flagIso: 'us', group: 'D' },
  AUS: { name: 'Australie', flagIso: 'au', group: 'D' },
  PAR: { name: 'Paraguay', flagIso: 'py', group: 'D' },
  TUR: { name: 'Turquie', flagIso: 'tr', group: 'D' },
  GER: { name: 'Allemagne', flagIso: 'de', group: 'E' },
  ECU: { name: 'Équateur', flagIso: 'ec', group: 'E' },
  CIV: { name: "Côte d'Ivoire", flagIso: 'ci', group: 'E' },
  CUW: { name: 'Curaçao', flagIso: 'cw', group: 'E' },
  NED: { name: 'Pays-Bas', flagIso: 'nl', group: 'F' },
  JPN: { name: 'Japon', flagIso: 'jp', group: 'F' },
  TUN: { name: 'Tunisie', flagIso: 'tn', group: 'F' },
  SWE: { name: 'Suède', flagIso: 'se', group: 'F' },
  BEL: { name: 'Belgique', flagIso: 'be', group: 'G' },
  IRN: { name: 'Iran', flagIso: 'ir', group: 'G' },
  EGY: { name: 'Égypte', flagIso: 'eg', group: 'G' },
  NZL: { name: 'Nouvelle-Zélande', flagIso: 'nz', group: 'G' },
  ESP: { name: 'Espagne', flagIso: 'es', group: 'H' },
  URU: { name: 'Uruguay', flagIso: 'uy', group: 'H' },
  KSA: { name: 'Arabie saoudite', flagIso: 'sa', group: 'H' },
  CPV: { name: 'Cap-Vert', flagIso: 'cv', group: 'H' },
  FRA: { name: 'France', flagIso: 'fr', group: 'I' },
  SEN: { name: 'Sénégal', flagIso: 'sn', group: 'I' },
  NOR: { name: 'Norvège', flagIso: 'no', group: 'I' },
  IRQ: { name: 'Irak', flagIso: 'iq', group: 'I' },
  ARG: { name: 'Argentine', flagIso: 'ar', group: 'J' },
  AUT: { name: 'Autriche', flagIso: 'at', group: 'J' },
  ALG: { name: 'Algérie', flagIso: 'dz', group: 'J' },
  JOR: { name: 'Jordanie', flagIso: 'jo', group: 'J' },
  POR: { name: 'Portugal', flagIso: 'pt', group: 'K' },
  COL: { name: 'Colombie', flagIso: 'co', group: 'K' },
  UZB: { name: 'Ouzbékistan', flagIso: 'uz', group: 'K' },
  COD: { name: 'RD Congo', flagIso: 'cd', group: 'K' },
  ENG: { name: 'Angleterre', flagIso: 'gb-eng', group: 'L' },
  CRO: { name: 'Croatie', flagIso: 'hr', group: 'L' },
  PAN: { name: 'Panama', flagIso: 'pa', group: 'L' },
  GHA: { name: 'Ghana', flagIso: 'gh', group: 'L' },
};

const GROUPS = {
  A: ['MEX', 'KOR', 'RSA', 'CZE'],
  B: ['CAN', 'BIH', 'SUI', 'QAT'],
  C: ['BRA', 'MAR', 'SCO', 'HTI'],
  D: ['USA', 'PAR', 'AUS', 'TUR'],
  E: ['GER', 'ECU', 'CIV', 'CUW'],
  F: ['NED', 'JPN', 'SWE', 'TUN'],
  G: ['BEL', 'IRN', 'EGY', 'NZL'],
  H: ['ESP', 'URU', 'KSA', 'CPV'],
  I: ['FRA', 'SEN', 'NOR', 'IRQ'],
  J: ['ARG', 'AUT', 'ALG', 'JOR'],
  K: ['POR', 'COL', 'UZB', 'COD'],
  L: ['ENG', 'CRO', 'PAN', 'GHA'],
};

/** [id, stage, group|null, home, away, paris ISO, venue, city, label?, score?] */
const FIXTURES = [
  ['M001', 'group', 'A', 'MEX', 'RSA', '2026-06-11T21:00:00+02:00', 'Estadio Azteca', 'Mexico City', null, { home: 2, away: 0, status: 'finished' }],
  ['M002', 'group', 'A', 'KOR', 'CZE', '2026-06-12T04:00:00+02:00', 'Estadio Akron', 'Guadalajara', null, { home: 2, away: 1, status: 'finished' }],
  ['M003', 'group', 'B', 'CAN', 'BIH', '2026-06-12T21:00:00+02:00', 'BMO Field', 'Toronto', null, { home: 1, away: 1, status: 'finished' }],
  ['M004', 'group', 'D', 'USA', 'PAR', '2026-06-13T03:00:00+02:00', 'SoFi Stadium', 'Los Angeles', null, { home: 4, away: 1, status: 'finished' }],
  ['M005', 'group', 'C', 'HTI', 'SCO', '2026-06-14T03:00:00+02:00', 'Gillette Stadium', 'Boston'],
  ['M006', 'group', 'D', 'AUS', 'TUR', '2026-06-14T06:00:00+02:00', 'BC Place', 'Vancouver'],
  ['M007', 'group', 'C', 'BRA', 'MAR', '2026-06-14T00:00:00+02:00', 'MetLife Stadium', 'New York'],
  ['M008', 'group', 'B', 'QAT', 'SUI', '2026-06-13T21:00:00+02:00', "Levi's Stadium", 'San Francisco'],
  ['M009', 'group', 'E', 'CIV', 'ECU', '2026-06-15T01:00:00+02:00', 'Lincoln Financial Field', 'Philadelphia'],
  ['M010', 'group', 'E', 'GER', 'CUW', '2026-06-14T19:00:00+02:00', 'NRG Stadium', 'Houston'],
  ['M011', 'group', 'F', 'NED', 'JPN', '2026-06-14T22:00:00+02:00', 'AT&T Stadium', 'Dallas'],
  ['M012', 'group', 'F', 'SWE', 'TUN', '2026-06-15T04:00:00+02:00', 'Estadio BBVA', 'Monterrey'],
  ['M013', 'group', 'H', 'KSA', 'URU', '2026-06-16T00:00:00+02:00', 'Hard Rock Stadium', 'Miami'],
  ['M014', 'group', 'H', 'ESP', 'CPV', '2026-06-15T18:00:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta'],
  ['M015', 'group', 'G', 'IRN', 'NZL', '2026-06-16T03:00:00+02:00', 'SoFi Stadium', 'Los Angeles'],
  ['M016', 'group', 'G', 'BEL', 'EGY', '2026-06-15T21:00:00+02:00', 'Lumen Field', 'Seattle'],
  ['M017', 'group', 'I', 'FRA', 'SEN', '2026-06-16T21:00:00+02:00', 'MetLife Stadium', 'New York'],
  ['M018', 'group', 'I', 'IRQ', 'NOR', '2026-06-17T00:00:00+02:00', 'Gillette Stadium', 'Boston'],
  ['M019', 'group', 'J', 'ARG', 'ALG', '2026-06-17T03:00:00+02:00', 'Arrowhead Stadium', 'Kansas City'],
  ['M020', 'group', 'J', 'AUT', 'JOR', '2026-06-17T06:00:00+02:00', "Levi's Stadium", 'San Francisco'],
  ['M021', 'group', 'L', 'GHA', 'PAN', '2026-06-18T01:00:00+02:00', 'BMO Field', 'Toronto'],
  ['M022', 'group', 'L', 'ENG', 'CRO', '2026-06-17T22:00:00+02:00', 'AT&T Stadium', 'Dallas'],
  ['M023', 'group', 'K', 'POR', 'COD', '2026-06-17T19:00:00+02:00', 'NRG Stadium', 'Houston'],
  ['M024', 'group', 'K', 'UZB', 'COL', '2026-06-18T04:00:00+02:00', 'Estadio Azteca', 'Mexico City'],
  ['M025', 'group', 'A', 'CZE', 'RSA', '2026-06-18T18:00:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta'],
  ['M026', 'group', 'B', 'SUI', 'BIH', '2026-06-18T21:00:00+02:00', 'SoFi Stadium', 'Los Angeles'],
  ['M027', 'group', 'B', 'CAN', 'QAT', '2026-06-19T00:00:00+02:00', 'BC Place', 'Vancouver'],
  ['M028', 'group', 'A', 'MEX', 'KOR', '2026-06-19T03:00:00+02:00', 'Estadio Akron', 'Guadalajara'],
  ['M029', 'group', 'C', 'BRA', 'HTI', '2026-06-20T02:30:00+02:00', 'Lincoln Financial Field', 'Philadelphia'],
  ['M030', 'group', 'C', 'SCO', 'MAR', '2026-06-20T00:00:00+02:00', 'Gillette Stadium', 'Boston'],
  ['M031', 'group', 'D', 'TUR', 'PAR', '2026-06-20T05:00:00+02:00', "Levi's Stadium", 'San Francisco'],
  ['M032', 'group', 'D', 'USA', 'AUS', '2026-06-19T21:00:00+02:00', 'Lumen Field', 'Seattle'],
  ['M033', 'group', 'E', 'GER', 'CIV', '2026-06-20T22:00:00+02:00', 'BMO Field', 'Toronto'],
  ['M034', 'group', 'E', 'ECU', 'CUW', '2026-06-21T02:00:00+02:00', 'Arrowhead Stadium', 'Kansas City'],
  ['M035', 'group', 'F', 'NED', 'SWE', '2026-06-20T19:00:00+02:00', 'NRG Stadium', 'Houston'],
  ['M036', 'group', 'F', 'TUN', 'JPN', '2026-06-21T06:00:00+02:00', 'Estadio BBVA', 'Monterrey'],
  ['M037', 'group', 'H', 'URU', 'CPV', '2026-06-22T00:00:00+02:00', 'Hard Rock Stadium', 'Miami'],
  ['M038', 'group', 'H', 'ESP', 'KSA', '2026-06-21T18:00:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta'],
  ['M039', 'group', 'G', 'BEL', 'IRN', '2026-06-21T21:00:00+02:00', 'SoFi Stadium', 'Los Angeles'],
  ['M040', 'group', 'G', 'NZL', 'EGY', '2026-06-22T03:00:00+02:00', 'BC Place', 'Vancouver'],
  ['M041', 'group', 'I', 'NOR', 'SEN', '2026-06-23T02:00:00+02:00', 'MetLife Stadium', 'New York'],
  ['M042', 'group', 'I', 'FRA', 'IRQ', '2026-06-22T23:00:00+02:00', 'Lincoln Financial Field', 'Philadelphia'],
  ['M043', 'group', 'J', 'ARG', 'AUT', '2026-06-22T19:00:00+02:00', 'AT&T Stadium', 'Dallas'],
  ['M044', 'group', 'J', 'JOR', 'ALG', '2026-06-23T05:00:00+02:00', "Levi's Stadium", 'San Francisco'],
  ['M045', 'group', 'L', 'ENG', 'GHA', '2026-06-23T22:00:00+02:00', 'Gillette Stadium', 'Boston'],
  ['M046', 'group', 'L', 'PAN', 'CRO', '2026-06-24T01:00:00+02:00', 'BMO Field', 'Toronto'],
  ['M047', 'group', 'K', 'POR', 'UZB', '2026-06-23T19:00:00+02:00', 'NRG Stadium', 'Houston'],
  ['M048', 'group', 'K', 'COL', 'COD', '2026-06-24T04:00:00+02:00', 'Estadio Akron', 'Guadalajara'],
  ['M049', 'group', 'C', 'SCO', 'BRA', '2026-06-25T00:00:00+02:00', 'Hard Rock Stadium', 'Miami'],
  ['M050', 'group', 'C', 'MAR', 'HTI', '2026-06-25T00:00:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta'],
  ['M051', 'group', 'B', 'SUI', 'CAN', '2026-06-24T21:00:00+02:00', 'BC Place', 'Vancouver'],
  ['M052', 'group', 'B', 'BIH', 'QAT', '2026-06-24T21:00:00+02:00', 'Lumen Field', 'Seattle'],
  ['M053', 'group', 'A', 'CZE', 'MEX', '2026-06-25T03:00:00+02:00', 'Estadio Azteca', 'Mexico City'],
  ['M054', 'group', 'A', 'RSA', 'KOR', '2026-06-25T03:00:00+02:00', 'Estadio BBVA', 'Monterrey'],
  ['M055', 'group', 'E', 'CUW', 'CIV', '2026-06-25T22:00:00+02:00', 'Lincoln Financial Field', 'Philadelphia'],
  ['M056', 'group', 'E', 'ECU', 'GER', '2026-06-25T22:00:00+02:00', 'MetLife Stadium', 'New York'],
  ['M057', 'group', 'F', 'JPN', 'SWE', '2026-06-26T01:00:00+02:00', 'AT&T Stadium', 'Dallas'],
  ['M058', 'group', 'F', 'TUN', 'NED', '2026-06-26T01:00:00+02:00', 'Arrowhead Stadium', 'Kansas City'],
  ['M059', 'group', 'D', 'TUR', 'USA', '2026-06-26T04:00:00+02:00', 'SoFi Stadium', 'Los Angeles'],
  ['M060', 'group', 'D', 'PAR', 'AUS', '2026-06-26T04:00:00+02:00', "Levi's Stadium", 'San Francisco'],
  ['M061', 'group', 'I', 'NOR', 'FRA', '2026-06-26T21:00:00+02:00', 'Gillette Stadium', 'Boston'],
  ['M062', 'group', 'I', 'SEN', 'IRQ', '2026-06-26T21:00:00+02:00', 'BMO Field', 'Toronto'],
  ['M063', 'group', 'G', 'EGY', 'IRN', '2026-06-27T05:00:00+02:00', 'Lumen Field', 'Seattle'],
  ['M064', 'group', 'G', 'NZL', 'BEL', '2026-06-27T05:00:00+02:00', 'BC Place', 'Vancouver'],
  ['M065', 'group', 'H', 'CPV', 'KSA', '2026-06-27T02:00:00+02:00', 'NRG Stadium', 'Houston'],
  ['M066', 'group', 'H', 'URU', 'ESP', '2026-06-27T02:00:00+02:00', 'Estadio Akron', 'Guadalajara'],
  ['M067', 'group', 'L', 'PAN', 'ENG', '2026-06-27T23:00:00+02:00', 'MetLife Stadium', 'New York'],
  ['M068', 'group', 'L', 'CRO', 'GHA', '2026-06-27T23:00:00+02:00', 'Lincoln Financial Field', 'Philadelphia'],
  ['M069', 'group', 'J', 'ALG', 'AUT', '2026-06-28T04:00:00+02:00', 'Arrowhead Stadium', 'Kansas City'],
  ['M070', 'group', 'J', 'JOR', 'ARG', '2026-06-28T04:00:00+02:00', 'AT&T Stadium', 'Dallas'],
  ['M071', 'group', 'K', 'COL', 'POR', '2026-06-28T01:30:00+02:00', 'Hard Rock Stadium', 'Miami'],
  ['M072', 'group', 'K', 'COD', 'UZB', '2026-06-28T01:30:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta'],
  ['M073', 'round32', null, null, null, '2026-06-28T21:00:00+02:00', 'SoFi Stadium', 'Los Angeles', '2e Groupe A vs 2e Groupe B'],
  ['M074', 'round32', null, null, null, '2026-06-29T22:30:00+02:00', 'Gillette Stadium', 'Boston', '1er Groupe E vs 3e (A/B/C/D/F)'],
  ['M075', 'round32', null, null, null, '2026-06-30T01:00:00+02:00', 'Estadio BBVA', 'Monterrey', '1er Groupe F vs 2e Groupe C'],
  ['M076', 'round32', null, null, null, '2026-06-29T19:00:00+02:00', 'NRG Stadium', 'Houston', '1er Groupe C vs 2e Groupe F'],
  ['M077', 'round32', null, null, null, '2026-06-30T21:00:00+02:00', 'MetLife Stadium', 'New York', '1er Groupe I vs 3e (C/D/F/G/H)'],
  ['M078', 'round32', null, null, null, '2026-06-30T19:00:00+02:00', 'AT&T Stadium', 'Dallas', '2e Groupe E vs 2e Groupe I'],
  ['M079', 'round32', null, null, null, '2026-07-01T01:00:00+02:00', 'Estadio Azteca', 'Mexico City', '1er Groupe A vs 3e (C/E/F/H/I)'],
  ['M080', 'round32', null, null, null, '2026-07-01T18:00:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta', '1er Groupe L vs 3e (E/H/I/J/K)'],
  ['M081', 'round32', null, null, null, '2026-07-02T02:00:00+02:00', "Levi's Stadium", 'San Francisco', '1er Groupe D vs 3e (B/E/F/I/J)'],
  ['M082', 'round32', null, null, null, '2026-07-01T22:00:00+02:00', 'Lumen Field', 'Seattle', '1er Groupe G vs 3e (A/E/H/I/J)'],
  ['M083', 'round32', null, null, null, '2026-07-02T23:00:00+02:00', 'BMO Field', 'Toronto', '2e Groupe K vs 2e Groupe L'],
  ['M084', 'round32', null, null, null, '2026-07-02T21:00:00+02:00', 'SoFi Stadium', 'Los Angeles', '1er Groupe H vs 2e Groupe J'],
  ['M085', 'round32', null, null, null, '2026-07-03T05:00:00+02:00', 'BC Place', 'Vancouver', '1er Groupe B vs 3e (E/F/G/I/J)'],
  ['M086', 'round32', null, null, null, '2026-07-03T22:00:00+02:00', 'Hard Rock Stadium', 'Miami', '1er Groupe J vs 2e Groupe H'],
  ['M087', 'round32', null, null, null, '2026-07-04T01:30:00+02:00', 'Arrowhead Stadium', 'Kansas City', '1er Groupe K vs 3e (D/E/I/J/L)'],
  ['M088', 'round32', null, null, null, '2026-07-03T20:00:00+02:00', 'AT&T Stadium', 'Dallas', '2e Groupe D vs 2e Groupe G'],
  ['M089', 'round16', null, null, null, '2026-07-04T23:00:00+02:00', 'Lincoln Financial Field', 'Philadelphia', 'Vainqueur M74 vs Vainqueur M77'],
  ['M090', 'round16', null, null, null, '2026-07-04T19:00:00+02:00', 'NRG Stadium', 'Houston', 'Vainqueur M73 vs Vainqueur M75'],
  ['M091', 'round16', null, null, null, '2026-07-05T22:00:00+02:00', 'MetLife Stadium', 'New York', 'Vainqueur M76 vs Vainqueur M78'],
  ['M092', 'round16', null, null, null, '2026-07-06T02:00:00+02:00', 'Estadio Azteca', 'Mexico City', 'Vainqueur M79 vs Vainqueur M80'],
  ['M093', 'round16', null, null, null, '2026-07-06T21:00:00+02:00', 'AT&T Stadium', 'Dallas', 'Vainqueur M83 vs Vainqueur M84'],
  ['M094', 'round16', null, null, null, '2026-07-07T02:00:00+02:00', 'Lumen Field', 'Seattle', 'Vainqueur M81 vs Vainqueur M82'],
  ['M095', 'round16', null, null, null, '2026-07-07T18:00:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta', 'Vainqueur M86 vs Vainqueur M88'],
  ['M096', 'round16', null, null, null, '2026-07-07T22:00:00+02:00', 'BC Place', 'Vancouver', 'Vainqueur M85 vs Vainqueur M87'],
  ['M097', 'quarter', null, null, null, '2026-07-09T22:00:00+02:00', 'Gillette Stadium', 'Boston', 'Vainqueur M89 vs Vainqueur M90'],
  ['M098', 'quarter', null, null, null, '2026-07-10T21:00:00+02:00', 'SoFi Stadium', 'Los Angeles', 'Vainqueur M93 vs Vainqueur M94'],
  ['M099', 'quarter', null, null, null, '2026-07-11T23:00:00+02:00', 'Hard Rock Stadium', 'Miami', 'Vainqueur M91 vs Vainqueur M92'],
  ['M100', 'quarter', null, null, null, '2026-07-12T03:00:00+02:00', 'Arrowhead Stadium', 'Kansas City', 'Vainqueur M95 vs Vainqueur M96'],
  ['M101', 'semi', null, null, null, '2026-07-14T21:00:00+02:00', 'AT&T Stadium', 'Dallas', 'Vainqueur M97 vs Vainqueur M98'],
  ['M102', 'semi', null, null, null, '2026-07-15T21:00:00+02:00', 'Mercedes-Benz Stadium', 'Atlanta', 'Vainqueur M99 vs Vainqueur M100'],
  ['M103', 'third', null, null, null, '2026-07-18T23:00:00+02:00', 'Hard Rock Stadium', 'Miami', 'Perdant M101 vs Perdant M102'],
  ['M104', 'final', null, null, null, '2026-07-19T21:00:00+02:00', 'MetLife Stadium', 'New York', 'Vainqueur M101 vs Vainqueur M102'],
];

/** Matchs diffusés en clair sur M6 (54 affiches — franceinfo / M6) */
const M6_MATCHES = new Set([
  'M001', 'M003', 'M007', 'M008', 'M017', 'M018', 'M022', 'M026', 'M027', 'M029', 'M032',
  'M033', 'M038', 'M042', 'M045', 'M051', 'M056', 'M061', 'M062', 'M067', 'M077', 'M089',
  'M091', 'M097', 'M099', 'M101', 'M102', 'M103', 'M104',
]);

function tvForMatch(id, home, away, stage) {
  const hasFra = home === 'FRA' || away === 'FRA';
  const onM6 = M6_MATCHES.has(id) || hasFra || ['semi', 'final', 'third'].includes(stage);
  const channels = onM6 ? ['M6', 'beIN Sports 1'] : ['beIN Sports 1'];
  return { channels, freeToAir: onM6 };
}

function computeStandings(matches) {
  const standings = {};
  for (const [gid, teams] of Object.entries(GROUPS)) {
    standings[gid] = teams.map((code) => ({
      team: code,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      pts: 0,
    }));
  }

  const byGroup = {};
  for (const m of matches) {
    if (m.stage !== 'group' || !m.group) continue;
    const sc = m.score;
    if (sc.status !== 'finished' || sc.home == null || sc.away == null) continue;
    if (!byGroup[m.group]) byGroup[m.group] = [];
    byGroup[m.group].push(m);
  }

  for (const [gid, list] of Object.entries(byGroup)) {
    const table = standings[gid];
    const idx = (code) => table.find((r) => r.team === code);
    for (const m of list) {
      const h = idx(m.home);
      const a = idx(m.away);
      if (!h || !a) continue;
      h.played++;
      a.played++;
      h.gf += m.score.home;
      h.ga += m.score.away;
      a.gf += m.score.away;
      a.ga += m.score.home;
      if (m.score.home > m.score.away) {
        h.won++;
        h.pts += 3;
        a.lost++;
      } else if (m.score.home < m.score.away) {
        a.won++;
        a.pts += 3;
        h.lost++;
      } else {
        h.drawn++;
        a.drawn++;
        h.pts++;
        a.pts++;
      }
    }
    table.sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf);
  }

  return Object.entries(GROUPS).map(([id, teams]) => ({
    id,
    teams,
    standings: standings[id],
  }));
}

const matches = FIXTURES.map((row) => {
  const [id, stage, group, home, away, kickoffParis, venue, city, label, scoreOverride] = row;
  const score = scoreOverride || { home: null, away: null, status: 'scheduled' };
  return {
    id,
    stage,
    group: group || undefined,
    home: home || undefined,
    away: away || undefined,
    label: label || undefined,
    kickoffParis,
    venue,
    city,
    tv: tvForMatch(id, home, away, stage),
    score,
  };
});

const teams = Object.entries(TEAMS).map(([code, t]) => ({
  code,
  name: t.name,
  flagIso: t.flagIso,
  group: t.group,
}));

const existing = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : null;
const updatedBy = existing?.meta?.updatedBy || 'local';

const out = {
  meta: {
    updatedAt: new Date().toISOString(),
    updatedBy,
    sources: ['matchcalendar.football', 'fwctimes.com', 'franceinfo'],
    tournament: { start: '2026-06-11', end: '2026-07-19', timezone: 'Europe/Paris' },
  },
  teams,
  groups: computeStandings(matches),
  matches,
};

const dest = path.join(__dirname, '..', 'apps', 'cdm2026', 'data', 'cdm2026.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Written', dest, '—', matches.length, 'matches');
