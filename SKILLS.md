# Skills – stappen voor veelvoorkomende taken

Deze stappen zijn bedoeld voor Claude Code (en voor de gebruiker zelf). Zie `CLAUDE.md` voor de regels.

## 1. Nieuwe waarneming.nl-melding toevoegen

Input: URL `https://waarneming.nl/observation/<id>/`, eventueel met een extra coördinaat of locatie.

1. Open de pagina in de browser (Claude Browser). waarneming.nl gebruikt Anubis: `curl` werkt niet.
2. Lees: datum, locatie, GPS, nauwkeurigheid, validatie (`Goedgekeurd (x)` → `x`) en **activiteit**.
3. **Activiteit moet `nest` zijn.** Bij "ter plaatse" of iets anders: vragen aan de gebruiker, niet toevoegen.
4. Controleer op dubbelen: zoek binnen ~5 m met dezelfde datum (`SELECT … WHERE ABS(lat-?)<0.00005`). Bij twijfel vragen.
5. Voeg een regel toe aan `data/waarneming_nl_flevoland.txt`:
   `id|datum|(leeg)|locatie|validatie|lat|lon|nauwkeurigheid`
6. `node import.js`.
7. Zet de status als de gebruiker die noemt (default is `te laat`), bijvoorbeeld met een UPDATE op `geruimd`.
8. `node export-json.js`.

Verwijderen: regel uit de `.txt` halen **én** rij uit de database verwijderen, anders komt hij bij de volgende import terug.

## 2. Nieuwe meldpunt-melding toevoegen (uuid)

Input: `https://www.meldpuntaziatischehoornaar.nl/kaart?melding=<uuid>`, eventueel met coördinaat en adres van de gebruiker.

1. Haal het rapport op via de publieke API: `https://www.meldpuntaziatischehoornaar.nl/api/reports/<uuid>`.
   - Bevat `latitude`, `longitude` (vaak **benaderd**: `locationObfuscated: true`), `spottedAt`, `status`, `municipality`.
2. Exact adres en exacte coördinaat zijn alleen zichtbaar **na inloggen**. Vraag de gebruiker om in te loggen in de Browser-pane, daarna in de pagina: `fetch('/api/reports/<uuid>', {credentials:'include'})` met `addressFormatted`, `addressStreet`, `addressCity`.
   - Zonder adres: de gebruiker geeft de coördinaat, of de benaderde coördinaat wordt gebruikt (na bevestiging).
3. Zet het adres in `data/meldpunt_adressen.json` (uuid → adres). Het huisnummer blijft daar. De export maakt er straat + plaats van.
4. Voeg een regel toe aan `data/extra_meldingen.txt`:
   `meldpunt|<uuid>|<datum>|<locatie>|<status>|<lat>|<lon>|te laat`
   (status: `removed` → `Weggehaald`, `pending` → `Wachtend op validatie`, `rejected` → `Afgekeurd voor verwijdering`)
5. `node import-extra.js`, daarna `node export-json.js`.

Lookup van een CSV-meldingsnummer (zoals `70723`) naar uuid: `https://www.meldpuntaziatischehoornaar.nl/api/reports/<nummer>` → veld `id`. Staat in `data/meldingsnummer_uuid.json`.

## 3. Adres of locatie van een bestaande melding bijwerken

- Adres (meldpunt uuid): `data/meldpunt_adressen.json` aanpassen, en de regel in `data/extra_meldingen.txt`. Daarna `import-extra.js` en `export-json.js`.
- Locatie (waarneming.nl): de tekst in `data/waarneming_nl_flevoland.txt` aanpassen (veld 4). Daarna `import.js`.

## 4. Datum of status wijzigen

- Datum van een handmatige melding (`handmatig`, id `N<n>`): regel in `data/extra_meldingen.txt` aanpassen, `import-extra.js`.
- Status (`geruimd`) wijzigen de gebruikers meestal in de kaart zelf (lokale server, PATCH). Dat wordt alleen in de database opgeslagen. Vóór een publicatie: `export-json.js`.

## 5. Publiceren naar GitHub Pages

1. `node export-json.js`
2. `git add -A`, `git commit` (met `Co-Authored-By`-regel), `git pull --rebase origin main`, `git push origin main`
3. Wacht op de Pages-run: `gh run list --repo mroeling/gph-2026-data --limit 1`
4. Controle: `curl https://mroeling.github.io/gph-2026-data/data.json`

Commit en push alleen als de gebruiker dat vraagt.

## 6. Lokale server

- Starten: `node server.js` (achtergrond, poort 3000)
- Testen: `curl http://127.0.0.1:3000/api/waarnemingen`
- Stoppen: het proces dat op poort 3000 luistert.

## 7. Controle na elke wijziging

- Aantal per bron: `SELECT bron, COUNT(*) FROM waarnemingen GROUP BY bron`
- Geen namen of volledige adressen in `public/data.json`: zoek op huisnummers en op "Geen adres".
- Alle meldpunt-id's zijn uuid's (geen numerieke meldingsnummers meer): `SELECT COUNT(*) FROM waarnemingen WHERE bron='meldpunt' AND id NOT LIKE '%-%'` moet 0 zijn.
