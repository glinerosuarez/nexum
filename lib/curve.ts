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
  const today = opts.today ?? new Date();

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
  const effectivePhases: CurvePhaseInput[] =
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

  // Build monthly buckets between start and end (inclusive).
  const buckets: { monthStart: Date; monthEnd: Date }[] = [];
  let cursor = startOfMonth(inferredStart);
  while (cursor <= inferredEnd) {
    buckets.push({ monthStart: cursor, monthEnd: endOfMonth(cursor) });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const points: CurvePoint[] = [];

  let cumCptp = 0;
  let cumCptr = 0;
  let cumAcwp = 0;

  for (const b of buckets) {
    let bucketCptp = 0;
    let bucketCptr = 0;
    let bucketAcwp = 0;

    for (const ph of effectivePhases) {
      const ps = new Date(ph.fecha_inicio!);
      const pe = new Date(ph.fecha_fin!);
      const phaseDuration = daysBetween(ps, pe);
      if (phaseDuration <= 0) continue;

      const overlap = overlapDays(ps, pe, b.monthStart, b.monthEnd);
      const planRatio = overlap / phaseDuration;
      const plannedBucket = ph.costo_planeado * planRatio;
      bucketCptp += plannedBucket;

      // Earned value: scale the phase's % complete by the proportion of
      // planned time elapsed up to the end of this bucket.
      const elapsedDays = overlapDays(ps, pe, ps, b.monthEnd);
      const elapsedRatio = Math.min(1, elapsedDays / phaseDuration);
      const completed = ph.porcentaje_completado / 100;
      // EV per bucket: contribution of new earned value vs previous month.
      const earnedToEndOfBucket =
        ph.costo_planeado * Math.min(elapsedRatio, completed);
      const previousElapsedDays = overlapDays(
        ps,
        pe,
        ps,
        new Date(b.monthStart.getTime() - 86400000),
      );
      const previousRatio = Math.min(1, previousElapsedDays / phaseDuration);
      const earnedToPrevious =
        ph.costo_planeado * Math.min(previousRatio, completed);
      bucketCptr += Math.max(0, earnedToEndOfBucket - earnedToPrevious);

      // ACWP: spread the phase's actual cost linearly over completed days
      const actualSpread =
        (ph.costo_real * (elapsedRatio - previousRatio));
      if (Number.isFinite(actualSpread) && actualSpread > 0) {
        bucketAcwp += actualSpread;
      }
    }

    cumCptp += bucketCptp;
    cumCptr += bucketCptr;
    cumAcwp += bucketAcwp;

    points.push({
      fecha: isoDayString(b.monthEnd),
      cptp: Math.round(cumCptp),
      cptr: Math.round(cumCptr),
      acwp: Math.round(cumAcwp),
      futuro: b.monthEnd > today,
    });
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
    hoy: isoDayString(today),
  };
}
