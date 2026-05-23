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
  parseContractFile,
  type ParsedContract,
  type ParsedPhase,
} from "@/lib/contract-parser";

const createInitial: CreateActionState = { ok: false, message: null };

const ACCEPTED_TYPES =
  ".xml,.csv,.docx,.pdf,.png,.jpg,.jpeg,.webp,application/xml,text/xml,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";

const MAX_BYTES = 32 * 1024 * 1024;

export function NewProjectWizard() {
  const [createState, createFormAction] = useActionState(
    createProjectAction,
    createInitial,
  );

  const [parsed, setParsed] = useState<ParsedContract | null>(null);
  const [phases, setPhases] = useState<ParsedPhase[]>([]);
  const [fileMeta, setFileMeta] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setParseError(null);
    setFileMeta({ name: file.name, size: file.size, type: file.type });

    if (file.size > MAX_BYTES) {
      setParseError("El archivo supera el límite de 32 MB.");
      return;
    }

    setParsing(true);
    try {
      const result = await parseContractFile(file);
      setParsed(result);
      setPhases(result.fases ?? []);
    } catch (err) {
      setParseError(`No pudimos leer el contrato: ${(err as Error).message}`);
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setParsed(null);
    setPhases([]);
    setFileMeta(null);
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
            const f = e.dataTransfer.files?.[0];
            if (f) {
              if (fileInputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(f);
                fileInputRef.current.files = dt.files;
              }
              void handleFile(f);
            }
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging
              ? "border-ink bg-ink/[0.03]"
              : "border-line bg-canvas-raised hover:border-ink/30 hover:bg-ink/[0.02]"
          }`}
        >
          <span
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-canvas"
          >
            {parsing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </span>
          <p className="mt-4 font-display text-lg text-ink">
            {parsing
              ? "Analizando contrato…"
              : "Arrastra el contrato aquí o haz clic para seleccionar"}
          </p>
          <p className="mt-1.5 text-sm text-ink-muted">
            Acepta XML (MS Project), CSV, DOCX, PDF e imágenes (PNG, JPG).
          </p>
          <input
            id="contract"
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="sr-only"
            disabled={parsing}
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          {fileMeta ? (
            <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink">
              <FileTypeIcon name={fileMeta.name} type={fileMeta.type} />
              <span className="font-mono">{fileMeta.name}</span>
              <span className="text-ink-soft">
                · {formatBytes(fileMeta.size)}
              </span>
            </span>
          ) : null}
        </label>

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
          <span className="text-xs text-ink-soft">
            El análisis se hace en tu navegador — el archivo no sube al servidor.
          </span>
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
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-[#1a1a1c] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <>
          Crear proyecto
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </>
      )}
    </button>
  );
}

function DetectionBanner({
  source,
  confidence,
  notes,
  filename,
  onReset,
}: {
  source: string;
  confidence: string;
  notes: string[];
  filename: string;
  onReset: () => void;
}) {
  const sourceLabel: Record<string, string> = {
    msproject_xml: "Microsoft Project (XML)",
    csv: "CSV",
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
              Detectamos los datos del contrato
            </p>
            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink">
              {sourceLabel[source] ?? source}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${confidenceTone}`}
            >
              Confianza {confidence}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-ink-soft">
            {filename}
          </p>
          {notes.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
              {notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
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
