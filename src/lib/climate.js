/**
 * Climate data fetching with caching
 * Live: Open-Meteo NWP (15-min cache)
 * Typical: ERA5-Land 5-year monthly mean (60-min cache)
 */
import { getCachedClimate, setCachedClimate } from "./cache.js";

const HOURLY_VARS = "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,direct_radiation,diffuse_radiation";

export const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function uhiOffset(buildingCount, radiusM=250, hour=14) {
  const density   = buildingCount / (Math.PI * (radiusM/1000)**2);
  const isDaytime = hour >= 7 && hour < 20;
  let day, night;
  if      (density > 50) { day=3.0; night=4.5; }
  else if (density > 20) { day=1.8; night=2.8; }
  else if (density >  5) { day=0.8; night=1.2; }
  else                   { day=0.2; night=0.4; }
  return isDaytime ? day : night;
}

export async function fetchWeatherLive(lat, lon) {
  const cached = getCachedClimate(lat, lon, "live", 0);
  if (cached) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover` +
    `&hourly=${HOURLY_VARS}` +
    `&wind_speed_unit=ms&forecast_days=2&timezone=auto`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const c = data.current, h = data.hourly;
  const nowHour = new Date().getHours();

  const hourly = [];
  for (let i = nowHour; i < nowHour+24 && i < h.time.length; i++) {
    hourly.push({
      time:h.time[i], hour:i%24,
      ta:        h.temperature_2m[i]       ?? 15,
      rh:        h.relative_humidity_2m[i] ?? 60,
      ws:        Math.max(0.5, h.wind_speed_10m[i] ?? 1),
      cloudCover:h.cloud_cover[i]          ?? 0,
      directRad: Math.max(0, h.direct_radiation[i]  ?? 0),
      diffuseRad:Math.max(0, h.diffuse_radiation[i] ?? 0),
      uhiApplied:0,
    });
  }

  const result = {
    mode:"live", label:"Live conditions",
    current:{
      ta:c.temperature_2m, rh:c.relative_humidity_2m,
      ws:Math.max(0.5,c.wind_speed_10m), cloudCover:c.cloud_cover,
      directRad: Math.max(0, h.direct_radiation?.[nowHour]  ?? 0),
      diffuseRad:Math.max(0, h.diffuse_radiation?.[nowHour] ?? 0),
    },
    hourly, uhiApplied:false,
  };
  setCachedClimate(lat, lon, "live", 0, result);
  return result;
}

export async function fetchWeatherTypical(lat, lon, month, buildingCount) {
  // Check cache — typical data is slow to fetch, cache for 1hr
  const cached = getCachedClimate(lat, lon, "typical", month);
  if (cached) { console.log("Climate cache hit"); return cached; }

  const currentYear = new Date().getFullYear();
  const years       = [1,2,3,4,5].map(n => currentYear-n);
  const monthStr    = String(month).padStart(2,"0");
  const days        = [0,31,28,31,30,31,30,31,31,30,31,30,31][month];
  const startDate   = `${years[years.length-1]}-${monthStr}-01`;
  const endDate     = `${years[0]}-${monthStr}-${days}`;

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&hourly=${HOURLY_VARS}` +
    `&wind_speed_unit=ms&timezone=auto`;

  const res = await fetch(url, { signal:AbortSignal.timeout(35_000) });
  if (!res.ok) throw new Error(`Open-Meteo archive HTTP ${res.status}`);
  const data = await res.json();
  const h    = data.hourly;

  const acc = Array.from({length:24}, ()=>({ta:0,rh:0,ws:0,cloudCover:0,directRad:0,diffuseRad:0,n:0}));
  for (let i=0; i<h.time.length; i++) {
    const mo = parseInt(h.time[i].slice(5,7), 10);
    if (mo !== month) continue;
    const hr = parseInt(h.time[i].slice(11,13), 10);
    const s  = acc[hr];
    s.ta+=h.temperature_2m[i]??0; s.rh+=h.relative_humidity_2m[i]??50;
    s.ws+=Math.max(0.5,h.wind_speed_10m[i]??0.5); s.cloudCover+=h.cloud_cover[i]??0;
    s.directRad+=Math.max(0,h.direct_radiation[i]??0);
    s.diffuseRad+=Math.max(0,h.diffuse_radiation[i]??0);
    s.n++;
  }

  const hourly = acc.map((s,hr) => {
    const n=s.n||1, uhi=uhiOffset(buildingCount,250,hr);
    return {
      hour:hr,
      ta:        Math.round((s.ta/n+uhi)*10)/10,
      rh:        Math.round(s.rh/n),
      ws:        Math.max(0.5, Math.round(s.ws/n*10)/10),
      cloudCover:Math.round(s.cloudCover/n),
      directRad: Math.round(s.directRad/n),
      diffuseRad:Math.round(s.diffuseRad/n),
      uhiApplied:uhi,
    };
  });

  const yearRange = `${years[years.length-1]}–${years[0]}`;
  const result = {
    mode:"typical",
    label:`Typical ${MONTH_NAMES[month-1]} (${yearRange})`,
    current:hourly[14],
    hourly, uhiApplied:true,
    uhiNote:`ERA5-Land 5-yr mean · UHI offset from building density`,
  };
  setCachedClimate(lat, lon, "typical", month, result);
  return result;
}
