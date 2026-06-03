/**
 * Client-side cache for expensive API responses
 * Uses sessionStorage (cleared on tab close) for OSM data
 * and in-memory Map for climate data (lighter, changes with mode)
 *
 * OSM key: rounded lat/lon to 2dp (≈1km grid) + radius
 * Climate key: lat/lon + mode + month
 */

const SESSION_PREFIX = "thermochrone_osm_";
const climateCache   = new Map(); // in-memory, survives re-renders

// ── OSM cache ─────────────────────────────────────────────────
function osmKey(lat, lon, radius) {
  // Round to 2dp ≈ 1.1km grid — close enough to reuse network data
  return `${SESSION_PREFIX}${lat.toFixed(2)}_${lon.toFixed(2)}_${Math.round(radius)}`;
}

export function getCachedOSM(lat, lon, radius) {
  try {
    const key  = osmKey(lat, lon, radius);
    const raw  = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Expire after 30 minutes
    if (Date.now() - ts > 30 * 60 * 1000) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

export function setCachedOSM(lat, lon, radius, data) {
  try {
    const key = osmKey(lat, lon, radius);
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage full or unavailable — silently skip
  }
}

// ── Climate cache ─────────────────────────────────────────────
function climateKey(lat, lon, mode, month) {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}_${mode}_${month}`;
}

export function getCachedClimate(lat, lon, mode, month) {
  const key  = climateKey(lat, lon, mode, month);
  const entry = climateCache.get(key);
  if (!entry) return null;
  // Live data expires after 15 minutes; typical after 60
  const ttl = mode === "live" ? 15 * 60 * 1000 : 60 * 60 * 1000;
  if (Date.now() - entry.ts > ttl) { climateCache.delete(key); return null; }
  return entry.data;
}

export function setCachedClimate(lat, lon, mode, month, data) {
  climateCache.set(climateKey(lat, lon, mode, month), { data, ts: Date.now() });
}

// ── Copernicus STL cache ──────────────────────────────────────
const stlCache = new Map();

export function getCachedSTL(lat, lon, radius) {
  const key = `${lat.toFixed(2)}_${lon.toFixed(2)}_${Math.round(radius)}`;
  const entry = stlCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > 60 * 60 * 1000) { stlCache.delete(key); return null; }
  return entry.data;
}

export function setCachedSTL(lat, lon, radius, data) {
  stlCache.set(`${lat.toFixed(2)}_${lon.toFixed(2)}_${Math.round(radius)}`, { data, ts: Date.now() });
}
