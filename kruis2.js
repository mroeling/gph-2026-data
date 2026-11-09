// Kruis-check v2: database-meldingen die niet in het sheet staan, vergeleken met de meldingen die wel in het sheet staan.
// "In het sheet" = gekoppeld aan een sheet-regel OF genoemd in een link van het sheet.
// Per melding: dichtstbijzijnde sheet-melding (afstand en datumverschil). Schrijft data/kruischeck_v2.csv.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, 'data', 'flevoland.db'));
const gematcht = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'gematcht.json'), 'utf8')));
const alle = db.prepare('SELECT bron, id, datum, locatie, validatie, status, geruimd, lat, lon FROM waarnemingen ORDER BY bron, datum').all();
const verwezen = new Set();
for (const f of ['ruimingen_tf.txt', 'ruimingen_tf_links.txt']) {
  for (const l of fs.readFileSync(path.join(__dirname, 'data', f), 'utf8').split(/\r?\n/)) {
    if (!l || l.startsWith('#')) continue;
    for (const id of l.split(/[;|,]/)) if (/^\d{6,9}$/.test(id) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id)) verwezen.add(id);
  }
}
const inSheet = alle.filter((r) => gematcht.has(r.bron + ':' + r.id) || verwezen.has(r.id));
const niet = alle.filter((r) => !inSheet.includes(r));
const afstand = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180));
const dagen = (a, b) => Math.abs((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000);
const link = (r) => r.bron === 'waarneming.nl' ? `https://waarneming.nl/observation/${r.id}/`
  : r.bron === 'meldpunt' && r.id.includes('-') ? `https://www.meldpuntaziatischehoornaar.nl/kaart?melding=${r.id}`
  : r.bron === 'meldpunt' ? '(meldpunt-CSV, geen link)' : '(handmatig)';
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const rijen = niet.map((r) => {
  let best = null, bd = Infinity;
  for (const s of inSheet) { const d = afstand(r, s); if (d < bd) { bd = d; best = s; } }
  const cat = bd < 50 ? 'dicht bij sheet-melding (<50 m)' : bd < 500 ? 'andere plaats (50-500 m)' : 'nieuwe locatie (>500 m)';
  return { ...r, cat, bd, best, dd: best && r.datum ? dagen(r.datum, best.datum) : null, link: link(r) };
});
const kop = 'categorie;bron;id;datum;locatie;status;geruimd;lat;lon;dichtstbij sheet (bron:id);afstand m;datumverschil dagen;link';
fs.writeFileSync(path.join(__dirname, 'data', 'kruischeck_v2.csv'), '﻿' + [kop, ...rijen.map((r) => [q(r.cat), r.bron, r.id, r.datum, q(r.locatie), q(r.status || r.validatie), r.geruimd, r.lat, r.lon,
  q(r.best ? `${r.best.bron}:${r.best.id}` : ''), r.best ? Math.round(r.bd) : '', r.dd ?? '', q(r.link)].join(';'))].join('\n'));
const tel = {}; rijen.forEach((r) => { tel[r.cat] = (tel[r.cat] || 0) + 1; });
console.log(`Niet in sheet: ${niet.length}. ${JSON.stringify(tel)}`);
db.close();
