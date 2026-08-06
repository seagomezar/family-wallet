import { describe, it, expect } from 'vitest';
import { parseTransactionsFromText, parsePeriodToMonthKey, parseSummary } from '@/lib/pdf-parse-utils';

describe('PDF Parse Utils - Transaction Parsing', () => {
  const sampleText = `DETALLE DE CUENTA
FECHA OFICINA No DOCUM DESCRIPCION MONTO SALDO
4/05/2026 CENTRAL DE C RETIRO ATM BCOL PLZAMERIC 526 105710 -600.000,00 16.334.391,71
4/05/2026 CENTRAL DE C Pago por PSE CElulasMadre -223.798,00 16.110.593,71
4/05/2026 CENTRAL DE C Pago por PSE DepOsito a tu cuenta NU -500.000,00 15.610.593,71
4/05/2026 CENTRAL DE C COMPRA POS PRICESMART AME 010526 160248 -640.900,00 14.969.693,71
5/05/2026 CENTRAL DE C COMPRA POS R39 CREPESYWAF AER 050526 131410 -59.000,00 4.207.060,71
7/05/2026 CENTRAL DE C COMPRA POS I P S SUPLIMED ITA 070526 103344 -153.700,00 3.952.860,71
25/05/2026 CENTRAL DE C COMPRA POS MOBIL EDS LOS DRO 250526 124611 -170.000,00 21.611.388,01
25/05/2026 CENTRAL DE C Pago por PSE EPM FACTURA WEB PSE -1.064.521,00 20.546.867,01`;

  it('parses transactions from text', () => {
    const txs = parseTransactionsFromText(sampleText);
    expect(txs.length).toBeGreaterThanOrEqual(7);
  });

  it('extracts correct dates', () => {
    const txs = parseTransactionsFromText(sampleText);
    const first = txs[0]!;
    expect(first.date.getDate()).toBe(4);
    expect(first.date.getMonth()).toBe(4); // May = 4
    expect(first.date.getFullYear()).toBe(2026);
  });

  it('extracts correct amounts', () => {
    const txs = parseTransactionsFromText(sampleText);
    const pricesmart = txs.find((t) => t.description.includes('PRICESMART'));
    expect(pricesmart).toBeDefined();
    expect(pricesmart!.amount).toBeCloseTo(-640900);
    expect(pricesmart!.balance).toBeCloseTo(14969693.71);
  });

  it('extracts EPM amount correctly', () => {
    const txs = parseTransactionsFromText(sampleText);
    const epm = txs.find((t) => t.description.includes('EPM'));
    expect(epm).toBeDefined();
    expect(epm!.amount).toBeCloseTo(-1064521);
  });

  it('handles Mobil EDS description', () => {
    const txs = parseTransactionsFromText(sampleText);
    const mobil = txs.find((t) => t.description.includes('MOBIL'));
    expect(mobil).toBeDefined();
    expect(mobil!.amount).toBeCloseTo(-170000);
  });

  describe('parsePeriodToMonthKey', () => {
    it('parses MAY 2026', () => {
      expect(parsePeriodToMonthKey('1 AL 31 MAY 2026')).toBe('2026-05');
    });

    it('parses JUN 2026', () => {
      expect(parsePeriodToMonthKey('1 AL 30 JUN 2026')).toBe('2026-06');
    });

    it('parses JUL 2026', () => {
      expect(parsePeriodToMonthKey('1 AL 31 JUL 2026')).toBe('2026-07');
    });

    it('returns empty for invalid input', () => {
      expect(parsePeriodToMonthKey('')).toBe('');
    });
  });

  describe('parseSummary', () => {
    const summaryText = `RESUMEN CUENTA AHORROS
SALDO ANTERIOR
DEPOSITOS Y OTROS CREDITOS
RETIROS Y OTROS DEBITOS
NUEVO SALDO
16.934.391,71
82.506.736,53
94.660.522,92
4.780.605,32`;

    it('extracts previous balance', () => {
      const summary = parseSummary(summaryText);
      expect(summary.previousBalance).toBeCloseTo(16934391.71);
    });

    it('extracts deposits', () => {
      const summary = parseSummary(summaryText);
      expect(summary.deposits).toBeCloseTo(82506736.53);
    });

    it('extracts withdrawals', () => {
      const summary = parseSummary(summaryText);
      expect(summary.withdrawals).toBeCloseTo(94660522.92);
    });

    it('extracts new balance', () => {
      const summary = parseSummary(summaryText);
      expect(summary.newBalance).toBeCloseTo(4780605.32);
    });
  });
});
