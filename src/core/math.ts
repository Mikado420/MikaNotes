/**
 * MikaNotes TJA Core - Math Utilities
 * High-precision rational arithmetic and LCM calculations
 */

export const EPSILON = 1e-6;

/**
 * Greatest Common Divisor (Euclidean algorithm)
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a === 0 ? 1 : a;
}

/**
 * Least Common Multiple
 */
export function lcm(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  if (a === 0 || b === 0) return 0;
  return (a / gcd(a, b)) * b;
}

/**
 * Simplify a rational fraction
 */
export function simplifyFraction(numerator: number, denominator: number): { num: number; den: number } {
  if (denominator === 0) return { num: 0, den: 1 };
  const g = gcd(numerator, denominator);
  const sign = (denominator < 0) ? -1 : 1;
  return {
    num: (numerator * sign) / g,
    den: (denominator * sign) / g,
  };
}

/**
 * Find the LCM of an array of denominators with a maximum safety cap
 */
export function calculateArrayLCM(denominators: number[], maxLimit: number = 3840): number {
  let result = 1;
  for (const d of denominators) {
    if (!d || isNaN(d) || !isFinite(d) || d <= 0) continue;
    result = lcm(result, Math.round(d));
    if (result > maxLimit || !isFinite(result)) {
      return maxLimit;
    }
  }
  return result > 0 ? result : 1;
}

/**
 * Float comparison with epsilon
 */
export function approxEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

/**
 * Clamp a number
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Format BPM to clean string (up to 4 decimal places, no trailing zeros)
 */
export function formatBpm(bpm: number): string {
  if (!isFinite(bpm) || isNaN(bpm)) return "120";
  const rounded = Math.round(bpm * 10000) / 10000;
  return rounded.toString();
}
