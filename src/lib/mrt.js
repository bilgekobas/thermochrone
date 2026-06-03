/**
 * Mean Radiant Temperature (MRT) — v2
 * ISO 7726 / VDI 3787 outdoor radiation balance
 *
 * v2: uses real LST from Sentinel-3 SLSTR (via Cloudflare Worker)
 * for ground LW emission when available, falling back to Ta+2°C
 */
export function computeMRT({
  ta, directRad, diffuseRad, svf,
  altDeg, fp, cloudCover,
  albedo     = 0.20,
  surfEpsilon = 0.93,
  lst         = null,   // Sentinel-3 LST in °C — null → use Ta+2 fallback
}) {
  const alphaK  = 0.70;
  const alphaL  = 0.97;
  const epsilon = 0.97;
  const sigma   = 5.67e-8;

  const Idir  = Math.max(0, directRad);
  const Idiff = Math.max(0, diffuseRad);
  const Iref  = (Idir + Idiff) * albedo;

  const SWload =
    (altDeg > 0 ? alphaK * fp * Idir : 0) +
    alphaK * (svf * Idiff + (1 - svf) * Iref);

  const taK = ta + 273.15;

  // Sky LW — Brutsaert (1975) + cloud correction
  const epsSkyClear = 0.787 + 0.764 * Math.log(Math.max(0.01, taK / 273));
  const epsSky      = epsSkyClear + (1 - epsSkyClear) * (cloudCover / 100);
  const LWsky       = epsSky * sigma * taK ** 4;

  // Ground LW — use Sentinel-3 LST if available, else Ta+2 fallback
  const groundTK = lst != null ? (lst + 273.15) : (taK + 2);
  const LWground = surfEpsilon * sigma * groundTK ** 4;

  const LWload = alphaL * (svf * LWsky + (1 - svf) * LWground);
  const Rtotal = SWload + LWload;
  const tmrtK  = Math.pow(Rtotal / (epsilon * sigma), 0.25);
  const tmrt   = tmrtK - 273.15;

  return {
    tmrt:        Math.round(tmrt * 10) / 10,
    SWload:      Math.round(SWload),
    LWload:      Math.round(LWload),
    fp:          Math.round(fp * 1000) / 1000,
    lstSource:   lst != null ? "Sentinel-3 SLSTR" : "modelled (Tₐ+2°C)",
    groundTempC: Math.round((groundTK - 273.15) * 10) / 10,
  };
}
