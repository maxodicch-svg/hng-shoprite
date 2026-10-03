/**
 * Money helpers — mirrors `src/lib/money.ts` on the website.
 *
 * Deliberately formatted by hand rather than with `Intl.NumberFormat`: Hermes
 * ships a reduced ICU in some Expo builds, where `Intl` silently renders the
 * wrong symbol or throws. Amounts are always integer minor units.
 */

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND']);

const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  NGN: '₦',
  GHS: 'GH₵',
  KES: 'KSh',
  ZAR: 'R',
  INR: '₹',
  CAD: 'CA$',
  AUD: 'A$',
  // The zero- and three-decimal currencies need symbols of their own, because
  // this module deliberately cannot ask `Intl` for one.
  JPY: '¥',
  KRW: '₩',
  VND: '₫',
  CLP: 'CLP$',
  ISK: 'kr',
  BHD: 'BD',
  KWD: 'KD',
  OMR: 'OMR',
  TND: 'DT',
};

/** Smallest-unit multiplier for a currency code. */
export function minorUnitFactor(currency = 'USD'): number {
  const code = String(currency || 'USD').toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 1;
  if (THREE_DECIMAL.has(code)) return 1000;
  return 100;
}

/** True when `value` is a safe, non-negative integer number of minor units. */
export function isValidCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Currency symbol, for compact UI such as cart badges. */
export function currencySymbol(currency = 'USD'): string {
  const code = String(currency || 'USD').toUpperCase();
  return SYMBOLS[code] ?? `${code} `;
}

/** Insert thousands separators into the whole part of a decimal string. */
function groupThousands(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/**
 * Format integer minor units for display.
 *
 * @example formatMoney(8900) // "$89.00"
 */
export function formatMoney(cents: number, currency = 'USD'): string {
  const code = String(currency || 'USD').toUpperCase();
  const safe = isValidCents(cents) ? cents : 0;
  const factor = minorUnitFactor(code);
  const digits = factor === 1 ? 0 : factor === 1000 ? 3 : 2;
  const amount = safe / factor;
  return `${currencySymbol(code)}${groupThousands(amount.toFixed(digits))}`;
}
