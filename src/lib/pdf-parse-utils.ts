/**
 * Pure utility functions for parsing Davibank PDF text content.
 * No pdfjs-dist dependency - safe for testing in Node.js environments.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface ParsedTransaction {
  date: Date;
  office: string;
  documentNumber: string;
  description: string;
  amount: number;
  balance: number;
}

export interface ParsedStatement {
  bank: 'davibank';
  accountNumber: string;
  period: string; // "2026-05"
  periodLabel: string; // "1 AL 31 MAY 2026"
  previousBalance: number;
  deposits: number;
  withdrawals: number;
  newBalance: number;
  transactions: ParsedTransaction[];
}

export interface ParseError {
  type: 'parse_error' | 'invalid_format' | 'validation_error';
  message: string;
  details?: string;
}

// ─── Amount Parsing ──────────────────────────────────────────────────

/**
 * Parse Colombian amount format: "1.234.567,89" or "-5.150.361,98"
 */
export function parseCOPAmount(str: string): number {
  const cleaned = str.trim();
  if (!cleaned) return 0;
  const isNegative = cleaned.startsWith('-');
  const absStr = cleaned.replace(/^-/, '');

  // Remove thousands separator (periods) and replace decimal comma with dot
  const normalized = absStr.replace(/\./g, '').replace(',', '.');
  const value = parseFloat(normalized);

  if (isNaN(value)) return 0;
  return isNegative ? -value : value;
}

// ─── Date Parsing ────────────────────────────────────────────────────

export function parseDateStr(dateStr: string): Date {
  // D/MM/YYYY or DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length !== 3) return new Date();
  const day = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10) - 1;
  const year = parseInt(parts[2]!, 10);
  return new Date(year, month, day);
}

// ─── Period Parsing ──────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  ENE: '01', FEB: '02', MAR: '03', ABR: '04',
  MAY: '05', JUN: '06', JUL: '07', AGO: '08',
  SEP: '09', OCT: '10', NOV: '11', DIC: '12',
};

export function parsePeriodToMonthKey(periodLabel: string): string {
  // "1 AL 31 MAY 2026" → "2026-05"
  const match = periodLabel.match(/(\w{3})\s+(\d{4})/);
  if (!match) return '';
  const monthAbbr = match[1]!.toUpperCase();
  const year = match[2]!;
  const month = MONTH_MAP[monthAbbr] ?? '01';
  return `${year}-${month}`;
}

// ─── Text Parsing Utilities ──────────────────────────────────────────

export function isHeaderLine(line: string): boolean {
  return (
    line.includes('ESTIMADO CLIENTE') ||
    line.includes('DETALLE DE CUENTA') ||
    (line.includes('FECHA') && line.includes('OFICINA') && line.includes('MONTO')) ||
    line.includes('RESUMEN CUENTA') ||
    line.includes('SALDO ANTERIOR') ||
    line.includes('DEPOSITOS Y OTROS') ||
    line.includes('RETIROS Y OTROS') ||
    line.includes('NUEVO SALDO') ||
    line.includes('PERIODO') ||
    line.includes('CUENTA DE AHORROS') ||
    /^Pag\s*$/.test(line) ||
    /^\d{1,2}\s*$/.test(line)
  );
}

export function isFooterLine(line: string): boolean {
  return (
    line.includes('Ponemos a tu disposición') ||
    line.includes('www.davibank.com') ||
    line.includes('Defensoría del Consumidor') ||
    line.includes('Davibank pertenece') ||
    line.includes('canales de atención')
  );
}

// ─── Transaction Parsing from Text ───────────────────────────────────

export function parseTransactionsFromText(text: string): ParsedTransaction[] {
  const lines = text.split('\n');
  const transactions: ParsedTransaction[] = [];

  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();

    // Try to match a date at the start of a line (D/MM/YYYY or DD/MM/YYYY)
    const dateMatch = line.match(/^(\d{1,2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      const result = parseTransactionBlock(lines, i);
      if (result) {
        transactions.push(result.transaction);
        i = result.nextIndex;
        continue;
      }
    }
    i++;
  }

  return transactions;
}

interface TransactionBlockResult {
  transaction: ParsedTransaction;
  nextIndex: number;
}

function parseTransactionBlock(lines: string[], startIndex: number): TransactionBlockResult | null {
  const line = lines[startIndex]!.trim();

  const dateMatch = line.match(/^(\d{1,2}\/\d{2}\/\d{4})/);
  if (!dateMatch) return null;

  const dateStr = dateMatch[1]!;
  const date = parseDateStr(dateStr);

  const rest = line.slice(dateStr.length).trim();

  // Try to extract amounts from the end of the line
  // Amounts in Colombian format: -5.150.361,98 or 22.794.699,00
  const amountPattern = /(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;
  const amountMatch = rest.match(amountPattern);

  if (!amountMatch) {
    return parseMultiLineTransaction(lines, startIndex, date, dateStr);
  }

  const amount = parseCOPAmount(amountMatch[1]!);
  const balance = parseCOPAmount(amountMatch[2]!);
  const beforeAmounts = rest.slice(0, amountMatch.index).trim();

  const { office, description: desc } = parseOfficeAndDescription(beforeAmounts);

  // Check if next line is a continuation
  let description = desc;
  let nextIndex = startIndex + 1;

  while (nextIndex < lines.length) {
    const nextLine = lines[nextIndex]!.trim();
    if (
      !nextLine ||
      /^\d{1,2}\/\d{2}\/\d{4}/.test(nextLine) ||
      isHeaderLine(nextLine) ||
      isFooterLine(nextLine)
    ) {
      break;
    }
    // Check if this continuation line has amounts (might be a separate transaction)
    if (amountPattern.test(nextLine) && !nextLine.startsWith('-')) {
      break;
    }
    // It's a continuation line
    const contText = nextLine.replace(/(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/, '').trim();
    if (contText && !contText.match(/^(-?[\d.]+,\d{2})$/)) {
      description += ' ' + contText;
    }
    nextIndex++;
  }

  return {
    transaction: {
      date,
      office,
      documentNumber: '',
      description: cleanDescription(description),
      amount,
      balance,
    },
    nextIndex,
  };
}

function parseMultiLineTransaction(
  lines: string[],
  startIndex: number,
  date: Date,
  dateStr: string
): TransactionBlockResult | null {
  const blockLines: string[] = [lines[startIndex]!.trim()];
  let nextIndex = startIndex + 1;

  while (nextIndex < lines.length) {
    const nextLine = lines[nextIndex]!.trim();
    if (
      !nextLine ||
      /^\d{1,2}\/\d{2}\/\d{4}/.test(nextLine) ||
      isHeaderLine(nextLine) ||
      isFooterLine(nextLine)
    ) {
      break;
    }
    blockLines.push(nextLine);
    nextIndex++;
  }

  const fullBlock = blockLines.join(' ');
  const amountPattern = /(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;
  const amountMatch = fullBlock.match(amountPattern);

  if (!amountMatch) return null;

  const amount = parseCOPAmount(amountMatch[1]!);
  const balance = parseCOPAmount(amountMatch[2]!);
  const beforeAmounts = fullBlock.slice(dateStr.length, amountMatch.index).trim();
  const { office, description } = parseOfficeAndDescription(beforeAmounts);

  return {
    transaction: {
      date,
      office,
      documentNumber: '',
      description: cleanDescription(description),
      amount,
      balance,
    },
    nextIndex,
  };
}

function parseOfficeAndDescription(text: string): { office: string; description: string } {
  const officePatterns = [
    'CENTRAL DE C',
    'SANTAFE MEDE',
    'TR',
  ];

  let office = '';
  let description = text;

  for (const pattern of officePatterns) {
    if (text.startsWith(pattern)) {
      office = pattern;
      description = text.slice(pattern.length).trim();
      break;
    }
  }

  return { office, description };
}

function cleanDescription(desc: string): string {
  let cleaned = desc
    .replace(/^\d{6,}\s*/, '')
    .replace(/\s+\d{6}\s+\d{6}\s*/, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  cleaned = cleaned.replace(/\s+[A-Z]{2,3}\s+\d{6}\s+\d{6}\s*$/, '');

  return cleaned || desc.trim();
}

// ─── Summary Parsing ─────────────────────────────────────────────────

export function parseSummary(text: string) {
  // The summary section has labels followed by values, potentially
  // on separate lines. We look for the section and extract values in order.
  const lines = text.split('\n').map((l) => l.trim());

  // Find the summary section
  const summaryStart = lines.findIndex((l) => l.includes('RESUMEN CUENTA'));
  if (summaryStart === -1) {
    return { previousBalance: 0, deposits: 0, withdrawals: 0, newBalance: 0 };
  }

  // Extract all amount-like values after the summary header
  const amountRegex = /^-?[\d.]+,\d{2}$/;
  const amounts: number[] = [];

  for (let i = summaryStart; i < lines.length && amounts.length < 4; i++) {
    const line = lines[i]!;
    if (amountRegex.test(line)) {
      amounts.push(parseCOPAmount(line));
    }
  }

  return {
    previousBalance: amounts[0] ?? 0,
    deposits: amounts[1] ?? 0,
    withdrawals: amounts[2] ?? 0,
    newBalance: amounts[3] ?? 0,
  };
}

/**
 * Detect if a file is a PDF by checking extension.
 */
export function isPDFFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

/**
 * Detect file type for import routing.
 */
export function detectFileType(file: File): 'pdf' | 'csv' | 'tsv' | 'unknown' {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.csv') || file.type === 'text/csv') return 'csv';
  if (name.endsWith('.tsv') || name.endsWith('.txt')) return 'tsv';
  return 'unknown';
}
