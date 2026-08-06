/**
 * Davibank (Davivienda) PDF bank statement parser.
 *
 * Uses pdfjs-dist to extract text from PDF pages, then delegates
 * to pure parsing utilities in pdf-parse-utils.ts.
 */
import * as pdfjsLib from "pdfjs-dist";
import {
  parsePeriodToMonthKey,
  parseSummary,
  parseTransactionsFromText,
  type ParsedStatement,
} from "./pdf-parse-utils";

// Re-export types and utilities used by other modules
export type {
  ParsedTransaction,
  ParsedStatement,
  ParseError,
} from "./pdf-parse-utils";
export { parseCOPAmount, detectFileType, isPDFFile } from "./pdf-parse-utils";

// Configure worker - use CDN for production, bundled for dev
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

// ─── Main Parser ─────────────────────────────────────────────────────

export async function parseDavibankPDF(
  file: File,
): Promise<
  | { success: true; statement: ParsedStatement }
  | {
      success: false;
      error: { type: string; message: string; details?: string };
    }
> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Extract structured text per page (preserving layout)
    const pageTexts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await extractPageTextWithLayout(page);
      pageTexts.push(text);
    }

    const combined = pageTexts.join("\n");

    // Verify it's a Davibank statement
    if (
      !combined.includes("CUENTA DE AHORROS") &&
      !combined.includes("DETALLE DE CUENTA")
    ) {
      return {
        success: false,
        error: {
          type: "invalid_format",
          message: "No se reconoce como extracto de Davibank/Davivienda",
        },
      };
    }

    // Parse header info
    const periodMatch = combined.match(
      /PERIODO\s*\n?\s*(\d+\s+AL\s+\d+\s+\w+\s+\d{4})/i,
    );
    const periodLabel = periodMatch?.[1]?.trim() ?? "";
    const period = parsePeriodToMonthKey(periodLabel);

    const accountMatch = combined.match(/No\s+(\d{10})/);
    const accountNumber = accountMatch?.[1] ?? "";

    // Parse summary
    const summary = parseSummary(combined);

    // Parse transactions from all pages
    const transactions = parseTransactionsFromText(combined);

    if (transactions.length === 0) {
      return {
        success: false,
        error: {
          type: "parse_error",
          message: "No se encontraron transacciones en el PDF",
        },
      };
    }

    const statement: ParsedStatement = {
      bank: "davibank",
      accountNumber,
      period,
      periodLabel,
      previousBalance: summary.previousBalance,
      deposits: summary.deposits,
      withdrawals: summary.withdrawals,
      newBalance: summary.newBalance,
      transactions,
    };

    return { success: true, statement };
  } catch (err) {
    return {
      success: false,
      error: {
        type: "parse_error",
        message: "Error al leer el PDF",
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ─── Layout-preserving text extraction ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractPageTextWithLayout(page: any): Promise<string> {
  const content = await page.getTextContent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (content.items as any[]).filter(
    (item: Record<string, unknown>) => "str" in item,
  ) as { str: string; transform: number[]; width: number }[];

  if (items.length === 0) return "";

  // Group items by Y position (same line), sorted by X
  const lines: Map<number, { x: number; text: string; width: number }[]> =
    new Map();
  const Y_THRESHOLD = 3;

  for (const item of items) {
    const y =
      Math.round((item.transform[5] as number) / Y_THRESHOLD) * Y_THRESHOLD;
    const x = item.transform[4] as number;
    if (!lines.has(y)) lines.set(y, []);
    const lineGroup = lines.get(y);
    if (lineGroup) lineGroup.push({ x, text: item.str, width: item.width });
  }

  // Sort lines by Y (descending since PDF y=0 is bottom)
  const sortedLines = [...lines.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, lineItems]) => lineItems.sort((a, b) => a.x - b.x));

  // Convert to text with approximate column positions
  return sortedLines
    .map((lineItems) => lineItems.map((i) => i.text).join(" "))
    .join("\n");
}
