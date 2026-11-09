// Importeert waarnemingen in de lokale SQLite-database (data/flevoland.db).
// Gebruik: node import.js                 (importeert beide standaardbestanden)
//          node import.js bestand.txt|.csv  (één bestand)
//
// Ondersteunde bronnen:
//  - waarneming.nl: pipe-gescheiden .txt (zie data/waarneming_nl_flevoland.txt)
//  - meldpunt:      puntkomma-gescheiden .csv-export van meldpuntaziatischehoornaar.nl
// Bestaande rijen worden bijgewerkt, maar het veld "geruimd" blijft behouden.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = __dirname;
const dataDir = path.join(root, 'data');
const dbFile = path.join(dataDir, 'flevoland.db');
const STANDAARD = [
  path.join(dataDir, 'waarneming_nl_flevoland.txt'),
  path.join(dataDir, 'waarneming_nl_extra.txt'),
  path.join(root, 'hoornaar-export_flevoland_2026-01-01_2026-11-08.csv'),
];
const GERUIMD = ['ja', 'onbereikbaar', 'te laat'];

const db = new DatabaseSync(dbFile);

// Schema (primaire sleutel = bron + id, zodat meldpunt- en waarneming.nl-id's naast elkaar kunnen)
const SCHEMA = `
  CREATE TABLE waarnemingen (
    bron              TEXT NOT NULL,
    id                TEXT NOT NULL,
    datum             TEXT NOT NULL,
    locatie           TEXT,
    validatie         TEXT,
    status            TEXT,
    type              TEXT,
    lat               REAL NOT NULL,
    lon               REAL NOT NULL,
    nauwkeurigheid    TEXT,
    geruimd           TEXT NOT NULL DEFAULT 'ja' CHECK (geruimd IN ('ja', 'onbereikbaar', 'te laat')),
    geruimd_gewijzigd TEXT,
    geimporteerd      TEXT NOT NULL,
    PRIMARY KEY (bron, id)
  )`;

const bestaand = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='waarnemingen'`).get();
if (!bestaand) {
  db.exec(SCHEMA);
} else {
  const kolommen = db.prepare('PRAGMA table_info(waarnemingen)').all().map((k) => k.name);
  if (!kolommen.includes('status')) {
    // Migratie van het oude schema (alleen waarneming.nl, id als enige sleutel)
    console.log('Database migreren naar bron + id als sleutel…');
    db.exec('BEGIN');
    db.exec(SCHEMA.replace('CREATE TABLE waarnemingen', 'CREATE TABLE waarnemingen_nieuw'));
    db.exec(`
      INSERT INTO waarnemingen_nieuw (bron, id, datum, locatie, validatie, lat, lon, nauwkeurigheid,
                                      geruimd, geruimd_gewijzigd, geimporteerd)
      SELECT bron, id, datum, locatie, validatie, lat, lon, nauwkeurigheid,
             geruimd, geruimd_gewijzigd, geimporteerd FROM waarnemingen`);
    db.exec('DROP TABLE waarnemingen');
    db.exec('ALTER TABLE waarnemingen_nieuw RENAME TO waarnemingen');
    db.exec('COMMIT');
  }
}

const upsert = db.prepare(`
  INSERT INTO waarnemingen (bron, id, datum, locatie, validatie, status, type, lat, lon, nauwkeurigheid, geruimd, geimporteerd)
  VALUES (@bron, @id, @datum, @locatie, @validatie, @status, @type, @lat, @lon, @nauwkeurigheid, 'ja', @geimporteerd)
  ON CONFLICT(bron, id) DO UPDATE SET
    datum = excluded.datum,
    locatie = CASE WHEN waarnemingen.bron = 'meldpunt' THEN waarnemingen.locatie ELSE excluded.locatie END,
    validatie = excluded.validatie, status = excluded.status, type = excluded.type,
    lat = excluded.lat, lon = excluded.lon, nauwkeurigheid = excluded.nauwkeurigheid,
    geimporteerd = excluded.geimporteerd
    -- geruimd wordt bewust NIET overschreven
`);

const nu = new Date().toISOString();
const fouten = [];
let ok = 0;

function geldig(id, lat, lon) {
  return /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27})$/i.test(id) && lat > 50.7 && lat < 53.6 && lon > 3.3 && lon < 7.3;
}

// Pipe-formaat (waarneming.nl): id|datum|(leeg)|locatie|validatie|lat|lon|nauwkeurigheid
// Het derde veld (waarnemer) is leeg: namen worden niet opgeslagen.
function leesWaarnemingNl(regels) {
  const rijen = [];
  for (const [i, raw] of regels.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [id, datum, , locatie, validatie, lat, lon, nauwkeurigheid] = line.split('|');
    if (!geldig(id, Number(lat), Number(lon))) { fouten.push(`regel ${i + 1}: ongeldige id/coördinaat (${id})`); continue; }
    rijen.push({ bron: 'waarneming.nl', id, datum, locatie, validatie, status: null, type: 'Nest',
      lat: Number(lat), lon: Number(lon), nauwkeurigheid: nauwkeurigheid || null, geimporteerd: nu });
  }
  return rijen;
}

// Datum als "d-m-yyyy" (meldpunt) naar "yyyy-mm-dd" zodat sorteren en filteren kloppen
function naarIso(datum) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(datum);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : datum;
}

// Meldpunt-export (puntkomma, komma als decimaalteken, UTF-8 met BOM)
const UUID_VAN = fs.existsSync(path.join(dataDir, 'meldingsnummer_uuid.json'))
  ? JSON.parse(fs.readFileSync(path.join(dataDir, 'meldingsnummer_uuid.json'), 'utf8'))
  : {};
function leesMeldpunt(regels) {
  const tekst = regels.join('\n').replace(/^﻿/, '');
  const [kop, ...data] = tekst.split('\n').filter((l) => l.trim());
  const kolom = Object.fromEntries(kop.split(';').map((k, i) => [k.trim(), i]));
  const rijen = [];
  for (const [i, line] of data.entries()) {
    const v = line.split(';');
    const get = (naam) => (v[kolom[naam]] ?? '').trim();
    // Meldingsnummer -> uuid (data/meldingsnummer_uuid.json), zodat CSV- en API-meldingen niet dubbel komen
    const id = UUID_VAN[get('Meldingsnummer')] || get('Meldingsnummer');
    const lat = Number(get('Breedtegraad').replace(',', '.'));
    const lon = Number(get('Lengtegraad').replace(',', '.'));
    if (!geldig(id, lat, lon)) { fouten.push(`meldpunt-regel ${i + 2}: ongeldige id/coördinaat (${id})`); continue; }
    rijen.push({
      bron: 'meldpunt', id, datum: naarIso(get('Datum waargenomen')),
      locatie: get('Gemeente'), validatie: null, status: get('Status'), type: get('Type') || 'Nest',
      lat, lon, nauwkeurigheid: null, geimporteerd: nu,
    });
  }
  return rijen;
}

const bestanden = process.argv.length > 2 ? process.argv.slice(2) : STANDAARD;
db.exec('BEGIN');
for (const bestand of bestanden) {
  if (!fs.existsSync(bestand)) { fouten.push(`bestand niet gevonden: ${bestand}`); continue; }
  const regels = fs.readFileSync(bestand, 'utf8').split(/\r?\n/);
  const rijen = bestand.toLowerCase().endsWith('.csv') ? leesMeldpunt(regels) : leesWaarnemingNl(regels);
  for (const r of rijen) { upsert.run(r); ok++; }
  console.log(`${path.basename(bestand)}: ${rijen.length} rijen verwerkt.`);
}
db.exec('COMMIT');

const per = db.prepare('SELECT bron, COUNT(*) AS n FROM waarnemingen GROUP BY bron').all();
console.log(`Totaal verwerkt: ${ok}. In database: ${per.map((p) => `${p.bron}=${p.n}`).join(', ')}.`);
if (fouten.length) console.log('Overgeslagen/fouten:\n  ' + fouten.join('\n  '));
db.close();
