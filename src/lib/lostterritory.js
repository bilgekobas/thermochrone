/**
 * Lost Territory computation
 *
 * Computes the area difference between reference isochrone polygons
 * and thermal isochrone polygons.
 *
 * Returns:
 *   lostArea_m2   — area only in reference, not in thermal (m²)
 *   refArea_m2    — total reference isochrone area (m²)
 *   lostPct       — lostArea / refArea × 100
 *   gainedArea_m2 — area in thermal but not in reference (rare, cold conditions)
 *
 * Method: Shoelace formula for polygon area, then approximate
 * set difference via bounding box sampling (fast, sufficient for display).
 *
 * For production research: replace with proper polygon clipping
 * (e.g. Sutherland-Hodgman or Greiner-Hormann algorithm).
 */

/** Shoelace formula — polygon area in m² (approximate for geographic coords) */
export function polygonArea(ring) {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  // Convert from degree² to m² at mean latitude
  const meanLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const degLon  = 111_320 * Math.cos((meanLat * Math.PI) / 180);
  const degLat  = 110_574;
  return Math.abs(area / 2) * degLon * degLat;
}

/** Point-in-polygon (ray casting) */
function pointInPolygon([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Approximate lost/gained territory between two isochrone sets.
 *
 * @param {Array} refRings     [[lon,lat], …] rings for each time band
 * @param {Array} thermalRings [[lon,lat], …] rings for each time band
 * @returns Array of { mins, refArea, thermalArea, lostArea, lostPct, gainedArea }
 */
export function computeLostTerritory(refRings, thermalRings) {
  return refRings.map((refRing, i) => {
    const thermalRing = thermalRings[i];
    const refArea     = polygonArea(refRing);
    const thermalArea = polygonArea(thermalRing ?? []);

    if (!refRing?.length || !thermalRing?.length) {
      return { refArea, thermalArea, lostArea: refArea, lostPct: 100, gainedArea: 0 };
    }

    // Sample the bounding box of the reference polygon
    // Count sample points in ref but not in thermal → lost fraction
    const xs = refRing.map(p => p[0]);
    const ys = refRing.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const SAMPLES = 800;
    const sqrtS   = Math.floor(Math.sqrt(SAMPLES));
    const dx      = (maxX - minX) / sqrtS;
    const dy      = (maxY - minY) / sqrtS;

    let inRef = 0, inBoth = 0, inThermalOnly = 0;

    for (let r = 0; r < sqrtS; r++) {
      for (let c = 0; c < sqrtS; c++) {
        const pt = [minX + (c + 0.5) * dx, minY + (r + 0.5) * dy];
        const inR = pointInPolygon(pt, refRing);
        const inT = pointInPolygon(pt, thermalRing);
        if (inR) inRef++;
        if (inR && inT) inBoth++;
        if (!inR && inT) inThermalOnly++;
      }
    }

    if (inRef === 0) return { refArea, thermalArea, lostArea: 0, lostPct: 0, gainedArea: 0 };

    const lostFraction  = (inRef - inBoth) / inRef;
    const lostArea      = refArea * lostFraction;
    const gainedArea    = thermalArea * (inThermalOnly / Math.max(1, inRef));
    const lostPct       = lostFraction * 100;

    return {
      refArea:     Math.round(refArea),
      thermalArea: Math.round(thermalArea),
      lostArea:    Math.round(lostArea),
      lostPct:     Math.round(lostPct * 10) / 10,
      gainedArea:  Math.round(gainedArea),
    };
  });
}

/** Format area for display */
export function formatArea(m2) {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000)    return `${(m2 / 10_000).toFixed(1)} ha`;
  return `${Math.round(m2).toLocaleString()} m²`;
}
