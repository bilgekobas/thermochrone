/**
 * Thermoregulatory penalty
 *
 * v2 additions:
 *   - Acclimatisation modifier: unacclimatised / mixed / acclimatised
 *     Based on: Kobas et al. 2026 (Scientific Reports) — continuous AC vs
 *     free-running conditions attenuate thermophysiological adaptation
 *   - Penalty curves reference Kenney & Munce (2003), Havenith (2001),
 *     Cramer & Jay (2019)
 */

export const AGE_GROUPS = [
  { id: "child",      label: "Child",       range: "5–12 yrs",  icon: "👧", baseSpeed: 60,  note: "Limited sweating capacity; high SA:mass ratio" },
  { id: "youngAdult", label: "Young Adult", range: "18–35 yrs", icon: "🧑", baseSpeed: 83,  note: "Reference population" },
  { id: "middleAge",  label: "Middle Age",  range: "36–55 yrs", icon: "🧔", baseSpeed: 78,  note: "Slightly reduced thermoregulatory efficiency" },
  { id: "older",      label: "Older Adult", range: "56–70 yrs", icon: "👴", baseSpeed: 70,  note: "Reduced sweating onset; lower cardiovascular reserve" },
  { id: "elderly",    label: "Elderly",     range: "70+ yrs",   icon: "🧓", baseSpeed: 55,  note: "Significantly attenuated thermoregulatory response" },
];

// Age-group thermal sensitivity relative to young adult reference
const SENSITIVITY = {
  child:      1.4,
  youngAdult: 1.0,
  middleAge:  1.1,
  older:      1.35,
  elderly:    1.6,
};

/**
 * Acclimatisation states
 * Based on the finding that continuous AC attenuates thermophysiological
 * adaptation (Kobas et al. 2026 Scientific Reports):
 *   - Acclimatised population tolerates heat stress better (lower penalty)
 *   - Unacclimatised (AC-dependent) population more vulnerable (higher penalty)
 */
export const ACCLIMATISATION_STATES = [
  {
    id:        "unacclimatised",
    label:     "Unacclimatised",
    sublabel:  "AC-dependent / low prior heat exposure",
    icon:      "❄️",
    modifier:  1.35,
    color:     "#60a5fa",
  },
  {
    id:        "mixed",
    label:     "Mixed",
    sublabel:  "General urban population",
    icon:      "🌤️",
    modifier:  1.0,
    color:     "#94a3b8",
  },
  {
    id:        "acclimatised",
    label:     "Acclimatised",
    sublabel:  "Free-running / heat-adapted",
    icon:      "☀️",
    modifier:  0.70,
    color:     "#f59e0b",
  },
];

/**
 * @param {number} utci
 * @param {string} ageGroupId
 * @param {string} acclimatisationId
 * @returns {number} penalty ∈ [0, 0.88]
 */
export function thermalPenalty(utci, ageGroupId, acclimatisationId = "mixed") {
  const neutral   = 17.5;
  const deviation = utci - neutral;
  const ageSens   = SENSITIVITY[ageGroupId]     ?? 1.0;
  const accMod    = ACCLIMATISATION_STATES.find(s => s.id === acclimatisationId)?.modifier ?? 1.0;
  const s         = ageSens * accMod;

  let raw = 0;
  if (deviation > 8.5) {
    raw = Math.pow((deviation - 8.5) / 20, 1.5) * s;
  } else if (deviation < -8.5) {
    raw = Math.pow((Math.abs(deviation) - 8.5) / 25, 1.5) * s * 0.7;
  }

  return Math.max(0, Math.min(0.88, raw));
}

export const THERMONEUTRAL_UTCI = 17.5;
