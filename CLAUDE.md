# Aziatische hoornaar – nesten Flevoland 2026

Lokale Node.js-app (geen npm-packages) met SQLite (`node:sqlite`) en een kaart (Leaflet + OpenStreetMap).
Online: https://mroeling.github.io/gph-2026-data/ (alleen-lezen, via `public/data.json`).

## Structuur

- `data/flevoland.db` – SQLite-database. **Niet in git** (`.gitignore`). Bouwt op uit de bronbestanden + losse meldingen.
- `data/waarneming_nl_flevoland.txt`, `data/waarneming_nl_extra.txt` – waarneming.nl-rijen (pipe-gescheiden, derde veld leeg).
- `hoornaar-export_*.csv` – meldpunt-export (puntkomma).
- `data/meldingsnummer_uuid.json` – koppeling CSV-meldingsnummer → uuid (meldpunt).
- `data/extra_meldingen.txt` – losse meldingen (meldpunt of handmatig), ingelezen door `import-extra.js`.
- `data/meldpunt_adressen*.json`, `data/meldpunt_locaties.json` – **lokale** adressen en gemelde locatie-tekst. Niet in git.
- `public/index.html` – kaart en tabel (werkt met server én met `data.json`).
- `public/data.json` – export voor online. Gemaakt door `export-json.js`.
- `server.js` – lokale server op 127.0.0.1:3000 (API + PATCH voor "geruimd").
- `import.js`, `import-extra.js`, `import-meldpunt-api.js`, `voeg-handmatig-toe.js` – importscripts.

## Regels

- **Geruimd-status**: `ja` / `onbereikbaar` / `te laat`. Nieuwe invoer krijgt standaard `te laat`. Bestaande waarden nooit overschrijven zonder dat de gebruiker het vraagt.
- **Kleuren**: groen = ja, rood = onbereikbaar, oranje = te laat.
- **Coördinaat is leidend** boven het adres. Een door de gebruiker opgegeven coördinaat gaat voor.
- **Privacy**:
  - Waarnemernamen worden niet opgeslagen.
  - Exacte adressen en de vrije tekst van het meldpunt (`locationDescription`) blijven lokaal.
  - In `data.json` staat alleen straat (zonder huisnummer, met een tweedelig wijknummer zoals "Archipel 37") plus plaats, of alleen de gemeente.
  - Geen e-mail, telefoon of namen van melders in een bestand dat in git komt.
- **Dubbelen**: een CSV-melding en een uuid-record van dezelfde melding worden samengevoegd. Het uuid is de id; de CSV-coördinaat en -status blijven leidend.
- **Nest-controle**: waarneming.nl-meldingen met activiteit "ter plaatse" zijn geen nest. Alleen na bevestiging van de gebruiker toevoegen.
- **Git**: alleen committen en pushen als de gebruiker dat vraagt. Commit-berichten eindigen met de `Co-Authored-By`-regel.

## Veelgebruikte commando's

```bash
node import.js              # bronbestanden inlezen (geruimd blijft behouden)
node import-extra.js        # data/extra_meldingen.txt inlezen
node export-json.js         # public/data.json maken voor online
node server.js              # lokale kaart op http://localhost:3000
```

Na elke wijziging in de data: `node export-json.js`, dan commit en push. GitHub Pages publiceert automatisch (`.github/workflows/pages.yml`).

Zie `SKILLS.md` voor de stappen per bron.
