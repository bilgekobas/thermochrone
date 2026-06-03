/**
 * Surface emissivity (ε) and albedo (α) lookup
 * by building type and construction era
 *
 * Sources:
 *   Oke (1988) urban energy balance
 *   Sailor & Fan (2002) urban surface properties
 *   Santamouris (2013) energy performance of buildings
 *   Avdelidis & Moropoulou (2003) emissivity of building materials
 *
 * Used for:
 *   - Long-wave radiation ground emissivity in MRT computation
 *   - Short-wave albedo (ground reflectance) in MRT computation
 */

// Era bands matching EUBUCCO / OSM start_date ranges
const ERA_BANDS = [
  { before: 1919, era: "pre1919"  },
  { before: 1945, era: "1919_45"  },
  { before: 1970, era: "1945_70"  },
  { before: 1990, era: "1970_90"  },
  { before: 2010, era: "1990_10"  },
  { before: 9999, era: "post2010" },
];

// [epsilon, albedo] per era
const RESIDENTIAL = {
  pre1919:  [0.94, 0.42],  // Stone, brick, terracotta
  "1919_45":  [0.93, 0.40],
  "1945_70":  [0.92, 0.35],  // Concrete panel / rendered brick
  "1970_90":  [0.91, 0.30],
  "1990_10":  [0.90, 0.28],  // Mixed render / ETICS
  post2010: [0.88, 0.25],  // Modern glazed / coated
};

const COMMERCIAL = {
  pre1919:  [0.93, 0.35],
  "1919_45":  [0.92, 0.33],
  "1945_70":  [0.90, 0.28],
  "1970_90":  [0.88, 0.22],
  "1990_10":  [0.86, 0.18],  // Glass curtain wall
  post2010: [0.84, 0.15],
};

const INDUSTRIAL = {
  pre1919:  [0.92, 0.30],
  "1919_45":  [0.90, 0.28],
  "1945_70":  [0.87, 0.22],
  "1970_90":  [0.85, 0.18],
  "1990_10":  [0.83, 0.15],  // Metal cladding
  post2010: [0.82, 0.13],
};

const DEFAULTS = [0.92, 0.30];

function classifyType(buildingTag) {
  const residential = [
    "house","detached","semidetached_house","terrace","apartments",
    "residential","bungalow","dormitory","yes",
  ];
  const commercial = [
    "commercial","retail","office","hotel","supermarket",
    "shop","bank","restaurant",
  ];
  const industrial = ["industrial","warehouse","factory","storage_tank"];

  if (residential.includes(buildingTag)) return "residential";
  if (commercial.includes(buildingTag))  return "commercial";
  if (industrial.includes(buildingTag))  return "industrial";
  return "residential"; // safe default
}

function parseYear(startDate) {
  if (!startDate) return null;
  const m = String(startDate).match(/\d{4}/);
  return m ? parseInt(m[0]) : null;
}

function eraFromYear(year) {
  if (!year) return null;
  for (const { before, era } of ERA_BANDS) {
    if (year < before) return era;
  }
  return "post2010";
}

/**
 * @param {object} tags  OSM building tags
 * @returns {{ epsilon: number, albedo: number, era: string|null }}
 */
export function buildingEmissivity(tags = {}) {
  const type = classifyType(tags.building || tags["building:use"] || "yes");
  const year = parseYear(tags.start_date || tags["construction_date"] || tags["year_of_construction"]);
  const era  = eraFromYear(year);

  const table =
    type === "commercial" ? COMMERCIAL :
    type === "industrial" ? INDUSTRIAL :
    RESIDENTIAL;

  const [epsilon, albedo] = era ? (table[era] ?? DEFAULTS) : DEFAULTS;

  return { epsilon, albedo, era, type };
}

/**
 * Area-weighted mean emissivity + albedo across a set of buildings
 * Falls back to open-ground defaults when no buildings found.
 */
export function meanEmissivity(buildings) {
  if (!buildings.length) return { epsilon: 0.92, albedo: 0.20 };
  let wEps = 0, wAlb = 0, wTotal = 0;
  for (const b of buildings) {
    const { epsilon, albedo } = buildingEmissivity(b.tags || {});
    const w = 1; // could weight by building footprint area if available
    wEps   += epsilon * w;
    wAlb   += albedo  * w;
    wTotal += w;
  }
  return {
    epsilon: wEps   / wTotal,
    albedo:  wAlb   / wTotal,
  };
}
