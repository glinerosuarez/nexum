"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  createProjectAction,
  type CreateActionState,
} from "@/app/dashboard/proyectos/nuevo/actions";
import {
  type MergedContract,
  type ParsedPhase,
  type ShadowExtractionChunk,
} from "@/lib/contract-parser";

const createInitial: CreateActionState = { ok: false, message: null };

const ACCEPTED_TYPES =
  ".xml,.csv,.xlsx,.md,.markdown,.docx,.pdf,.png,.jpg,.jpeg,.webp,application/xml,text/xml,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";

const MAX_BYTES_PER_FILE = 32 * 1024 * 1024;

export function NewProjectWizard() {
  const [createState, createFormAction] = useActionState(
    createProjectAction,
    createInitial,
  );

  const [parsed, setParsed] = useState<MergedContract | null>(null);
  const [phases, setPhases] = useState<ParsedPhase[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [inputBatchId, setInputBatchId] = useState<string | null>(null);
  const [shadowExtractionChunks, setShadowExtractionChunks] = useState<
    ShadowExtractionChunk[]
  >([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | File[]) {
    setParseError(null);
    const next: File[] = [...files];
    for (const f of Array.from(incoming)) {
      if (f.size > MAX_BYTES_PER_FILE) {
        setParseError(`"${f.name}" supera el límite de 32 MB.`);
        continue;
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) {
        next.push(f);
      }
    }
    setFiles(next);
  }

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx));
  }

  async function analyze() {
    if (files.length === 0) return;
    setParseError(null);
    setParsing(true);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));

      const response = await fetch("/api/project-input-batches/analyze", {
        method: "POST",
        body,
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as {
        detail?: string;
        preview?: MergedContract;
        input_batch_id?: string;
        shadow_extraction_chunks?: ShadowExtractionChunk[];
      };
      if (!response.ok || !payload.preview || !payload.input_batch_id) {
        throw new Error(payload.detail ?? "No pudimos analizar los archivos.");
      }

      setParsed(payload.preview);
      setPhases(payload.preview.fases ?? []);
      setInputBatchId(payload.input_batch_id);
      setShadowExtractionChunks(payload.shadow_extraction_chunks ?? []);
    } catch (err) {
      setParseError(`No pudimos leer los archivos: ${(err as Error).message}`);
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setParsed(null);
    setPhases([]);
    setFiles([]);
    setInputBatchId(null);
    setShadowExtractionChunks([]);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!parsed) {
    return (
      <div className="space-y-6">
        <label
          htmlFor="contract"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) {
              addFiles(e.dataTransfer.files);
            }
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging
              ? "border-ink bg-ink/[0.03]"
              : "border-line bg-canvas-raised hover:border-ink/30 hover:bg-ink/[0.02]"
          }`}
        >
          <span
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-canvas"
          >
            <Upload className="h-5 w-5" />
          </span>
          <p className="mt-4 font-display text-lg text-ink">
            Arrastra uno o varios contratos o haz clic para seleccionar
          </p>
          <p className="mt-1.5 text-sm text-ink-muted">
            XML (MS Project) + APU (MD/CSV) + documentos. Mezclamos los datos
            automáticamente.
          </p>
          <input
            id="contract"
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="sr-only"
            disabled={parsing}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
            }}
          />
        </label>

        {files.length > 0 ? (
          <ul className="space-y-2">
            {files.map((f, idx) => (
              <li
                key={`${f.name}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas-raised px-3 py-2.5"
              >
                <span className="inline-flex min-w-0 items-center gap-2 text-sm text-ink">
                  <FileTypeIcon name={f.name} type={f.type} />
                  <span className="truncate font-mono text-xs">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-soft">
                    · {formatBytes(f.size)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  aria-label={`Quitar ${f.name}`}
                  className="rounded-full px-2 py-0.5 text-xs text-ink-soft hover:bg-ink/5 hover:text-status-risk"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {parseError ? (
          <div
            role="alert"
            className="rounded-xl border border-status-risk/30 bg-status-risk/5 px-4 py-3 text-sm text-status-risk"
          >
            {parseError}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard/proyectos"
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-ink-soft sm:inline">
              El análisis y la persistencia ocurren en el servidor.
            </span>
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={files.length === 0 || parsing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-canvas transition-colors hover:bg-[#1a1a1c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              {parsing
                ? "Analizando…"
                : `Analizar ${files.length || ""} archivo${files.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>

        <FormatsCard />
      </div>
    );
  }

  return (
    <form action={createFormAction} className="space-y-7" noValidate>
      <DetectionBanner
        source={parsed.source}
        confidence={parsed.confidence}
        notes={parsed.notas}
        filename={parsed.raw_filename}
        files={parsed.files}
        onReset={reset}
      />

      <section className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Nombre del proyecto"
          name="nombre"
          defaultValue={parsed.nombre}
          required
          className="sm:col-span-2"
        />
        <Field
          label="Descripción"
          name="descripcion"
          defaultValue={parsed.descripcion ?? ""}
          className="sm:col-span-2"
        />
        <Field
          label="Ubicación"
          name="ubicacion"
          defaultValue={parsed.ubicacion ?? ""}
        />
        <SelectField
          label="Estado"
          name="estado"
          defaultValue="en_ejecucion"
          options={[
            { value: "planificacion", label: "Planificación" },
            { value: "en_ejecucion", label: "En ejecución" },
            { value: "pausado", label: "Pausado" },
            { value: "finalizado", label: "Finalizado" },
            { value: "cancelado", label: "Cancelado" },
          ]}
        />
        <Field
          label="Fecha de inicio planeada"
          name="fecha_inicio_planeada"
          type="date"
          defaultValue={parsed.fecha_inicio_planeada ?? ""}
        />
        <Field
          label="Fecha de fin planeada"
          name="fecha_fin_planeada"
          type="date"
          defaultValue={parsed.fecha_fin_planeada ?? ""}
        />
        <Field
          label="Fecha de inicio real"
          name="fecha_inicio_real"
          type="date"
          defaultValue={parsed.fecha_inicio_real ?? ""}
        />
        <Field
          label={`Presupuesto total${parsed.moneda ? ` (${parsed.moneda})` : " (COP)"}`}
          name="presupuesto_total"
          type="number"
          step="0.01"
          inputMode="decimal"
          defaultValue={
            parsed.presupuesto_total != null
              ? String(parsed.presupuesto_total)
              : ""
          }
        />
      </section>

      <PhasesEditor phases={phases} onChange={setPhases} />
      <input type="hidden" name="phases_json" value={JSON.stringify(phases)} />
      <input type="hidden" name="input_batch_id" value={inputBatchId ?? ""} />
      <input
        type="hidden"
        name="shadow_extraction_chunks_json"
        value={JSON.stringify(shadowExtractionChunks)}
      />

      {createState.message && !createState.ok ? (
        <div
          role="alert"
          className="rounded-xl border border-status-risk/30 bg-status-risk/5 px-4 py-3 text-sm text-status-risk"
        >
          {createState.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-ink-muted hover:text-ink"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Subir otro archivo
        </button>
        <CreateSubmit />
      </div>
    </form>
  );
}

function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-[#1a1a1c] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Llamando al agente de insumos críticos...
          </>
        ) : (
          <>
            Crear proyecto
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>
      {pending ? (
        <p className="text-xs text-ink-soft">
          Esto puede tomar unos segundos mientras se calcula el riesgo de costos.
        </p>
      ) : null}
    </div>
  );
}

function DetectionBanner({
  confidence,
  notes,
  filename,
  files,
  onReset,
}: {
  source: string;
  confidence: string;
  notes: string[];
  filename: string;
  files?: { filename: string; source: string; confidence: string; contributed: string[] }[];
  onReset: () => void;
}) {
  const sourceLabel: Record<string, string> = {
    msproject_xml: "Microsoft Project (XML)",
    apu_markdown: "APU (Markdown)",
    csv: "CSV",
    xlsx: "Excel (XLSX)",
    markdown: "Markdown",
    docx: "Documento Word",
    pdf: "PDF",
    image: "Imagen",
    filename: "Archivo genérico",
  };
  const confidenceTone =
    confidence === "alta"
      ? "bg-status-ok/10 text-status-ok"
      : confidence === "media"
        ? "bg-status-warn/10 text-status-warn"
        : "bg-ink/5 text-ink-muted";

  return (
    <div className="rounded-2xl border border-line bg-canvas-raised p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-canvas"
        >
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">
              Datos detectados de {files?.length ?? 1} archivo{(files?.length ?? 1) === 1 ? "" : "s"}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${confidenceTone}`}
            >
              Confianza {confidence}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-ink-soft">{filename}</p>

          {files && files.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/70 bg-canvas px-2.5 py-1.5 text-[11px]"
                >
                  <span className="inline-flex items-center gap-2 truncate text-ink">
                    <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                      {sourceLabel[f.source] ?? f.source}
                    </span>
                    <span className="truncate font-mono">{f.filename}</span>
                  </span>
                  <span className="text-ink-soft">
                    {f.contributed.length > 0
                      ? `aporta: ${f.contributed.join(", ")}`
                      : "sin aporte"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {notes.length > 0 ? (
            <details className="mt-3 text-xs text-ink-muted">
              <summary className="cursor-pointer text-ink-soft hover:text-ink">
                Ver notas de extracción ({notes.length})
              </summary>
              <ul className="mt-2 space-y-0.5">
                {notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-ink-muted hover:text-ink"
        >
          Cambiar
        </button>
      </div>
    </div>
  );
}

function PhasesEditor({
  phases,
  onChange,
}: {
  phases: ParsedPhase[];
  onChange: (next: ParsedPhase[]) => void;
}) {
  function updatePhase(idx: number, nombre: string) {
    const next = phases.slice();
    next[idx] = { ...next[idx], nombre };
    onChange(next);
  }
  function removePhase(idx: number) {
    onChange(phases.filter((_, i) => i !== idx));
  }
  function addPhase() {
    onChange([
      ...phases,
      {
        nombre: "",
        sort_order: phases.length + 1,
        fecha_inicio: null,
        fecha_fin: null,
        porcentaje_completado: null,
        costo: null,
      },
    ]);
  }

  return (
    <section className="rounded-2xl border border-line bg-canvas-raised p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-ink">Fases del proyecto</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {phases.length > 0
              ? `${phases.length} fase${phases.length === 1 ? "" : "s"} detectada${phases.length === 1 ? "" : "s"}. Edítalas si es necesario.`
              : "No detectamos fases. Puedes agregarlas manualmente."}
          </p>
        </div>
        <button
          type="button"
          onClick={addPhase}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-xs font-medium text-ink hover:border-ink/30"
        >
          + Agregar fase
        </button>
      </div>

      {phases.length === 0 ? null : (
        <ul className="mt-5 space-y-2">
          {phases.map((ph, idx) => (
            <li
              key={idx}
              className="grid grid-cols-12 items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2"
            >
              <span className="col-span-1 text-center font-mono text-xs text-ink-soft">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <input
                value={ph.nombre}
                onChange={(e) => updatePhase(idx, e.target.value)}
                placeholder="Nombre de la fase"
                className="col-span-7 h-9 rounded-lg border border-transparent bg-transparent px-2 text-sm text-ink outline-none focus:border-line focus:bg-canvas-raised"
              />
              <span className="col-span-3 text-right font-mono text-[11px] text-ink-soft">
                {ph.fecha_inicio ?? "—"} → {ph.fecha_fin ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => removePhase(idx)}
                aria-label={`Eliminar fase ${idx + 1}`}
                className="col-span-1 text-right text-xs text-ink-soft hover:text-status-risk"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue = "",
  step,
  inputMode,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  step?: string;
  inputMode?: "decimal" | "numeric" | "text";
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft"
      >
        {label} {required ? <span className="text-status-risk">*</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        inputMode={inputMode}
        required={required}
        defaultValue={defaultValue}
        className="mt-2 h-11 w-full rounded-xl border border-line bg-canvas-raised px-3.5 text-[15px] text-ink shadow-soft outline-none transition-colors placeholder:text-ink-soft focus:border-ink/40 focus:ring-2 focus:ring-accent/30"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="mt-2 h-11 w-full rounded-xl border border-line bg-canvas-raised px-3 text-[15px] text-ink shadow-soft outline-none transition-colors focus:border-ink/40 focus:ring-2 focus:ring-accent/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormatsCard() {
  const items = [
    {
      ext: "XML",
      label:
        "Microsoft Project — extracción rica de nombre, fechas, presupuesto y fases.",
    },
    {
      ext: "CSV",
      label:
        "Detección por columnas: nombre, ubicación, fechas, presupuesto, fases.",
    },
    {
      ext: "DOCX",
      label: "Documento Word — completarás los campos manualmente.",
    },
    { ext: "PDF", label: "Contrato PDF — completarás los campos manualmente." },
    {
      ext: "IMG",
      label: "PNG/JPG/WEBP — usamos el nombre del archivo como referencia.",
    },
  ];
  return (
    <div className="rounded-2xl border border-dashed border-line bg-canvas-raised p-5">
      <h3 className="font-display text-lg text-ink">Formatos soportados</h3>
      <ul className="mt-4 grid gap-3 text-sm text-ink-muted sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.ext} className="flex items-start gap-3">
            <span className="grid h-7 w-10 shrink-0 place-items-center rounded-md bg-ink font-mono text-[10px] uppercase text-canvas">
              {i.ext}
            </span>
            <p className="text-[13px] leading-snug">{i.label}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileTypeIcon({ name, type }: { name: string; type: string }) {
  if (type.startsWith("image/"))
    return (
      <ImageIcon className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
    );
  if (name.toLowerCase().endsWith(".xml"))
    return <FileText className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />;
  return <FileText className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
