import { describe, it, expect } from 'vitest';
import {
  categorizeWithBuiltins,
  isInternalTransfer,
  isBankFee,
  suggestPattern,
} from '@/lib/categorization';

describe('Categorization Engine', () => {
  describe('isInternalTransfer', () => {
    it('detects "Traslados entre cuentas"', () => {
      expect(isInternalTransfer('Rec.Inter TFR TO-69220066 -Traslados entre cuentas')).toBe(true);
    });

    it('detects "Rec.Inter TFR"', () => {
      expect(isInternalTransfer('Rec.Inter TFR FR-16350501')).toBe(true);
    });

    it('detects "Trans. ACH TFR"', () => {
      expect(isInternalTransfer('Trans. ACH TFR TO-2595955 -Traslados Producto-Cta/Cnt')).toBe(true);
    });

    it('detects "TARJETAS DE CREDITO"', () => {
      expect(isInternalTransfer('-TARJETAS DE CREDITO')).toBe(true);
    });

    it('returns false for regular transactions', () => {
      expect(isInternalTransfer('COMPRA POS EXITO WOW LAUR')).toBe(false);
    });
  });

  describe('isBankFee', () => {
    it('detects "PAGO DE INTERESES"', () => {
      expect(isBankFee('PAGO DE INTERESES')).toBe(true);
    });

    it('detects "RETENCION EN LA FUENTE"', () => {
      expect(isBankFee('RETENCION EN LA FUENTE')).toBe(true);
    });

    it('detects "IMP/TRANS FINANC"', () => {
      expect(isBankFee('IMP/TRANS FINANC/ACUM MES')).toBe(true);
    });

    it('returns false for regular transactions', () => {
      expect(isBankFee('COMPRA POS FRISBY')).toBe(false);
    });
  });

  describe('categorizeWithBuiltins', () => {
    it('categorizes supermarket purchases to mercado', () => {
      const result = categorizeWithBuiltins('COMPRA POS EXITO WOW LAUR 080526 202423');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
      expect(result.isTransfer).toBe(false);
    });

    it('categorizes gas stations to transporte', () => {
      const result = categorizeWithBuiltins('COMPRA POS TEXACO N 11 18 215941');
      expect(result.categoryId).toBe('cat-transporte');
      expect(result.confidence).toBe('high');
    });

    it('categorizes Mobil EDS to transporte', () => {
      const result = categorizeWithBuiltins('COMPRA POS MOBIL EDS LOS DRO 250526 124611');
      expect(result.categoryId).toBe('cat-transporte');
      expect(result.confidence).toBe('high');
    });

    it('categorizes EPM factura to vivienda', () => {
      const result = categorizeWithBuiltins('Pago por PSE EPM FACTURA WEB PSE');
      expect(result.categoryId).toBe('cat-vivienda');
      expect(result.confidence).toBe('high');
    });

    it('categorizes Movistar to vivienda', () => {
      const result = categorizeWithBuiltins('Pago por PSE Pago multiples facturas Movist');
      expect(result.categoryId).toBe('cat-vivienda');
      expect(result.confidence).toBe('high');
    });

    it('categorizes PAGO VIVIENDA to vivienda', () => {
      const result = categorizeWithBuiltins('Pago VIVIENDA Y OTROSCREDITOS');
      expect(result.categoryId).toBe('cat-vivienda');
      expect(result.confidence).toBe('high');
    });

    it('categorizes PRESTAMOS to vivienda', () => {
      const result = categorizeWithBuiltins('Pago Int-504119030946 -PRESTAMOS');
      expect(result.categoryId).toBe('cat-vivienda');
      expect(result.confidence).toBe('high');
    });

    it('categorizes DEBITO ACH to mercado', () => {
      const result = categorizeWithBuiltins('DEBITO - RECAUDO ACH A-0007-Id890903790');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
    });

    it('categorizes PAGO TC Credencial to mercado', () => {
      const result = categorizeWithBuiltins('Pago por PSE PAGO TC Credencial Visa');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
    });

    it('categorizes restaurants to mercado', () => {
      const result = categorizeWithBuiltins('COMPRA POS FRISBY NO G-69 26 190737');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('medium');
    });

    it('categorizes CINEMAS to mercado', () => {
      const result = categorizeWithBuiltins('COMPRA POS CINEMAS PROCIN ENT 180726 180150');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('medium');
    });

    it('categorizes CDT Digital to mercado', () => {
      const result = categorizeWithBuiltins('CDT DIGITAL NO COBRO 4X10 Internet');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
    });

    it('categorizes UNIVERSIDAD EAFIT to mercado', () => {
      const result = categorizeWithBuiltins('COMPRA POS UNIVERSIDAD EA 90526 151919');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
    });

    it('categorizes ACTION BLACK (gym) to mercado', () => {
      const result = categorizeWithBuiltins('COMPRA POS ACTION BLACK V 0526 080544');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
    });

    it('categorizes APPLE.COM/BILL to mercado', () => {
      const result = categorizeWithBuiltins('COMPRA POS APPLE.COM/BILL 26 065743');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
    });

    it('categorizes SOMOS INTERNET to vivienda', () => {
      const result = categorizeWithBuiltins('Pago a SOMOS INTERNET,ref: WC');
      expect(result.categoryId).toBe('cat-vivienda');
      expect(result.confidence).toBe('high');
    });

    it('marks transfers with isTransfer=true', () => {
      const result = categorizeWithBuiltins('Rec.Inter TFR TO-69220066 -Traslados entre cuentas');
      expect(result.isTransfer).toBe(true);
      expect(result.categoryId).toBeNull();
    });

    it('marks bank fees with isBankFee=true', () => {
      const result = categorizeWithBuiltins('IMP/TRANS FINANC/ACUM MES');
      expect(result.isBankFee).toBe(true);
      expect(result.categoryId).toBeNull();
    });

    it('returns none confidence for unknown transactions', () => {
      const result = categorizeWithBuiltins('BREB 1037609063 SEBASTIAN ALONSO GOMEZARIAS');
      expect(result.confidence).toBe('none');
      expect(result.categoryId).toBeNull();
    });

    it('categorizes PRICESMART to mercado', () => {
      const result = categorizeWithBuiltins('COMPRA POS PRICESMART AME 010526 160248');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('high');
    });

    it('categorizes Sol Creciente to vivienda', () => {
      const result = categorizeWithBuiltins('Pago por PSE PagoSolCrecienteFAC.60240Apart');
      expect(result.categoryId).toBe('cat-vivienda');
      expect(result.confidence).toBe('high');
    });

    it('categorizes NU deposit to mercado', () => {
      const result = categorizeWithBuiltins('Pago por PSE DepOsito a tu cuenta NU');
      expect(result.categoryId).toBe('cat-mercado');
      expect(result.confidence).toBe('medium');
    });
  });

  describe('suggestPattern', () => {
    it('extracts meaningful pattern from POS purchase', () => {
      const pattern = suggestPattern('COMPRA POS EXITO WOW LAUR 080526 202423');
      expect(pattern).not.toContain('COMPRA POS');
      expect(pattern).toContain('EXITO');
    });

    it('extracts pattern from PSE payment', () => {
      const pattern = suggestPattern('Pago por PSE EPM FACTURA WEB PSE');
      expect(pattern).not.toContain('Pago por PSE');
      expect(pattern).toContain('EPM');
    });

    it('limits pattern length', () => {
      const pattern = suggestPattern('COMPRA POS SUPERMERCADO CARULLA ENVIGADO LOCAL 123 456789 654321');
      expect(pattern.length).toBeLessThanOrEqual(30);
    });
  });
});
