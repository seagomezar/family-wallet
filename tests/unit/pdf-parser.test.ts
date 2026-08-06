import { describe, it, expect } from 'vitest';
import { parseCOPAmount } from '@/lib/pdf-parse-utils';

describe('PDF Parser', () => {
  describe('parseCOPAmount', () => {
    it('parses positive amounts with period thousands separator', () => {
      expect(parseCOPAmount('16.934.391,71')).toBeCloseTo(16934391.71);
    });

    it('parses negative amounts', () => {
      expect(parseCOPAmount('-5.150.361,98')).toBeCloseTo(-5150361.98);
    });

    it('parses small amounts', () => {
      expect(parseCOPAmount('-600.000,00')).toBeCloseTo(-600000);
    });

    it('parses amounts without thousands separator', () => {
      expect(parseCOPAmount('-898,00')).toBeCloseTo(-898);
    });

    it('parses zero', () => {
      expect(parseCOPAmount('0,00')).toBe(0);
    });

    it('parses large positive amounts', () => {
      expect(parseCOPAmount('82.506.736,53')).toBeCloseTo(82506736.53);
    });

    it('handles amounts with decimals', () => {
      expect(parseCOPAmount('10.080,93')).toBeCloseTo(10080.93);
    });

    it('handles single digit decimals format', () => {
      expect(parseCOPAmount('-705,66')).toBeCloseTo(-705.66);
    });

    it('returns 0 for invalid input', () => {
      expect(parseCOPAmount('abc')).toBe(0);
      expect(parseCOPAmount('')).toBe(0);
    });
  });
});
