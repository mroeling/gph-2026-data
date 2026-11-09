// Voegt meldpunt-meldingen toe die via een link in het sheet zijn gevonden, maar niet in de CSV-export zitten.
// Bron: data/meldpunt_uuids.json (opgehaald met fetch-meldpunt-uuids.js; alleen coördinaat, datum en status).
// Een melding wordt overgeslagen als er al een meldpunt-melding binnen 25 m en op dezelfde datum is.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'data', 'flevoland.db'));
const api = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'meldpunt_uuids.json'), 'utf8'));
const STATUS = { removed: 'Weggehaald', pending: 'Wachtend op validatie', rejected: 'Afgekeurd voor verwijdering' };
const bestaand = db.prepare("SELECT id, datum, lat, lon FROM waarnemingen WHERE bron = 'meldpunt'").all();
const afstandM = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180));
const insert = db.prepare(`INSERT INTO waarnemingen (bron, id, datum, locatie, validatie, status, type, lat, lon, nauwkeurigheid, geruimd, geimporteerd)
  VALUES ('meldpunt', ?, ?, ?, NULL, ?, 'Nest', ?, ?, NULL, 'ja', ?) ON CONFLICT(bron, id) DO NOTHING`);
const nu = new Date().toISOString();
let toegevoegd = 0, dubbel = 0;
db.exec('BEGIN');
for (const [uuid, a] of Object.entries(api)) {
  if (!a.lat) continue;
  const datum = (a.spottedAt || '').slice(0, 10);
  const dup = bestaand.find((b) => b.datum === datum && afstandM(a, b) <= 25);
  if (dup) { dubbel++; continue; }
  insert.run(uuid, datum, a.gemeente || null, STATUS[a.status] || `API: ${a.status}`, a.lat, a.lon, nu);
  bestaand.push({ id: uuid, datum, lat: a.lat, lon: a.lon });
  toegevoegd++;
}
db.exec('COMMIT');
console.log(`Meldpunt-API: ${toegevoegd} toegevoegd, ${dubbel} al aanwezig in de database.`);
db.close();
