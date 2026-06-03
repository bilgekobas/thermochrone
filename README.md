# Thermochrone

**15-Minute Cities — Under the Sun**

Thermochrone is an open-source web tool that recomputes pedestrian walkability isochrones as a function of outdoor thermal stress and thermoregulatory capacity. It challenges the standard 15-minute city concept by making visible the territory that becomes inaccessible to different population groups under heat stress conditions.

→ **Live tool:** [bilgekobas.github.io/thermochrone](https://bilgekobas.github.io/thermochrone)

---

## What it does

Standard walkability analysis assumes a fixed walking speed and thermoneutral conditions. Thermochrone replaces this with a thermally-adjusted effective speed that varies with:

- **UTCI** (Universal Thermal Climate Index) — computed from live or climatological meteorological data via a full ISO 7726 outdoor radiation balance
- **Age group** — five groups with empirically-grounded thermoregulatory sensitivity multipliers
- **Acclimatisation state** — unacclimatised (AC-dependent), mixed, or acclimatised (free-running)

The result is a set of thermal isochrones that shrink under heat stress. The difference between the standard planning reference (healthy young adult, thermoneutral conditions) and the thermal isochrone is quantified as **lost territory** — area in m² and percentage.

Click anywhere in an EU city, and Thermochrone:

1. Fetches the pedestrian street network and building footprints from OpenStreetMap
2. Computes Sky View Factor at network nodes from building morphology and Copernicus tree canopy
3. Retrieves live or climatological weather + solar radiation
4. Runs the ISO 7726 MRT computation with Sentinel-3 land surface temperature when available
5. Computes UTCI via the Bröde et al. (2012) polynomial
6. Applies age-group and acclimatisation thermoregulatory penalty to effective walking speed
7. Draws alpha-shape isochrones via time-budget Dijkstra on the pedestrian graph
8. Reports lost territory, POI counts per isochrone band, and per-age-group comparisons

---

## Scientific basis

| Component | Method | Reference |
|---|---|---|
| MRT | ISO 7726 outdoor radiation balance | ISO 7726 (1998) |
| Solar geometry | Spencer (1971) equations | Spencer (1971) |
| Projected area factor | Walkenhorst & David (2002) | Walkenhorst & David (2002) |
| Sky View Factor | 36-sector horizon scan, OSM buildings + Copernicus STL | Johnson & Watson (1984) |
| Tree canopy transmittance | τ = 0.3 | Konarska et al. (2014) |
| LW sky emissivity | Brutsaert (1975) + cloud correction | Brutsaert (1975) |
| UTCI | 6th-order polynomial | Bröde et al. (2012) |
| Wind height correction | Log profile, z₀ from building density | — |
| Age penalties | Sensitivity multipliers | Kenney & Munce (2003), Havenith (2001), Cramer & Jay (2019) |
| Acclimatisation | Three-state modifier | Kobas et al. (2026, Sci. Rep.) |
| Isochrone boundary | Alpha-shape concave hull (Bowyer-Watson) | — |
| UHI correction | Building-density offset | Lauwaet et al. (2024) |

---

## Data sources

| Source | Data | Access |
|---|---|---|
| OpenStreetMap / Overpass API | Street network, buildings, trees, POIs | Free, open (ODbL) |
| Copernicus Urban Atlas STL 2018 | Street tree layer polygons | Free, EEA discomap REST |
| Open-Meteo | Live NWP forecast + ERA5-Land archive | Free (CC BY 4.0) |
| Sentinel-3 SLSTR | Land surface temperature | Free (CDSE, requires account) |
| Nominatim / OSM | Geocoding + EU coverage check | Free, open |

All data sources are freely accessible without institutional subscriptions. The tool runs entirely client-side after the initial data fetch.

---

## Climate modes

**Live** — Open-Meteo NWP forecast. Real-time conditions, hourly for next 24h. No UHI correction required (forecast models incorporate local station data).

**Typical month** — ERA5-Land 5-year monthly mean via Open-Meteo archive API. Produces a mean diurnal cycle for the selected month. Urban heat island correction applied as a building-density-dependent temperature offset calibrated against Copernicus UrbClim (Lauwaet et al., 2024):

| Building density | Daytime offset | Night offset |
|---|---|---|
| Dense urban (>50 bldgs/km²) | +3.0°C | +4.5°C |
| Medium urban (20–50) | +1.8°C | +2.8°C |
| Suburban (5–20) | +0.8°C | +1.2°C |
| Open/park (<5) | +0.2°C | +0.4°C |

---

## Limitations

- SVF computed at subsampled network nodes, not along full paths
- OSM building heights frequently missing — type-based priors applied
- STL minimum mapping unit 500 m² — isolated trees from OSM nodes as fallback
- ERA5-Land at 9 km resolution — UHI offset is a first-order correction, not microclimate modelling
- Thermoregulatory penalty function is literature-derived, not empirically calibrated to specific populations
- Lost territory estimated via point sampling (800 points/band), not exact polygon intersection

---

## Deployment

Deployed as a static site on GitHub Pages. Requires Node.js 20+.
Vite builds directly to `docs/` — no renaming step needed.

**First time:**
```bash
npm install
npm run build
git add .
git commit -m "build"
git push origin master
```

Then in your GitHub repo: **Settings → Pages → Source: Deploy from a branch → master / docs → Save.**

**Subsequent updates:**
```bash
npm run build
git add .
git commit -m "update"
git push origin master
```

### Optional: Cloudflare Worker (for Sentinel-3 LST)

The Sentinel Hub LST integration requires a CDSE OAuth client. Credentials are stored as Cloudflare Worker secrets, never in the repository.

```bash
cd worker
wrangler deploy
wrangler secret put SH_CLIENT_ID
wrangler secret put SH_CLIENT_SECRET
```

Update `WORKER_URL` in `src/lib/fetch.js` with your worker URL. The tool degrades gracefully if the worker is unavailable (falls back to modelled ground temperature).

---

## Caching

To reduce load on free public APIs:

- **OSM data** — cached in `sessionStorage` for 30 minutes per location (1km grid)
- **Copernicus STL** — in-memory cache, 60-minute TTL
- **Climate data** — in-memory: live 15-minute TTL, typical 60-minute TTL
- **Nominatim** — in-memory per-session, search results cached per query string

---

## Repository structure

```
src/
  lib/
    solar.js         Spencer (1971) solar geometry
    mrt.js           ISO 7726 MRT computation
    utci.js          Bröde et al. (2012) UTCI polynomial
    svf.js           Sky View Factor from OSM buildings + STL trees
    graph.js         Dijkstra, alpha-shape, UHI wind correction
    penalty.js       Thermoregulatory penalty by age + acclimatisation
    emissivity.js    Building type × era → ε + albedo lookup
    lostterritory.js Polygon difference, area computation
    climate.js       Live + typical climate fetching with UHI correction
    cache.js         sessionStorage + in-memory caching
    fetch.js         Overpass, Copernicus, Nominatim, LST
  components/
    Map.jsx          Leaflet map, isochrone drawing
    SearchBar.jsx    Nominatim geocoding search
    MonthPicker.jsx  Live / Typical month selector
    LoadingScreen.jsx Step-by-step loading with progress bar
  App.jsx            Main application, state management
worker/
  proxy.js           Cloudflare Worker — Sentinel Hub OAuth proxy
```

---

## Citation

If you use Thermochrone in research, please cite:

> Kobas, B. (2026). *Thermochrone: Climate-adjusted pedestrian accessibility for thermally vulnerable populations*. TU Munich / SenseLab. https://bilgekobas.github.io/thermochrone

---

## Acknowledgements

Developed at the Chair of Building Technology and Climate Responsive Design, TU Munich, within the SenseLab research platform. Connected to an empirical research programme on thermophysiological adaptation and indoor/outdoor climate resilience.

Data: © OpenStreetMap contributors (ODbL) · Copernicus Land Monitoring Service / EEA · Copernicus Data Space Ecosystem (Sentinel-3) · Open-Meteo (CC BY 4.0)

---

## License

MIT License. © 2026 Bilge Kobas.
