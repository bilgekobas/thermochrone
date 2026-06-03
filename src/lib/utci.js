/**
 * Universal Thermal Climate Index (UTCI)
 * Bröde et al. (2012) 6th-order polynomial approximation
 * Valid: Ta −50 to +50°C, ws 0.5–17 m/s, Tmrt−Ta −30 to +70°C
 */
export function computeUTCI(ta, rh, ws, tr) {
  // Enforce UTCI polynomial validity bounds
  const wsC  = Math.max(0.5, Math.min(17, ws));
  const d    = tr - ta;

  /* eslint-disable no-multi-spaces */
  const utci =
    ta +
    0.607562052        + -0.0227712343  * ta  + 8.06470249e-4  * ta**2 +
    -1.54271372e-4     * ta**3          + -3.24651735e-6 * ta**4  +
     7.32602852e-8     * ta**5          +  1.35959073e-9 * ta**6  +
    -2.25836520        * wsC            +  0.0880326035  * ta*wsC +
     0.00216844454     * ta**2*wsC      + -1.53347087e-5 * ta**3*wsC +
    -5.72983704e-7     * ta**4*wsC      + -2.55090776e-9 * ta**5*wsC +
    -0.751269505       * wsC**2         + -0.00408350271 * ta*wsC**2 +
    -5.21670675e-5     * ta**2*wsC**2   +  1.94544667e-6 * ta**3*wsC**2 +
     1.14099531e-8     * ta**4*wsC**2   +  0.158137256   * wsC**3 +
    -6.57263143e-5     * ta*wsC**3      +  2.22697524e-7 * ta**2*wsC**3 +
    -4.16117031e-8     * ta**3*wsC**3   + -0.0127762753  * wsC**4 +
     9.66891875e-6     * ta*wsC**4      +  2.52785852e-9 * ta**2*wsC**4 +
     4.56306672e-4     * wsC**5         + -1.74202546e-7 * ta*wsC**5 +
    -5.91491269e-6     * wsC**6         +  0.398374029   * d +
     1.83945314e-4     * ta*d           + -1.73754510e-4 * ta**2*d +
    -7.60781159e-7     * ta**3*d        +  3.77830287e-8 * ta**4*d +
     5.43079673e-10    * ta**5*d        + -0.0200518269  * wsC*d +
     8.92859837e-4     * ta*wsC*d       +  3.45433048e-6 * ta**2*wsC*d +
    -3.77925774e-7     * ta**3*wsC*d    + -1.69699377e-9 * ta**4*wsC*d +
     1.69992415e-4     * wsC**2*d       + -4.99204314e-5 * ta*wsC**2*d +
     2.47417178e-7     * ta**2*wsC**2*d +  1.07596466e-8 * ta**3*wsC**2*d +
     8.49242932e-5     * wsC**3*d       +  1.35191328e-6 * ta*wsC**3*d +
    -6.21531254e-9     * ta**2*wsC**3*d + -4.99410301e-6 * wsC**4*d +
    -1.89489258e-8     * ta*wsC**4*d    +  8.15300114e-8 * wsC**5*d +
     7.55043090e-4     * d**2           + -5.65095215e-5 * ta*d**2 +
    -4.52166564e-7     * ta**2*d**2     +  2.46688878e-8 * ta**3*d**2 +
     2.42674348e-10    * ta**4*d**2     +  1.54547250e-4 * wsC*d**2 +
     5.24110970e-6     * ta*wsC*d**2    + -8.75874982e-8 * ta**2*wsC*d**2 +
    -1.50743064e-9     * ta**3*wsC*d**2 + -1.56236307e-5 * wsC**2*d**2 +
    -1.33895614e-7     * ta*wsC**2*d**2 +  2.49709824e-9 * ta**2*wsC**2*d**2 +
     6.51711721e-7     * wsC**3*d**2    +  1.94960053e-9 * ta*wsC**3*d**2 +
    -1.00451445e-8     * wsC**4*d**2    + -1.29136586e-5 * d**3 +
    -8.84418826e-8     * ta*d**3        + -2.32779298e-8 * ta**2*d**3 +
     5.83926201e-10    * ta**3*d**3     + -1.28495495e-6 * wsC*d**3 +
    -2.80696548e-7     * ta*wsC*d**3    +  2.59958229e-8 * ta**2*wsC*d**3 +
     2.27368497e-9     * wsC**2*d**3    + -8.19682751e-11* ta*wsC**2*d**3 +
    -7.97522449e-10    * wsC**3*d**3    +  2.37601631e-8 * d**4 +
     3.20689570e-10    * ta*d**4        + -2.17983095e-10* wsC*d**4 +
    -3.03263434e-10    * d**5;
  /* eslint-enable no-multi-spaces */

  return Math.round(utci * 10) / 10;
}

/** UTCI stress category — ISO 15743 / Bröde 2012 Table 1 */
export function utciCategory(utci) {
  if (utci < -40) return { label: "Extreme cold stress",     color: "#1e3a8a", emoji: "🥶" };
  if (utci < -27) return { label: "Very strong cold stress", color: "#1d4ed8", emoji: "❄️"  };
  if (utci < -13) return { label: "Strong cold stress",      color: "#3b82f6", emoji: "🌬️" };
  if (utci <   0) return { label: "Moderate cold stress",    color: "#60a5fa", emoji: "🌥️" };
  if (utci <   9) return { label: "Slight cold stress",      color: "#7dd3fc", emoji: "🌤️" };
  if (utci <  26) return { label: "No thermal stress",       color: "#22c55e", emoji: "☀️"  };
  if (utci <  32) return { label: "Moderate heat stress",    color: "#fbbf24", emoji: "🌡️" };
  if (utci <  38) return { label: "Strong heat stress",      color: "#f97316", emoji: "🔥"  };
  if (utci <  46) return { label: "Very strong heat stress", color: "#ef4444", emoji: "🌶️" };
  return            { label: "Extreme heat stress",          color: "#7f1d1d", emoji: "☠️"  };
}
