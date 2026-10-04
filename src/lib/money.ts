export const UNKNOWN_CURRENCY = 'UNKNOWN';
export function currencyCode(value?: string | null): string {
	return value?.trim().toUpperCase() || UNKNOWN_CURRENCY;
}
export function validCurrency(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}
export function money(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function displayMoney(value: number, currency: string, locale = 'nb-NO'): string {
	return currency === UNKNOWN_CURRENCY
		? `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} (currency unknown)`
		: new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
