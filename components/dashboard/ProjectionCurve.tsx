import type { CurveData } from "@/lib/curve";
import { fmtCOPCompact, fmtDate, fmtNumber } from "@/lib/format";

interface ProjectionCurveProps {
  data: CurveData | null;
}

export function ProjectionCurve({ data }: ProjectionCurveProps) {
  if (!data || data.points.length < 2) {
    return (
      <section className="rounded-2xl border border-line bg-canvas-raised">
        <header className="border-b border-line px-5 py-4">
          <h2 className="font-display text-xl text-ink">
            Curva de proyección · CPTP / CPTR
          </h2>
        </header>
        <div className="px-5 py-12 text-center text-sm text-ink-muted">
          Aún no hay datos suficientes para construir la curva. Carga un
          cronograma con fechas por fase para ver el presupuesto en el tiempo.
        </div>
      </section>
    );
  }

  const { points, presupuesto_total, ev_total, spi, cpi, hoy, fecha_inicio, fecha_fin } = data;

  const width = 880;
  const height = 320;
  const padding = { top: 32, right: 28, bottom: 44, left: 76 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxY = Math.max(
    presupuesto_total,
    ...points.map((p) => Math.max(p.cptp, p.cptr, p.acwp)),
  );
  const minDate = new Date(points[0].fecha).getTime();
  const maxDate = new Date(points[points.length - 1].fecha).getTime();

  const x = (iso: string) => {
    const t = new Date(iso).getTime();
    const ratio = (t - minDate) / Math.max(1, maxDate - minDate);
    return padding.left + ratio * innerW;
  };
  const y = (value: number) => {
    const ratio = value / Math.max(1, maxY);
    return padding.top + (1 - ratio) * innerH;
  };

  const pathFor = (key: "cptp" | "cptr") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.fecha).toFixed(1)} ${y(p[key]).toFixed(1)}`)
      .join(" ");

  // Split CPTP into "actual" (solid) up to today and "projected" (dashed)
  // after today, so the planned curve reads as a forecast going forward.
  const todayIdx = points.findIndex((p) => p.futuro);
  const cptpPath = pathFor("cptp");
  const cptrPath = pathFor("cptr");

  const todayX = todayIdx >= 0 ? x(points[todayIdx].fecha) : null;

  const ticks = makeYTicks(maxY, 4);
  const xTicks = makeXTicks(points);

  const presupuestoLineY = y(presupuesto_total);

  return (
    <section className="rounded-2xl border border-line bg-canvas-raised">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-xl text-ink">
            Curva de proyección · CPTP / CPTR
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Presupuesto distribuido en el tiempo entre {fmtDate(fecha_inicio)} y {fmtDate(fecha_fin)}.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 text-right text-xs">
          <div>
            <dt className="text-ink-soft">CPTP a hoy</dt>
            <dd className="mt-0.5 font-mono text-sm text-ink">
              {fmtCOPCompact(valueAt(points, hoy, "cptp"))}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">CPTR (EV)</dt>
            <dd className="mt-0.5 font-mono text-sm text-ink">
              {fmtCOPCompact(ev_total)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">SPI · CPI</dt>
            <dd className="mt-0.5 font-mono text-sm text-ink">
              {spi != null ? fmtNumber(spi, { decimals: 2 }) : "—"} ·{" "}
              {cpi != null ? fmtNumber(cpi, { decimals: 2 }) : "—"}
            </dd>
          </div>
        </dl>
      </header>

      <div className="px-5 py-6">
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Curva de proyección de costos en el tiempo"
            className="block w-full min-w-[560px]"
          >
            {ticks.map((t, i) => (
              <g key={`y-${i}`}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#E5E2DA"
                  strokeDasharray="3 4"
                />
                <text
                  x={padding.left - 8}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-current text-[10px] text-ink-soft"
                  style={{ fill: "#8A8983" }}
                >
                  {fmtCOPCompact(t)}
                </text>
              </g>
            ))}

            {xTicks.map((t, i) => (
              <g key={`x-${i}`}>
                <line
                  x1={x(t.iso)}
                  x2={x(t.iso)}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke="#EFEDE6"
                />
                <text
                  x={x(t.iso)}
                  y={height - padding.bottom + 14}
                  textAnchor="middle"
                  className="fill-current text-[10px]"
                  style={{ fill: "#8A8983" }}
                >
                  {t.label}
                </text>
              </g>
            ))}

            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={presupuestoLineY}
              y2={presupuestoLineY}
              stroke="#0B0B0C"
              strokeOpacity="0.25"
              strokeDasharray="2 4"
            />
            <text
              x={width - padding.right}
              y={presupuestoLineY - 6}
              textAnchor="end"
              className="text-[10px]"
              style={{ fill: "#0B0B0C", fillOpacity: 0.55 }}
            >
              Presupuesto · {fmtCOPCompact(presupuesto_total)}
            </text>

            {todayX != null ? (
              <g>
                <line
                  x1={todayX}
                  x2={todayX}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke="#B45309"
                  strokeOpacity="0.4"
                  strokeDasharray="4 4"
                />
                <text
                  x={todayX + 4}
                  y={padding.top + 10}
                  className="text-[10px]"
                  style={{ fill: "#B45309" }}
                >
                  Hoy
                </text>
              </g>
            ) : null}

            <path
              d={cptpPath}
              fill="none"
              stroke="#0B0B0C"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={todayIdx > 0 ? "0" : "4 4"}
            />

            <path
              d={cptrPath}
              fill="none"
              stroke="#B45309"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {points.map((p, i) => (
              <circle
                key={i}
                cx={x(p.fecha)}
                cy={y(p.cptr)}
                r="2.5"
                fill="#B45309"
              />
            ))}
          </svg>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-5 text-xs">
          <LegendDot color="#0B0B0C" label="CPTP — Costo presupuestado del trabajo programado (PV)" />
          <LegendDot color="#B45309" label="CPTR — Costo presupuestado del trabajo realizado (EV)" />
          <LegendDot
            color="#0B0B0C"
            label="Línea de presupuesto total"
            dashed
            muted
          />
        </div>
      </div>
    </section>
  );
}

function LegendDot({
  color,
  label,
  dashed = false,
  muted = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  muted?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-muted">
      <svg width="22" height="6" aria-hidden="true">
        <line
          x1="0"
          x2="22"
          y1="3"
          y2="3"
          stroke={color}
          strokeOpacity={muted ? 0.45 : 1}
          strokeWidth="2"
          strokeDasharray={dashed ? "3 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function makeYTicks(max: number, count: number): number[] {
  if (max <= 0) return [0];
  const step = max / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(step * i);
  return ticks;
}

function makeXTicks(
  points: { fecha: string }[],
): { iso: string; label: string }[] {
  if (points.length === 0) return [];
  const wanted = Math.min(6, points.length);
  const stride = Math.max(1, Math.floor((points.length - 1) / (wanted - 1 || 1)));
  const labels = new Intl.DateTimeFormat("es-CO", {
    month: "short",
    year: "2-digit",
  });
  const ticks: { iso: string; label: string }[] = [];
  for (let i = 0; i < points.length; i += stride) {
    const d = new Date(points[i].fecha);
    ticks.push({ iso: points[i].fecha, label: labels.format(d) });
  }
  const last = points[points.length - 1];
  if (ticks[ticks.length - 1]?.iso !== last.fecha) {
    ticks.push({ iso: last.fecha, label: labels.format(new Date(last.fecha)) });
  }
  return ticks;
}

function valueAt(
  points: { fecha: string; cptp: number }[],
  isoDay: string,
  key: "cptp" | "cptr" | "acwp",
): number {
  const target = new Date(isoDay).getTime();
  let best = points[0];
  for (const p of points) {
    if (new Date(p.fecha).getTime() <= target) best = p;
    else break;
  }
  // @ts-expect-error indexed read on union
  return Number(best[key] ?? 0);
}
