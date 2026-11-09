// Importeert extra meldingen uit data/extra_meldingen.txt (bron|id|datum|locatie|status|lat|lon|geruimd).
// Gebruik: node import-extra.js
// Bestaande rijen worden bijgewerkt, maar het veld "geruimd" blijft behouden.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'data', 'flevoland.db'));
const GERUIMD = ['ja', 'onbereikbaar', 'te laat'];
const upsert = db.prepare(`
  INSERT INTO waarnemingen (bron, id, datum, locatie, validatie, status, type, lat, lon, nauwkeurigheid, geruimd, geimporteerd)
  VALUES (@bron, @id, @datum, @locatie, NULL, @status, 'Nest', @lat, @lon, NULL, @geruimd, @geimporteerd)
  ON CONFLICT(bron, id) DO UPDATE SET
    datum = excluded.datum, locatie = excluded.locatie, status = excluded.status,
    lat = excluded.lat, lon = excluded.lon, geimporteerd = excluded.geimporteerd
    -- geruimd wordt bewust NIET overschreven
`);

const nu = new Date().toISOString();
let n = 0;
db.exec('BEGIN');
for (const regel of fs.readFileSync(path.join(__dirname, 'data', 'extra_meldingen.txt'), 'utf8').split(/\r?\n/)) {
  if (!regel.trim() || regel.startsWith('#')) continue;
  const [bron, id, datum, locatie, status, lat, lon, geruimd] = regel.split('|');
  if (!GERUIMD.includes(geruimd)) throw new Error(`ongeldige geruimd-waarde voor ${id}: ${geruimd}`);
  upsert.run({ bron, id, datum, locatie, status, lat: Number(lat), lon: Number(lon), geruimd, geimporteerd: nu });
  n++;
}
db.exec('COMMIT');
console.log(`${n} extra meldingen verwerkt.`);
db.close();
