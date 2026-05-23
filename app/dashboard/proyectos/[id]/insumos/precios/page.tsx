import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FileUp, History, TableProperties } from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import { getRecentPriceBatches } from "@/lib/dashboard-data";
import { fmtDate } from "@/lib/format";
import { ingestSupplyPriceCsvBatch } from "@/lib/supply-price-etl";

export const dynamic = "force-dynamic";

interface PriceUploadPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PriceUploadPage({
  params,
  searchParams,
}: PriceUploadPageProps) {
  const { id: projectId } = await params;
  const paramsMap = (await searchParams) ?? {};
  const batches = await getRecentPriceBatches();

  const success = toSingle(paramsMap.success) === "1";
  const error = toSingle(paramsMap.error);
  const matched = Number(toSingle(paramsMap.matched) ?? "0");
  const total = Number(toSingle(paramsMap.total) ?? "0");
  const skipped = Number(toSingle(paramsMap.skipped) ?? "0");

  return (
    <>
      <Topbar
        title="Carga de precios"
        subtitle="Sube lotes CSV para monitorear alzas de insumos y su impacto sobre el presupuesto."
      />

      <div className="space-y-8 px-5 py-8 sm:px-8">
        {success ? (
          <Banner
            tone="ok"
            title="Lote procesado"
            message={`Se importaron ${matched} de ${total} filas. ${skipped} filas fueron descartadas por formato.`}
          />
        ) : null}

        {error ? (
          <Banner
            tone="risk"
            title="No se pudo importar el lote"
            message={error}
          />
        ) : null}

        <section className="grid gap-6 lg:grid-cols-12">
          <article className="rounded-2xl border border-line bg-canvas-raised lg:col-span-7">
            <header className="flex items-center gap-2 border-b border-line px-5 py-4">
              <FileUp className="h-4 w-4 text-ink-soft" aria-hidden="true" />
              <h2 className="font-display text-xl text-ink">Subir archivo</h2>
            </header>

            <form action={uploadSupplyPriceBatch} className="space-y-4 px-5 py-5">
              <input type="hidden" name="project_id" value={projectId} />
              <div>
                <label htmlFor="observed_at" className="block text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">
                  Fecha de referencia de mercado
                </label>
                <input
                  id="observed_at"
                  name="observed_at"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
                />
              </div>

              <div>
                <label htmlFor="price_file" className="block text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">
                  Archivo CSV
                </label>
                <input
                  id="price_file"
                  name="price_file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="mt-1 block w-full rounded-xl border border-dashed border-line bg-canvas px-3 py-2 text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1 file:text-xs file:font-medium file:text-canvas"
                />
                <p className="mt-1 text-xs text-ink-soft">
                  Encabezados válidos: <code>supply_id</code> o <code>nombre</code>, y <code>precio_actual</code>.
                </p>
              </div>

              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas hover:bg-ink/90"
              >
                Procesar lote
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-line bg-canvas-raised lg:col-span-5">
            <header className="flex items-center gap-2 border-b border-line px-5 py-4">
              <TableProperties className="h-4 w-4 text-ink-soft" aria-hidden="true" />
              <h2 className="font-display text-xl text-ink">Plantilla recomendada</h2>
            </header>
            <div className="space-y-3 px-5 py-5 text-sm text-ink-muted">
              <p>Usa el archivo con esta estructura mínima:</p>
              <pre className="overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-xs text-ink">
{"supply_id,nombre,unidad,precio_actual\n2ff7...,Cemento gris,kg,41250\n,Acero corrugado,kg,5820"}
              </pre>
              <p>
                Si <code>supply_id</code> está vacío, el sistema intentará mapear por
                <code> nombre</code> en <code>supply_catalog</code>.
              </p>
              <p>
                Las filas no mapeadas quedan registradas como <strong>unmatched</strong>
                para revisión.
              </p>
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised">
          <header className="flex items-center gap-2 border-b border-line px-5 py-4">
            <History className="h-4 w-4 text-ink-soft" aria-hidden="true" />
            <h2 className="font-display text-xl text-ink">Lotes recientes</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                  <th scope="col" className="px-5 py-3">Archivo</th>
                  <th scope="col" className="px-5 py-3">Referencia</th>
                  <th scope="col" className="px-5 py-3">Carga</th>
                  <th scope="col" className="px-5 py-3 text-right">Filas</th>
                  <th scope="col" className="px-5 py-3 text-right">Match</th>
                  <th scope="col" className="px-5 py-3 text-right">Unmatched</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-muted">
                      Aún no hay lotes de precios cargados.
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id} className="border-b border-line/70">
                      <td className="px-5 py-3.5 text-ink">{batch.source_file_name}</td>
                      <td className="px-5 py-3.5 text-ink-muted">{fmtDate(batch.observed_at)}</td>
                      <td className="px-5 py-3.5 text-ink-muted">{fmtDate(batch.created_at)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-ink">{batch.total_rows}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-status-ok">{batch.matched_rows}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-status-risk">{batch.unmatched_rows}</td>
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

async function uploadSupplyPriceBatch(formData: FormData) {
  "use server";

  const projectId = String(formData.get("project_id") ?? "").trim();
  const observedAt = String(formData.get("observed_at") ?? "").trim();
  const file = formData.get("price_file");

  if (!(file instanceof File) || !projectId) {
    redirect(`/dashboard/proyectos/${projectId || ""}/insumos/precios?error=Adjunta+un+archivo+CSV+valido`);
  }

  const fileName = file.name || "precios.csv";
  const csvText = await file.text();

  try {
    const summary = await ingestSupplyPriceCsvBatch({
      csvText,
      fileName,
      observedAt,
    });

    revalidatePath(`/dashboard/proyectos/${projectId}`);
    revalidatePath(`/dashboard/proyectos/${projectId}/insumos`);
    revalidatePath(`/dashboard/proyectos/${projectId}/costos`);
    revalidatePath(`/dashboard/proyectos/${projectId}/insumos/precios`);

    const query = new URLSearchParams({
      success: "1",
      matched: String(summary.matchedRows),
      total: String(summary.totalRows),
      skipped: String(summary.skippedRows),
    });

    redirect(`/dashboard/proyectos/${projectId}/insumos/precios?${query.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const query = new URLSearchParams({ error: message });
    redirect(`/dashboard/proyectos/${projectId}/insumos/precios?${query.toString()}`);
  }
}

function toSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function Banner({
  tone,
  title,
  message,
}: {
  tone: "ok" | "risk";
  title: string;
  message: string;
}) {
  const cls = tone === "ok"
    ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
    : "border-status-risk/30 bg-status-risk/10 text-status-risk";

  return (
    <div className={`rounded-2xl border px-5 py-3 ${cls}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs">{message}</p>
    </div>
  );
}
