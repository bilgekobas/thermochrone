/**
 * Solar geometry
 * Spencer (1971) day angle + Iqbal (1983) declination/hour angle
 * Returns solar altitude and azimuth in degrees for a given location and UTC datetime.
 */
export function solarGeometry(lat, lon, dateObj) {
  const doy = Math.floor(
    (dateObj - new Date(dateObj.getFullYear(), 0, 0)) / 86_400_000
  );
  const B = (2 * Math.PI * (doy - 1)) / 365;

  // Equation of time (minutes)
  const EoT =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(B) -
      0.032077 * Math.sin(B) -
      0.014615 * Math.cos(2 * B) -
      0.04089 * Math.sin(2 * B));

  // Declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(B) +
    0.070257 * Math.sin(B) -
    0.006758 * Math.cos(2 * B) +
    0.000907 * Math.sin(2 * B) -
    0.002697 * Math.cos(3 * B) +
    0.00148 * Math.sin(3 * B);

  const utcHour = dateObj.getUTCHours() + dateObj.getUTCMinutes() / 60;
  const solarNoon = 12 - lon / 15 - EoT / 60;
  const hourAngle = ((utcHour - solarNoon) * 15 * Math.PI) / 180;
  const latR = (lat * Math.PI) / 180;

  const sinAlt =
    Math.sin(latR) * Math.sin(decl) +
    Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle);
  const altDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * (180 / Math.PI);

  const cosAz =
    (Math.sin(decl) - Math.sin(latR) * sinAlt) /
    (Math.cos(latR) * Math.cos((altDeg * Math.PI) / 180) + 1e-9);
  const azDeg =
    (Math.sin(hourAngle) > 0 ? 360 : 0) +
    (Math.sin(hourAngle) > 0 ? 1 : -1) *
      Math.acos(Math.max(-1, Math.min(1, cosAz))) *
      (180 / Math.PI);

  return { altDeg, azDeg };
}

/**
 * Projected area factor for a standing person
 * Walkenhorst & David (2002), simplified for upright posture
 */
export function projectedAreaFactor(altDeg) {
  const altR = (altDeg * Math.PI) / 180;
  return 0.308 * Math.cos(0.998 - 0.0132 * altR);
}
