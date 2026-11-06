/**
 * Alert rules — mirrors alert.py (/process-alerts) but driven by the
 * alert_tolerances table that the Administration > Alerts screen edits.
 *
 *   deviation % = (actual - expected) / expected * 100      (actual = WEIGHT OF INOCULANT)
 *   percent of expected = actual / expected * 100
 *
 *   Over Dose     : deviation  >  +max
 *   Under Dose    : deviation  <  -max
 *   Pipe Chocked  : percent of expected < min      (alert.py: actual < expected * min/100)
 *   Dose Missed   : percent of expected < min      (also: no actual / no master dosage)
 *
 * A tolerance of 0 on Pipe Chocked / Dose Missed means "never trigger".
 * Over/Under Dose with 0/0 (never configured) fall back to 5/5 (±5 %).
 */

export type Tol = { min: number; max: number };
export type TolMap = Map<string, Tol>;

export const DEFAULT_TOLERANCE: Record<string, Tol> = {
  'Over Dose': { min: 5, max: 5 },
  'Under Dose': { min: 5, max: 5 },
};

/** Tolerance for one alert type, applying the ±5 % default when it was left at 0/0. */
export function tolFor(map: TolMap, alertType: string): Tol {
  const t = map.get(alertType);
  const d = DEFAULT_TOLERANCE[alertType];
  if (d && (!t || (t.min === 0 && t.max === 0))) return d;
  return t ?? { min: 0, max: 0 };
}

export type LiveAlertType = 'Over Dose' | 'Under Dose' | 'Dose Miss' | 'Pipe Choked';

/** Returns the alert to raise for one dose, or null when it is within tolerance. */
export function classifyDose(
  actual: number | null,
  expected: number | null,
  tols: TolMap,
  enabled: (alertType: string) => boolean,
): LiveAlertType | null {
  const missEnabled = enabled('Dose Missed');
  if (actual == null || expected == null || expected === 0) return missEnabled ? 'Dose Miss' : null;

  const pct = (actual / expected) * 100;
  const deviation = pct - 100;

  if (missEnabled) {
    const { min } = tolFor(tols, 'Dose Missed');
    if (min > 0 && pct < min) return 'Dose Miss';
  }
  if (enabled('Pipe Chocked')) {
    const { min } = tolFor(tols, 'Pipe Chocked');
    if (min > 0 && pct < min) return 'Pipe Choked';
  }
  if (enabled('Over Dose') && deviation > tolFor(tols, 'Over Dose').max) return 'Over Dose';
  if (enabled('Under Dose') && deviation < -tolFor(tols, 'Under Dose').max) return 'Under Dose';
  return null;
}
