/**
 * Thermochrone — Cloudflare Worker
 *
 * Handles two jobs:
 *   1. CORS proxy for EEA discomap services (Copernicus STL, Building Height)
 *   2. Sentinel Hub OAuth + LST point query (credentials stored as Worker secrets)
 *
 * Deploy:
 *   wrangler secret put SH_CLIENT_ID
 *   wrangler secret put SH_CLIENT_SECRET
 *   wrangler deploy
 *
 * Routes:
 *   GET  /proxy?url=<encoded>        — generic CORS proxy for allowed hosts
 *   GET  /lst?lat=<lat>&lon=<lon>    — Sentinel Hub LST point query
 */

const ALLOWED_ORIGINS = [
  "https://bilgekobas.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

const ALLOWED_PROXY_HOSTS = [
  "noise.discomap.eea.europa.eu",
  "copernicus.discomap.eea.europa.eu",
  "image.discomap.eea.europa.eu",
  "nominatim.openstreetmap.org",
  "overpass-api.de",
  "api.open-meteo.com",
];

const SH_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const SH_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/api/v1/process";

// ── Token cache (per isolate lifetime) ───────────────────────────────────────
let cachedToken = null;
let tokenExpiry  = 0;

async function getSHToken(env) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 30_000) return cachedToken;

  const res = await fetch(SH_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     env.SH_CLIENT_ID,
      client_secret: env.SH_CLIENT_SECRET,
    }),
  });

  if (!res.ok) throw new Error(`SH token error: ${res.status}`);
  const data    = await res.json();
  cachedToken   = data.access_token;
  tokenExpiry   = now + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

/**
 * LST point query via Sentinel Hub Statistical API
 * Returns mean LST (°C) for the pixel containing [lat, lon]
 * from the most recent clear Sentinel-3 SLSTR observation (≤7 days)
 */
async function fetchLST(lat, lon, env) {
  const token = await getSHToken(env);

  // 500m bbox around point
  const d = 0.005;
  const bbox = [lon - d, lat - d, lon + d, lat + d];

  // Evalscript: Sentinel-3 SLSTR LST (S8 thermal band + NDVI-based emissivity)
  const evalscript = `
//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["S8", "S5", "S3"],
      units: ["BRIGHTNESS_TEMPERATURE", "REFLECTANCE", "REFLECTANCE"]
    }],
    output: { bands: 1, sampleType: "FLOAT32" }
  };
}

function evaluatePixel(sample) {
  // Brightness temperature in Celsius
  const BT = sample.S8 - 273.15;

  // NDVI for emissivity correction
  const ndvi = (sample.S5 - sample.S3) / (sample.S5 + sample.S3 + 0.0001);
  const NDVIs = 0.2, NDVIv = 0.5;
  const PV = Math.pow(Math.max(0, Math.min(1, (ndvi - NDVIs) / (NDVIv - NDVIs))), 2);

  // Land surface emissivity (Avdan & Kaplan 2016)
  const LSE = ndvi < NDVIs ? 0.97 :
              ndvi > NDVIv ? 0.99 :
              0.004 * PV + 0.986;

  // LST from Planck inversion
  const rho  = 1.438e-2; // m·K
  const bCent = 10.85e-6; // S8 central wavelength
  const LST  = BT / (1 + (bCent * BT / rho) * Math.log(LSE));

  return [LST];
}`;

  const body = {
    input: {
      bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
      data: [{
        type: "SENTINEL3_SLSTR",
        dataFilter: {
          timeRange: {
            from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
            to:   new Date().toISOString(),
          },
          mosaickingOrder: "mostRecent",
          maxCloudCoverage: 30,
        },
      }],
    },
    evalscript,
    output: {
      responses: [{ identifier: "default", format: { type: "application/json" } }],
    },
  };

  // Use Statistical API for a single mean value — much cheaper than image tile
  const statBody = {
    input: {
      bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
      data: [{
        type: "SENTINEL3_SLSTR",
        dataFilter: {
          timeRange: {
            from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
            to:   new Date().toISOString(),
          },
          maxCloudCoverage: 30,
        },
      }],
    },
    aggregation: {
      timeRange: {
        from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        to:   new Date().toISOString(),
      },
      aggregationInterval: { of: "P7D" },
      resx: 0.01, resy: 0.01,
      evalscript,
    },
    calculations: { default: { statistics: { default: { percentiles: { k: [50] } } } } },
  };

  const res = await fetch(
    "https://sh.dataspace.copernicus.eu/api/v1/statistics",
    {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(statBody),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SH statistics error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // Navigate to median LST value
  const intervals = data?.data?.[0]?.outputs?.default?.bands?.B0?.stats;
  if (!intervals || intervals.noDataCount === intervals.sampleCount) {
    return null; // no valid pixels (cloud/night)
  }
  const lst = intervals.percentiles?.["50.0"] ?? intervals.mean;
  return typeof lst === "number" ? Math.round(lst * 10) / 10 : null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";
    const corsHeaders = {
      "Access-Control-Allow-Origin":
        ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url      = new URL(request.url);
    const pathname = url.pathname;

    try {
      // ── /lst endpoint ───────────────────────────────────────────
      if (pathname === "/lst") {
        const lat = parseFloat(url.searchParams.get("lat"));
        const lon = parseFloat(url.searchParams.get("lon"));
        if (isNaN(lat) || isNaN(lon)) {
          return new Response("Invalid lat/lon", { status: 400, headers: corsHeaders });
        }
        const lst = await fetchLST(lat, lon, env);
        return new Response(JSON.stringify({ lst }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── /proxy endpoint ─────────────────────────────────────────
      if (pathname === "/proxy") {
        const target = url.searchParams.get("url");
        if (!target) {
          return new Response("Missing ?url=", { status: 400, headers: corsHeaders });
        }
        const targetURL = new URL(target);
        if (!ALLOWED_PROXY_HOSTS.includes(targetURL.hostname)) {
          return new Response(`Host not allowed: ${targetURL.hostname}`, {
            status: 403, headers: corsHeaders,
          });
        }
        const proxyRes = await fetch(target, {
          method:  request.method,
          headers: { "User-Agent": "Thermochrone/0.2" },
          body:    request.method === "POST" ? request.body : undefined,
        });
        const body = await proxyRes.arrayBuffer();
        return new Response(body, {
          status:  proxyRes.status,
          headers: {
            ...Object.fromEntries(proxyRes.headers),
            ...corsHeaders,
          },
        });
      }

      return new Response("Not found", { status: 404, headers: corsHeaders });

    } catch (e) {
      console.error(e);
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
