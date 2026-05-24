/**
 * Format a product price with its currency symbol.
 * Supports common currencies; falls back to `<amount> <CODE>` for others.
 */
export function formatProductPrice(price: number | string | undefined | null, currencyCode?: string): string {
  const numericPrice = Number(price || 0).toFixed(2);
  const code = (currencyCode || 'USD').toUpperCase();

  if (code === 'USD') return `$${numericPrice}`;
  if (code === 'EUR') return `€${numericPrice}`;
  if (code === 'LBP') return `${numericPrice} LBP`;
  if (code === 'GBP') return `£${numericPrice}`;
  if (code === 'JPY') return `¥${numericPrice}`;
  if (code === 'CNY') return `¥${numericPrice}`;
  if (code === 'AED') return `${numericPrice} AED`;
  if (code === 'SAR') return `${numericPrice} SAR`;
  if (code === 'EGP') return `${numericPrice} EGP`;
  if (code === 'CHF') return `${numericPrice} CHF`;
  if (code === 'INR') return `₹${numericPrice}`;
  if (code === 'AUD') return `A$${numericPrice}`;
  if (code === 'CAD') return `C$${numericPrice}`;
  return `${numericPrice} ${code}`;
}
