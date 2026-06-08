import { XMLParser } from "fast-xml-parser";
import Papa from "papaparse";

export type ContractSource =
  | "msproject_xml"
  | "csv"
  | "xlsx"
  | "apu_markdown"
  | "markdown"
  | "docx"
  | "pdf"
  | "image"
  | "filename";

export type ParseConfidence = "alta" | "media" | "baja";

export type InputParseStatus =
  | "parsed_supply_rows"
  | "metadata_only"
  | "unsupported_for_supply_rows"
  | "parse_failed";

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
  confidence: ParseConfidence;
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
  confidence: ParseConfidence;
  parse_status: InputParseStatus;
  extracted_row_count: number;
  contributed: string[];
}

export interface MergedContract extends ParsedContract {
  files: FileParseSummary[];
}

export interface SupplySourceReference {
  filename: string;
  source: ContractSource;
  parser: string;
  row_index?: number | null;
  line_number?: number | null;
  sheet_name?: string | null;
}

export interface ExtractedSupplyRow {
  id: string;
  document_id: string;
  source: ContractSource;
  source_ref: SupplySourceReference;
  raw_name: string;
  raw_unit: string | null;
  raw_category: string | null;
  raw_quantity: number | null;
  raw_unit_price: number | null;
  raw_total_price: number | null;
  normalized_name: string;
  normalized_unit: string | null;
  normalized_category: string;
  normalization_key: string;
  notes: string[];
  raw_columns: Record<string, string | number | null>;
}

export interface NormalizedSupplyCandidate {
  key: string;
  display_name: string;
  normalized_name: string;
  normalized_unit: string | null;
  normalized_category: string;
  quantity_total: number | null;
  unit_price_reference: number | null;
  total_price_reference: number | null;
  extracted_row_ids: string[];
  source_document_ids: string[];
  row_count: number;
  source_count: number;
}

export interface RowNormalization {
  extracted_row_id: string;
  normalized_key: string;
  normalization_reason: string;
}

export type AgenticCandidateOrigin =
  | "matched_deterministic_candidate"
  | "agentic_only_candidate"
  | "agentic_split_from_deterministic_candidate";

export type ExtractionConfidence = "high" | "medium" | "low";

export interface ShadowCandidateEvidenceRef {
  type: string;
  value: string | number | null;
}

export interface AgenticShadowCandidate {
  shadow_candidate_id: string;
  input_batch_id: string;
  document_id: string;
  candidate_origin: AgenticCandidateOrigin;
  deterministic_extracted_row_id: string | null;
  deterministic_normalized_supply_id: string | null;
  source_type: string;
  source_ref: SupplySourceReference;
  raw_text: string;
  raw_name: string;
  raw_unit: string | null;
  raw_category: string | null;
  raw_quantity: number | null;
  raw_unit_price: number | null;
  raw_total_price: number | null;
  context_before: string[];
  context_after: string[];
  section_labels: string[];
  evidence_refs: ShadowCandidateEvidenceRef[];
  raw_columns: Record<string, string | number | null>;
  span_offsets: Record<string, string | number | null>;
  table_signature: string | null;
  extraction_confidence: ExtractionConfidence;
  extraction_notes: string[];
}

export interface ShadowExtractionChunkRow {
  row_key: string;
  row_index: number;
  raw_text: string;
  raw_name: string;
  raw_unit: string | null;
  raw_category: string | null;
  raw_quantity: number | null;
  raw_unit_price: number | null;
  raw_total_price: number | null;
  raw_columns: Record<string, string | number | null>;
  section_labels: string[];
}

export interface ShadowExtractionChunk {
  chunk_id: string;
  document_id: string;
  source_type: string;
  source_ref: SupplySourceReference;
  table_signature: string | null;
  chunk_index: number;
  headers: string[];
  context_before: string[];
  context_after: string[];
  section_labels: string[];
  rows: ShadowExtractionChunkRow[];
}

export interface ParsedInputDocument {
  id: string;
  filename: string;
  source: ContractSource;
  confidence: ParseConfidence;
  parse_status: InputParseStatus;
  notes: string[];
  preview: ParsedContract;
  content_type: string;
  byte_size: number;
  sheet_names: string[];
  extracted_row_count: number;
}

export interface ContractFileAnalysis {
  merged_preview: MergedContract;
  documents: ParsedInputDocument[];
  extracted_rows: ExtractedSupplyRow[];
  normalized_supplies: NormalizedSupplyCandidate[];
  row_normalizations: RowNormalization[];
  shadow_candidates: AgenticShadowCandidate[];
  shadow_extraction_chunks: ShadowExtractionChunk[];
}

interface DraftExtractedSupplyRow {
  source: ContractSource;
  source_ref: SupplySourceReference;
  raw_name: string;
  raw_unit: string | null;
  raw_category: string | null;
  raw_quantity: number | null;
  raw_unit_price: number | null;
  raw_total_price: number | null;
  normalized_name: string;
  normalized_unit: string | null;
  normalized_category: string;
  normalization_key: string;
  notes: string[];
  raw_columns: Record<string, string | number | null>;
}

interface DraftAgenticShadowCandidate {
  candidate_origin: AgenticCandidateOrigin;
  deterministic_extracted_row_id: string | null;
  deterministic_normalized_supply_id: string | null;
  source_type: string;
  source_ref: SupplySourceReference;
  raw_text: string;
  raw_name: string;
  raw_unit: string | null;
  raw_category: string | null;
  raw_quantity: number | null;
  raw_unit_price: number | null;
  raw_total_price: number | null;
  context_before: string[];
  context_after: string[];
  section_labels: string[];
  evidence_refs: ShadowCandidateEvidenceRef[];
  raw_columns: Record<string, string | number | null>;
  span_offsets: Record<string, string | number | null>;
  table_signature: string | null;
  extraction_confidence: ExtractionConfidence;
  extraction_notes: string[];
}

interface DraftShadowExtractionChunkRow {
  row_key: string;
  row_index: number;
  raw_text: string;
  raw_name: string;
  raw_unit: string | null;
  raw_category: string | null;
  raw_quantity: number | null;
  raw_unit_price: number | null;
  raw_total_price: number | null;
  raw_columns: Record<string, string | number | null>;
  section_labels: string[];
}

interface DraftShadowExtractionChunk {
  source_type: string;
  source_ref: SupplySourceReference;
  table_signature: string | null;
  chunk_index: number;
  headers: string[];
  context_before: string[];
  context_after: string[];
  section_labels: string[];
  rows: DraftShadowExtractionChunkRow[];
}

interface ParsedDocumentAnalysis {
  preview: ParsedContract;
  parse_status: InputParseStatus;
  extracted_rows: DraftExtractedSupplyRow[];
  shadow_candidates: DraftAgenticShadowCandidate[];
  shadow_extraction_chunks: DraftShadowExtractionChunk[];
  sheet_names: string[];
}

interface TabularHeaderMap {
  name: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
  category: string | null;
}

interface WorksheetTableMatch {
  header_row_index: number;
  headers: string[];
  header_map: TabularHeaderMap;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const SOURCE_PRIORITY: Record<ContractSource, number> = {
  msproject_xml: 5,
  apu_markdown: 4,
  pdf: 4,
  xlsx: 4,
  csv: 3,
  markdown: 2,
  docx: 1,
  image: 0,
  filename: 0,
};

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogramo: "kg",
  kilogramos: "kg",
  g: "g",
  gr: "g",
  gramo: "g",
  gramos: "g",
  ton: "ton",
  tonelada: "ton",
  toneladas: "ton",
  m: "m",
  ml: "m",
  metro: "m",
  metros: "m",
  m2: "m2",
  mt2: "m2",
  metro2: "m2",
  metrocuadrado: "m2",
  metroscuadrados: "m2",
  m3: "m3",
  mt3: "m3",
  metro3: "m3",
  metrocubico: "m3",
  metroscubicos: "m3",
  und: "und",
  ud: "und",
  un: "und",
  unidad: "und",
  unidades: "und",
  ea: "und",
  pza: "und",
  pieza: "und",
  piezas: "und",
  l: "l",
  lt: "l",
  litro: "l",
  litros: "l",
  bolsa: "bolsa",
  bolsas: "bolsa",
  bulto: "bulto",
  bultos: "bulto",
};

const HEADER_ALIASES: Record<
  "name" | "unit" | "quantity" | "unitPrice" | "totalPrice" | "category",
  string[]
> = {
  name: [
    "descripcion",
    "descripción",
    "detalle",
    "concepto",
    "insumo",
    "material",
    "recurso",
    "nombre",
    "item descripcion",
    "actividad",
  ],
  unit: [
    "unidad",
    "unidad medida",
    "unidad de medida",
    "um",
    "u m",
    "und",
    "und.",
    "unit",
  ],
  quantity: [
    "cantidad",
    "cant",
    "qty",
    "cantidad planeada",
    "cantidad prevista",
    "quantity",
  ],
  unitPrice: [
    "vr unit",
    "vr.unit",
    "vr unitario",
    "vr.unitario",
    "valor unitario",
    "precio unitario",
    "precio_unitario",
    "unit price",
    "p u",
  ],
  totalPrice: [
    "vr parcial",
    "vr.parcial",
    "valor parcial",
    "subtotal",
    "valor total",
    "total",
    "parcial",
  ],
  category: ["categoria", "categoría", "tipo", "clase"],
};

const HEADING_HINTS = new Set([
  "acabados",
  "arquitectonicos",
  "arquitectonicos y acabados",
  "capitulo",
  "elementos arquitectonicos",
  "equipos",
  "habitaciones y pasillos",
  "instalaciones electricas",
  "instalaciones hidraulicas",
  "preliminares",
]);

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
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

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, "0");
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

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

function tokenizeWords(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function isIgnoredBudgetLine(rawName: string): boolean {
  return /^subtotal|^valor total|^administraci|^imprevistos|^utilidad|^iva/i.test(rawName);
}

function looksHeadingLikeCandidate(
  rawName: string,
  rawUnit: string | null,
  rawQuantity: number | null,
  rawUnitPrice: number | null,
  rawTotalPrice: number | null,
): boolean {
  const words = tokenizeWords(rawName);
  if (words.length === 0) return false;
  const hasNumericSignal =
    rawQuantity != null || rawUnitPrice != null || rawTotalPrice != null || Boolean(rawUnit);
  const letters = Array.from(rawName).filter((char) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(char));
  const uppercaseRatio =
    letters.length === 0
      ? 0
      : letters.filter((char) => char === char.toUpperCase()).length / letters.length;
  const normalized = normalizeText(rawName);
  if (HEADING_HINTS.has(normalized)) return true;
  if (!hasNumericSignal && uppercaseRatio >= 0.75 && words.length <= 8) return true;
  if (!hasNumericSignal && words.length <= 5 && words.some((word) => HEADING_HINTS.has(word))) {
    return true;
  }
  return false;
}

function hasTabularSupplySignals(
  rawUnit: string | null,
  rawQuantity: number | null,
  rawUnitPrice: number | null,
  rawTotalPrice: number | null,
): boolean {
  return rawUnit != null || rawQuantity != null || rawUnitPrice != null || rawTotalPrice != null;
}

function normalizeUnit(value: string | null | undefined): string | null {
  const normalized = normalizeText(value ?? "");
  if (!normalized) return null;
  return UNIT_ALIASES[normalized.replace(/\s+/g, "")] ?? normalized.replace(/\s+/g, "");
}

function detectSupplyCategory(rawName: string, rawCategory?: string | null): string {
  const text = `${rawCategory ?? ""} ${rawName}`.toLowerCase();
  if (
    text.includes("mano de obra") ||
    text.includes("oficial") ||
    text.includes("ayudante") ||
    text.includes("labor")
  ) {
    return "mano_obra";
  }
  if (
    text.includes("equipo") ||
    text.includes("maquina") ||
    text.includes("máquina") ||
    text.includes("retroexcavadora") ||
    text.includes("compresor")
  ) {
    return "equipo";
  }
  if (
    text.includes("subcontrato") ||
    text.includes("instalacion") ||
    text.includes("instalación") ||
    text.includes("servicio")
  ) {
    return "subcontrato";
  }
  return "material";
}

function makeNormalizationKey(
  normalizedName: string,
  normalizedUnit: string | null,
  normalizedCategory: string,
): string {
  return [
    normalizedName || "sin_nombre",
    normalizedUnit || "sin_unidad",
    normalizedCategory || "material",
  ].join("|");
}

function similarName(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
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
  return parseMonetary(raw);
}

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
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const isDecimal =
      /^-?\d+(?:\d{3})*,\d{1,2}$/.test(s) && !/,\d{3}(?:,|$)/.test(s);
    s = isDecimal ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1) {
      s = s.replace(/\./g, "");
    }
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

function buildTabularPreview(
  rows: Record<string, string>[],
  filename: string,
  source: ContractSource,
): ParsedContract {
  const result = emptyResult(filename, source);
  if (rows.length === 0) {
    result.notas.push("El archivo tabular está vacío o sin filas legibles.");
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
    .map((row, idx) => {
      const nm = pickField(row, ["fase", "phase", "etapa", "nombre", "name"]);
      if (!nm) return null;
      return {
        nombre: cleanPhaseName(nm),
        sort_order: idx + 1,
        fecha_inicio: isoDate(
          pickField(row, ["fecha_inicio", "start_date", "start"]),
        ),
        fecha_fin: isoDate(pickField(row, ["fecha_fin", "end_date", "finish"])),
        porcentaje_completado: pickNumber(row, ["porcentaje", "percent", "avance"]),
        costo: pickNumber(row, ["costo", "cost", "presupuesto", "monto"]),
      } satisfies ParsedPhase;
    })
    .filter((phase): phase is ParsedPhase => phase !== null);

  if (phaseRows.length > 1) {
    result.fases = phaseRows.slice(0, 50);
    result.notas.push(`${phaseRows.length} fase(s) detectadas desde filas.`);
  }

  return result;
}

function detectSupplyHeaderMap(headers: string[]): TabularHeaderMap | null {
  const keyedHeaders = Array.from({ length: headers.length }, (_, index) => {
    const header = String(headers[index] ?? "");
    return {
      actual: header.trim().toLowerCase(),
      normalized: normalizeHeader(header),
    };
  }).filter((header) => header.actual !== "");
  const findHeader = (aliases: string[]): string | null => {
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const match = keyedHeaders.find((header) => header.normalized === normalizedAlias);
      if (match) return match.actual;
    }
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const match = keyedHeaders.find(
        (header) =>
          header.normalized.includes(normalizedAlias)
          || normalizedAlias.includes(header.normalized),
      );
      if (match) return match.actual;
    }
    return null;
  };

  const name = findHeader(HEADER_ALIASES.name);
  const quantity = findHeader(HEADER_ALIASES.quantity);
  const unitPrice = findHeader(HEADER_ALIASES.unitPrice);
  const totalPrice = findHeader(HEADER_ALIASES.totalPrice);
  const unit = findHeader(HEADER_ALIASES.unit);
  const category = findHeader(HEADER_ALIASES.category);

  if (!name) return null;
  if (!quantity && !unitPrice && !totalPrice) return null;

  return { name, unit, quantity, unitPrice, totalPrice, category };
}

function toRawColumns(row: Record<string, string>): Record<string, string | number | null> {
  const result: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = value ?? null;
  }
  return result;
}

function extractSupplyRowsFromTabularRecords(
  rows: Record<string, string>[],
  filename: string,
  source: ContractSource,
  headerMap: TabularHeaderMap,
  options: { sheetName?: string; rowOffset?: number; parser: string },
): DraftExtractedSupplyRow[] {
  const extracted: DraftExtractedSupplyRow[] = [];

  rows.forEach((row, idx) => {
    const rawName = row[headerMap.name]?.trim() ?? "";
    if (!rawName) return;

    if (
      /^subtotal|^valor total|^administraci|^imprevistos|^utilidad|^iva/i.test(rawName)
    ) {
      return;
    }

    const rawUnit = headerMap.unit ? row[headerMap.unit]?.trim() || null : null;
    const rawCategory = headerMap.category
      ? row[headerMap.category]?.trim() || null
      : null;
    const rawQuantity = headerMap.quantity
      ? parseMonetary(row[headerMap.quantity] ?? "")
      : null;
    const rawUnitPrice = headerMap.unitPrice
      ? parseMonetary(row[headerMap.unitPrice] ?? "")
      : null;
    const rawTotalPrice = headerMap.totalPrice
      ? parseMonetary(row[headerMap.totalPrice] ?? "")
      : null;

    if (
      rawUnit == null &&
      rawQuantity == null &&
      rawUnitPrice == null &&
      rawTotalPrice == null
    ) {
      return;
    }

    const normalizedName = normalizeText(rawName);
    if (!normalizedName) return;

    const normalizedUnit = normalizeUnit(rawUnit);
    const normalizedCategory = detectSupplyCategory(rawName, rawCategory);
    const normalizationKey = makeNormalizationKey(
      normalizedName,
      normalizedUnit,
      normalizedCategory,
    );

    extracted.push({
      source,
      source_ref: {
        filename,
        source,
        parser: options.parser,
        row_index: (options.rowOffset ?? 0) + idx + 1,
        sheet_name: options.sheetName ?? null,
      },
      raw_name: rawName,
      raw_unit: rawUnit,
      raw_category: rawCategory,
      raw_quantity: rawQuantity,
      raw_unit_price: rawUnitPrice,
      raw_total_price:
        rawTotalPrice ??
        (rawQuantity != null && rawUnitPrice != null
          ? Number((rawQuantity * rawUnitPrice).toFixed(6))
          : null),
      normalized_name: normalizedName,
      normalized_unit: normalizedUnit,
      normalized_category: normalizedCategory,
      normalization_key: normalizationKey,
      notes: [],
      raw_columns: toRawColumns(row),
    });
  });

  return extracted;
}

function extractShadowCandidatesFromTabularRecords(
  rows: Record<string, string>[],
  filename: string,
  source: ContractSource,
  headerMap: TabularHeaderMap,
  options: { sheetName?: string; rowOffset?: number; parser: string },
): DraftAgenticShadowCandidate[] {
  const nameSeries = rows.map((row) => row[headerMap.name]?.trim() ?? "");
  const sectionLabelsByIndex = buildSectionLabelsByIndex(rows, headerMap);

  return rows.flatMap((row, idx) => {
    const rawName = row[headerMap.name]?.trim() ?? "";
    if (!rawName || isIgnoredBudgetLine(rawName)) return [];

    const rawUnit = headerMap.unit ? row[headerMap.unit]?.trim() || null : null;
    const rawCategory = headerMap.category
      ? row[headerMap.category]?.trim() || null
      : null;
    const rawQuantity = headerMap.quantity
      ? parseMonetary(row[headerMap.quantity] ?? "")
      : null;
    const rawUnitPrice = headerMap.unitPrice
      ? parseMonetary(row[headerMap.unitPrice] ?? "")
      : null;
    const rawTotalPrice = headerMap.totalPrice
      ? parseMonetary(row[headerMap.totalPrice] ?? "")
      : null;
    const hasSignals = hasTabularSupplySignals(
      rawUnit,
      rawQuantity,
      rawUnitPrice,
      rawTotalPrice,
    );
    const looksHeading = looksHeadingLikeCandidate(
      rawName,
      rawUnit,
      rawQuantity,
      rawUnitPrice,
      rawTotalPrice,
    );

    if (!hasSignals && !looksHeading) {
      return [];
    }

    const contextBefore = nameSeries
      .slice(Math.max(0, idx - 2), idx)
      .filter((value) => value && !isIgnoredBudgetLine(value));
    const contextAfter = nameSeries
      .slice(idx + 1, Math.min(nameSeries.length, idx + 3))
      .filter((value) => value && !isIgnoredBudgetLine(value));
    const evidenceRefs: ShadowCandidateEvidenceRef[] = [
      { type: "row_text", value: rawName },
    ];
    if (options.sheetName) {
      evidenceRefs.push({ type: "sheet_name", value: options.sheetName });
    }
    sectionLabelsByIndex[idx]?.slice(0, 2).forEach((label) => {
      evidenceRefs.push({ type: "neighbor_heading", value: label });
    });

    return [
      {
        candidate_origin: "agentic_only_candidate",
        deterministic_extracted_row_id: null,
        deterministic_normalized_supply_id: null,
        source_type: source,
        source_ref: {
          filename,
          source,
          parser: options.parser,
          row_index: (options.rowOffset ?? 0) + idx + 1,
          sheet_name: options.sheetName ?? null,
        },
        raw_text: rawName,
        raw_name: rawName,
        raw_unit: rawUnit,
        raw_category: rawCategory,
        raw_quantity: rawQuantity,
        raw_unit_price: rawUnitPrice,
        raw_total_price:
          rawTotalPrice ??
          (rawQuantity != null && rawUnitPrice != null
            ? Number((rawQuantity * rawUnitPrice).toFixed(6))
            : null),
        context_before: contextBefore,
        context_after: contextAfter,
        section_labels: sectionLabelsByIndex[idx] ?? [],
        evidence_refs: evidenceRefs,
        raw_columns: toRawColumns(row),
        span_offsets: {},
        table_signature: stableHash(
          [
            source,
            filename,
            options.sheetName ?? "",
            options.parser,
            headerMap.name,
            headerMap.unit ?? "",
            headerMap.quantity ?? "",
            headerMap.unitPrice ?? "",
            headerMap.totalPrice ?? "",
          ].join("|"),
        ),
        extraction_confidence: hasSignals ? "medium" : "low",
        extraction_notes: [
          hasSignals
            ? "Recovered from row-emitting document context."
            : "Recovered as heading/scope candidate from local row context.",
        ],
      },
    ];
  });
}

function buildSectionLabelsByIndex(
  rows: Record<string, string>[],
  headerMap: TabularHeaderMap,
): string[][] {
  const sectionLabelsByIndex: string[][] = [];
  let activeSectionLabels: string[] = [];

  rows.forEach((row, idx) => {
    const rawName = row[headerMap.name]?.trim() ?? "";
    const rawUnit = headerMap.unit ? row[headerMap.unit]?.trim() || null : null;
    const rawQuantity = headerMap.quantity
      ? parseMonetary(row[headerMap.quantity] ?? "")
      : null;
    const rawUnitPrice = headerMap.unitPrice
      ? parseMonetary(row[headerMap.unitPrice] ?? "")
      : null;
    const rawTotalPrice = headerMap.totalPrice
      ? parseMonetary(row[headerMap.totalPrice] ?? "")
      : null;
    const looksHeading = looksHeadingLikeCandidate(
      rawName,
      rawUnit,
      rawQuantity,
      rawUnitPrice,
      rawTotalPrice,
    );
    if (looksHeading) {
      activeSectionLabels = [rawName];
    }
    sectionLabelsByIndex[idx] = [...activeSectionLabels];
  });

  return sectionLabelsByIndex;
}

function buildShadowExtractionChunksFromTabularRecords(
  rows: Record<string, string>[],
  filename: string,
  source: ContractSource,
  headerMap: TabularHeaderMap,
  options: { sheetName?: string; rowOffset?: number; parser: string; headers: string[] },
): DraftShadowExtractionChunk[] {
  const nameSeries = rows.map((row) => row[headerMap.name]?.trim() ?? "");
  const sectionLabelsByIndex = buildSectionLabelsByIndex(rows, headerMap);
  const candidateRows: DraftShadowExtractionChunkRow[] = rows.flatMap((row, idx) => {
    const rawName = row[headerMap.name]?.trim() ?? "";
    if (!rawName || isIgnoredBudgetLine(rawName)) return [];

    const rawUnit = headerMap.unit ? row[headerMap.unit]?.trim() || null : null;
    const rawCategory = headerMap.category
      ? row[headerMap.category]?.trim() || null
      : null;
    const rawQuantity = headerMap.quantity
      ? parseMonetary(row[headerMap.quantity] ?? "")
      : null;
    const rawUnitPrice = headerMap.unitPrice
      ? parseMonetary(row[headerMap.unitPrice] ?? "")
      : null;
    const rawTotalPrice = headerMap.totalPrice
      ? parseMonetary(row[headerMap.totalPrice] ?? "")
      : null;
    const rowIndex = (options.rowOffset ?? 0) + idx + 1;
    const rowKey = [
      options.sheetName ?? "sheet",
      rowIndex,
      stableHash(
        [rawName, rawUnit ?? "", rawQuantity ?? "", rawUnitPrice ?? "", rawTotalPrice ?? ""].join("|"),
      ).slice(0, 12),
    ].join(":");

    return [
      {
        row_key: rowKey,
        row_index: rowIndex,
        raw_text: rawName,
        raw_name: rawName,
        raw_unit: rawUnit,
        raw_category: rawCategory,
        raw_quantity: rawQuantity,
        raw_unit_price: rawUnitPrice,
        raw_total_price:
          rawTotalPrice ??
          (rawQuantity != null && rawUnitPrice != null
            ? Number((rawQuantity * rawUnitPrice).toFixed(6))
            : null),
        raw_columns: toRawColumns(row),
        section_labels: sectionLabelsByIndex[idx] ?? [],
      },
    ];
  });

  const chunkSize = 12;
  const chunks: DraftShadowExtractionChunk[] = [];
  for (let chunkStart = 0; chunkStart < candidateRows.length; chunkStart += chunkSize) {
    const rowsInChunk = candidateRows.slice(chunkStart, chunkStart + chunkSize);
    if (rowsInChunk.length === 0) continue;
    const firstCandidate = rowsInChunk[0];
    const lastCandidate = rowsInChunk[rowsInChunk.length - 1];
    const startIdx = nameSeries.findIndex((name, idx) =>
      ((options.rowOffset ?? 0) + idx + 1) === firstCandidate.row_index && normalizeText(name) === normalizeText(firstCandidate.raw_name),
    );
    const endIdx = nameSeries.findIndex((name, idx) =>
      ((options.rowOffset ?? 0) + idx + 1) === lastCandidate.row_index && normalizeText(name) === normalizeText(lastCandidate.raw_name),
    );
    const contextBefore =
      startIdx >= 0
        ? nameSeries
            .slice(Math.max(0, startIdx - 2), startIdx)
            .filter((value) => value && !isIgnoredBudgetLine(value))
        : [];
    const contextAfter =
      endIdx >= 0
        ? nameSeries
            .slice(endIdx + 1, Math.min(nameSeries.length, endIdx + 3))
            .filter((value) => value && !isIgnoredBudgetLine(value))
        : [];
    const sectionLabels = Array.from(
      new Set(rowsInChunk.flatMap((row) => row.section_labels).filter(Boolean)),
    ).slice(0, 6);

    chunks.push({
      source_type: source,
      source_ref: {
        filename,
        source,
        parser: options.parser,
        row_index: firstCandidate.row_index,
        sheet_name: options.sheetName ?? null,
      },
      table_signature: stableHash(
        [
          source,
          filename,
          options.sheetName ?? "",
          options.parser,
          ...options.headers.map((header) => normalizeHeader(header)),
          rowsInChunk[0]?.row_index ?? "",
          rowsInChunk[rowsInChunk.length - 1]?.row_index ?? "",
        ].join("|"),
      ),
      chunk_index: chunks.length,
      headers: options.headers,
      context_before: contextBefore,
      context_after: contextAfter,
      section_labels: sectionLabels,
      rows: rowsInChunk,
    });
  }

  return chunks;
}

function buildMergedPreview(documents: ParsedInputDocument[]): MergedContract {
  const parsed = documents.map((document) => document.preview);
  const firstFilename = documents[0]?.filename ?? "contrato";

  const nombre = bestForField(
    parsed,
    [
      "msproject_xml",
      "apu_markdown",
      "xlsx",
      "csv",
      "markdown",
      "docx",
      "pdf",
      "image",
      "filename",
    ],
    (result) => result.nombre,
  );
  const descripcion = bestForField(parsed, null, (result) => result.descripcion);
  const ubicacion = bestForField(parsed, null, (result) => result.ubicacion);
  const fechaInicioP = bestForField(
    parsed,
    ["msproject_xml", "xlsx", "csv", "markdown", "apu_markdown"],
    (result) => result.fecha_inicio_planeada,
  );
  const fechaFinP = bestForField(
    parsed,
    ["msproject_xml", "xlsx", "csv", "markdown", "apu_markdown"],
    (result) => result.fecha_fin_planeada,
  );
  const fechaInicioR = bestForField(parsed, ["msproject_xml"], (result) => result.fecha_inicio_real);
  const presupuesto = bestForField(
    parsed,
    ["apu_markdown", "xlsx", "msproject_xml", "csv"],
    (result) => result.presupuesto_total,
  );
  const moneda = bestForField(
    parsed,
    ["msproject_xml", "apu_markdown", "xlsx", "csv"],
    (result) => result.moneda,
  );
  const costoReal = bestForField(parsed, ["msproject_xml"], (result) => result.costo_real);
  const costoRestante = bestForField(
    parsed,
    ["msproject_xml"],
    (result) => result.costo_restante,
  );
  const porcentaje = bestForField(parsed, ["pdf", "msproject_xml"], (result) => result.porcentaje_completado);

  const fases = mergePhases(parsed);
  const notas: string[] = [];
  parsed.forEach((result) => {
    result.notas.forEach((note) => notas.push(`(${result.raw_filename}) ${note}`));
  });

  const fileSummaries: FileParseSummary[] = documents.map((document) => {
    const contributed: string[] = [];
    if (document.preview.source === nombre.source) contributed.push("nombre");
    if (document.preview.source === presupuesto.source) contributed.push("presupuesto");
    if (document.preview.fases.length > 0) contributed.push("fases");
    if (document.preview.fecha_inicio_planeada || document.preview.fecha_fin_planeada) {
      contributed.push("fechas");
    }
    if (document.preview.porcentaje_completado != null) contributed.push("avance");
    return {
      filename: document.filename,
      source: document.source,
      confidence: document.confidence,
      parse_status: document.parse_status,
      extracted_row_count: document.extracted_row_count,
      contributed,
    };
  });

  return {
    source: nombre.source ?? parsed[0]?.source ?? "filename",
    confidence: parsed.some((result) => result.confidence === "alta")
      ? "alta"
      : parsed.some((result) => result.confidence === "media")
        ? "media"
        : "baja",
    nombre: nombre.value ?? decodeName(firstFilename),
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
      documents.length === 1
        ? firstFilename
        : `${documents.length} archivos combinados`,
    files: fileSummaries,
  };
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
    name: (task.Name as string | undefined) ?? "",
    outlineNumber: (task.OutlineNumber as string | undefined) ?? "",
    outlineLevel: Number(task.OutlineLevel ?? 0),
    isSummary: task.Summary === "1" || task.Summary === 1,
    start: isoDate(task.Start as string | undefined),
    finish: isoDate(task.Finish as string | undefined),
    actualStart: isoDate(task.ActualStart as string | undefined),
    percentComplete: asNumber(task.PercentComplete),
    cost: scaleCost(task.Cost),
    actualCost: scaleCost(task.ActualCost),
    remainingCost: scaleCost(task.RemainingCost),
  }));
}

function aggregatePhaseCost(task: MsProjectTask, tasks: MsProjectTask[]): number | null {
  if ((task.cost ?? 0) > 0) return task.cost;
  if (!task.outlineNumber) return task.cost;

  const prefix = `${task.outlineNumber}.`;
  const descendants = tasks.filter((candidate) => candidate.outlineNumber.startsWith(prefix));
  if (descendants.length === 0) return task.cost;

  const directChildren = descendants.filter(
    (candidate) =>
      candidate.outlineLevel === task.outlineLevel + 1 && (candidate.cost ?? 0) > 0,
  );
  const directChildrenCost = directChildren.reduce(
    (sum, candidate) => sum + (candidate.cost ?? 0),
    0,
  );
  if (directChildrenCost > 0) return directChildrenCost;

  const leafCost = descendants
    .filter((candidate) => !candidate.isSummary && (candidate.cost ?? 0) > 0)
    .reduce((sum, candidate) => sum + (candidate.cost ?? 0), 0);
  if (leafCost > 0) return leafCost;

  const maxDescendantCost = descendants.reduce(
    (max, candidate) => Math.max(max, candidate.cost ?? 0),
    0,
  );
  return maxDescendantCost > 0 ? maxDescendantCost : task.cost;
}

function parseMsProjectXml(xmlText: string, filename: string): ParsedDocumentAnalysis {
  const result = emptyResult(filename, "msproject_xml");

  let doc: unknown;
  try {
    doc = xmlParser.parse(xmlText);
  } catch (err) {
    result.notas.push(`No se pudo parsear el XML: ${(err as Error).message}`);
    return {
      preview: result,
      parse_status: "parse_failed",
      extracted_rows: [],
      shadow_candidates: [],
      shadow_extraction_chunks: [],
      sheet_names: [],
    };
  }

  const project = (doc as { Project?: Record<string, unknown> } | undefined)?.Project;
  if (!project) {
    result.notas.push("El XML no parece ser un archivo de Microsoft Project.");
    return {
      preview: result,
      parse_status: "metadata_only",
      extracted_rows: [],
      shadow_candidates: [],
      shadow_extraction_chunks: [],
      sheet_names: [],
    };
  }

  const currencyDigits = Number(project.CurrencyDigits ?? 2);
  const costScale = Math.pow(10, Number.isFinite(currencyDigits) ? currencyDigits : 2);
  const scaleCost = (raw: unknown): number | null => {
    const n = asNumber(raw);
    if (n == null) return null;
    return n / costScale;
  };

  const title = (project.Title as string | undefined) ?? "";
  const projectName = (project.Name as string | undefined) ?? "";
  const startDate = isoDate(project.StartDate as string | undefined);
  const finishDate = isoDate(project.FinishDate as string | undefined);
  const currency = (project.CurrencyCode as string | undefined) ?? null;

  const tasksContainer = project.Tasks as Record<string, unknown> | undefined;
  const taskList: Record<string, unknown>[] = (() => {
    if (!tasksContainer) return [];
    return asArray(tasksContainer.Task as Record<string, unknown> | Record<string, unknown>[]);
  })();
  const tasks = toMsProjectTasks(taskList, scaleCost);

  const summaryTask = tasks.find((task) => task.outlineLevel === 0);
  const rootTask = tasks.find((task) => task.outlineLevel === 1) ?? summaryTask;

  const nombre =
    rootTask?.name ||
    title ||
    decodeName(projectName) ||
    decodeName(filename);

  const presupuesto = rootTask?.cost ?? summaryTask?.cost ?? null;
  const costoReal = rootTask?.actualCost ?? summaryTask?.actualCost ?? null;
  const costoRestante = rootTask?.remainingCost ?? summaryTask?.remainingCost ?? null;
  const porcentaje = rootTask?.percentComplete ?? summaryTask?.percentComplete ?? null;
  const fechaInicioReal = rootTask?.actualStart ?? summaryTask?.actualStart ?? null;
  const fechaInicio = startDate ?? rootTask?.start ?? summaryTask?.start ?? null;
  const fechaFin = finishDate ?? rootTask?.finish ?? summaryTask?.finish ?? null;

  const phaseTasks = tasks
    .filter((task) => task.outlineLevel === 2 && task.isSummary)
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
      .filter((task) => task.outlineLevel >= 2 && task.outlineLevel <= 3)
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

  if (taskList.length > 0) {
    result.notas.push(
      `Detectadas ${taskList.length} tareas y ${fases.length} fase${fases.length === 1 ? "" : "s"} en el cronograma.`,
    );
  }
  const location = detectLocation(nombre);
  if (location) result.ubicacion = location;

  return {
    preview: result,
    parse_status: "metadata_only",
    extracted_rows: [],
    shadow_candidates: [],
    shadow_extraction_chunks: [],
    sheet_names: [],
  };
}

function parseCsv(text: string, filename: string): ParsedDocumentAnalysis {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const rows = parsed.data ?? [];
  const result = buildTabularPreview(rows, filename, "csv");
  if (parsed.errors.length > 0) {
    result.notas.push(`CSV con ${parsed.errors.length} advertencias de parseo.`);
  }
  if (rows.length === 0) {
    result.notas.push("El CSV está vacío o sin encabezados.");
    return {
      preview: result,
      parse_status: "metadata_only",
      extracted_rows: [],
      shadow_candidates: [],
      shadow_extraction_chunks: [],
      sheet_names: [],
    };
  }

  const headerMap = detectSupplyHeaderMap(parsed.meta.fields ?? []);
  if (!headerMap) {
    result.notas.push("CSV leído como vista previa, sin columnas de insumos/APU detectadas.");
    return {
      preview: result,
      parse_status: "metadata_only",
      extracted_rows: [],
      shadow_candidates: [],
      shadow_extraction_chunks: [],
      sheet_names: [],
    };
  }

  const extractedRows = extractSupplyRowsFromTabularRecords(rows, filename, "csv", headerMap, {
    parser: "csv_supply_rows",
    rowOffset: 1,
  });
  const shadowCandidates = extractShadowCandidatesFromTabularRecords(
    rows,
    filename,
    "csv",
    headerMap,
    {
      parser: "csv_shadow_candidates",
      rowOffset: 1,
    },
  );
  const shadowExtractionChunks = buildShadowExtractionChunksFromTabularRecords(
    rows,
    filename,
    "csv",
    headerMap,
    {
      parser: "csv_shadow_extraction_chunks",
      rowOffset: 1,
      headers: parsed.meta.fields ?? [],
    },
  );
  result.notas.push(
    `CSV con ${extractedRows.length} fila${extractedRows.length === 1 ? "" : "s"} de insumos detectadas.`,
  );

  return {
    preview: result,
    parse_status: extractedRows.length > 0 ? "parsed_supply_rows" : "metadata_only",
    extracted_rows: extractedRows,
    shadow_candidates: shadowCandidates,
    shadow_extraction_chunks: shadowExtractionChunks,
    sheet_names: [],
  };
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { getDocument } = pdfjs;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({
    data,
    disableWorker: true,
  } as unknown as Parameters<typeof getDocument>[0]).promise;

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

function parseControlBudgetPdf(text: string, filename: string): ParsedDocumentAnalysis {
  const result = emptyResult(filename, "pdf");
  const normalized = text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");

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

  const rowsWithEV = rows.filter((row) => row.week > 0 && row.cptr > 0);
  const latest = rowsWithEV.length > 0 ? rowsWithEV[rowsWithEV.length - 1] : null;
  const pctFromEv = bac != null && bac > 0 && latest ? (latest.cptr / bac) * 100 : null;

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

  return {
    preview: result,
    parse_status: "metadata_only",
    extracted_rows: [],
    shadow_candidates: [],
    shadow_extraction_chunks: [],
    sheet_names: [],
  };
}

function parsePipeTableRows(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length === 0) continue;
    rows.push(cells);
  }
  return rows;
}

function matrixRowsToObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header.trim().toLowerCase()] = row[index]?.trim() ?? "";
      });
      return record;
    });
}

function parseApuMarkdown(text: string, filename: string): ParsedDocumentAnalysis {
  const result = emptyResult(filename, "apu_markdown");
  const rows = parsePipeTableRows(text);

  if (rows.length === 0) {
    result.notas.push("No detectamos tablas APU en este archivo.");
    return {
      preview: result,
      parse_status: "metadata_only",
      extracted_rows: [],
      shadow_candidates: [],
      shadow_extraction_chunks: [],
      sheet_names: [],
    };
  }

  const phases: ParsedPhase[] = [];
  let valorTotal: number | null = null;
  let nombreChapterCero: string | null = null;
  let subtotalCostoDirecto: number | null = null;

  rows.forEach((row) => {
    if (row.length < 2) return;
    const item = (row[0] ?? "").trim();
    const desc = (row[1] ?? "").trim();
    const parcial = row.length >= 6 ? parseMonetary(row[5] ?? "") : null;

    if (/^VALOR\s+TOTAL/i.test(item) || /^VALOR\s+TOTAL/i.test(desc)) {
      valorTotal = parcial ?? parseMonetary(row[row.length - 1] ?? "");
      return;
    }
    if (/^SUBTOTAL\s+COSTO\s+DIRECTO/i.test(item)) {
      subtotalCostoDirecto = parcial ?? parseMonetary(row[row.length - 1] ?? "");
      return;
    }
    if (
      /^ADMINISTRACI|^IMPREVISTOS|^UTILIDAD|^IVA/i.test(item) ||
      /^ADMINISTRACI|^IMPREVISTOS|^UTILIDAD|^IVA/i.test(desc)
    ) {
      return;
    }
    if (!item && desc && !nombreChapterCero && /[A-ZÁÉÍÓÚÑ]{4,}/.test(desc)) {
      nombreChapterCero = desc;
      return;
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
  });

  if (phases.length === 0 && nombreChapterCero == null) {
    result.notas.push("No detectamos capítulos APU.");
    return {
      preview: result,
      parse_status: "metadata_only",
      extracted_rows: [],
      shadow_candidates: [],
      shadow_extraction_chunks: [],
      sheet_names: [],
    };
  }

  result.confidence = phases.length > 0 ? "alta" : "media";
  result.nombre = nombreChapterCero ?? decodeName(filename);
  result.presupuesto_total = valorTotal ?? subtotalCostoDirecto ?? null;
  result.moneda = "COP";
  result.fases = phases;

  const location = detectLocation(result.nombre);
  if (location) result.ubicacion = location;

  const budgetNote =
    valorTotal != null
      ? `, total ${Number(valorTotal).toLocaleString("es-CO")} COP`
      : subtotalCostoDirecto != null
        ? `, costo directo ${Number(subtotalCostoDirecto).toLocaleString("es-CO")} COP`
        : "";
  result.notas.push(
    `APU detectada: ${phases.length} capítulo(s)${budgetNote}.`,
  );

  const extractedRows: DraftExtractedSupplyRow[] = [];
  const shadowCandidates: DraftAgenticShadowCandidate[] = [];
  const shadowExtractionChunks: DraftShadowExtractionChunk[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const headerMap = detectSupplyHeaderMap(rows[rowIndex] ?? []);
    if (!headerMap) continue;
    const rawHeader = rows[rowIndex];
    const bodyRows: string[][] = [];
    for (let bodyIndex = rowIndex + 1; bodyIndex < rows.length; bodyIndex += 1) {
      const candidateHeader = detectSupplyHeaderMap(rows[bodyIndex] ?? []);
      if (candidateHeader) break;
      bodyRows.push(rows[bodyIndex]);
    }
    const records = matrixRowsToObjects(rawHeader, bodyRows);
    extractedRows.push(
      ...extractSupplyRowsFromTabularRecords(records, filename, "apu_markdown", headerMap, {
        parser: "apu_markdown_table",
        rowOffset: rowIndex + 1,
      }),
    );
    shadowCandidates.push(
      ...extractShadowCandidatesFromTabularRecords(records, filename, "apu_markdown", headerMap, {
        parser: "apu_markdown_shadow_candidates",
        rowOffset: rowIndex + 1,
      }),
    );
    shadowExtractionChunks.push(
      ...buildShadowExtractionChunksFromTabularRecords(records, filename, "apu_markdown", headerMap, {
        parser: "apu_markdown_shadow_extraction_chunks",
        rowOffset: rowIndex + 1,
        headers: rawHeader,
      }),
    );
  }

  if (extractedRows.length > 0) {
    result.notas.push(
      `APU con ${extractedRows.length} fila${extractedRows.length === 1 ? "" : "s"} de insumos detectadas.`,
    );
  }

  return {
    preview: result,
    parse_status: extractedRows.length > 0 ? "parsed_supply_rows" : "metadata_only",
    extracted_rows: extractedRows,
    shadow_candidates: shadowCandidates,
    shadow_extraction_chunks: shadowExtractionChunks,
    sheet_names: [],
  };
}

function parseGenericMarkdown(text: string, filename: string): ParsedDocumentAnalysis {
  if (
    /\|\s*ITEM\s*\|/i.test(text) ||
    /VALOR\s+TOTAL\s+DE\s+LA\s+PROPUESTA/i.test(text)
  ) {
    return parseApuMarkdown(text, filename);
  }

  const result = emptyResult(filename, "markdown");
  const titleMatch = text.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.nombre = titleMatch[1].trim().slice(0, 200);
    result.confidence = "media";
  }
  result.notas.push(
    "Documento Markdown sin tabla APU detectada. Se conserva solo como metadata.",
  );

  return {
    preview: result,
    parse_status: "metadata_only",
    extracted_rows: [],
    shadow_candidates: [],
    shadow_extraction_chunks: [],
    sheet_names: [],
  };
}

function parseFallback(
  filename: string,
  source: ContractSource,
  textHint: string,
  parseStatus: InputParseStatus,
): ParsedDocumentAnalysis {
  const result = emptyResult(filename, source);
  result.notas.push(textHint);
  return {
    preview: result,
    parse_status: parseStatus,
    extracted_rows: [],
    shadow_candidates: [],
    shadow_extraction_chunks: [],
    sheet_names: [],
  };
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function findZipEocdOffset(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (readUint32LE(bytes, offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("El runtime no soporta descompresión ZIP para XLSX.");
  }
  const safeBytes = bytes.slice();
  const stream = new Blob([safeBytes.buffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function unzipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const eocdOffset = findZipEocdOffset(bytes);
  if (eocdOffset < 0) {
    throw new Error("No se encontró el directorio ZIP del XLSX.");
  }

  const centralDirectorySize = readUint32LE(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUint32LE(bytes, eocdOffset + 16);
  const textDecoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();

  let pointer = centralDirectoryOffset;
  while (pointer < centralDirectoryOffset + centralDirectorySize) {
    if (readUint32LE(bytes, pointer) !== 0x02014b50) {
      throw new Error("Entrada ZIP inválida dentro del XLSX.");
    }

    const compressionMethod = readUint16LE(bytes, pointer + 10);
    const compressedSize = readUint32LE(bytes, pointer + 20);
    const fileNameLength = readUint16LE(bytes, pointer + 28);
    const extraLength = readUint16LE(bytes, pointer + 30);
    const commentLength = readUint16LE(bytes, pointer + 32);
    const localHeaderOffset = readUint32LE(bytes, pointer + 42);
    const fileName = textDecoder.decode(
      bytes.slice(pointer + 46, pointer + 46 + fileNameLength),
    );

    pointer += 46 + fileNameLength + extraLength + commentLength;
    if (fileName.endsWith("/")) continue;

    if (readUint32LE(bytes, localHeaderOffset) !== 0x04034b50) {
      throw new Error("Cabecera local ZIP inválida dentro del XLSX.");
    }
    const localNameLength = readUint16LE(bytes, localHeaderOffset + 26);
    const localExtraLength = readUint16LE(bytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    let content: Uint8Array;
    if (compressionMethod === 0) {
      content = compressed;
    } else if (compressionMethod === 8) {
      content = await inflateRaw(compressed);
    } else {
      throw new Error(`Compresión ZIP no soportada en XLSX: método ${compressionMethod}.`);
    }
    entries.set(fileName, content);
  }

  return entries;
}

function decodeZipEntry(entries: Map<string, Uint8Array>, path: string): string | null {
  const data = entries.get(path);
  if (!data) return null;
  return new TextDecoder().decode(data);
}

function resolveZipPath(basePath: string, target: string): string {
  if (target.startsWith("/")) {
    return target.replace(/^\/+/, "");
  }
  const segments = basePath.split("/");
  segments.pop();
  target.split("/").forEach((segment) => {
    if (!segment || segment === ".") return;
    if (segment === "..") {
      segments.pop();
      return;
    }
    segments.push(segment);
  });
  return segments.join("/");
}

function extractRichText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  if (typeof node.t === "string") return node.t;
  if (Array.isArray(node.t)) return node.t.map((item) => extractRichText(item)).join("");
  if (node.r) return asArray(node.r).map((item) => extractRichText(item)).join("");
  return "";
}

function parseSharedStrings(xmlText: string | null): string[] {
  if (!xmlText) return [];
  const parsed = xmlParser.parse(xmlText) as {
    sst?: { si?: Array<Record<string, unknown>> | Record<string, unknown> };
  };
  return asArray(parsed.sst?.si).map((item) => extractRichText(item).trim());
}

function columnIndexFromCellRef(ref: string): number {
  const match = ref.match(/^([A-Z]+)\d+$/i);
  if (!match) return -1;
  let index = 0;
  const letters = match[1].toUpperCase();
  for (let i = 0; i < letters.length; i += 1) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

function sheetCellText(
  cell: Record<string, unknown>,
  sharedStrings: string[],
): string {
  const type = String(cell.t ?? "");
  if (type === "s") {
    const index = Number(cell.v ?? -1);
    return sharedStrings[index] ?? "";
  }
  if (type === "inlineStr") {
    return extractRichText(cell.is).trim();
  }
  if (cell.is) {
    return extractRichText(cell.is).trim();
  }
  if (cell.v != null) {
    return String(cell.v).trim();
  }
  return "";
}

function parseWorksheetRows(xmlText: string, sharedStrings: string[]): string[][] {
  const parsed = xmlParser.parse(xmlText) as {
    worksheet?: {
      sheetData?: {
        row?: Array<Record<string, unknown>> | Record<string, unknown>;
      };
    };
  };
  const rows: string[][] = [];
  for (const rowNode of asArray(parsed.worksheet?.sheetData?.row)) {
    const cells = asArray((rowNode.c as Array<Record<string, unknown>> | Record<string, unknown>) ?? []);
    const row: string[] = [];
    cells.forEach((cell, idx) => {
      const ref = typeof cell.r === "string" ? cell.r : "";
      const columnIndex = ref ? columnIndexFromCellRef(ref) : idx;
      if (columnIndex < 0) return;
      row[columnIndex] = sheetCellText(cell, sharedStrings);
    });
    while (row.length > 0 && !row[row.length - 1]) {
      row.pop();
    }
    rows.push(row.map((value) => value ?? ""));
  }
  return rows;
}

function findWorksheetTableMatch(rows: string[][]): WorksheetTableMatch | null {
  const limit = Math.min(rows.length, 25);
  for (let index = 0; index < limit; index += 1) {
    const sourceRow = rows[index] ?? [];
    const headers = Array.from(
      { length: sourceRow.length },
      (_, headerIndex) => String(sourceRow[headerIndex] ?? "").trim(),
    );
    const headerMap = detectSupplyHeaderMap(headers);
    if (!headerMap) continue;
    return {
      header_row_index: index,
      headers,
      header_map: headerMap,
    };
  }
  return null;
}

function rowsToTabularObjects(
  matrix: string[][],
  headers: string[],
  headerRowIndex: number,
): Record<string, string>[] {
  const objects: Record<string, string>[] = [];
  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];
    if (row.every((cell) => !String(cell ?? "").trim())) continue;
    const record: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      record[header.trim().toLowerCase()] = String(row[headerIndex] ?? "").trim();
    });
    objects.push(record);
  }
  return objects;
}

async function parseXlsx(file: File): Promise<ParsedDocumentAnalysis> {
  const filename = file.name || "contrato.xlsx";
  const result = emptyResult(filename, "xlsx");
  const zipEntries = await unzipEntries(new Uint8Array(await file.arrayBuffer()));
  const workbookXml = decodeZipEntry(zipEntries, "xl/workbook.xml");
  const relationshipsXml = decodeZipEntry(zipEntries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relationshipsXml) {
    result.notas.push("El XLSX no contiene workbook.xml válido.");
    return {
      preview: result,
      parse_status: "parse_failed",
      extracted_rows: [],
      shadow_candidates: [],
      shadow_extraction_chunks: [],
      sheet_names: [],
    };
  }

  const workbook = xmlParser.parse(workbookXml) as {
    workbook?: {
      sheets?: {
        sheet?: Array<Record<string, unknown>> | Record<string, unknown>;
      };
    };
  };
  const relationships = xmlParser.parse(relationshipsXml) as {
    Relationships?: {
      Relationship?: Array<Record<string, unknown>> | Record<string, unknown>;
    };
  };
  const relationshipById = new Map<string, string>();
  asArray(relationships.Relationships?.Relationship).forEach((relation) => {
    const id = String(relation.Id ?? "");
    const target = String(relation.Target ?? "");
    if (id && target) {
      relationshipById.set(id, resolveZipPath("xl/workbook.xml", target));
    }
  });

  const sharedStrings = parseSharedStrings(decodeZipEntry(zipEntries, "xl/sharedStrings.xml"));
  const sheets = asArray(workbook.workbook?.sheets?.sheet).map((sheet) => ({
    name: String(sheet.name ?? "Sheet"),
    path: relationshipById.get(String(sheet.id ?? "")) ?? "",
  }));

  const matchedSheetNames: string[] = [];
  const allExtractedRows: DraftExtractedSupplyRow[] = [];
  const allShadowCandidates: DraftAgenticShadowCandidate[] = [];
  const allShadowExtractionChunks: DraftShadowExtractionChunk[] = [];
  let firstPreviewRows: Record<string, string>[] = [];

  for (const sheet of sheets) {
    if (!sheet.path) continue;
    const sheetXml = decodeZipEntry(zipEntries, sheet.path);
    if (!sheetXml) continue;
    const matrix = parseWorksheetRows(sheetXml, sharedStrings);
    const match = findWorksheetTableMatch(matrix);
    if (!match) continue;

    matchedSheetNames.push(sheet.name);
    const records = rowsToTabularObjects(
      matrix,
      match.headers,
      match.header_row_index,
    );
    if (firstPreviewRows.length === 0) {
      firstPreviewRows = records;
    }
    allExtractedRows.push(
      ...extractSupplyRowsFromTabularRecords(records, filename, "xlsx", match.header_map, {
        parser: "xlsx_sheet_table",
        sheetName: sheet.name,
        rowOffset: match.header_row_index + 1,
      }),
    );
    allShadowCandidates.push(
      ...extractShadowCandidatesFromTabularRecords(records, filename, "xlsx", match.header_map, {
        parser: "xlsx_shadow_candidates",
        sheetName: sheet.name,
        rowOffset: match.header_row_index + 1,
      }),
    );
    allShadowExtractionChunks.push(
      ...buildShadowExtractionChunksFromTabularRecords(records, filename, "xlsx", match.header_map, {
        parser: "xlsx_shadow_extraction_chunks",
        sheetName: sheet.name,
        rowOffset: match.header_row_index + 1,
        headers: match.headers,
      }),
    );
  }

  if (firstPreviewRows.length > 0) {
    const preview = buildTabularPreview(firstPreviewRows, filename, "xlsx");
    preview.notas.push(
      `XLSX con ${matchedSheetNames.length} hoja${matchedSheetNames.length === 1 ? "" : "s"} compatible${matchedSheetNames.length === 1 ? "" : "s"}: ${matchedSheetNames.join(", ")}.`,
    );
    if (allExtractedRows.length > 0) {
      preview.notas.push(
        `XLSX con ${allExtractedRows.length} fila${allExtractedRows.length === 1 ? "" : "s"} de insumos detectadas.`,
      );
    }
    return {
      preview,
      parse_status: allExtractedRows.length > 0 ? "parsed_supply_rows" : "metadata_only",
      extracted_rows: allExtractedRows,
      shadow_candidates: allShadowCandidates,
      shadow_extraction_chunks: allShadowExtractionChunks,
      sheet_names: matchedSheetNames,
    };
  }

  result.notas.push(
    "XLSX detectado, pero ninguna hoja coincidió con encabezados esperados de insumos/APU.",
  );
  return {
    preview: result,
    parse_status: "metadata_only",
    extracted_rows: [],
    shadow_candidates: [],
    shadow_extraction_chunks: [],
    sheet_names: [],
  };
}

function attachDocumentIdentity(
  file: File,
  analysis: ParsedDocumentAnalysis,
): {
  document: ParsedInputDocument;
  extractedRows: ExtractedSupplyRow[];
  shadowCandidates: AgenticShadowCandidate[];
  shadowExtractionChunks: ShadowExtractionChunk[];
} {
  const documentId = `doc_${stableHash(
    `${file.name}|${file.type}|${file.size}|${analysis.preview.source}`,
  )}`;
  const extractedRows = analysis.extracted_rows.map((row) => {
    const rowId = `row_${stableHash(
      [
        documentId,
        row.source_ref.sheet_name ?? "",
        row.source_ref.row_index ?? "",
        row.raw_name,
        row.raw_unit ?? "",
        row.raw_quantity ?? "",
        row.raw_total_price ?? "",
      ].join("|"),
    )}`;
    return {
      ...row,
      id: rowId,
      document_id: documentId,
    };
  });
  const extractedRowBySignature = new Map<string, ExtractedSupplyRow>();
  extractedRows.forEach((row) => {
    extractedRowBySignature.set(
      [
        row.source_ref.sheet_name ?? "",
        row.source_ref.row_index ?? "",
        normalizeText(row.raw_name),
      ].join("|"),
      row,
    );
  });
  const shadowCandidates = analysis.shadow_candidates.map((candidate) => {
    const matchedExtractedRow =
      extractedRowBySignature.get(
        [
          candidate.source_ref.sheet_name ?? "",
          candidate.source_ref.row_index ?? "",
          normalizeText(candidate.raw_name),
        ].join("|"),
      ) ?? null;
    return {
      shadow_candidate_id: crypto.randomUUID(),
      input_batch_id: "",
      document_id: documentId,
      candidate_origin: matchedExtractedRow
        ? "matched_deterministic_candidate"
        : candidate.candidate_origin,
      deterministic_extracted_row_id: matchedExtractedRow?.id ?? null,
      deterministic_normalized_supply_id: null,
      source_type: candidate.source_type,
      source_ref: {
        ...candidate.source_ref,
        filename: file.name,
      },
      raw_text: candidate.raw_text,
      raw_name: candidate.raw_name,
      raw_unit: candidate.raw_unit,
      raw_category: candidate.raw_category,
      raw_quantity: candidate.raw_quantity,
      raw_unit_price: candidate.raw_unit_price,
      raw_total_price: candidate.raw_total_price,
      context_before: candidate.context_before,
      context_after: candidate.context_after,
      section_labels: candidate.section_labels,
      evidence_refs: candidate.evidence_refs,
      raw_columns: candidate.raw_columns,
      span_offsets: candidate.span_offsets,
      table_signature: candidate.table_signature,
      extraction_confidence: candidate.extraction_confidence,
      extraction_notes: candidate.extraction_notes,
    };
  });
  const shadowExtractionChunks = analysis.shadow_extraction_chunks.map((chunk) => ({
    chunk_id: `chunk_${stableHash(
      [
        documentId,
        chunk.source_ref.sheet_name ?? "",
        chunk.source_ref.row_index ?? "",
        chunk.chunk_index,
        chunk.table_signature ?? "",
      ].join("|"),
    )}`,
    document_id: documentId,
    source_type: chunk.source_type,
    source_ref: {
      ...chunk.source_ref,
      filename: file.name,
    },
    table_signature: chunk.table_signature,
    chunk_index: chunk.chunk_index,
    headers: chunk.headers,
    context_before: chunk.context_before,
    context_after: chunk.context_after,
    section_labels: chunk.section_labels,
    rows: chunk.rows,
  }));

  return {
    document: {
      id: documentId,
      filename: file.name,
      source: analysis.preview.source,
      confidence: analysis.preview.confidence,
      parse_status: analysis.parse_status,
      notes: analysis.preview.notas,
      preview: analysis.preview,
      content_type: file.type || "application/octet-stream",
      byte_size: file.size,
      sheet_names: analysis.sheet_names,
      extracted_row_count: extractedRows.length,
    },
    extractedRows,
    shadowCandidates,
    shadowExtractionChunks,
  };
}

function buildNormalizedSupplies(
  extractedRows: ExtractedSupplyRow[],
): {
  normalized_supplies: NormalizedSupplyCandidate[];
  row_normalizations: RowNormalization[];
} {
  const grouped = new Map<string, NormalizedSupplyCandidate>();
  const rowNormalizations: RowNormalization[] = [];

  extractedRows.forEach((row) => {
    const existing = grouped.get(row.normalization_key);
    if (!existing) {
      grouped.set(row.normalization_key, {
        key: row.normalization_key,
        display_name: row.raw_name,
        normalized_name: row.normalized_name,
        normalized_unit: row.normalized_unit,
        normalized_category: row.normalized_category,
        quantity_total: row.raw_quantity,
        unit_price_reference: row.raw_unit_price,
        total_price_reference: row.raw_total_price,
        extracted_row_ids: [row.id],
        source_document_ids: [row.document_id],
        row_count: 1,
        source_count: 1,
      });
    } else {
      existing.row_count += 1;
      existing.extracted_row_ids.push(row.id);
      if (!existing.source_document_ids.includes(row.document_id)) {
        existing.source_document_ids.push(row.document_id);
        existing.source_count = existing.source_document_ids.length;
      }
      if (row.raw_quantity != null) {
        existing.quantity_total =
          existing.quantity_total == null
            ? row.raw_quantity
            : Number((existing.quantity_total + row.raw_quantity).toFixed(6));
      }
      if (existing.unit_price_reference == null && row.raw_unit_price != null) {
        existing.unit_price_reference = row.raw_unit_price;
      }
      if (row.raw_total_price != null) {
        existing.total_price_reference =
          existing.total_price_reference == null
            ? row.raw_total_price
            : Number((existing.total_price_reference + row.raw_total_price).toFixed(6));
      }
    }

    rowNormalizations.push({
      extracted_row_id: row.id,
      normalized_key: row.normalization_key,
      normalization_reason: "canonical_name_unit_category",
    });
  });

  return {
    normalized_supplies: Array.from(grouped.values()).sort((left, right) =>
      left.display_name.localeCompare(right.display_name, "es"),
    ),
    row_normalizations: rowNormalizations,
  };
}

export async function parseContractFile(file: File): Promise<ParsedContract> {
  const analysis = await parseContractFileAnalysis(file);
  return analysis.preview;
}

async function parseContractFileAnalysis(file: File): Promise<ParsedDocumentAnalysis> {
  const filename = file.name || "contrato";
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const mime = file.type ?? "";

  if (ext === "xml" || mime === "text/xml" || mime === "application/xml") {
    return parseMsProjectXml(await file.text(), filename);
  }

  if (ext === "csv" || mime === "text/csv" || mime === "application/csv") {
    return parseCsv(await file.text(), filename);
  }

  if (
    ext === "xlsx" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    try {
      return await parseXlsx(file);
    } catch (err) {
      return parseFallback(
        filename,
        "xlsx",
        `XLSX detectado, pero no pudimos procesarlo: ${(err as Error).message}`,
        "parse_failed",
      );
    }
  }

  if (ext === "md" || ext === "markdown" || mime === "text/markdown") {
    return parseGenericMarkdown(await file.text(), filename);
  }

  if (ext === "docx" || mime.includes("wordprocessingml")) {
    return parseFallback(
      filename,
      "docx",
      "Documento Word detectado. Se conserva metadata, pero v1 no extrae filas de insumos desde DOCX.",
      "unsupported_for_supply_rows",
    );
  }

  if (ext === "pdf" || mime === "application/pdf") {
    try {
      return parseControlBudgetPdf(await extractPdfText(file), filename);
    } catch (err) {
      return parseFallback(
        filename,
        "pdf",
        `PDF detectado pero no pudimos extraer su contenido: ${(err as Error).message}`,
        "parse_failed",
      );
    }
  }

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    return parseFallback(
      filename,
      "image",
      "Imagen detectada. Se conserva metadata, pero v1 no extrae filas de insumos desde imágenes.",
      "unsupported_for_supply_rows",
    );
  }

  return parseFallback(
    filename,
    "filename",
    `Formato .${ext || "desconocido"} no autodetectable para insumos. Completa los campos manualmente si aplica.`,
    "unsupported_for_supply_rows",
  );
}

export async function analyzeContractFiles(
  files: File[],
): Promise<ContractFileAnalysis> {
  if (files.length === 0) {
    throw new Error("No hay archivos para analizar.");
  }

  const parsedAnalyses = await Promise.all(files.map((file) => parseContractFileAnalysis(file)));
  const documents: ParsedInputDocument[] = [];
  const extractedRows: ExtractedSupplyRow[] = [];
  const shadowCandidates: AgenticShadowCandidate[] = [];
  const shadowExtractionChunks: ShadowExtractionChunk[] = [];

  files.forEach((file, index) => {
    const withIdentity = attachDocumentIdentity(file, parsedAnalyses[index]);
    documents.push(withIdentity.document);
    extractedRows.push(...withIdentity.extractedRows);
    shadowCandidates.push(...withIdentity.shadowCandidates);
    shadowExtractionChunks.push(...withIdentity.shadowExtractionChunks);
  });

  const { normalized_supplies, row_normalizations } = buildNormalizedSupplies(extractedRows);
  const extractedRowById = new Map(extractedRows.map((row) => [row.id, row]));
  const shadowCandidatesWithNormalization = shadowCandidates.map((candidate) => {
    const extractedRow = candidate.deterministic_extracted_row_id
      ? extractedRowById.get(candidate.deterministic_extracted_row_id) ?? null
      : null;
    return {
      ...candidate,
      deterministic_normalized_supply_id: extractedRow?.normalization_key ?? null,
    };
  });
  const merged_preview = buildMergedPreview(documents);

  return {
    merged_preview,
    documents,
    extracted_rows: extractedRows,
    normalized_supplies,
    row_normalizations,
    shadow_candidates: shadowCandidatesWithNormalization,
    shadow_extraction_chunks: shadowExtractionChunks,
  };
}

export async function parseContractFiles(
  files: File[],
): Promise<MergedContract> {
  const analysis = await analyzeContractFiles(files);
  return analysis.merged_preview;
}
