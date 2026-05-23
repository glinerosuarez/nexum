import { Banknote, Receipt, Users, Wallet } from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import { POStatusBadge } from "@/components/dashboard/SupplyBadges";
import { KPICard } from "@/components/dashboard/KPICard";
import { getCostsData } from "@/lib/dashboard-data";
import { fmtCOP, fmtCOPCompact, fmtDate, fmtPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

interface CostosPageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function CostosPage({ searchParams }: CostosPageProps) {
  const { project: projectId } = await searchParams;
  const data = await getCostsData(projectId);
  const { project, budgetByPhase, purchaseOrders, gastoPorCategoria } = data;

  const presupuesto = project?.presupuesto_total ?? 0;
  const gasto = project?.gasto_ejecutado ?? 0;
  const consumido = presupuesto > 0 ? (gasto / presupuesto) * 100 : 0;
  const restante = Math.max(presupuesto - gasto, 0);
  const totalGastoCategorias = gastoPorCategoria.reduce(
    (acc, c) => acc + c.monto,
    0,
  );

  return (
    <>
      <Topbar
        title="Costos"
        subtitle="Presupuesto APU, gasto ejecutado, órdenes prioritarias y nómina del proyecto."
      />

      <div className="space-y-8 px-5 py-8 sm:px-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Presupuesto total APU"
            value={fmtCOP(presupuesto)}
            hint="Cantidad planeada × precio unitario"
            icon={Wallet}
            highlight
          />
          <KPICard
            label="Gasto ejecutado"
            value={fmtCOP(gasto)}
            hint={`${fmtPercent(consumido, { decimals: 1 })} del presupuesto`}
            icon={Banknote}
            delta={{
              value: `Saldo ${fmtCOPCompact(restante)}`,
              tone: consumido < 100 ? "ok" : "risk",
            }}
          />
          <KPICard
            label="OC prioritarias"
            value={fmtCOP(data.ordenesPrioritarias)}
            hint="Órdenes que incluyen insumos críticos"
            icon={Receipt}
          />
          <KPICard
            label="Nómina del proyecto"
            value={fmtCOP(data.nominaTotal)}
            hint="Total neto pagado por periodos"
            icon={Users}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-12">
          <article className="rounded-2xl border border-line bg-canvas-raised lg:col-span-7">
            <header className="border-b border-line px-5 py-4">
              <h2 className="font-display text-xl text-ink">
                Presupuesto vs ejecutado por fase
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Aproximación: ejecutado = cantidad ejecutada × precio unitario APU.
              </p>
            </header>
            {budgetByPhase.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">
                Aún no hay fases con APU cargado.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {budgetByPhase.map((ph) => {
                  const pct = ph.presupuesto > 0
                    ? (ph.ejecutado_aprox / ph.presupuesto) * 100
                    : 0;
                  return (
                    <li key={ph.phase_id} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-ink">{ph.nombre}</p>
                        <div className="text-right font-mono text-sm text-ink">
                          {fmtCOPCompact(ph.ejecutado_aprox)}{" "}
                          <span className="text-ink-soft">/</span>{" "}
                          {fmtCOPCompact(ph.presupuesto)}
                        </div>
                      </div>
                      <div
                        className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/5"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-full rounded-full ${
                            pct > 100
                              ? "bg-status-risk"
                              : pct > 85
                                ? "bg-status-warn"
                                : "bg-ink"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
                        <span>{fmtPercent(pct, { decimals: 0 })} consumido</span>
                        <span>Avance promedio {fmtPercent(ph.avance_promedio, { decimals: 0 })}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>

          <article className="rounded-2xl border border-line bg-canvas-raised lg:col-span-5">
            <header className="border-b border-line px-5 py-4">
              <h2 className="font-display text-xl text-ink">
                Distribución del gasto
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Composición por categoría de salida.
              </p>
            </header>
            <ul className="space-y-3 p-5">
              {gastoPorCategoria.map((c) => {
                const pct = totalGastoCategorias > 0
                  ? (c.monto / totalGastoCategorias) * 100
                  : 0;
                return (
                  <li key={c.categoria}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <p className="text-ink">{c.categoria}</p>
                      <p className="font-mono text-ink">{fmtCOPCompact(c.monto)}</p>
                    </div>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/5"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-soft">
                      {fmtPercent(pct, { decimals: 1 })} del gasto registrado
                    </p>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-xl text-ink">Órdenes de compra</h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Las prioritarias contienen al menos un insumo crítico.
              </p>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                  <th scope="col" className="px-5 py-3">OC</th>
                  <th scope="col" className="px-5 py-3">Proveedor</th>
                  <th scope="col" className="px-5 py-3">Estado</th>
                  <th scope="col" className="px-5 py-3">Emisión</th>
                  <th scope="col" className="px-5 py-3">Entrega esperada</th>
                  <th scope="col" className="px-5 py-3 text-right">Total</th>
                  <th scope="col" className="px-5 py-3 text-right">Pagado</th>
                  <th scope="col" className="px-5 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-10 text-center text-sm text-ink-muted"
                    >
                      Aún no hay órdenes de compra registradas.
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr
                      key={po.id}
                      className={`border-b border-line/70 transition-colors ${
                        po.prioritario ? "bg-accent-soft/40" : "hover:bg-ink/[0.02]"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-ink">{po.order_number}</p>
                          {po.prioritario ? (
                            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-canvas">
                              Prioritaria
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-ink-soft">
                          {po.items_count} ítem{po.items_count === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-ink">{po.supplier_nombre}</td>
                      <td className="px-5 py-4">
                        <POStatusBadge status={po.estado} />
                      </td>
                      <td className="px-5 py-4 text-ink-muted">{fmtDate(po.fecha_emision)}</td>
                      <td className="px-5 py-4 text-ink-muted">
                        {fmtDate(po.fecha_entrega_esperada)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtCOP(po.total)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-status-ok">
                        {fmtCOP(po.pagado)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtCOP(po.saldo)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
