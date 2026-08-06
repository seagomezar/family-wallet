import { describe, it, expect, beforeEach } from 'vitest';
import {
  categorizeWithBuiltins,
  categorize,
  categorizeBatch,
  createUserRule,
  getAllRules,
  deleteUserRule,
  isInternalTransfer,
  isBankFee,
  suggestPattern,
  BUILTIN_RULES,
} from '@/lib/categorization';
import { db } from '@/db/schema';

describe('Categorization Engine - Extended', () => {
  beforeEach(async () => {
    await db.categorizationRules.clear();
    await db.categories.clear();
  });

  describe('isInternalTransfer - extended', () => {
    it('is case-insensitive', () => {
      expect(isInternalTransfer('TRASLADOS ENTRE CUENTAS')).toBe(true);
      expect(isInternalTransfer('traslados entre cuentas')).toBe(true);
    });

    it('detects Trans. ACH TFR', () => {
      expect(isInternalTransfer('Trans. ACH TFR TO-2595955')).toBe(true);
    });

    it('rejects typical expense descriptions', () => {
      expect(isInternalTransfer('Pago por PSE EPM FACTURA WEB PSE')).toBe(false);
      expect(isInternalTransfer('COMPRA POS TEXACO N 11')).toBe(false);
      expect(isInternalTransfer('CDT DIGITAL NO COBRO')).toBe(false);
    });
  });

  describe('isBankFee - extended', () => {
    it('is case-insensitive', () => {
      expect(isBankFee('pago de intereses')).toBe(true);
      expect(isBankFee('PAGO DE INTERESES')).toBe(true);
    });

    it('detects COMIS_COMP', () => {
      expect(isBankFee('COMIS_COMP - cuota de manejo')).toBe(true);
    });

    it('rejects non-fee descriptions', () => {
      expect(isBankFee('COMPRA POS PRICESMART AME')).toBe(false);
      expect(isBankFee('CDT DIGITAL')).toBe(false);
    });
  });

  describe('categorizeWithBuiltins - comprehensive', () => {
    it('returns isTransfer=false and isBankFee=false for regular match', () => {
      const result = categorizeWithBuiltins('COMPRA POS EXITO');
      expect(result.isTransfer).toBe(false);
      expect(result.isBankFee).toBe(false);
    });

    it('matchedRule is not null for matched transactions', () => {
      const result = categorizeWithBuiltins('COMPRA POS EXITO');
      expect(result.matchedRule).not.toBeNull();
      expect(result.matchedRule!.id).toBe('builtin-mercado');
    });

    it('matchedRule is null for unmatched transactions', () => {
      const result = categorizeWithBuiltins('RANDOM UNKNOWN TRANSACTION');
      expect(result.matchedRule).toBeNull();
    });

    // Test every high-confidence rule
    it('TEXACO → tanqueadas', () => {
      const r = categorizeWithBuiltins('COMPRA POS TEXACO LA 33');
      expect(r.categoryId).toBe('cat-tanqueadas');
      expect(r.confidence).toBe('high');
    });

    it('TERPEL → tanqueadas', () => {
      const r = categorizeWithBuiltins('COMPRA POS TERPEL LA FLORA');
      expect(r.categoryId).toBe('cat-tanqueadas');
      expect(r.confidence).toBe('high');
    });

    it('PRIMAX → tanqueadas', () => {
      const r = categorizeWithBuiltins('COMPRA POS PRIMAX DORADO');
      expect(r.categoryId).toBe('cat-tanqueadas');
      expect(r.confidence).toBe('high');
    });

    it('GASOLINA → tanqueadas', () => {
      const r = categorizeWithBuiltins('PAGO GASOLINA EDS');
      expect(r.categoryId).toBe('cat-tanqueadas');
      expect(r.confidence).toBe('high');
    });

    it('CARULLA → para-gastar', () => {
      const r = categorizeWithBuiltins('COMPRA POS CARULLA LAUR');
      expect(r.categoryId).toBe('cat-para-gastar');
      expect(r.confidence).toBe('high');
    });

    it('JUMBO → para-gastar', () => {
      const r = categorizeWithBuiltins('COMPRA POS JUMBO ENVIGADO');
      expect(r.categoryId).toBe('cat-para-gastar');
      expect(r.confidence).toBe('high');
    });

    it('OLIMPICA → para-gastar', () => {
      const r = categorizeWithBuiltins('COMPRA POS OLIMPICA SAO');
      expect(r.categoryId).toBe('cat-para-gastar');
      expect(r.confidence).toBe('high');
    });

    it('D1 → para-gastar', () => {
      const r = categorizeWithBuiltins('COMPRA POS D1 LAURELES');
      expect(r.categoryId).toBe('cat-para-gastar');
      expect(r.confidence).toBe('high');
    });

    it('CEDIMED → para-gastar (salud)', () => {
      const r = categorizeWithBuiltins('COMPRA POS CEDIMED MEDELLIN');
      expect(r.categoryId).toBe('cat-para-gastar');
      expect(r.confidence).toBe('medium');
    });

    it('CLINICA → para-gastar (salud)', () => {
      const r = categorizeWithBuiltins('COMPRA POS CLINICA DEL NORTE');
      expect(r.categoryId).toBe('cat-para-gastar');
      expect(r.confidence).toBe('medium');
    });

    it('CLARO → celulares', () => {
      const r = categorizeWithBuiltins('Pago por PSE CLARO MOVIL');
      expect(r.categoryId).toBe('cat-celulares');
      expect(r.confidence).toBe('medium');
    });

    it('TIGO → celulares', () => {
      const r = categorizeWithBuiltins('DEBITO ACH TIGO COLOMBIA');
      expect(r.categoryId).toBe('cat-celulares');
      expect(r.confidence).toBe('medium');
    });

    it('CONJ → administraciones', () => {
      const r = categorizeWithBuiltins('Pago por PSE CONJ RES LAURELES');
      expect(r.categoryId).toBe('cat-administraciones');
      expect(r.confidence).toBe('medium');
    });

    it('PagodelaFactura → administraciones', () => {
      const r = categorizeWithBuiltins('PagodelaFactura 12345');
      expect(r.categoryId).toBe('cat-administraciones');
      expect(r.confidence).toBe('medium');
    });

    it('DOLLARCITY → para-gastar', () => {
      const r = categorizeWithBuiltins('COMPRA POS DOLLARCITY SAN FER');
      expect(r.categoryId).toBe('cat-para-gastar');
      expect(r.confidence).toBe('medium');
    });

    it('Impuestopredial → servicios', () => {
      const r = categorizeWithBuiltins('Pago por PSE Impuestopredial2026');
      expect(r.categoryId).toBe('cat-servicios');
      expect(r.confidence).toBe('high');
    });

    it('Pago de factura → servicios (low confidence)', () => {
      const r = categorizeWithBuiltins('Pago de factura genérica');
      expect(r.categoryId).toBe('cat-servicios');
      expect(r.confidence).toBe('low');
    });

    it('PAGO BANCO DE OCCIDENTE → debitos', () => {
      const r = categorizeWithBuiltins('Pago por PSE PAGO BANCO DE OCCIDENTE');
      expect(r.categoryId).toBe('cat-debitos');
      expect(r.confidence).toBe('high');
    });
  });

  describe('categorize (async with user rules)', () => {
    it('uses builtin rules when no user rules exist', async () => {
      const result = await categorize('COMPRA POS EXITO WOW');
      expect(result.categoryId).toBe('cat-para-gastar');
      expect(result.confidence).toBe('high');
    });

    it('user rules take priority over builtins', async () => {
      // Create a user rule for EXITO that maps to a different category
      await createUserRule('EXITO', 'cat-tanqueadas');

      const result = await categorize('COMPRA POS EXITO WOW');
      expect(result.categoryId).toBe('cat-tanqueadas');
      expect(result.confidence).toBe('high');
    });

    it('increments matchCount on user rule match', async () => {
      const rule = await createUserRule('NETFLIX', 'cat-debitos');

      await categorize('PAGO PSE NETFLIX.COM');

      const updated = await db.categorizationRules.get(rule.id);
      expect(updated!.matchCount).toBe(1);
    });

    it('falls through to builtins if user rule does not match', async () => {
      await createUserRule('NETFLIX', 'cat-debitos');

      const result = await categorize('COMPRA POS TEXACO');
      expect(result.categoryId).toBe('cat-tanqueadas');
    });

    it('supports regex user rules', async () => {
      await createUserRule('UBER\\s+TRIP', 'cat-tanqueadas', true);

      const result = await categorize('UBER TRIP 12345');
      expect(result.categoryId).toBe('cat-tanqueadas');
      expect(result.confidence).toBe('high');
    });

    it('regex rule fallback to substring on invalid regex', async () => {
      // Invalid regex falls back to substring match
      await createUserRule('[invalid', 'cat-debitos', true);

      // The pattern "[invalid" used as substring won't match "SOMETHING"
      const result = await categorize('SOMETHING ELSE');
      expect(result.confidence).toBe('none');
    });
  });

  describe('categorizeBatch', () => {
    it('categorizes multiple descriptions at once', async () => {
      const results = await categorizeBatch([
        'COMPRA POS EXITO WOW',
        'COMPRA POS TEXACO LA 33',
        'Pago por PSE EPM FACTURA WEB',
        'RANDOM UNKNOWN',
      ]);

      expect(results).toHaveLength(4);
      expect(results[0]!.categoryId).toBe('cat-para-gastar');
      expect(results[1]!.categoryId).toBe('cat-tanqueadas');
      expect(results[2]!.categoryId).toBe('cat-servicios');
      expect(results[3]!.confidence).toBe('none');
    });

    it('user rules apply in batch mode', async () => {
      await createUserRule('CUSTOM STORE', 'cat-universidad');

      const results = await categorizeBatch([
        'COMPRA POS CUSTOM STORE',
        'COMPRA POS EXITO',
      ]);

      expect(results[0]!.categoryId).toBe('cat-universidad');
      expect(results[1]!.categoryId).toBe('cat-para-gastar');
    });

    it('handles empty array', async () => {
      const results = await categorizeBatch([]);
      expect(results).toHaveLength(0);
    });

    it('batch regex user rules work', async () => {
      await createUserRule('\\d{6}.*UBER', 'cat-tanqueadas', true);

      const results = await categorizeBatch([
        '123456 UBER TRIP',
        'COMPRA POS EXITO',
      ]);
      expect(results[0]!.categoryId).toBe('cat-tanqueadas');
      expect(results[1]!.categoryId).toBe('cat-para-gastar');
    });
  });

  describe('createUserRule', () => {
    it('creates a rule with correct fields', async () => {
      const rule = await createUserRule('TEST PATTERN', 'cat-creditos');

      expect(rule.pattern).toBe('TEST PATTERN');
      expect(rule.categoryId).toBe('cat-creditos');
      expect(rule.source).toBe('user');
      expect(rule.isRegex).toBe(false);
      expect(rule.matchCount).toBe(0);
      expect(rule.createdAt).toBeInstanceOf(Date);
      expect(rule.id).toMatch(/^rule-/);
    });

    it('creates regex rule', async () => {
      const rule = await createUserRule('UBER\\s+\\d+', 'cat-tanqueadas', true);
      expect(rule.isRegex).toBe(true);
    });

    it('persists to database', async () => {
      const rule = await createUserRule('PERSIST TEST', 'cat-debitos');
      const fromDb = await db.categorizationRules.get(rule.id);
      expect(fromDb).toBeDefined();
      expect(fromDb!.pattern).toBe('PERSIST TEST');
    });

    it('generates unique IDs', async () => {
      const rule1 = await createUserRule('A', 'cat-creditos');
      const rule2 = await createUserRule('B', 'cat-creditos');
      expect(rule1.id).not.toBe(rule2.id);
    });
  });

  describe('getAllRules', () => {
    it('returns empty when no rules exist', async () => {
      const rules = await getAllRules();
      expect(rules).toHaveLength(0);
    });

    it('returns user rules after creation', async () => {
      await createUserRule('RULE1', 'cat-creditos');
      await createUserRule('RULE2', 'cat-debitos');

      const rules = await getAllRules();
      expect(rules).toHaveLength(2);
    });
  });

  describe('deleteUserRule', () => {
    it('removes rule from database', async () => {
      const rule = await createUserRule('TO DELETE', 'cat-creditos');
      await deleteUserRule(rule.id);

      const fromDb = await db.categorizationRules.get(rule.id);
      expect(fromDb).toBeUndefined();
    });

    it('does not affect other rules', async () => {
      const rule1 = await createUserRule('KEEP', 'cat-creditos');
      const rule2 = await createUserRule('DELETE', 'cat-debitos');

      await deleteUserRule(rule2.id);

      const remaining = await getAllRules();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe(rule1.id);
    });
  });

  describe('suggestPattern - extended', () => {
    it('removes trailing numeric codes', () => {
      const pattern = suggestPattern('COMPRA POS TEXACO N 11 18 215941');
      expect(pattern).not.toMatch(/\d{6}$/);
    });

    it('removes ATM prefix', () => {
      const pattern = suggestPattern('RETIRO ATM BCOL PLZAMERIC 526 105710');
      expect(pattern).not.toContain('RETIRO ATM');
    });

    it('handles description shorter than 30 chars', () => {
      const pattern = suggestPattern('COMPRA POS FRISBY NO G-69');
      expect(pattern.length).toBeLessThanOrEqual(30);
      expect(pattern).toContain('FRISBY');
    });

    it('returns trimmed non-empty result', () => {
      const pattern = suggestPattern('COMPRA POS SOMETHING');
      expect(pattern.trim()).toBe(pattern);
      expect(pattern.length).toBeGreaterThan(0);
    });
  });

  describe('BUILTIN_RULES structure', () => {
    it('all rules have required fields', () => {
      for (const rule of BUILTIN_RULES) {
        expect(rule.id).toBeTruthy();
        expect(rule.patterns.length).toBeGreaterThan(0);
        expect(rule.categoryId).toBeTruthy();
        expect(rule.source).toBe('builtin');
        expect(['high', 'medium', 'low']).toContain(rule.confidence);
      }
    });

    it('all rule IDs are unique', () => {
      const ids = BUILTIN_RULES.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all patterns are non-empty strings', () => {
      for (const rule of BUILTIN_RULES) {
        for (const pattern of rule.patterns) {
          expect(pattern.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
