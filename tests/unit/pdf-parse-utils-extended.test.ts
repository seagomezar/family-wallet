import { describe, it, expect } from 'vitest';
import {
  parseCOPAmount,
  parseDateStr,
  parsePeriodToMonthKey,
  parseTransactionsFromText,
  parseSummary,
  isHeaderLine,
  isFooterLine,
  isPDFFile,
  detectFileType,
} from '@/lib/pdf-parse-utils';

describe('parseCOPAmount - extended', () => {
  it('parses whole number without decimals separator', () => {
    expect(parseCOPAmount('100,00')).toBeCloseTo(100);
  });

  it('parses amount with one thousands group', () => {
    expect(parseCOPAmount('1.500,00')).toBeCloseTo(1500);
  });

  it('parses two thousands groups', () => {
    expect(parseCOPAmount('1.234.567,89')).toBeCloseTo(1234567.89);
  });

  it('parses three thousands groups', () => {
    expect(parseCOPAmount('100.234.567,89')).toBeCloseTo(100234567.89);
  });

  it('handles whitespace around value', () => {
    expect(parseCOPAmount('  16.934.391,71  ')).toBeCloseTo(16934391.71);
  });

  it('handles negative with whitespace', () => {
    expect(parseCOPAmount(' -500.000,00 ')).toBeCloseTo(-500000);
  });

  it('returns 0 for undefined-like inputs', () => {
    expect(parseCOPAmount('')).toBe(0);
    expect(parseCOPAmount('   ')).toBe(0);
  });

  it('returns 0 for non-numeric text', () => {
    expect(parseCOPAmount('abc')).toBe(0);
    expect(parseCOPAmount('N/A')).toBe(0);
  });

  it('parses amount with no thousands (sub-1000)', () => {
    expect(parseCOPAmount('50,00')).toBeCloseTo(50);
  });

  it('parses negative sub-1000 amount', () => {
    expect(parseCOPAmount('-50,00')).toBeCloseTo(-50);
  });

  it('handles exact zero', () => {
    expect(parseCOPAmount('0,00')).toBe(0);
  });

  it('handles non-zero decimal part', () => {
    expect(parseCOPAmount('0,99')).toBeCloseTo(0.99);
  });
});

describe('parseDateStr', () => {
  it('parses D/MM/YYYY (single digit day)', () => {
    const date = parseDateStr('4/05/2026');
    expect(date.getDate()).toBe(4);
    expect(date.getMonth()).toBe(4); // May
    expect(date.getFullYear()).toBe(2026);
  });

  it('parses DD/MM/YYYY (double digit day)', () => {
    const date = parseDateStr('25/05/2026');
    expect(date.getDate()).toBe(25);
    expect(date.getMonth()).toBe(4);
    expect(date.getFullYear()).toBe(2026);
  });

  it('parses 1/01/2026 (January 1st)', () => {
    const date = parseDateStr('1/01/2026');
    expect(date.getDate()).toBe(1);
    expect(date.getMonth()).toBe(0);
    expect(date.getFullYear()).toBe(2026);
  });

  it('parses 31/12/2025', () => {
    const date = parseDateStr('31/12/2025');
    expect(date.getDate()).toBe(31);
    expect(date.getMonth()).toBe(11);
    expect(date.getFullYear()).toBe(2025);
  });

  it('returns a Date for invalid format (fallback)', () => {
    const date = parseDateStr('invalid');
    expect(date).toBeInstanceOf(Date);
  });

  it('handles missing parts gracefully', () => {
    const date = parseDateStr('4/05');
    // Only 2 parts, returns new Date()
    expect(date).toBeInstanceOf(Date);
  });
});

describe('parsePeriodToMonthKey - extended', () => {
  it('parses ENE 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 31 ENE 2026')).toBe('2026-01');
  });

  it('parses FEB 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 28 FEB 2026')).toBe('2026-02');
  });

  it('parses MAR 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 31 MAR 2026')).toBe('2026-03');
  });

  it('parses ABR 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 30 ABR 2026')).toBe('2026-04');
  });

  it('parses AGO 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 31 AGO 2026')).toBe('2026-08');
  });

  it('parses SEP 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 30 SEP 2026')).toBe('2026-09');
  });

  it('parses OCT 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 31 OCT 2026')).toBe('2026-10');
  });

  it('parses NOV 2026', () => {
    expect(parsePeriodToMonthKey('1 AL 30 NOV 2026')).toBe('2026-11');
  });

  it('parses DIC 2025', () => {
    expect(parsePeriodToMonthKey('1 AL 31 DIC 2025')).toBe('2025-12');
  });

  it('returns empty for empty string', () => {
    expect(parsePeriodToMonthKey('')).toBe('');
  });

  it('returns empty for string without month abbreviation', () => {
    expect(parsePeriodToMonthKey('PERIODO')).toBe('');
  });

  it('handles lowercase input (no match - returns empty)', () => {
    // MONTH_MAP keys are uppercase; match uses toUpperCase so it should work
    expect(parsePeriodToMonthKey('1 al 31 may 2026')).toBe('2026-05');
  });
});

describe('isHeaderLine', () => {
  it('detects ESTIMADO CLIENTE', () => {
    expect(isHeaderLine('ESTIMADO CLIENTE SEBASTIAN')).toBe(true);
  });

  it('detects DETALLE DE CUENTA', () => {
    expect(isHeaderLine('DETALLE DE CUENTA')).toBe(true);
  });

  it('detects column header row', () => {
    expect(isHeaderLine('FECHA OFICINA No DOCUM DESCRIPCION MONTO SALDO')).toBe(true);
  });

  it('detects RESUMEN CUENTA', () => {
    expect(isHeaderLine('RESUMEN CUENTA AHORROS')).toBe(true);
  });

  it('detects SALDO ANTERIOR', () => {
    expect(isHeaderLine('SALDO ANTERIOR')).toBe(true);
  });

  it('detects PERIODO', () => {
    expect(isHeaderLine('PERIODO')).toBe(true);
  });

  it('detects page numbers', () => {
    expect(isHeaderLine('Pag')).toBe(true);
    expect(isHeaderLine('3')).toBe(true);
  });

  it('does not flag regular text', () => {
    expect(isHeaderLine('COMPRA POS EXITO WOW')).toBe(false);
    expect(isHeaderLine('4/05/2026 CENTRAL DE C')).toBe(false);
  });
});

describe('isFooterLine', () => {
  it('detects "Ponemos a tu disposición"', () => {
    expect(isFooterLine('Ponemos a tu disposición los canales')).toBe(true);
  });

  it('detects www.davibank.com', () => {
    expect(isFooterLine('www.davibank.com')).toBe(true);
  });

  it('detects Defensoría del Consumidor', () => {
    expect(isFooterLine('Defensoría del Consumidor Financiero')).toBe(true);
  });

  it('does not flag regular text', () => {
    expect(isFooterLine('COMPRA POS FRISBY')).toBe(false);
  });
});

describe('parseTransactionsFromText - extended', () => {
  it('handles empty text', () => {
    const txs = parseTransactionsFromText('');
    expect(txs).toHaveLength(0);
  });

  it('handles text with no transactions', () => {
    const text = `DETALLE DE CUENTA
ESTIMADO CLIENTE
RESUMEN CUENTA AHORROS`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(0);
  });

  it('parses a single transaction', () => {
    const text = `7/05/2026 CENTRAL DE C COMPRA POS I P S SUPLIMED ITA 070526 103344 -153.700,00 3.952.860,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBeCloseTo(-153700);
    expect(txs[0]!.balance).toBeCloseTo(3952860.71);
    expect(txs[0]!.date.getDate()).toBe(7);
  });

  it('parses positive deposit amounts', () => {
    const text = `15/05/2026 CENTRAL DE C Rec.Inter TFR FR-16350501 22.794.699,00 26.801.760,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBeCloseTo(22794699);
  });

  it('handles multi-line descriptions', () => {
    const text = `4/05/2026 CENTRAL DE C Trans. ACH TFR TO-2595955
-Traslados Producto-Cta/Cnt -5.150.361,98 11.184.029,73`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.description).toContain('Trans. ACH TFR');
    expect(txs[0]!.amount).toBeCloseTo(-5150361.98);
  });

  it('parses multiple transactions in sequence', () => {
    const text = `4/05/2026 CENTRAL DE C RETIRO ATM BCOL PLZAMERIC 526 105710 -600.000,00 16.334.391,71
4/05/2026 CENTRAL DE C Pago por PSE CElulasMadre -223.798,00 16.110.593,71
5/05/2026 CENTRAL DE C COMPRA POS R39 CREPESYWAF AER 050526 131410 -59.000,00 4.207.060,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(3);
    expect(txs[0]!.amount).toBeCloseTo(-600000);
    expect(txs[1]!.amount).toBeCloseTo(-223798);
    expect(txs[2]!.amount).toBeCloseTo(-59000);
  });

  it('ignores header lines between transactions', () => {
    const text = `4/05/2026 CENTRAL DE C RETIRO ATM -600.000,00 16.334.391,71
DETALLE DE CUENTA
FECHA OFICINA No DOCUM DESCRIPCION MONTO SALDO
5/05/2026 CENTRAL DE C COMPRA POS FRISBY -59.000,00 4.207.060,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(2);
  });

  it('ignores footer lines', () => {
    const text = `4/05/2026 CENTRAL DE C COMPRA POS EXITO -327.900,00 14.969.693,71
www.davibank.com
Ponemos a tu disposición los canales de atención`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
  });

  it('extracts office from known patterns', () => {
    const text = `4/05/2026 CENTRAL DE C COMPRA POS EXITO -327.900,00 14.969.693,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs[0]!.office).toBe('CENTRAL DE C');
  });
});

describe('parseSummary - extended', () => {
  it('returns zeros when no summary section found', () => {
    const result = parseSummary('No summary here');
    expect(result.previousBalance).toBe(0);
    expect(result.deposits).toBe(0);
    expect(result.withdrawals).toBe(0);
    expect(result.newBalance).toBe(0);
  });

  it('handles summary with only partial amounts', () => {
    const text = `RESUMEN CUENTA AHORROS
SALDO ANTERIOR
1.000.000,00
2.000.000,00`;
    const result = parseSummary(text);
    expect(result.previousBalance).toBeCloseTo(1000000);
    expect(result.deposits).toBeCloseTo(2000000);
    expect(result.withdrawals).toBe(0);
    expect(result.newBalance).toBe(0);
  });

  it('parses all four summary values', () => {
    const text = `RESUMEN CUENTA AHORROS
SALDO ANTERIOR
DEPOSITOS Y OTROS CREDITOS
RETIROS Y OTROS DEBITOS
NUEVO SALDO
10.000.000,00
5.000.000,00
3.000.000,00
12.000.000,00`;
    const result = parseSummary(text);
    expect(result.previousBalance).toBeCloseTo(10000000);
    expect(result.deposits).toBeCloseTo(5000000);
    expect(result.withdrawals).toBeCloseTo(3000000);
    expect(result.newBalance).toBeCloseTo(12000000);
  });
});

describe('isPDFFile', () => {
  it('detects PDF by MIME type', () => {
    const file = new File([''], 'document.pdf', { type: 'application/pdf' });
    expect(isPDFFile(file)).toBe(true);
  });

  it('detects PDF by extension', () => {
    const file = new File([''], 'extracto.PDF', { type: '' });
    expect(isPDFFile(file)).toBe(true);
  });

  it('rejects non-PDF files', () => {
    const file = new File([''], 'data.csv', { type: 'text/csv' });
    expect(isPDFFile(file)).toBe(false);
  });

  it('rejects file with no type and no .pdf extension', () => {
    const file = new File([''], 'report.txt', { type: '' });
    expect(isPDFFile(file)).toBe(false);
  });
});

describe('detectFileType', () => {
  it('detects PDF', () => {
    const file = new File([''], 'extracto.pdf', { type: 'application/pdf' });
    expect(detectFileType(file)).toBe('pdf');
  });

  it('detects CSV by extension', () => {
    const file = new File([''], 'data.csv', { type: '' });
    expect(detectFileType(file)).toBe('csv');
  });

  it('detects CSV by MIME', () => {
    const file = new File([''], 'data.dat', { type: 'text/csv' });
    expect(detectFileType(file)).toBe('csv');
  });

  it('detects TSV by .tsv extension', () => {
    const file = new File([''], 'bancolombia.tsv', { type: '' });
    expect(detectFileType(file)).toBe('tsv');
  });

  it('detects TSV by .txt extension', () => {
    const file = new File([''], 'bancolombia.txt', { type: '' });
    expect(detectFileType(file)).toBe('tsv');
  });

  it('returns unknown for unrecognized file', () => {
    const file = new File([''], 'image.png', { type: 'image/png' });
    expect(detectFileType(file)).toBe('unknown');
  });
});
