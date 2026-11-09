# Aziatische hoornaar – nesten Flevoland 2026

Overzichtskaart van gevonden nesten (bron: waarneming.nl, soort 8807, activiteit NEST,
Flevoland, 15-04-2026 t/m 31-12-2026). Alles draait lokaal: Node.js (geen extra packages) + SQLite.

## Starten

```bash
cd 2026
node import.js      # alleen nodig na een nieuwe dataset
node server.js
```

Open daarna http://localhost:3000

## Bestanden

| Bestand | Doel |
|---|---|
| `data/waarneming_nl_flevoland.txt` | Ruwe gegevens (id, datum, plaats, validatie, GPS-coördinaat, nauwkeurigheid). Het derde veld is leeg: waarnemers worden niet opgeslagen |
| `data/flevoland.db` | SQLite-database ("lightdb"), tabel `waarnemingen` |
| `import.js` | Leest de txt in de database. Het veld `geruimd` blijft behouden bij opnieuw importeren |
| `server.js` | Webserver + API (`GET /api/waarnemingen`, `PATCH /api/waarnemingen/:id`) |
| `public/index.html` | Kaart (Leaflet + OpenStreetMap) en tabel |
| `haal-op-browser.js` | Plakken in de browser-console om de lijst te verversen |

## Velden in de database

- `id` – waarneming.nl-id (bv. 426839767)
- `bron` – altijd `waarneming.nl` (voor een eventuele tweede bron later)
- `datum`, `locatie`, `validatie`, `nauwkeurigheid` (waarnemers worden bewust niet opgeslagen)
- `lat`, `lon` – WGS84 (uit de GPS-regel van de waarneming)
- `geruimd` – `ja` (standaard) / `onbereikbaar` / `te laat`
- `geruimd_gewijzigd`, `geimporteerd` – tijdstempels

## Kleuren en filters

- Groen = geruimd **ja**, rood = **onbereikbaar**, oranje = **te laat**
- De checkboxes boven de kaart filteren zowel de kaart als de tabel.
- De tabel is sorteerbaar (klik op de kolomkop) en filterbaar op datum en plaats.
- Geruimd wijzigen: via de keuzelijst in de tabel; wordt direct opgeslagen in de database.

## Bijwerken met nieuwe waarnemingen

Waarneming.nl beschermt de pagina's tegen geautomatiseerd ophalen, dus het script
kan niet met gewone `curl` werken. Werkwijze:

1. Open de overzichtspagina van waarneming.nl met de filters.
2. Plak `haal-op-browser.js` in de console (F12). De uitvoer staat daarna op het klembord.
3. Plak die tekst in `data/waarneming_nl_flevoland.txt` (vervang de inhoud).
4. Draai `node import.js`. Bestaande `geruimd`-waarden blijven staan.
