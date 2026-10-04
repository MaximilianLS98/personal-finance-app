'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

interface ProvidersProps {
	children: ReactNode;
}

type CurrencySettings = {
	currency: string; // ISO 4217 code
	locale: string; // BCP 47 locale
	setCurrency: (c: string) => void;
	setLocale: (l: string) => void;
};

const CurrencyContext = createContext<CurrencySettings | undefined>(undefined);

const CURRENCY_STORAGE_KEY = 'pf-currency';
const LOCALE_STORAGE_KEY = 'pf-locale';

export function useCurrencySettings(): CurrencySettings {
	const ctx = useContext(CurrencyContext);
	if (!ctx) {
		return {
			currency: 'NOK',
			locale: 'nb-NO',
			setCurrency: () => {},
			setLocale: () => {},
		};
	}
	return ctx;
}

export function Providers({ children }: ProvidersProps) {
	// Create one QueryClient per Provider instance
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 1000 * 30,
						gcTime: 1000 * 60 * 5,
						refetchOnWindowFocus: false,
						retry: 1,
					},
					mutations: {
						retry: 0,
					},
				},
			}),
	);

	// Currency settings with persistence
	const [currency, setCurrency] = useState('NOK');
	const [locale, setLocale] = useState('nb-NO');
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	useEffect(() => {
		try {
			const savedCurrency = localStorage.getItem(CURRENCY_STORAGE_KEY) || 'NOK';
			const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) || 'nb-NO';
			new Intl.NumberFormat(savedLocale, { style: 'currency', currency: savedCurrency });
			setCurrency(savedCurrency);
			setLocale(savedLocale);
		} catch {
			/* Keep defaults if preferences are unavailable or invalid. */
		}
		setSettingsLoaded(true);
	}, []);
	useEffect(() => {
		if (!settingsLoaded) return;
		try {
			localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
			localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		} catch {
			/* Settings still work for this session when storage is unavailable. */
		}
	}, [currency, locale, settingsLoaded]);

	const currencyValue = useMemo(
		() => ({ currency, locale, setCurrency, setLocale }),
		[currency, locale],
	);

	return (
		<QueryClientProvider client={queryClient}>
			<NextThemesProvider
				attribute='class'
				defaultTheme='system'
				enableSystem
				disableTransitionOnChange
				storageKey='pf-theme'
			>
				<CurrencyContext.Provider value={currencyValue}>{children}</CurrencyContext.Provider>
				<ReactQueryDevtools initialIsOpen={false} />
			</NextThemesProvider>
		</QueryClientProvider>
	);
}

export function formatWithSettings(amount: number, opts?: { currency?: string; locale?: string }) {
	const currency = opts?.currency ?? 'NOK';
	const locale = opts?.locale ?? 'nb-NO';
	return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function useCurrencyFormatter() {
	const { currency, locale } = useCurrencySettings();
	return (amount: number, override?: { currency?: string; locale?: string }) =>
		new Intl.NumberFormat(override?.locale ?? locale, {
			style: 'currency',
			currency: override?.currency ?? currency,
		}).format(amount);
}
