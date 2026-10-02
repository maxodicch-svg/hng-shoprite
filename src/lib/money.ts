/**
 * Money helpers.
 *
 * All amounts are integer **minor units** (cents). Floating point is never used
 * for money, which is why `parsePriceToCents` returns an integer and
 * `formatMoney` only divides a value that is already exact.
 */

/** Currencies where the minor unit is not 1/100 (zero-decimal or 3-decimal). */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND']);

/** Currency symbols used by the server-rendered fallback. */
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

/**
 * Format integer minor units as a display string.
 *
 * @example formatMoney(8900) // "$89.00"
 * @example formatMoney(8900, 'NGN') // "₦89.00"
 */
export function formatMoney(cents: number, currency = 'USD'): string {
  const code = String(currency || 'USD').toUpperCase();
  const safe = isValidCents(cents) ? cents : 0;
  const factor = minorUnitFactor(code);
  const amount = safe / factor;
  const digits = factor === 1 ? 0 : 2;
  try {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
    }).format(amount);
    // Node built without full ICU renders NGN as "NGN 1,999.00". Prefer our own
    // symbol whenever the runtime declines to use one, so receipts stay readable.
    const symbol = SYMBOLS[code];
    if (symbol && formatted.toUpperCase().startsWith(code)) {
      return `${symbol}${formatted.slice(code.length).trimStart()}`;
    }
    return formatted;
  } catch {
    const symbol = SYMBOLS[code] ?? `${code} `;
    return `${symbol}${amount.toFixed(digits)}`;
  }
}

/** Currency symbol, for compact UI such as cart badges. */
export function currencySymbol(currency = 'USD'): string {
  const code = String(currency || 'USD').toUpperCase();
  return SYMBOLS[code] ?? `${code} `;
}
