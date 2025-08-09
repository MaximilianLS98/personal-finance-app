'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useCurrencySettings } from '@/app/providers';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

// Extensible registry for base color themes. Keys should map to CSS var sets in globals.css
const BASE_COLOR_THEMES = [
	{ key: 'neutral', label: 'Neutral' },
	{ key: 'tangerine', label: 'Tangerine' },
	{ key: 'candy', label: 'Candy' },
] as const;

const CURRENCIES = [
	{ code: 'NOK', label: 'Norwegian Krone (NOK)' },
	{ code: 'USD', label: 'US Dollar (USD)' },
	{ code: 'EUR', label: 'Euro (EUR)' },
	{ code: 'GBP', label: 'British Pound (GBP)' },
] as const;

const THEME_STORAGE_KEY = 'pf-base-color';

export default function SettingsPage() {
	const { theme, setTheme, resolvedTheme } = useTheme();
	const { currency, setCurrency } = useCurrencySettings();

	// Base color theme state persisted to localStorage; applied as data attribute on <html>
	const [baseColor, setBaseColor] = useState<string>(() => {
		if (typeof window === 'undefined') return 'neutral';
		return localStorage.getItem(THEME_STORAGE_KEY) ?? 'neutral';
	});

	// Apply base color to <html data-theme="..."> for future CSS scoping if needed
	useMemo(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', baseColor);
			localStorage.setItem(THEME_STORAGE_KEY, baseColor);
		}
	}, [baseColor]);

	return (
		<div className='container mx-auto max-w-4xl space-y-6 p-4'>
			<h1 className='text-2xl font-semibold'>Settings</h1>

			<Card>
				<CardHeader>
					<CardTitle>Appearance</CardTitle>
					<CardDescription>Configure dark mode and the base color theme.</CardDescription>
				</CardHeader>
				<CardContent className='flex flex-col gap-4'>
					<div className='flex items-center justify-between gap-6'>
						<div className='space-y-0.5'>
							<div className='font-medium'>Color scheme</div>
							<div className='text-muted-foreground text-sm'>
								Choose light, dark, or follow system.
							</div>
						</div>
						<div className='flex items-center gap-3'>
							<Button
								variant={resolvedTheme === 'light' ? 'default' : 'outline'}
								onClick={() => setTheme('light')}>
								Light
							</Button>
							<Button
								variant={resolvedTheme === 'dark' ? 'default' : 'outline'}
								onClick={() => setTheme('dark')}>
								Dark
							</Button>
							<Button
								variant={theme === 'system' ? 'default' : 'outline'}
								onClick={() => setTheme('system')}>
								System
							</Button>
						</div>
					</div>

					<div className='flex items-center justify-between gap-6'>
						<div className='space-y-0.5'>
							<div className='font-medium'>Base color theme</div>
							<div className='text-muted-foreground text-sm'>
								Switch the design token set used by shadcn variables.
							</div>
						</div>
						<Select value={baseColor} onValueChange={setBaseColor}>
							<SelectTrigger className='min-w-44'>
								<SelectValue placeholder='Theme' />
							</SelectTrigger>
							<SelectContent>
								{BASE_COLOR_THEMES.map((t) => (
									<SelectItem key={t.key} value={t.key}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Currency</CardTitle>
					<CardDescription>Choose your default display currency.</CardDescription>
				</CardHeader>
				<CardContent className='flex items-center justify-between gap-6'>
					<div className='text-muted-foreground text-sm'>
						All amounts will default to this currency.
					</div>
					<Select value={currency} onValueChange={setCurrency}>
						<SelectTrigger className='min-w-52'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CURRENCIES.map((c) => (
								<SelectItem key={c.code} value={c.code}>
									{c.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Categories</CardTitle>
					<CardDescription>Manage your transaction categories and rules.</CardDescription>
				</CardHeader>
				<CardContent className='flex items-center justify-between gap-6'>
					<div className='text-muted-foreground text-sm'>
						Go to Categories to configure and organize your categories.
					</div>
					<Button asChild>
						<Link href='/categories'>Open Categories</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
