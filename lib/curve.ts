export interface CurvePhaseInput {
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  costo_planeado: number;
  costo_real: number;
  porcentaje_completado: number;
}

export interface CurvePoint {
  /** ISO month-end date e.g. 2026-05-31 */
  fecha: string;
  /** Cumulative Planned Value (CPTP / BCWS) */
  cptp: number;
  /** Cumulative Earned Value (CPTR / BCWP) */
  cptr: number;
  /** Cumulative Actual Cost (when available) */
  acwp: number;
  /** Marker: this is a future bucket (after today) */
  futuro: boolean;
}

export interface CurveData {
  points: CurvePoint[];
  presupuesto_total: number;
  ev_total: number;
  spi: number | null;
  cpi: number | null;
  fecha_inicio: string;
  fecha_fin: string;
  hoy: string;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

function isoDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24) + 1);
}

function overlapDays(
  rangeStart: Date,
  rangeEnd: Date,
  windowStart: Date,
  windowEnd: Date,
): number {
  const start = rangeStart > windowStart ? rangeStart : windowStart;
  const end = rangeEnd < windowEnd ? rangeEnd : windowEnd;
  if (end < start) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1);
}

/**
 * Build the monthly projection curve from the phase plan.
 *
 * For each month bucket, planned value (CPTP) is the cumulative
 * proportion of phase budget that *should* have been earned by that
 * date, assuming a linear distribution of cost across each phase's
 * planned window. Earned value (CPTR) is the cumulative proportion
 * actually earned, derived from the phase's reported %complete
 * pro-rated by the elapsed planned time up to that bucket.
 *
 * If no phase dates are available the function falls back to a single
 * straight line between the project start and finish.
 */
export function buildProjectionCurve(opts: {
  phases: CurvePhaseInput[];
  projectStart: string | null;
  projectEnd: string | null;
  totalBudget: number;
  totalActualCost: number;
  today?: Date;
}): CurveData | null {
  const todayDay = toDay(opts.today ?? new Date());

  const phasesWithDates = opts.phases.filter(
    (p) => p.fecha_inicio && p.fecha_fin && p.costo_planeado > 0,
  );

  let inferredStart = opts.projectStart ? new Date(opts.projectStart) : null;
  let inferredEnd = opts.projectEnd ? new Date(opts.projectEnd) : null;

  if (phasesWithDates.length > 0) {
    for (const p of phasesWithDates) {
      const start = new Date(p.fecha_inicio!);
      const end = new Date(p.fecha_fin!);
      if (!inferredStart || start < inferredStart) inferredStart = start;
      if (!inferredEnd || end > inferredEnd) inferredEnd = end;
    }
  }

  if (!inferredStart || !inferredEnd || inferredEnd < inferredStart) {
    return null;
  }

  const totalBudget = opts.totalBudget > 0
    ? opts.totalBudget
    : opts.phases.reduce((a, p) => a + p.costo_planeado, 0);

  if (totalBudget <= 0) return null;

  // If no phase dates, distribute the whole budget linearly across the
  // project window using a single synthetic phase.
  let effectivePhases: CurvePhaseInput[] =
    phasesWithDates.length > 0
      ? phasesWithDates
      : [
          {
            nombre: "Proyecto",
            fecha_inicio: isoDayString(inferredStart),
            fecha_fin: isoDayString(inferredEnd),
            costo_planeado: totalBudget,
            costo_real: opts.totalActualCost,
            porcentaje_completado: 0,
          },
        ];

  // Keep CPTP aligned with contractual total budget even when imported
  // phase costs are incomplete or come from a different source split.
  const phaseBudgetSum = effectivePhases.reduce(
    (sum, p) => sum + Math.max(0, p.costo_planeado),
    0,
  );
  if (phaseBudgetSum > 0 && totalBudget > 0) {
    const driftRatio = Math.abs(phaseBudgetSum - totalBudget) / totalBudget;
    if (driftRatio > 0.02) {
      const scale = totalBudget / phaseBudgetSum;
      effectivePhases = effectivePhases.map((p) => ({
        ...p,
        costo_planeado: p.costo_planeado * scale,
      }));
    }
  }

  // Build month-end checkpoints, capped at project end, and include a
  // "today" checkpoint so CPTR/CPTP to-date is explicit (not deferred to
  // month-end).
  const bucketEnds: Date[] = [];
  let cursor = startOfMonth(inferredStart);
  while (cursor <= inferredEnd) {
    bucketEnds.push(minDate(endOfMonth(cursor), inferredEnd));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  if (todayDay >= inferredStart && todayDay <= inferredEnd) {
    const hasToday = bucketEnds.some(
      (d) => isoDayString(d) === isoDayString(todayDay),
    );
    if (!hasToday) bucketEnds.push(todayDay);
  }
  bucketEnds.sort((a, b) => a.getTime() - b.getTime());

  const points: CurvePoint[] = [];

  let cumCptp = 0;
  let cumCptr = 0;
  let cumAcwp = 0;

  for (let i = 0; i < bucketEnds.length; i++) {
    const bucketEnd = bucketEnds[i];
    const bucketStart =
      i === 0 ? inferredStart : addDays(bucketEnds[i - 1], 1);
    let bucketCptp = 0;
    let bucketCptr = 0;
    let bucketAcwp = 0;

    for (const ph of effectivePhases) {
      const ps = new Date(ph.fecha_inicio!);
      const pe = new Date(ph.fecha_fin!);
      const phaseDuration = daysBetween(ps, pe);
      if (phaseDuration <= 0) continue;

      const overlap = overlapDays(ps, pe, bucketStart, bucketEnd);
      const planRatio = overlap / phaseDuration;
      const plannedBucket = ph.costo_planeado * planRatio;
      bucketCptp += plannedBucket;

      const completed = ph.porcentaje_completado / 100;
      const realizedEnd = minDate(todayDay, pe);
      const realizedDuration =
        realizedEnd >= ps ? daysBetween(ps, realizedEnd) : 0;
      const realizedElapsedDays = overlapDays(ps, realizedEnd, ps, bucketEnd);
      const realizedElapsedRatio =
        realizedDuration > 0
          ? Math.min(1, realizedElapsedDays / realizedDuration)
          : 0;
      // EV per bucket: interpolate earned value up to "today", then hold.
      const earnedToEndOfBucket =
        ph.costo_planeado * completed * realizedElapsedRatio;
      const previousRealizedElapsedDays = overlapDays(
        ps,
        realizedEnd,
        ps,
        addDays(bucketStart, -1),
      );
      const previousRealizedRatio =
        realizedDuration > 0
          ? Math.min(1, previousRealizedElapsedDays / realizedDuration)
          : 0;
      const earnedToPrevious =
        ph.costo_planeado * completed * previousRealizedRatio;
      bucketCptr += Math.max(0, earnedToEndOfBucket - earnedToPrevious);

      // ACWP: spread actual cost with the same realized window used for EV.
      const actualSpread =
        (ph.costo_real * (realizedElapsedRatio - previousRealizedRatio));
      if (Number.isFinite(actualSpread) && actualSpread > 0) {
        bucketAcwp += actualSpread;
      }
    }

    cumCptp += bucketCptp;
    cumCptr += bucketCptr;
    cumAcwp += bucketAcwp;

    points.push({
      fecha: isoDayString(bucketEnd),
      cptp: Math.round(cumCptp),
      cptr: Math.round(cumCptr),
      acwp: Math.round(cumAcwp),
      futuro: bucketEnd > todayDay,
    });
  }

  if (points.length > 0) {
    // Force the final point to close at total budget.
    points[points.length - 1].cptp = Math.round(totalBudget);
  }

  const lastPastIdx = (() => {
    let idx = -1;
    for (let i = 0; i < points.length; i++) {
      if (!points[i].futuro) idx = i;
    }
    return idx;
  })();

  const evTotal = lastPastIdx >= 0 ? points[lastPastIdx].cptr : 0;
  const pvAtNow = lastPastIdx >= 0 ? points[lastPastIdx].cptp : 0;
  const acAtNow = lastPastIdx >= 0 ? points[lastPastIdx].acwp : 0;

  const spi = pvAtNow > 0 ? evTotal / pvAtNow : null;
  const cpi =
    (opts.totalActualCost > 0 ? opts.totalActualCost : acAtNow) > 0
      ? evTotal / (opts.totalActualCost > 0 ? opts.totalActualCost : acAtNow)
      : null;

  return {
    points,
    presupuesto_total: totalBudget,
    ev_total: evTotal,
    spi: spi != null ? Number(spi.toFixed(3)) : null,
    cpi: cpi != null ? Number(cpi.toFixed(3)) : null,
    fecha_inicio: isoDayString(inferredStart),
    fecha_fin: isoDayString(inferredEnd),
    hoy: isoDayString(todayDay),
  };
}
