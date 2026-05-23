import { XMLParser } from "fast-xml-parser";
import Papa from "papaparse";

export type ContractSource =
  | "msproject_xml"
  | "csv"
  | "docx"
  | "pdf"
  | "image"
  | "filename";

export interface ParsedPhase {
  nombre: string;
  sort_order: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  porcentaje_completado: number | null;
  costo: number | null;
}

export interface ParsedContract {
  source: ContractSource;
  confidence: "alta" | "media" | "baja";
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  fecha_inicio_planeada: string | null;
  fecha_fin_planeada: string | null;
  fecha_inicio_real: string | null;
  presupuesto_total: number | null;
  moneda: string | null;
  costo_real: number | null;
  costo_restante: number | null;
  porcentaje_completado: number | null;
  fases: ParsedPhase[];
  notas: string[];
  raw_filename: string;
}

const HOURS_REGEX = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/;

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function decodeName(raw: string): string {
  return raw
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyResult(filename: string, source: ContractSource): ParsedContract {
  return {
    source,
    confidence: "baja",
    nombre: decodeName(filename),
    descripcion: null,
    ubicacion: null,
    fecha_inicio_planeada: null,
    fecha_fin_planeada: null,
    fecha_inicio_real: null,
    presupuesto_total: null,
    moneda: null,
    costo_real: null,
    costo_restante: null,
    porcentaje_completado: null,
    fases: [],
    notas: [],
    raw_filename: filename,
  };
}

function parseMsProjectXml(xmlText: string, filename: string): ParsedContract {
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });

  const result = emptyResult(filename, "msproject_xml");

  let doc: unknown;
  try {
    doc = parser.parse(xmlText);
  } catch (err) {
    result.notas.push(`No se pudo parsear el XML: ${(err as Error).message}`);
    return result;
  }

  const project = (doc as { Project?: Record<string, unknown> } | undefined)?.Project;
  if (!project) {
    result.notas.push("El XML no parece ser un archivo de Microsoft Project.");
    return result;
  }

  const title = (project["Title"] as string | undefined) ?? "";
  const projectName = (project["Name"] as string | undefined) ?? "";
  const startDate = isoDate(project["StartDate"] as string | undefined);
  const finishDate = isoDate(project["FinishDate"] as string | undefined);
  const currency = (project["CurrencyCode"] as string | undefined) ?? null;

  const tasksContainer = project["Tasks"] as Record<string, unknown> | undefined;
  const taskList: Record<string, unknown>[] = (() => {
    if (!tasksContainer) return [];
    const t = tasksContainer["Task"];
    if (!t) return [];
    return Array.isArray(t)
      ? (t as Record<string, unknown>[])
      : [t as Record<string, unknown>];
  })();

  const summaryTask = taskList.find(
    (task) => task["OutlineLevel"] === "0" || task["OutlineLevel"] === 0,
  );
  const rootTask =
    taskList.find(
      (task) => task["OutlineLevel"] === "1" || task["OutlineLevel"] === 1,
    ) ?? summaryTask;

  const nombre =
    (rootTask?.["Name"] as string | undefined) ||
    title ||
    decodeName(projectName) ||
    decodeName(filename);

  const presupuesto = asNumber(rootTask?.["Cost"]) ?? asNumber(summaryTask?.["Cost"]);
  const costoReal =
    asNumber(rootTask?.["ActualCost"]) ?? asNumber(summaryTask?.["ActualCost"]);
  const costoRestante =
    asNumber(rootTask?.["RemainingCost"]) ?? asNumber(summaryTask?.["RemainingCost"]);
  const porcentaje =
    asNumber(rootTask?.["PercentComplete"]) ??
    asNumber(summaryTask?.["PercentComplete"]);

  const fechaInicioReal = isoDate(
    (rootTask?.["ActualStart"] as string | undefined) ??
      (summaryTask?.["ActualStart"] as string | undefined),
  );

  const fechaInicio =
    isoDate(rootTask?.["Start"] as string | undefined) ?? startDate;
  const fechaFin =
    isoDate(rootTask?.["Finish"] as string | undefined) ?? finishDate;

  const phaseTasks = taskList
    .filter((task) => {
      const level = Number(task["OutlineLevel"] ?? 0);
      const isSummary = task["Summary"] === "1" || task["Summary"] === 1;
      return level === 2 && isSummary;
    })
    .slice(0, 25);

  const fases: ParsedPhase[] = phaseTasks.map((task, idx) => ({
    nombre: cleanPhaseName(
      (task["Name"] as string | undefined) ?? `Fase ${idx + 1}`,
    ),
    sort_order: idx + 1,
    fecha_inicio: isoDate(task["Start"] as string | undefined),
    fecha_fin: isoDate(task["Finish"] as string | undefined),
    porcentaje_completado: asNumber(task["PercentComplete"]),
    costo: asNumber(task["Cost"]),
  }));

  if (fases.length === 0) {
    const subtasks = taskList
      .filter((task) => {
        const level = Number(task["OutlineLevel"] ?? 0);
        return level >= 2 && level <= 3;
      })
      .slice(0, 12);
    fases.push(
      ...subtasks.map((task, idx) => ({
        nombre: cleanPhaseName(
          (task["Name"] as string | undefined) ?? `Fase ${idx + 1}`,
        ),
        sort_order: idx + 1,
        fecha_inicio: isoDate(task["Start"] as string | undefined),
        fecha_fin: isoDate(task["Finish"] as string | undefined),
        porcentaje_completado: asNumber(task["PercentComplete"]),
        costo: asNumber(task["Cost"]),
      })),
    );
  }

  result.confidence = "alta";
  result.nombre = nombre.trim();
  result.descripcion = title && title !== nombre ? title : null;
  result.fecha_inicio_planeada = fechaInicio;
  result.fecha_fin_planeada = fechaFin;
  result.fecha_inicio_real = fechaInicioReal;
  result.presupuesto_total = presupuesto;
  result.moneda = currency;
  result.costo_real = costoReal;
  result.costo_restante = costoRestante;
  result.porcentaje_completado = porcentaje;
  result.fases = fases;

  const taskCount = taskList.length;
  if (taskCount > 0) {
    result.notas.push(
      `Detectadas ${taskCount} tareas y ${fases.length} fase${fases.length === 1 ? "" : "s"} en el cronograma.`,
    );
  }

  const location = detectLocation(nombre);
  if (location) result.ubicacion = location;

  return result;
}

function cleanPhaseName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 120);
}

function detectLocation(name: string): string | null {
  const ciudades = [
    "Cartagena",
    "Bogotá",
    "Bogota",
    "Medellín",
    "Medellin",
    "Cali",
    "Barranquilla",
    "Bucaramanga",
    "Pereira",
    "Santa Marta",
  ];
  for (const c of ciudades) {
    if (name.toLowerCase().includes(c.toLowerCase())) {
      return c;
    }
  }
  return null;
}

function parseCsv(text: string, filename: string): ParsedContract {
  const result = emptyResult(filename, "csv");

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    result.notas.push(`CSV con ${parsed.errors.length} advertencias de parseo.`);
  }

  const rows = parsed.data ?? [];
  if (rows.length === 0) {
    result.notas.push("El CSV está vacío o sin encabezados.");
    return result;
  }

  const firstRow = rows[0];
  const nombre =
    pickField(firstRow, ["nombre", "name", "proyecto", "project"]) ??
    decodeName(filename);
  const ubicacion = pickField(firstRow, [
    "ubicacion",
    "ubicación",
    "location",
    "ciudad",
  ]);
  const fechaInicio = isoDate(
    pickField(firstRow, [
      "fecha_inicio",
      "fecha inicio",
      "start_date",
      "start",
      "inicio",
    ]),
  );
  const fechaFin = isoDate(
    pickField(firstRow, [
      "fecha_fin",
      "fecha fin",
      "end_date",
      "finish",
      "fin",
    ]),
  );
  const presupuesto = pickNumber(firstRow, [
    "presupuesto",
    "budget",
    "valor",
    "valor_contrato",
    "monto",
  ]);

  result.confidence = nombre ? "media" : "baja";
  result.nombre = nombre;
  result.ubicacion = ubicacion ?? detectLocation(nombre);
  result.fecha_inicio_planeada = fechaInicio;
  result.fecha_fin_planeada = fechaFin;
  result.presupuesto_total = presupuesto;

  const phaseRows = rows
    .map((r, idx) => {
      const nm = pickField(r, ["fase", "phase", "etapa", "nombre", "name"]);
      if (!nm) return null;
      return {
        nombre: cleanPhaseName(nm),
        sort_order: idx + 1,
        fecha_inicio: isoDate(
          pickField(r, ["fecha_inicio", "start_date", "start"]),
        ),
        fecha_fin: isoDate(pickField(r, ["fecha_fin", "end_date", "finish"])),
        porcentaje_completado: pickNumber(r, ["porcentaje", "percent", "avance"]),
        costo: pickNumber(r, ["costo", "cost", "presupuesto", "monto"]),
      } satisfies ParsedPhase;
    })
    .filter((p): p is ParsedPhase => p !== null);

  if (phaseRows.length > 1) {
    result.fases = phaseRows.slice(0, 25);
    result.notas.push(`${phaseRows.length} fase(s) detectadas desde filas.`);
  }

  return result;
}

function pickField(
  row: Record<string, string>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function pickNumber(
  row: Record<string, string>,
  keys: string[],
): number | null {
  const raw = pickField(row, keys);
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseFallback(
  filename: string,
  source: ContractSource,
  textHint: string,
): ParsedContract {
  const result = emptyResult(filename, source);
  result.notas.push(textHint);
  return result;
}

export async function parseContractFile(file: File): Promise<ParsedContract> {
  const filename = file.name || "contrato";
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const mime = file.type ?? "";

  if (ext === "xml" || mime === "text/xml" || mime === "application/xml") {
    const text = await file.text();
    return parseMsProjectXml(text, filename);
  }

  if (ext === "csv" || mime === "text/csv" || mime === "application/csv") {
    const text = await file.text();
    return parseCsv(text, filename);
  }

  if (ext === "docx" || mime.includes("wordprocessingml")) {
    return parseFallback(
      filename,
      "docx",
      "Documento Word detectado. Completa los datos manualmente o sube el cronograma en XML/CSV para autocompletado.",
    );
  }

  if (ext === "pdf" || mime === "application/pdf") {
    return parseFallback(
      filename,
      "pdf",
      "Contrato PDF detectado. Completa los datos manualmente.",
    );
  }

  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
  ) {
    return parseFallback(
      filename,
      "image",
      "Imagen detectada. Usamos el nombre del archivo como referencia; completa los demás campos.",
    );
  }

  return parseFallback(
    filename,
    "filename",
    `Formato .${ext || "desconocido"} no autodetectable. Completa los campos manualmente.`,
  );
}
