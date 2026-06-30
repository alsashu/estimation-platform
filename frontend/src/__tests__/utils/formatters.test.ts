import { describe, it, expect } from 'vitest';
import { fmt, accuracyColor, accuracyBg, cn } from '../../utils/formatters';

describe('fmt utilities', () => {
  describe('fmt.days', () => {
    it('formats single day', () => expect(fmt.days(1)).toBe('1 day'));
    it('formats multiple days', () => expect(fmt.days(5)).toBe('5 days'));
    it('formats decimal days', () => expect(fmt.days(1.5)).toBe('1.5 days'));
  });

  describe('fmt.hours', () => {
    it('formats single hour', () => expect(fmt.hours(1)).toBe('1 hr'));
    it('formats multiple hours', () => expect(fmt.hours(8.5)).toBe('8.5 hrs'));
  });

  describe('fmt.pct', () => {
    it('converts decimal to percentage', () => expect(fmt.pct(0.85)).toBe('85%'));
    it('handles 100%', () => expect(fmt.pct(1)).toBe('100%'));
  });

  describe('fmt.accuracy', () => {
    it('formats accuracy value', () => expect(fmt.accuracy(92.5)).toBe('92.5%'));
    it('handles whole numbers', () => expect(fmt.accuracy(100)).toBe('100%'));
  });

  describe('fmt.variance', () => {
    it('shows + for positive', () => expect(fmt.variance(3)).toBe('+3 hrs'));
    it('shows - for negative', () => expect(fmt.variance(-2)).toBe('-2 hrs'));
  });

  describe('fmt.date', () => {
    it('formats a date string', () => {
      const result = fmt.date('2024-01-15');
      expect(result).toContain('Jan');
      expect(result).toContain('2024');
    });
  });

  describe('fmt.range', () => {
    it('formats min-max range', () => expect(fmt.range(2, 5, 'days')).toBe('2–5 days'));
  });
});

describe('accuracyColor', () => {
  it('returns greenline class for >= 90', () => expect(accuracyColor(90)).toContain('greenline'));
  it('returns gold class for 70-89', () => expect(accuracyColor(75)).toContain('gold'));
  it('returns vibrant class for < 70', () => expect(accuracyColor(60)).toContain('vibrant'));
});

describe('accuracyBg', () => {
  it('returns greenline bg for >= 90', () => expect(accuracyBg(95)).toContain('greenline'));
  it('returns gold bg for 70-89', () => expect(accuracyBg(80)).toContain('gold'));
  it('returns vibrant bg for < 70', () => expect(accuracyBg(55)).toContain('vibrant'));
});

describe('cn (classname utility)', () => {
  it('merges class strings', () => expect(cn('foo', 'bar')).toBe('foo bar'));
  it('handles conditional classes', () => expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz'));
  it('concatenates all truthy classes (simple join, no tailwind-merge)', () => {
    const result = cn('bg-red-500', 'bg-blue-500');
    expect(result).toContain('bg-blue-500');
    expect(result).toContain('bg-red-500');
  });
});
