'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	ResponsiveContainer,
	BarChart,
	CartesianGrid,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
	Bar,
} from 'recharts';
import { useDashboardQuery } from '@/lib/queries';
import { useDashboardFilters } from '@/lib/stores/filters';
import { useCurrencySettings } from '@/app/providers';

const MonthlySpendingTrendsChart: React.FC = () => {
	const { dateRange, interval } = useDashboardFilters();
	const { currency: appCurrency, locale: appLocale } = useCurrencySettings();

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat(appLocale, { style: 'currency', currency: appCurrency }).format(
			Math.abs(amount),
		);

	const { data, isLoading } = useDashboardQuery({
		from: dateRange.from,
		to: dateRange.to,
		interval,
	});

	const monthly = useMemo(() => {
		const src = ((data as any)?.expenseIncomeOverTime ?? []) as Array<{
			dateKeyIso?: string;
			income: number;
			expenses: number;
		}>;
		const monthMap = new Map<string, { monthLabel: string; expenses: number }>();
		for (const item of src) {
			const keyIso = (item as any).dateKeyIso as string | undefined;
			if (!keyIso) continue;
			const d = new Date(keyIso);
			const ymKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			const label = `${d.toLocaleString(undefined, { month: 'short' })} ${d.getFullYear()}`;
			const existing = monthMap.get(ymKey) ?? { monthLabel: label, expenses: 0 };
			existing.expenses += Math.max(0, item.expenses || 0);
			monthMap.set(ymKey, existing);
		}
		const sorted = Array.from(monthMap.keys()).sort();
		return sorted.map((k) => ({
			month: monthMap.get(k)!.monthLabel,
			amount: monthMap.get(k)!.expenses,
		}));
	}, [data]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Monthly Spending Trends</CardTitle>
				<p className='text-sm text-muted-foreground'>Independent of the Group by setting</p>
			</CardHeader>
			<CardContent>
				<div className='h-80'>
					{isLoading ? (
						<div className='h-full flex items-center justify-center text-muted-foreground'>
							Loading chart...
						</div>
					) : (
						<ResponsiveContainer width='100%' height='100%'>
							<BarChart data={monthly}>
								<CartesianGrid strokeDasharray='3 3' />
								<XAxis dataKey='month' angle={-30} textAnchor='end' height={60} />
								<YAxis />
								<Tooltip
									formatter={(value: any) => formatCurrency(value as number)}
								/>
								<Legend />
								<Bar dataKey='amount' name='Spending' fill='var(--chart-2)' />
							</BarChart>
						</ResponsiveContainer>
					)}
				</div>
			</CardContent>
		</Card>
	);
};

export default MonthlySpendingTrendsChart;
