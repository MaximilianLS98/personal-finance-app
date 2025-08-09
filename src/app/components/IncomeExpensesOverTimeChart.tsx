'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	ResponsiveContainer,
	LineChart,
	CartesianGrid,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
	Line,
} from 'recharts';
import { useDashboardQuery } from '@/lib/queries';
import { useDashboardFilters } from '@/lib/stores/filters';
import { useCurrencySettings } from '@/app/providers';

const IncomeExpensesOverTimeChart: React.FC = () => {
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

	const lineData = useMemo(() => (data as any)?.expenseIncomeOverTime ?? [], [data]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Income vs Expenses Over Time</CardTitle>
			</CardHeader>
			<CardContent>
				<div className='h-80'>
					{isLoading ? (
						<div className='h-full flex items-center justify-center text-muted-foreground'>
							Loading chart...
						</div>
					) : (
						<ResponsiveContainer width='100%' height='100%'>
							<LineChart data={lineData}>
								<CartesianGrid strokeDasharray='3 3' />
								<XAxis dataKey='date' />
								<YAxis />
								<Tooltip
									formatter={(value: any, name: any) => [
										formatCurrency(value as number),
										name,
									]}
								/>
								<Legend />
								<Line
									type='monotone'
									dataKey='income'
									stroke='var(--chart-1)'
									strokeWidth={2}
									name='Income'
								/>
								<Line
									type='monotone'
									dataKey='expenses'
									stroke='var(--chart-2)'
									strokeWidth={2}
									name='Expenses'
								/>
								<Line
									type='monotone'
									dataKey='net'
									stroke='var(--chart-3)'
									strokeWidth={2}
									name='Net'
									strokeDasharray='5 5'
								/>
							</LineChart>
						</ResponsiveContainer>
					)}
				</div>
			</CardContent>
		</Card>
	);
};

export default IncomeExpensesOverTimeChart;
