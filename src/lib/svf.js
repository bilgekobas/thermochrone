/**
 * Sky View Factor (SVF) estimation
 *
 * Method: horizon-sector obstruction scan
 *   - 36 sectors × 10° azimuth
 *   - For each sector, find the maximum elevation angle to any building or tree
 *   - SVF = 1 − (1/n) Σ sin²(max_elevation_angle_in_sector)
 *
 * Buildings:  treated as opaque (τ = 0)
 * Tree crowns: treated as semi-transparent (τ = 0.3 — Konarska et al. 2014)
 *
 * References:
 *   Johnson & Watson (1984) horizon scan method
 *   Konarska et al. (2014) tree transmittance
 */

import { haversine } from "./graph.js";

const SECTORS     = 36;
const MAX_BLDG_R  = 250;  // m — buildings beyond this have negligible effect
const MAX_TREE_R  = 100;  // m — tree canopy search radius
const TREE_TAU    = 0.3;  // transmittance through canopy

/**
 * @param {number} lat  point latitude
 * @param {number} lon  point longitude
 * @param {Array}  buildings  [{lat, lon, height}]
 * @param {Array}  treePolygons  [{centroid: {lat,lon}, area}] from Copernicus STL
 * @param {Array}  osmTrees  [{lat, lon}] from OSM natural=tree
 * @returns {number} SVF in [0.05, 1.0]
 */
export function computeSVF(lat, lon, buildings = [], treePolygons = [], osmTrees = []) {
  const maxOpaqueAngles = new Float64Array(SECTORS).fill(0);
  const maxTreeAngles   = new Float64Array(SECTORS).fill(0);

  // ── Buildings (opaque) ───────────────────────────────────────────────────
  for (const b of buildings) {
    const d = haversine(lat, lon, b.lat, b.lon);
    if (d < 1 || d > MAX_BLDG_R) continue;
    const h = Math.max(0, b.height || 6);
    const elevAngle = Math.atan2(h, d);
    const bearing = bearingDeg(lat, lon, b.lat, b.lon);
    spreadToSectors(maxOpaqueAngles, bearing, elevAngle, 1);
  }

  // ── Copernicus STL polygons (semi-transparent) ────────────────────────────
  for (const tp of treePolygons) {
    const d = haversine(lat, lon, tp.centroid.lat, tp.centroid.lon);
    if (d < 1 || d > MAX_TREE_R) continue;
    // Approximate crown height: 8m default (street trees typically 6–12m)
    const h = tp.height || 8;
    const elevAngle = Math.atan2(h, d);
    const bearing = bearingDeg(lat, lon, tp.centroid.lat, tp.centroid.lon);
    spreadToSectors(maxTreeAngles, bearing, elevAngle, 2);
  }

  // ── OSM individual trees (semi-transparent, smaller radius) ──────────────
  for (const t of osmTrees) {
    const d = haversine(lat, lon, t.lat, t.lon);
    if (d < 1 || d > MAX_TREE_R) continue;
    const h = 6; // individual street tree default
    const elevAngle = Math.atan2(h, d);
    const bearing = bearingDeg(lat, lon, t.lat, t.lon);
    spreadToSectors(maxTreeAngles, bearing, elevAngle, 1);
  }

  // ── SVF calculation ───────────────────────────────────────────────────────
  let obstruction = 0;
  for (let i = 0; i < SECTORS; i++) {
    // Building obstruction (opaque)
    const bldgContrib = Math.sin(maxOpaqueAngles[i]) ** 2;
    // Tree obstruction — reduced by transmittance
    const treeContrib = (1 - TREE_TAU) * Math.sin(maxTreeAngles[i]) ** 2;
    obstruction += Math.max(bldgContrib, treeContrib);
  }

  const svf = 1 - obstruction / SECTORS;
  return Math.max(0.05, Math.min(1.0, svf));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  return ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
}

function spreadToSectors(arr, bearing, elevAngle, spread) {
  const sector = Math.floor(bearing / (360 / SECTORS)) % SECTORS;
  for (let ds = -spread; ds <= spread; ds++) {
    const s = (sector + ds + SECTORS) % SECTORS;
    if (elevAngle > arr[s]) arr[s] = elevAngle;
  }
}
