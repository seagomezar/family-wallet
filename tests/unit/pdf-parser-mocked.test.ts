import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist before importing the parser
vi.mock('pdfjs-dist', () => ({
  version: '4.0.0',
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

import * as pdfjsLib from 'pdfjs-dist';
import { parseDavibankPDF } from '@/lib/pdf-parser';

describe('parseDavibankPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error for non-Davibank PDF', async () => {
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'RANDOM BANK STATEMENT', transform: [1, 0, 0, 1, 50, 700], width: 200 },
        ],
      }),
    };

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    };

    (pdfjsLib.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    });

    const file = new File(['fake-pdf'], 'test.pdf', { type: 'application/pdf' });
    const result = await parseDavibankPDF(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('invalid_format');
      expect(result.error.message).toContain('Davibank');
    }
  });

  it('returns error when no transactions found', async () => {
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'CUENTA DE AHORROS', transform: [1, 0, 0, 1, 50, 700], width: 200 },
          { str: 'DETALLE DE CUENTA', transform: [1, 0, 0, 1, 50, 680], width: 200 },
          { str: 'No transactions here', transform: [1, 0, 0, 1, 50, 660], width: 200 },
        ],
      }),
    };

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    };

    (pdfjsLib.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    });

    const file = new File(['fake-pdf'], 'extracto.pdf', { type: 'application/pdf' });
    const result = await parseDavibankPDF(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('parse_error');
      expect(result.error.message).toContain('transacciones');
    }
  });

  it('successfully parses a valid Davibank PDF', async () => {
    // Simulate text content that looks like a Davibank statement
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: 'CUENTA DE AHORROS', transform: [1, 0, 0, 1, 50, 800], width: 150 },
          { str: 'DETALLE DE CUENTA', transform: [1, 0, 0, 1, 50, 780], width: 150 },
          { str: 'PERIODO', transform: [1, 0, 0, 1, 50, 760], width: 60 },
          { str: '1 AL 31 MAY 2026', transform: [1, 0, 0, 1, 120, 760], width: 120 },
          { str: 'No 1234567890', transform: [1, 0, 0, 1, 50, 740], width: 100 },
          { str: 'RESUMEN CUENTA AHORROS', transform: [1, 0, 0, 1, 50, 700], width: 200 },
          { str: 'SALDO ANTERIOR', transform: [1, 0, 0, 1, 50, 680], width: 120 },
          { str: '16.934.391,71', transform: [1, 0, 0, 1, 50, 660], width: 100 },
          { str: '82.506.736,53', transform: [1, 0, 0, 1, 50, 640], width: 100 },
          { str: '94.660.522,92', transform: [1, 0, 0, 1, 50, 620], width: 100 },
          { str: '4.780.605,32', transform: [1, 0, 0, 1, 50, 600], width: 100 },
          { str: '4/05/2026 CENTRAL DE C COMPRA POS EXITO WOW -327.900,00 16.606.491,71', transform: [1, 0, 0, 1, 50, 500], width: 500 },
        ],
      }),
    };

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    };

    (pdfjsLib.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    });

    const file = new File(['fake-pdf'], 'extracto-may.pdf', { type: 'application/pdf' });
    const result = await parseDavibankPDF(file);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.statement.bank).toBe('davibank');
      expect(result.statement.period).toBe('2026-05');
      expect(result.statement.accountNumber).toBe('1234567890');
      expect(result.statement.transactions.length).toBeGreaterThanOrEqual(1);
      expect(result.statement.previousBalance).toBeCloseTo(16934391.71);
    }
  });

  it('handles PDF read error gracefully', async () => {
    (pdfjsLib.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure')),
    });

    const file = new File(['corrupted'], 'bad.pdf', { type: 'application/pdf' });
    const result = await parseDavibankPDF(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('parse_error');
      expect(result.error.message).toContain('Error al leer el PDF');
      expect(result.error.details).toContain('Invalid PDF structure');
    }
  });

  it('handles non-Error thrown object', async () => {
    (pdfjsLib.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.reject('string error'),
    });

    const file = new File(['x'], 'err.pdf', { type: 'application/pdf' });
    const result = await parseDavibankPDF(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.details).toBe('string error');
    }
  });

  it('handles multi-page PDF', async () => {
    const createMockPage = (text: string) => ({
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: text, transform: [1, 0, 0, 1, 50, 700], width: 500 }],
      }),
    });

    const mockPdf = {
      numPages: 2,
      getPage: vi.fn()
        .mockResolvedValueOnce(createMockPage('CUENTA DE AHORROS DETALLE DE CUENTA'))
        .mockResolvedValueOnce(createMockPage('4/05/2026 CENTRAL DE C RETIRO ATM -600.000,00 16.334.391,71')),
    };

    (pdfjsLib.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    });

    const file = new File(['pdf'], 'multi.pdf', { type: 'application/pdf' });
    const result = await parseDavibankPDF(file);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.statement.transactions.length).toBe(1);
      expect(result.statement.transactions[0]!.amount).toBeCloseTo(-600000);
    }
  });

  it('handles empty page content', async () => {
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    };

    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
    };

    (pdfjsLib.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    });

    const file = new File(['pdf'], 'empty.pdf', { type: 'application/pdf' });
    const result = await parseDavibankPDF(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('invalid_format');
    }
  });
});
