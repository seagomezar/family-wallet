import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';

describe('CSV Import (Papa Parse)', () => {
  const sampleBancolombiaTSV = `FECHA\tDOCUMENTO\tOFICINA\tDESCRIPCIÓN\tREFERENCIA\tVALOR
2026/06/15\t12345\t001\tCOMPRA PTO.VTA EXITO LAURELES\tREF001\t-327900
2026/06/14\t12346\t001\tPAGO PSE NETFLIX.COM\tREF002\t-40000
2026/06/13\t12347\t001\tABONO INTERESES\tREF003\t15200
2026/06/12\t12348\t002\tCOMPRA INTL SPOTIFY\tREF004\t-28000`;

  it('parses Bancolombia TSV format', () => {
    const result = Papa.parse<Record<string, string>>(sampleBancolombiaTSV, {
      header: true,
      skipEmptyLines: true,
      delimiter: '\t',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.data).toHaveLength(4);
    expect(result.data[0]!['DESCRIPCIÓN']).toBe('COMPRA PTO.VTA EXITO LAURELES');
    expect(result.data[0]!['VALOR']).toBe('-327900');
  });

  it('auto-detects tab delimiter', () => {
    const result = Papa.parse<Record<string, string>>(sampleBancolombiaTSV, {
      header: true,
      skipEmptyLines: true,
    });

    expect(result.data).toHaveLength(4);
  });

  it('handles amount parsing correctly', () => {
    const result = Papa.parse<Record<string, string>>(sampleBancolombiaTSV, {
      header: true,
      skipEmptyLines: true,
    });

    const amounts = result.data.map((row) => parseFloat(row['VALOR'] ?? '0'));
    expect(amounts[0]).toBe(-327900);
    expect(amounts[1]).toBe(-40000);
    expect(amounts[2]).toBe(15200);
    expect(amounts[3]).toBe(-28000);

    // Total should be net negative
    const total = amounts.reduce((s, a) => s + a, 0);
    expect(total).toBe(-380700);
  });

  it('handles CSV with commas', () => {
    const csvData = `FECHA,DOCUMENTO,OFICINA,DESCRIPCIÓN,REFERENCIA,VALOR
2026/06/15,12345,001,COMPRA PTO.VTA EXITO,REF001,-327900
2026/06/14,12346,001,PAGO PSE NETFLIX,REF002,-40000`;

    const result = Papa.parse<Record<string, string>>(csvData, {
      header: true,
      skipEmptyLines: true,
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]!['DESCRIPCIÓN']).toBe('COMPRA PTO.VTA EXITO');
  });

  describe('category suggestion', () => {
    function suggestCategory(description: string): string | undefined {
      const desc = description.toUpperCase();
      const rules: [string[], string][] = [
        [['NETFLIX', 'SPOTIFY', 'SMARTFIT', 'CHATGPT'], 'cat-mercado'],
        [['UBER', 'TANQUE', 'GASOLINA', 'EDS ', 'PRIMAX', 'TERPEL'], 'cat-transporte'],
        [['EXITO', 'JUMBO', 'CARULLA', 'D1 ', 'EURO', 'OLIMPICA', 'MERCADO'], 'cat-mercado'],
        [['PEAJE'], 'cat-transporte'],
        [['ADMINISTRACION', 'ADMON'], 'cat-vivienda'],
        [['EPM', 'ENERGIA', 'ACUEDUCTO', 'GAS NATURAL', 'UNE'], 'cat-vivienda'],
        [['CLARO', 'TIGO', 'MOVISTAR'], 'cat-vivienda'],
      ];

      for (const [keywords, catId] of rules) {
        if (keywords.some((kw) => desc.includes(kw))) {
          return catId;
        }
      }
      return undefined;
    }

    it('suggests mercado for Netflix', () => {
      expect(suggestCategory('PAGO PSE NETFLIX.COM')).toBe('cat-mercado');
    });

    it('suggests mercado for Exito', () => {
      expect(suggestCategory('COMPRA PTO.VTA EXITO LAURELES')).toBe('cat-mercado');
    });

    it('suggests transporte for gas', () => {
      expect(suggestCategory('COMPRA PTO.VTA TERPEL')).toBe('cat-transporte');
    });

    it('returns undefined for unknown', () => {
      expect(suggestCategory('TRANSFERENCIA ENTRE CUENTAS')).toBeUndefined();
    });
  });
});
