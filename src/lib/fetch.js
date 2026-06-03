import { haversine } from "./graph.js";
import { getCachedOSM, setCachedOSM, getCachedSTL, setCachedSTL } from "./cache.js";

export const WORKER_URL = "https://thermochrone-proxy.bilgekobas.workers.dev";

const EU_EEA_CODES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU",
  "IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
  "IS","LI","NO","CH","UK","GB","AL","BA","ME","MK","RS","TR",
]);

// Nominatim: simple in-memory cache, one reverse-geocode per session per location
const nominatimCache = new Map();

export async function checkEUCoverage(lat, lon) {
  const key = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  if (nominatimCache.has(key)) return nominatimCache.get(key);
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=3`,
      { headers:{ "Accept-Language":"en", "User-Agent":"Thermochrone/0.8 (research tool; bilgekobas.github.io/thermochrone)" } }
    );
    const data = await res.json();
    const code = data.address?.country_code?.toUpperCase() ?? "";
    const result = { inEU:EU_EEA_CODES.has(code), countryCode:code, countryName:data.address?.country ?? "" };
    nominatimCache.set(key, result);
    return result;
  } catch { return { inEU:true, countryCode:"", countryName:"" }; }
}

// Geocoding search for SearchBar — separate from reverse geocode
const geocodeCache = new Map();
export async function geocodeSearch(query) {
  if (geocodeCache.has(query)) return geocodeCache.get(query);
  const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`;
  const res  = await fetch(url, {
    headers:{ "Accept-Language":"en", "User-Agent":"Thermochrone/0.8 (research tool; bilgekobas.github.io/thermochrone)" },
  });
  const data = await res.json();
  geocodeCache.set(query, data);
  return data;
}

// Overpass with retry + cache
async function overpassQuery(query, attempt=0) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  const url = endpoints[attempt % endpoints.length];
  try {
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body:`data=${encodeURIComponent(query)}`,
      signal:AbortSignal.timeout(40_000),
    });
    if ((res.status === 504 || res.status === 429) && attempt < 2) {
      await new Promise(r => setTimeout(r, 2000));
      return overpassQuery(query, attempt+1);
    }
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    return res.json();
  } catch(e) {
    if (attempt < 2) { await new Promise(r=>setTimeout(r,2000)); return overpassQuery(query,attempt+1); }
    throw e;
  }
}

export async function fetchOSMData(lat, lon, radiusMeters) {
  // Check cache first — 1km grid, 30-min TTL
  const cached = getCachedOSM(lat, lon, radiusMeters);
  if (cached) { console.log("OSM cache hit"); return cached; }

  const r = Math.round(radiusMeters), bR = 300;
  const query = `[out:json][timeout:40];(
  way["highway"~"footway|pedestrian|path|living_street|residential|primary|secondary|tertiary|unclassified|service|steps|track"]["highway"!~"motorway|trunk"](around:${r},${lat},${lon});
  way["building"](around:${bR},${lat},${lon});
  node["natural"="tree"](around:${r},${lat},${lon});
  node["amenity"](around:${r},${lat},${lon});
  node["shop"](around:${r},${lat},${lon});
  node["leisure"~"park|playground|garden|pitch|sports_centre"](around:${r},${lat},${lon});
  node["public_transport"~"stop_position|platform"](around:${r},${lat},${lon});
  node["highway"="bus_stop"](around:${r},${lat},${lon});
  node["railway"~"tram_stop|subway_entrance|station"](around:${r},${lat},${lon});
);out body;>;out skel qt;`;

  const data = await overpassQuery(query);
  setCachedOSM(lat, lon, radiusMeters, data);
  return data;
}

export async function fetchCopernicusSTL(lat, lon, radiusMeters) {
  const cached = getCachedSTL(lat, lon, radiusMeters);
  if (cached) return cached;

  const dDeg  = (radiusMeters / 111_320) * 1.2;
  const bbox  = `${lon-dDeg},${lat-dDeg},${lon+dDeg},${lat+dDeg}`;
  const base  = "https://noise.discomap.eea.europa.eu/arcgis/rest/services/UrbanAtlas/UA_StreetTreeLayer_2018/MapServer/0/query";
  const params = new URLSearchParams({
    geometry:bbox, geometryType:"esriGeometryEnvelope",
    inSR:"4326", spatialRel:"esriSpatialRelIntersects",
    outFields:"Shape_Area", returnGeometry:"true", outSR:"4326", f:"geojson",
  });
  try {
    const res  = await fetch(`${base}?${params}`, { signal:AbortSignal.timeout(10_000) });
    const data = await res.json();
    if (!data.features) { setCachedSTL(lat,lon,radiusMeters,[]); return []; }
    const result = data.features.map(f => {
      const coords = f.geometry?.coordinates; if (!coords) return null;
      const ring   = Array.isArray(coords[0][0]) ? coords[0] : coords;
      let sumLon=0, sumLat=0, n=0;
      for (const [ln,lt] of ring) { sumLon+=ln; sumLat+=lt; n++; }
      if (!n) return null;
      return { centroid:{ lat:sumLat/n, lon:sumLon/n }, area:f.properties?.Shape_Area??500, height:8 };
    }).filter(Boolean);
    setCachedSTL(lat, lon, radiusMeters, result);
    return result;
  } catch { return []; }
}

export async function fetchLST(lat, lon) {
  try {
    const res  = await fetch(`${WORKER_URL}/lst?lat=${lat}&lon=${lon}`, { signal:AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.lst === "number" ? data.lst : null;
  } catch { return null; }
}

export function categorizePOI(tags) {
  const a=tags.amenity, s=tags.shop, l=tags.leisure, pt=tags.public_transport, hw=tags.highway, rw=tags.railway;
  if (["bus_stop","tram_stop","subway_entrance","station","ferry_terminal"].includes(a)||
      hw==="bus_stop"||["tram_stop","subway_entrance","station"].includes(rw)||
      ["stop_position","platform"].includes(pt))
    return { cat:"Transit", color:"#2563eb" };
  if (["cafe","restaurant","fast_food","bar","pub","food_court","biergarten"].includes(a))
    return { cat:"Food & Drink", color:"#d97706" };
  if (["pharmacy","hospital","clinic","doctors","dentist"].includes(a))
    return { cat:"Health", color:"#dc2626" };
  if (["school","kindergarten","university","college","library"].includes(a))
    return { cat:"Education", color:"#7c3aed" };
  if (a==="supermarket"||["supermarket","convenience","bakery","grocery","butcher",
      "clothes","electronics","hardware","books","florist"].includes(s)||s)
    return { cat:"Shopping", color:"#059669" };
  if (["bank","atm","post_office"].includes(a))
    return { cat:"Services", color:"#0891b2" };
  if (["park","playground","garden","pitch","sports_centre"].includes(l))
    return { cat:"Green Space", color:"#16a34a" };
  if (["bench","shelter","toilets","drinking_water","fountain"].includes(a))
    return { cat:"Rest", color:"#64748b" };
  return null;
}
