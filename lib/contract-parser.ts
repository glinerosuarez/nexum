import { XMLParser } from "fast-xml-parser";
import Papa from "papaparse";

export type ContractSource =
  | "msproject_xml"
  | "csv"
  | "apu_markdown"
  | "markdown"
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

export interface FileParseSummary {
  filename: string;
  source: ContractSource;
  confidence: "alta" | "media" | "baja";
  contributed: string[];
}

export interface MergedContract extends ParsedContract {
  files: FileParseSummary[];
}

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

function emptyResult(
  filename: string,
  source: ContractSource,
): ParsedContract {
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

interface MsProjectTask {
  name: string;
  outlineNumber: string;
  outlineLevel: number;
  isSummary: boolean;
  start: string | null;
  finish: string | null;
  actualStart: string | null;
  percentComplete: number | null;
  cost: number | null;
  actualCost: number | null;
  remainingCost: number | null;
}

function toMsProjectTasks(
  rawTasks: Record<string, unknown>[],
  scaleCost: (raw: unknown) => number | null,
): MsProjectTask[] {
  return rawTasks.map((task) => ({
    name: (task["Name"] as string | undefined) ?? "",
    outlineNumber: (task["OutlineNumber"] as string | undefined) ?? "",
    outlineLevel: Number(task["OutlineLevel"] ?? 0),
    isSummary: task["Summary"] === "1" || task["Summary"] === 1,
    start: isoDate(task["Start"] as string | undefined),
    finish: isoDate(task["Finish"] as string | undefined),
    actualStart: isoDate(task["ActualStart"] as string | undefined),
    percentComplete: asNumber(task["PercentComplete"]),
    cost: scaleCost(task["Cost"]),
    actualCost: scaleCost(task["ActualCost"]),
    remainingCost: scaleCost(task["RemainingCost"]),
  }));
}

function aggregatePhaseCost(task: MsProjectTask, tasks: MsProjectTask[]): number | null {
  if ((task.cost ?? 0) > 0) return task.cost;
  if (!task.outlineNumber) return task.cost;

  const prefix = `${task.outlineNumber}.`;
  const descendants = tasks.filter((t) => t.outlineNumber.startsWith(prefix));
  if (descendants.length === 0) return task.cost;

  const directChildren = descendants.filter(
    (t) => t.outlineLevel === task.outlineLevel + 1 && (t.cost ?? 0) > 0,
  );
  const directChildrenCost = directChildren.reduce((sum, t) => sum + (t.cost ?? 0), 0);
  if (directChildrenCost > 0) return directChildrenCost;

  const leafCost = descendants
    .filter((t) => !t.isSummary && (t.cost ?? 0) > 0)
    .reduce((sum, t) => sum + (t.cost ?? 0), 0);
  if (leafCost > 0) return leafCost;

  const maxDescendantCost = descendants.reduce(
    (max, t) => Math.max(max, t.cost ?? 0),
    0,
  );
  return maxDescendantCost > 0 ? maxDescendantCost : task.cost;
}

// MS Project XML stores costs as integers scaled by 10^CurrencyDigits.
// CurrencyDigits is typically 2, so the integer "122910015242" represents
// 1,229,100,152.42. Without this scaling the dashboard shows a number two
// orders of magnitude too large.
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

  const project = (doc as { Project?: Record<string, unknown> } | undefined)
    ?.Project;
  if (!project) {
    result.notas.push("El XML no parece ser un archivo de Microsoft Project.");
    return result;
  }

  const currencyDigits = Number(project["CurrencyDigits"] ?? 2);
  const costScale = Math.pow(10, Number.isFinite(currencyDigits) ? currencyDigits : 2);
  const scaleCost = (raw: unknown): number | null => {
    const n = asNumber(raw);
    if (n == null) return null;
    return n / costScale;
  };

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
  const tasks = toMsProjectTasks(taskList, scaleCost);

  const summaryTask = tasks.find(
    (task) => task.outlineLevel === 0,
  );
  const rootTask =
    tasks.find(
      (task) => task.outlineLevel === 1,
    ) ?? summaryTask;

  const nombre =
    rootTask?.name ||
    title ||
    decodeName(projectName) ||
    decodeName(filename);

  const presupuesto = rootTask?.cost ?? summaryTask?.cost ?? null;
  const costoReal = rootTask?.actualCost ?? summaryTask?.actualCost ?? null;
  const costoRestante =
    rootTask?.remainingCost ??
    summaryTask?.remainingCost ??
    null;
  const porcentaje = rootTask?.percentComplete ?? summaryTask?.percentComplete ?? null;

  const fechaInicioReal = rootTask?.actualStart ?? summaryTask?.actualStart ?? null;

  // Use contractual project window first, then task-derived dates.
  const fechaInicio = startDate ?? rootTask?.start ?? summaryTask?.start ?? null;
  const fechaFin = finishDate ?? rootTask?.finish ?? summaryTask?.finish ?? null;

  const phaseTasks = tasks
    .filter((task) => {
      return task.outlineLevel === 2 && task.isSummary;
    })
    .slice(0, 50);

  const fases: ParsedPhase[] = phaseTasks.map((task, idx) => ({
    nombre: cleanPhaseName(task.name || `Fase ${idx + 1}`),
    sort_order: idx + 1,
    fecha_inicio: task.start,
    fecha_fin: task.finish,
    porcentaje_completado: task.percentComplete,
    costo: aggregatePhaseCost(task, tasks),
  }));

  if (fases.length === 0) {
    const subtasks = tasks
      .filter((task) => {
        return task.outlineLevel >= 2 && task.outlineLevel <= 3;
      })
      .slice(0, 12);
    fases.push(
      ...subtasks.map((task, idx) => ({
        nombre: cleanPhaseName(task.name || `Fase ${idx + 1}`),
        sort_order: idx + 1,
        fecha_inicio: task.start,
        fecha_fin: task.finish,
        porcentaje_completado: task.percentComplete,
        costo: task.cost,
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
    result.fases = phaseRows.slice(0, 50);
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
  const cleaned = parseMonetary(raw);
  return cleaned;
}

// Parses strings like "$ 122,910,015,242", "$1,229,100,152.42",
// "1.229.100.152,42", "23%", "$ 939,966,467.13" → number.
// Handles US (1,234,567.89), European/Colombian (1.234.567,89) and
// thousands-only commas (1,234,567 → 1234567).
function parseMonetary(raw: string): number | null {
  if (!raw) return null;
  let s = String(raw)
    .trim()
    .replace(/\$/g, "")
    .replace(/COP|USD|EUR|MXN/gi, "")
    .replace(/%/g, "")
    .replace(/\s+/g, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Whichever appears last is the decimal separator.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Comma alone: decimal only if it has exactly 1-2 trailing digits
    // and no repeated thousand-grouping pattern.
    const isDecimal = /^-?\d+(?:\d{3})*,\d{1,2}$/.test(s) && !/,\d{3}(?:,|$)/.test(s);
    s = isDecimal ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    // Dot alone: decimal only when single dot followed by 1-2 digits.
    const dots = (s.match(/\./g) ?? []).length;
    const looksDecimal = dots === 1 && /\.\d{1,2}$/.test(s);
    if (!looksDecimal) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDateDMY(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { getDocument, GlobalWorkerOptions } = pdfjs;
  const data = new Uint8Array(await file.arrayBuffer());
  if (typeof window !== "undefined") {
    GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
  }
  const pdf = await getDocument({ data }).promise;

  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (!item?.str) continue;
      text += item.str;
      text += item.hasEOL ? "\n" : " ";
    }
    text += "\n";
  }
  return text;
}

function parseControlBudgetPdf(text: string, filename: string): ParsedContract {
  const result = emptyResult(filename, "pdf");
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");

  const bacRaw =
    normalized.match(/BAC\s*=\s*([0-9\.\,]+)\s*\$/i)?.[1] ??
    normalized.match(/BAC\s*=\s*\$?\s*([0-9\.\,]+)/i)?.[1] ??
    null;
  const bac = bacRaw ? parseMonetary(bacRaw) : null;

  const rowRegex =
    /(?:^|\n)\s*(\d{1,2})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+\$\s*([0-9\.\,]+)\s+([0-9\.\,]+)\s*\$/gm;
  type BudgetRow = {
    week: number;
    fecha: string;
    cptp: number;
    cptr: number;
  };
  const rows: BudgetRow[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = rowRegex.exec(normalized)) !== null) {
    const week = Number(match[1]);
    const fecha = parseDateDMY(match[2]);
    const cptp = parseMonetary(match[3]);
    const cptr = parseMonetary(match[4]);
    if (!fecha || cptp == null || cptr == null || !Number.isFinite(week)) continue;
    rows.push({ week, fecha, cptp, cptr });
  }

  const rowsWithEV = rows.filter((r) => r.week > 0 && r.cptr > 0);
  const latest = rowsWithEV.length > 0 ? rowsWithEV[rowsWithEV.length - 1] : null;
  const pctFromEv =
    bac != null && bac > 0 && latest ? (latest.cptr / bac) * 100 : null;

  if (bac != null) {
    result.presupuesto_total = bac;
    result.moneda = "COP";
  }
  if (pctFromEv != null && Number.isFinite(pctFromEv)) {
    result.porcentaje_completado = Math.max(0, Math.min(100, pctFromEv));
    result.confidence = "alta";
  } else if (bac != null) {
    result.confidence = "media";
  }
  if (rows.length > 0) {
    result.fecha_inicio_planeada = rows[0].fecha;
    result.fecha_fin_planeada = rows[rows.length - 1].fecha;
  }
  if (latest) {
    result.notas.push(
      `Control presupuesto detectado: EV semana ${latest.week} = ${latest.cptr.toLocaleString("es-CO")} COP (${(pctFromEv ?? 0).toFixed(2)}%).`,
    );
  } else if (rows.length > 0) {
    result.notas.push(
      `Control presupuesto detectado con ${rows.length} filas semanales; sin EV acumulado válido.`,
    );
  } else {
    result.notas.push(
      "PDF detectado pero no se identificó la tabla de control de presupuesto.",
    );
  }
  return result;
}

// Parses APU (Análisis de Precios Unitarios) markdown tables produced by
// tableConvert. Structure: pipe-delimited rows where the first column is
// the ITEM number ("1", "1.1", "1.1.1", …) or a totals label.
// Top-level chapters (single number, e.g. "1", "2") become phases with the
// VR.PARCIAL column as their cost. The grand total is taken from the
// "VALOR TOTAL DE LA PROPUESTA" row when present.
function parseApuMarkdown(text: string, filename: string): ParsedContract {
  const result = emptyResult(filename, "apu_markdown");

  const lines = text.split(/\r?\n/);
  type Row = string[];
  const rows: Row[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length === 0) continue;
    rows.push(cells);
  }

  if (rows.length === 0) {
    result.notas.push("No detectamos tablas APU en este archivo.");
    return result;
  }

  const phases: ParsedPhase[] = [];
  let valorTotal: number | null = null;
  let nombreChapterCero: string | null = null;
  let subtotalCostoDirecto: number | null = null;

  for (const row of rows) {
    if (row.length < 2) continue;
    const item = (row[0] ?? "").trim();
    const desc = (row[1] ?? "").trim();
    const parcial = row.length >= 6 ? parseMonetary(row[5] ?? "") : null;

    if (/^VALOR\s+TOTAL/i.test(item) || /^VALOR\s+TOTAL/i.test(desc)) {
      valorTotal = parcial ?? parseMonetary(row[row.length - 1] ?? "");
      continue;
    }
    if (/^SUBTOTAL\s+COSTO\s+DIRECTO/i.test(item)) {
      subtotalCostoDirecto = parcial ?? parseMonetary(row[row.length - 1] ?? "");
      continue;
    }
    if (/^ADMINISTRACI|^IMPREVISTOS|^UTILIDAD|^IVA/i.test(item) || /^ADMINISTRACI|^IMPREVISTOS|^UTILIDAD|^IVA/i.test(desc)) {
      continue;
    }
    if (!item && desc && !nombreChapterCero && /[A-ZÁÉÍÓÚÑ]{4,}/.test(desc)) {
      nombreChapterCero = desc;
      continue;
    }
    if (/^\d+$/.test(item) && desc) {
      phases.push({
        nombre: cleanPhaseName(desc),
        sort_order: phases.length + 1,
        fecha_inicio: null,
        fecha_fin: null,
        porcentaje_completado: null,
        costo: parcial,
      });
    }
  }

  if (phases.length === 0 && nombreChapterCero == null) {
    result.notas.push("No detectamos capítulos APU.");
    return result;
  }

  result.confidence = phases.length > 0 ? "alta" : "media";
  result.nombre = nombreChapterCero ?? decodeName(filename);
  result.presupuesto_total = valorTotal ?? subtotalCostoDirecto ?? null;
  result.moneda = "COP";
  result.fases = phases;

  const location = detectLocation(result.nombre);
  if (location) result.ubicacion = location;

  result.notas.push(
    `APU detectada: ${phases.length} capítulo(s)${valorTotal != null ? `, total ${valorTotal.toLocaleString("es-CO")} COP` : subtotalCostoDirecto != null ? `, costo directo ${subtotalCostoDirecto.toLocaleString("es-CO")} COP` : ""}.`,
  );

  return result;
}

function parseGenericMarkdown(text: string, filename: string): ParsedContract {
  // If it looks like an APU table, use the rich parser.
  if (/\|\s*ITEM\s*\|/i.test(text) || /VALOR\s+TOTAL\s+DE\s+LA\s+PROPUESTA/i.test(text)) {
    return parseApuMarkdown(text, filename);
  }

  const result = emptyResult(filename, "markdown");
  const titleMatch = text.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.nombre = titleMatch[1].trim().slice(0, 200);
    result.confidence = "media";
  }
  result.notas.push(
    "Documento Markdown sin tabla APU detectada. Usamos el primer encabezado como nombre.",
  );
  return result;
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

  if (ext === "md" || ext === "markdown" || mime === "text/markdown") {
    const text = await file.text();
    return parseGenericMarkdown(text, filename);
  }

  if (ext === "docx" || mime.includes("wordprocessingml")) {
    return parseFallback(
      filename,
      "docx",
      "Documento Word detectado. Completa los datos manualmente o sube el cronograma en XML/CSV/MD para autocompletado.",
    );
  }

  if (ext === "pdf" || mime === "application/pdf") {
    try {
      const text = await extractPdfText(file);
      return parseControlBudgetPdf(text, filename);
    } catch (err) {
      return parseFallback(
        filename,
        "pdf",
        `PDF detectado pero no pudimos extraer su contenido: ${(err as Error).message}`,
      );
    }
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

// ---------- multi-file merge ----------

// Priority for each field when merging multiple files. Higher = wins.
// Order in array implies fallback if higher source has null.
const SOURCE_PRIORITY: Record<ContractSource, number> = {
  msproject_xml: 5,
  apu_markdown: 4,
  pdf: 4,
  csv: 3,
  markdown: 2,
  docx: 1,
  image: 0,
  filename: 0,
};

function bestForField<T>(
  results: ParsedContract[],
  preferred: ContractSource[] | null,
  pick: (r: ParsedContract) => T | null,
): { value: T | null; source: ContractSource | null } {
  const ordered = preferred
    ? results
        .slice()
        .sort((a, b) => preferred.indexOf(a.source) - preferred.indexOf(b.source))
    : results
        .slice()
        .sort(
          (a, b) =>
            (SOURCE_PRIORITY[b.source] ?? 0) -
            (SOURCE_PRIORITY[a.source] ?? 0),
        );
  for (const r of ordered) {
    const v = pick(r);
    if (v != null && v !== "") return { value: v, source: r.source };
  }
  return { value: null, source: null };
}

function mergePhases(results: ParsedContract[]): ParsedPhase[] {
  const xmlPhases =
    results.find((r) => r.source === "msproject_xml")?.fases ?? [];
  const apuPhases =
    results.find((r) => r.source === "apu_markdown")?.fases ?? [];
  const pdfProgress = results.find((r) => r.source === "pdf")?.porcentaje_completado;

  const applyPdfProgress = (phases: ParsedPhase[]): ParsedPhase[] => {
    if (pdfProgress == null || !Number.isFinite(pdfProgress)) return phases;
    return phases.map((ph) => ({
      ...ph,
      porcentaje_completado: pdfProgress,
    }));
  };

  if (xmlPhases.length === 0 && apuPhases.length === 0) {
    for (const r of results) {
      if (r.fases.length > 0) return applyPdfProgress(r.fases);
    }
    return [];
  }

  if (xmlPhases.length === 0) return applyPdfProgress(apuPhases);
  if (apuPhases.length === 0) return applyPdfProgress(xmlPhases);

  // Try to fuse: XML carries dates/% complete, APU carries cost.
  // Fallback to sort_order/index when names don't match.
  const usedApuIndexes = new Set<number>();
  const merged = xmlPhases.map((xp, idx) => {
    let matchIndex = apuPhases.findIndex(
      (ap, apIdx) =>
        !usedApuIndexes.has(apIdx) && similarName(ap.nombre, xp.nombre),
    );
    if (matchIndex < 0) {
      const orderIdx = Math.max(0, (xp.sort_order ?? idx + 1) - 1);
      if (orderIdx < apuPhases.length && !usedApuIndexes.has(orderIdx)) {
        matchIndex = orderIdx;
      }
    }
    if (matchIndex >= 0) usedApuIndexes.add(matchIndex);
    const match = matchIndex >= 0 ? apuPhases[matchIndex] : null;
    return {
      nombre: xp.nombre,
      sort_order: xp.sort_order ?? idx + 1,
      fecha_inicio: xp.fecha_inicio,
      fecha_fin: xp.fecha_fin,
      porcentaje_completado: xp.porcentaje_completado,
      costo: match?.costo ?? xp.costo,
    } satisfies ParsedPhase;
  });
  return applyPdfProgress(merged);
}

function similarName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

export async function parseContractFiles(
  files: File[],
): Promise<MergedContract> {
  if (files.length === 0) {
    throw new Error("No hay archivos para analizar.");
  }
  const parsed = await Promise.all(files.map((f) => parseContractFile(f)));

  const nombre = bestForField(parsed, ["msproject_xml", "apu_markdown", "csv", "markdown", "docx", "pdf", "image", "filename"], (r) => r.nombre);
  const descripcion = bestForField(parsed, null, (r) => r.descripcion);
  const ubicacion = bestForField(parsed, null, (r) => r.ubicacion);
  const fechaInicioP = bestForField(parsed, ["msproject_xml", "csv", "markdown", "apu_markdown"], (r) => r.fecha_inicio_planeada);
  const fechaFinP = bestForField(parsed, ["msproject_xml", "csv", "markdown", "apu_markdown"], (r) => r.fecha_fin_planeada);
  const fechaInicioR = bestForField(parsed, ["msproject_xml"], (r) => r.fecha_inicio_real);
  const presupuesto = bestForField(parsed, ["apu_markdown", "msproject_xml", "csv"], (r) => r.presupuesto_total);
  const moneda = bestForField(parsed, ["msproject_xml", "apu_markdown", "csv"], (r) => r.moneda);
  const costoReal = bestForField(parsed, ["msproject_xml"], (r) => r.costo_real);
  const costoRestante = bestForField(parsed, ["msproject_xml"], (r) => r.costo_restante);
  const porcentaje = bestForField(parsed, ["pdf", "msproject_xml"], (r) => r.porcentaje_completado);

  const fases = mergePhases(parsed);
  const notas: string[] = [];
  for (const r of parsed) {
    for (const n of r.notas) notas.push(`(${r.raw_filename}) ${n}`);
  }

  const fileSummaries: FileParseSummary[] = parsed.map((r) => {
    const contributed: string[] = [];
    if (r === parsed.find((x) => x.source === nombre.source)) contributed.push("nombre");
    if (r === parsed.find((x) => x.source === presupuesto.source)) contributed.push("presupuesto");
    if (r.fases.length > 0) contributed.push("fases");
    if (r.fecha_inicio_planeada || r.fecha_fin_planeada) contributed.push("fechas");
    if (r.porcentaje_completado != null) contributed.push("avance");
    return {
      filename: r.raw_filename,
      source: r.source,
      confidence: r.confidence,
      contributed,
    };
  });

  return {
    source: nombre.source ?? parsed[0].source,
    confidence: parsed.some((r) => r.confidence === "alta")
      ? "alta"
      : parsed.some((r) => r.confidence === "media")
        ? "media"
        : "baja",
    nombre: nombre.value ?? decodeName(files[0].name),
    descripcion: descripcion.value,
    ubicacion: ubicacion.value,
    fecha_inicio_planeada: fechaInicioP.value,
    fecha_fin_planeada: fechaFinP.value,
    fecha_inicio_real: fechaInicioR.value,
    presupuesto_total: presupuesto.value,
    moneda: moneda.value,
    costo_real: costoReal.value,
    costo_restante: costoRestante.value,
    porcentaje_completado: porcentaje.value,
    fases,
    notas,
    raw_filename:
      files.length === 1
        ? files[0].name
        : `${files.length} archivos combinados`,
    files: fileSummaries,
  };
}
