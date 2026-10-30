import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPrice, money } from './formatters';

describe('formatters', () => {
  it('formats numeric values with Vietnamese grouping and a currency suffix', () => {
    expect(formatCurrency(1250000)).toBe('1.250.000₫');
    expect(formatCurrency(0)).toBe('0₫');
    expect(formatCurrency('3750000')).toBe('3.750.000₫');
  });

  it('handles empty or non-finite inputs gracefully', () => {
    expect(formatCurrency(null)).toBe('0₫');
    expect(formatCurrency(undefined)).toBe('0₫');
    expect(formatCurrency('abc')).toBe('0₫');
  });

  it('exports money and formatPrice aliases', () => {
    expect(money(500000)).toBe('500.000₫');
    expect(formatPrice(500000)).toBe('500.000₫');
  });
});
