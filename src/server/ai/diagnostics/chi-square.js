// Chi-square 2x2 contingency test + p-value lookup for 1 degree of freedom.
// Used by the style diagnostic to compare pairs of personas on metrics like
// attack-when-available rate. Pure functions, no dependencies.
//
// 2x2 layout:
//          group1   group2
//   yes      a        b
//   no       c        d

export function chiSquare2x2({ a, b, c, d }) {
  const n = a + b + c + d;
  if (n === 0) throw new Error('chiSquare2x2: total count is zero');
  // Closed form for a 2x2 table:
  //   chi² = n * (ad - bc)^2 / ((a+b)(c+d)(a+c)(b+d))
  const num = n * Math.pow(a * d - b * c, 2);
  const den = (a + b) * (c + d) * (a + c) * (b + d);
  if (den === 0) return 0; // a row or column is all zeros — no association detectable
  return num / den;
}

// Survival function (1 - CDF) for chi-square with 1 degree of freedom.
//   chi² with 1 d.f. is Z² where Z ~ N(0,1)
//   so P(chi² > x) = 2 * (1 - Phi(sqrt(x)))
// We approximate Phi using the Abramowitz & Stegun 7.1.26 erf approximation.
export function chiSquarePValue(stat) {
  if (stat <= 0) return 1;
  const z = Math.sqrt(stat);
  return 2 * (1 - normalCdf(z));
}

// Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))
function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Abramowitz & Stegun 7.1.26 — max error ~1.5e-7 in |x|.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const t  = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}
