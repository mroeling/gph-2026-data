// Kruis-check: database-meldingen die NIET in het sheet "Ruimingen TF" voorkomen (dus niet gekoppeld), met bronlink.
// Gebruik: node kruischeck.js  -> schrijft data/kruischeck_niet_in_sheet.csv
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, 'data', 'flevoland.db'));
const gematcht = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'gematcht.json'), 'utf8')));
const alle = db.prepare('SELECT bron, id, datum, locatie, validatie, status, geruimd, lat, lon FROM waarnemingen ORDER BY bron, datum').all();
const niet = alle.filter((r) => !gematcht.has(r.bron + ':' + r.id));
const link = (r) => r.bron === 'waarneming.nl' ? `https://waarneming.nl/observation/${r.id}/`
  : r.bron === 'meldpunt' && r.id.includes('-') ? `https://www.meldpuntaziatischehoornaar.nl/kaart?melding=${r.id}`
  : r.bron === 'meldpunt' ? 'https://www.meldpuntaziatischehoornaar.nl/kaart (CSV-export, geen directe link)'
  : '(handmatig, geen link)';
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const regels = ['bron;id;datum;locatie;status;geruimd;lat;lon;link', ...niet.map((r) => [r.bron, r.id, r.datum, q(r.locatie), q(r.status || r.validatie), r.geruimd, r.lat, r.lon, q(link(r))].join(';'))];
fs.writeFileSync(path.join(__dirname, 'data', 'kruischeck_niet_in_sheet.csv'), '﻿' + regels.join('\n'));
const per = {}; niet.forEach((r) => { per[r.bron] = (per[r.bron] || 0) + 1; });
console.log(`Niet in sheet: ${niet.length} van ${alle.length}. Per bron: ${JSON.stringify(per)}`);
db.close();
