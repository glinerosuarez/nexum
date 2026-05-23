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

  const presupuesto =
    scaleCost(rootTask?.["Cost"]) ?? scaleCost(summaryTask?.["Cost"]);
  const costoReal =
    scaleCost(rootTask?.["ActualCost"]) ?? scaleCost(summaryTask?.["ActualCost"]);
  const costoRestante =
    scaleCost(rootTask?.["RemainingCost"]) ??
    scaleCost(summaryTask?.["RemainingCost"]);
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
    .slice(0, 50);

  const fases: ParsedPhase[] = phaseTasks.map((task, idx) => ({
    nombre: cleanPhaseName(
      (task["Name"] as string | undefined) ?? `Fase ${idx + 1}`,
    ),
    sort_order: idx + 1,
    fecha_inicio: isoDate(task["Start"] as string | undefined),
    fecha_fin: isoDate(task["Finish"] as string | undefined),
    porcentaje_completado: asNumber(task["PercentComplete"]),
    costo: scaleCost(task["Cost"]),
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
        costo: scaleCost(task["Cost"]),
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

// ---------- multi-file merge ----------

// Priority for each field when merging multiple files. Higher = wins.
// Order in array implies fallback if higher source has null.
const SOURCE_PRIORITY: Record<ContractSource, number> = {
  msproject_xml: 5,
  apu_markdown: 4,
  csv: 3,
  markdown: 2,
  docx: 1,
  pdf: 1,
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

  if (xmlPhases.length === 0 && apuPhases.length === 0) {
    for (const r of results) {
      if (r.fases.length > 0) return r.fases;
    }
    return [];
  }

  if (xmlPhases.length === 0) return apuPhases;
  if (apuPhases.length === 0) return xmlPhases;

  // Try to fuse: XML carries dates/% complete, APU carries cost.
  return xmlPhases.map((xp, idx) => {
    const match = apuPhases.find((ap) =>
      similarName(ap.nombre, xp.nombre),
    );
    return {
      nombre: xp.nombre,
      sort_order: xp.sort_order ?? idx + 1,
      fecha_inicio: xp.fecha_inicio,
      fecha_fin: xp.fecha_fin,
      porcentaje_completado: xp.porcentaje_completado,
      costo: match?.costo ?? xp.costo,
    } satisfies ParsedPhase;
  });
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
  const porcentaje = bestForField(parsed, ["msproject_xml"], (r) => r.porcentaje_completado);

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
