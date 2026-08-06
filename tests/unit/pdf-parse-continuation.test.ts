import { describe, it, expect } from 'vitest';
import { parseTransactionsFromText } from '@/lib/pdf-parse-utils';

describe('PDF Parse Utils - Continuation lines & edge cases', () => {
  it('handles continuation line with amounts (stops merging)', () => {
    // A continuation line that itself has amount format should start a new transaction
    const text = `4/05/2026 CENTRAL DE C RETIRO ATM BCOL -600.000,00 16.334.391,71
5/05/2026 CENTRAL DE C COMPRA POS FRISBY -59.000,00 4.207.060,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(2);
    expect(txs[0]!.amount).toBeCloseTo(-600000);
    expect(txs[1]!.amount).toBeCloseTo(-59000);
  });

  it('merges multi-line description when continuation has no amounts', () => {
    const text = `4/05/2026 CENTRAL DE C Trans. ACH TFR TO-2595955
-Traslados Producto-Cta/Cnt -5.150.361,98 11.184.029,73`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.description).toContain('Trans. ACH TFR');
    expect(txs[0]!.description).toContain('Traslados');
    expect(txs[0]!.amount).toBeCloseTo(-5150361.98);
    expect(txs[0]!.balance).toBeCloseTo(11184029.73);
  });

  it('handles transaction followed by empty line then next transaction', () => {
    const text = `4/05/2026 CENTRAL DE C COMPRA POS EXITO -327.900,00 14.969.693,71

5/05/2026 CENTRAL DE C COMPRA POS FRISBY -59.000,00 4.207.060,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(2);
  });

  it('handles continuation line that is only amount values', () => {
    // If continuation line is purely amounts, it should not merge as description
    const text = `15/05/2026 CENTRAL DE C Rec.Inter TFR FR-16350501
22.794.699,00 26.801.760,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBeCloseTo(22794699);
    expect(txs[0]!.balance).toBeCloseTo(26801760.71);
  });

  it('skips header lines in between transactions', () => {
    const text = `4/05/2026 CENTRAL DE C COMPRA POS EXITO -100.000,00 15.000.000,00
FECHA OFICINA No DOCUM DESCRIPCION MONTO SALDO
5/05/2026 CENTRAL DE C COMPRA POS FRISBY -50.000,00 14.950.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(2);
  });

  it('skips footer lines', () => {
    const text = `4/05/2026 CENTRAL DE C COMPRA POS EXITO -100.000,00 15.000.000,00
Ponemos a tu disposición los canales de atención
www.davibank.com`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
  });

  it('parses transaction from SANTAFE MEDE office', () => {
    const text = `4/05/2026 SANTAFE MEDE COMPRA POS CREPES -80.000,00 10.000.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.office).toBe('SANTAFE MEDE');
    expect(txs[0]!.description).toContain('COMPRA POS CREPES');
  });

  it('parses transaction from TR office', () => {
    const text = `4/05/2026 TR CDT DIGITAL NO COBRO 4X10 -500.000,00 9.500.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.office).toBe('TR');
  });

  it('handles D/MM/YYYY format (single digit day)', () => {
    const text = `1/01/2026 CENTRAL DE C ABONO INTERESES 10.080,93 17.000.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.date.getDate()).toBe(1);
    expect(txs[0]!.date.getMonth()).toBe(0); // January
    expect(txs[0]!.date.getFullYear()).toBe(2026);
  });

  it('handles DD/MM/YYYY format (double digit day)', () => {
    const text = `25/12/2025 CENTRAL DE C COMPRA POS AMAZON -150.000,00 5.000.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.date.getDate()).toBe(25);
    expect(txs[0]!.date.getMonth()).toBe(11); // December
    expect(txs[0]!.date.getFullYear()).toBe(2025);
  });

  it('balance validation: sequential balances make sense', () => {
    const text = `4/05/2026 CENTRAL DE C COMPRA 1 -100.000,00 10.000.000,00
4/05/2026 CENTRAL DE C COMPRA 2 -50.000,00 9.950.000,00
5/05/2026 CENTRAL DE C DEPOSITO 500.000,00 10.450.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(3);

    // Verify balance chain: each balance = previous balance + amount
    expect(txs[1]!.balance).toBeCloseTo(txs[0]!.balance + txs[1]!.amount);
    expect(txs[2]!.balance).toBeCloseTo(txs[1]!.balance + txs[2]!.amount);
  });

  it('handles very large deposit amounts', () => {
    const text = `15/05/2026 CENTRAL DE C ABONO NOMINA 22.794.699,00 39.728.090,71`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBeCloseTo(22794699);
    expect(txs[0]!.balance).toBeCloseTo(39728090.71);
  });

  it('handles very small amounts', () => {
    const text = `15/05/2026 CENTRAL DE C ABONO INTERESES 898,00 10.000.898,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBeCloseTo(898);
  });

  it('handles description with special characters', () => {
    const text = `4/05/2026 CENTRAL DE C Pago Int-504119030946 -PRESTAMOS -1.200.000,00 8.800.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.description).toContain('Pago Int');
  });

  it('returns empty array for only whitespace', () => {
    const txs = parseTransactionsFromText('   \n  \n  ');
    expect(txs).toHaveLength(0);
  });

  it('correctly handles line that looks like a date but is not a transaction', () => {
    // A date-like string without amounts should not produce a transaction
    const text = `4/05/2026 Random text without any amounts at all`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(0);
  });

  it('handles continuation line with description text and trailing amounts', () => {
    // This covers the contText branch: continuation line has text + amounts at the end
    const text = `4/05/2026 CENTRAL DE C Pago por PSE SomeLongDescription -1.000.000,00 15.000.000,00
Continuation text here -500.000,00 14.500.000,00`;
    const txs = parseTransactionsFromText(text);
    // The continuation line has amounts AND doesn't start with '-', so it breaks
    expect(txs.length).toBeGreaterThanOrEqual(1);
  });

  it('continuation line that is only an amount pair (no description text)', () => {
    // Tests the contText matching as pure amount (^(-?[\d.]+,\d{2})$)
    const text = `4/05/2026 CENTRAL DE C COMPRA POS SOMETHING
-500.000,00 14.500.000,00`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBeCloseTo(-500000);
  });

  it('continuation line with only description (no amounts) merges into previous', () => {
    // Continuation line has text but no trailing amounts - kept in description
    const text = `4/05/2026 CENTRAL DE C Pago Int-504119030946 -1.200.000,00 8.800.000,00
-PRESTAMOS VIVIENDA`;
    const txs = parseTransactionsFromText(text);
    expect(txs).toHaveLength(1);
    // The "-PRESTAMOS VIVIENDA" line starts with '-' so the amount check lets it pass
    // It gets merged as continuation
    expect(txs[0]!.description).toContain('PRESTAMOS');
  });
});
