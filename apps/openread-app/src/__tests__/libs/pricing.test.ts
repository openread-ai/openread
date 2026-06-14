import { describe, it, expect } from 'vitest';
import { getCountryFromHeaders, formatPrice, type RegionalPrice } from '@/lib/pricing';

const USD_PRICING: RegionalPrice = { currency: 'USD', symbol: '$', reader: 9.99, pro: 19.99 };

describe('pricing helpers', () => {
  describe('getCountryFromHeaders', () => {
    it('extracts country from cf-ipcountry header (Cloudflare)', () => {
      const headers = new Headers({ 'cf-ipcountry': 'IN' });
      expect(getCountryFromHeaders(headers)).toBe('IN');
    });

    it('extracts country from x-vercel-ip-country header (Vercel)', () => {
      const headers = new Headers({ 'x-vercel-ip-country': 'BR' });
      expect(getCountryFromHeaders(headers)).toBe('BR');
    });

    it('prefers cf-ipcountry over x-vercel-ip-country', () => {
      const headers = new Headers({
        'cf-ipcountry': 'IN',
        'x-vercel-ip-country': 'BR',
      });
      expect(getCountryFromHeaders(headers)).toBe('IN');
    });

    it('defaults to US when no country headers are present', () => {
      const headers = new Headers();
      expect(getCountryFromHeaders(headers)).toBe('US');
    });

    it('defaults to US when headers contain unrelated values only', () => {
      const headers = new Headers({ 'content-type': 'application/json' });
      expect(getCountryFromHeaders(headers)).toBe('US');
    });
  });

  describe('formatPrice', () => {
    it('formats canonical USD prices', () => {
      expect(formatPrice(USD_PRICING, 'reader')).toBe('$9.99');
      expect(formatPrice(USD_PRICING, 'pro')).toBe('$19.99');
    });
  });
});
