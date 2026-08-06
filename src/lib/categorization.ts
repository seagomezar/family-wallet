/**
 * Auto-categorization engine for bank transactions.
 *
 * Uses pattern matching (substring + regex) with a confidence score system.
 * User rules take priority over built-in rules.
 */

import { db, type CategorizationRule } from "@/db/schema";

// ─── Types ───────────────────────────────────────────────────────────

export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface CategorizationResult {
  categoryId: string | null;
  confidence: MatchConfidence;
  matchedRule: CategorizationRule | BuiltinRule | null;
  isTransfer: boolean; // internal bank transfer
  isBankFee: boolean; // bank interest/fees (informational)
}

export interface BuiltinRule {
  id: string;
  patterns: string[];
  categoryId: string;
  source: "builtin";
  confidence: MatchConfidence;
  label?: string; // human-readable label for UI
}

// ─── Built-in Rules ──────────────────────────────────────────────────

/**
 * Built-in categorization rules derived from analyzing 3 months of
 * Davibank statements (May, June, July 2026).
 */
export const BUILTIN_RULES: BuiltinRule[] = [
  // ── Credits / Mortgage ─────────────────────────────
  {
    id: "builtin-vivienda",
    patterns: ["PAGO VIVIENDA", "Pago VIVIENDA", "PRESTAMOS", "Pago Int-5041"],
    categoryId: "cat-creditos",
    source: "builtin",
    confidence: "high",
    label: "Crédito vivienda/préstamos",
  },

  // ── Débitos automáticos ────────────────────────────
  {
    id: "builtin-debito-ach",
    patterns: ["DEBITO - RECAUDO ACH"],
    categoryId: "cat-debitos",
    source: "builtin",
    confidence: "high",
    label: "Débito automático ACH",
  },
  {
    id: "builtin-pago-tc",
    patterns: ["PAGO TC Credencial", "PAGO BANCO DE OCCIDENTE"],
    categoryId: "cat-debitos",
    source: "builtin",
    confidence: "high",
    label: "Pago tarjeta de crédito",
  },

  // ── Servicios ──────────────────────────────────────
  {
    id: "builtin-epm",
    patterns: ["EPM FACTURA", "EPM factura"],
    categoryId: "cat-servicios",
    source: "builtin",
    confidence: "high",
    label: "EPM factura",
  },
  {
    id: "builtin-movistar",
    patterns: ["facturas Movist", "Pago multiples facturas"],
    categoryId: "cat-servicios",
    source: "builtin",
    confidence: "high",
    label: "Servicios Movistar",
  },

  // ── Internet Sopetrán ──────────────────────────────
  {
    id: "builtin-internet-sopetran",
    patterns: ["SOMOS INTERNET"],
    categoryId: "cat-internet-sopetran",
    source: "builtin",
    confidence: "high",
    label: "Internet Sopetrán",
  },

  // ── Tanqueadas ─────────────────────────────────────
  {
    id: "builtin-tanqueadas",
    patterns: ["TEXACO", "TERPEL", "MOBIL EDS", "EDS ", "PRIMAX", "GASOLINA"],
    categoryId: "cat-tanqueadas",
    source: "builtin",
    confidence: "high",
    label: "Estaciones de gasolina",
  },

  // ── Mercado / Supermercado ─────────────────────────
  {
    id: "builtin-mercado",
    patterns: [
      "EXITO",
      "ÉXITO",
      "SUPERMERCADO",
      "PRICESMART",
      "CARULLA",
      "JUMBO",
      "D1 ",
      "EURO",
      "OLIMPICA",
    ],
    categoryId: "cat-para-gastar",
    source: "builtin",
    confidence: "high",
    label: "Supermercados/mercado",
  },

  // ── Ocio / Restaurantes ────────────────────────────
  {
    id: "builtin-restaurantes",
    patterns: [
      "CINEMAS",
      "PROCINAL",
      "CREPESYWAF",
      "CREPES Y WAFFL",
      "FRISBY",
      "ALDEA NIKKEI",
      "TOSTAO",
      "HOME FOOD",
      "BIGOS",
      "TIENDA DE CAFE",
    ],
    categoryId: "cat-para-gastar",
    source: "builtin",
    confidence: "medium",
    label: "Restaurantes/ocio",
  },

  // ── CDT ────────────────────────────────────────────
  {
    id: "builtin-cdt",
    patterns: ["CDT DIGITAL"],
    categoryId: "cat-cdt",
    source: "builtin",
    confidence: "high",
    label: "CDT Digital",
  },

  // ── Gym ────────────────────────────────────────────
  {
    id: "builtin-gym",
    patterns: ["ACTION BLACK"],
    categoryId: "cat-para-gastar",
    source: "builtin",
    confidence: "high",
    label: "Gimnasio Action Black",
  },

  // ── Administraciones ───────────────────────────────
  {
    id: "builtin-admin",
    patterns: ["CONJ", "ADMINISTRACION", "ADMON", "PagodelaFactura"],
    categoryId: "cat-administraciones",
    source: "builtin",
    confidence: "medium",
    label: "Administración",
  },

  // ── Celulares ──────────────────────────────────────
  {
    id: "builtin-celulares",
    patterns: ["CLARO", "TIGO"],
    categoryId: "cat-celulares",
    source: "builtin",
    confidence: "medium",
    label: "Plan celular",
  },

  // ── Universidad ────────────────────────────────────
  {
    id: "builtin-universidad",
    patterns: ["UNIVERSIDAD EA", "EAFIT"],
    categoryId: "cat-universidad",
    source: "builtin",
    confidence: "high",
    label: "Universidad EAFIT",
  },

  // ── Apple (suscripción, débito) ────────────────────
  {
    id: "builtin-apple",
    patterns: ["APPLE.COM/BILL", "APPLE._"],
    categoryId: "cat-debitos",
    source: "builtin",
    confidence: "high",
    label: "Apple subscriptions",
  },

  // ── DollarCity / libreria (para gastar) ────────────
  {
    id: "builtin-dollarcity",
    patterns: ["DOLLARCITY", "LIBRERIA NACIO"],
    categoryId: "cat-para-gastar",
    source: "builtin",
    confidence: "medium",
    label: "Compras varias",
  },

  // ── NU deposit / PSE factura (débitos) ─────────────
  {
    id: "builtin-nu",
    patterns: ["DepOsito a tu cuenta NU"],
    categoryId: "cat-debitos",
    source: "builtin",
    confidence: "medium",
    label: "Depósito NU",
  },

  // ── Pago factura genérico (servicios) ──────────────
  {
    id: "builtin-factura",
    patterns: ["Pago de factura"],
    categoryId: "cat-servicios",
    source: "builtin",
    confidence: "low",
    label: "Pago de factura (genérico)",
  },

  // ── Salud ──────────────────────────────────────────
  {
    id: "builtin-salud",
    patterns: ["CEDIMED", "CLINICA", "SUPLIMED", "CElulasMadre"],
    categoryId: "cat-para-gastar",
    source: "builtin",
    confidence: "medium",
    label: "Salud/médico",
  },

  // ── Impuestos (predial) ────────────────────────────
  {
    id: "builtin-predial",
    patterns: ["Impuestopredial", "predial"],
    categoryId: "cat-servicios",
    source: "builtin",
    confidence: "high",
    label: "Impuesto predial",
  },

  // ── Sol Creciente (créditos) ───────────────────────
  {
    id: "builtin-sol-creciente",
    patterns: ["SolCreciente", "PagoSolCreciente"],
    categoryId: "cat-creditos",
    source: "builtin",
    confidence: "high",
    label: "Sol Creciente (préstamo)",
  },
];

// ─── Transfer Detection ──────────────────────────────────────────────

const TRANSFER_PATTERNS = [
  "Traslados entre cuentas",
  "Traslados Producto-Cta",
  "Rec.Inter TFR",
  "Trans. ACH TFR",
  "TARJETAS DE CREDITO",
];

const BANK_FEE_PATTERNS = [
  "PAGO DE INTERESES",
  "RETENCION EN LA FUENTE",
  "IMP/TRANS FINANC",
  "COMIS_COMP",
];

// ─── Engine ──────────────────────────────────────────────────────────

export function isInternalTransfer(description: string): boolean {
  const upper = description.toUpperCase();
  return TRANSFER_PATTERNS.some((p) => upper.includes(p.toUpperCase()));
}

export function isBankFee(description: string): boolean {
  const upper = description.toUpperCase();
  return BANK_FEE_PATTERNS.some((p) => upper.includes(p.toUpperCase()));
}

/**
 * Categorize a transaction description using built-in rules.
 * Returns the best match with confidence.
 */
export function categorizeWithBuiltins(
  description: string,
): CategorizationResult {
  if (isInternalTransfer(description)) {
    return {
      categoryId: null,
      confidence: "high",
      matchedRule: null,
      isTransfer: true,
      isBankFee: false,
    };
  }

  if (isBankFee(description)) {
    return {
      categoryId: null,
      confidence: "high",
      matchedRule: null,
      isTransfer: false,
      isBankFee: true,
    };
  }

  const upper = description.toUpperCase();

  for (const rule of BUILTIN_RULES) {
    for (const pattern of rule.patterns) {
      if (upper.includes(pattern.toUpperCase())) {
        return {
          categoryId: rule.categoryId,
          confidence: rule.confidence,
          matchedRule: rule,
          isTransfer: false,
          isBankFee: false,
        };
      }
    }
  }

  return {
    categoryId: null,
    confidence: "none",
    matchedRule: null,
    isTransfer: false,
    isBankFee: false,
  };
}

/**
 * Categorize using user rules first, then fall back to built-in rules.
 * User rules always take priority.
 */
export async function categorize(
  description: string,
): Promise<CategorizationResult> {
  // Check user rules first (they have priority)
  const userRules = await db.categorizationRules
    .where("source")
    .equals("user")
    .toArray();

  const upper = description.toUpperCase();

  for (const rule of userRules) {
    const pattern = rule.pattern.toUpperCase();
    const matches = rule.isRegex
      ? (() => {
          try {
            return new RegExp(rule.pattern, "i").test(description);
          } catch {
            return upper.includes(pattern);
          }
        })()
      : upper.includes(pattern);

    if (matches) {
      // Increment match count
      if (rule.id) {
        await db.categorizationRules.update(rule.id, {
          matchCount: rule.matchCount + 1,
        });
      }
      return {
        categoryId: rule.categoryId,
        confidence: "high",
        matchedRule: rule,
        isTransfer: false,
        isBankFee: false,
      };
    }
  }

  // Fall back to built-in rules
  return categorizeWithBuiltins(description);
}

/**
 * Batch categorize multiple descriptions.
 * Loads user rules once for efficiency.
 */
export async function categorizeBatch(
  descriptions: string[],
): Promise<CategorizationResult[]> {
  const userRules = await db.categorizationRules
    .where("source")
    .equals("user")
    .toArray();

  return descriptions.map((desc) => {
    const upper = desc.toUpperCase();

    // User rules first
    for (const rule of userRules) {
      const pattern = rule.pattern.toUpperCase();
      const matches = rule.isRegex
        ? (() => {
            try {
              return new RegExp(rule.pattern, "i").test(desc);
            } catch {
              return upper.includes(pattern);
            }
          })()
        : upper.includes(pattern);

      if (matches) {
        return {
          categoryId: rule.categoryId,
          confidence: "high" as MatchConfidence,
          matchedRule: rule,
          isTransfer: false,
          isBankFee: false,
        };
      }
    }

    // Built-in rules
    return categorizeWithBuiltins(desc);
  });
}

/**
 * Create a new user categorization rule.
 */
export async function createUserRule(
  pattern: string,
  categoryId: string,
  isRegex = false,
): Promise<CategorizationRule> {
  const rule: CategorizationRule = {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pattern,
    categoryId,
    source: "user",
    isRegex,
    matchCount: 0,
    createdAt: new Date(),
  };

  await db.categorizationRules.add(rule);
  return rule;
}

/**
 * Get all rules (user + display info for builtins).
 */
export async function getAllRules(): Promise<CategorizationRule[]> {
  return db.categorizationRules.toArray();
}

/**
 * Delete a user rule.
 */
export async function deleteUserRule(ruleId: string): Promise<void> {
  await db.categorizationRules.delete(ruleId);
}

/**
 * Suggest a pattern from a transaction description.
 * Extracts the most meaningful keywords.
 */
export function suggestPattern(description: string): string {
  // Remove common noise words and codes
  let pattern = description
    .replace(/\d{6}\s+\d{6}/g, "") // terminal codes
    .replace(/\b\d{6,}\b/g, "") // long numbers
    .replace(/COMPRA POS\s+/i, "") // remove "COMPRA POS" prefix
    .replace(/Pago por PSE\s*/i, "") // remove PSE prefix
    .replace(/RETIRO ATM\s+\w+\s+/i, "") // remove ATM prefix
    .replace(/\s+/g, " ")
    .trim();

  // Take first meaningful part (up to 30 chars)
  if (pattern.length > 30) {
    pattern = pattern.slice(0, 30).trim();
  }

  return pattern;
}
