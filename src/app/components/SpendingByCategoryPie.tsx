'use client';

import { useCurrencySettings } from '@/app/providers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardQuery } from '@/lib/queries';
import { useDashboardFilters } from '@/lib/stores/filters';
import React, { useMemo } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const SpendingByCategoryPie: React.FC = () => {
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

	const pieData = useMemo(() => {
		const source = (data?.categoryBreakdown ?? []).slice(0, 10) as Array<{
			categoryName: string;
			amount: number;
			categoryColor: string;
		}>;
		const total = source.reduce((sum, x) => sum + (x.amount || 0), 0);
		return source.map((x) => ({
			name: x.categoryName,
			value: x.amount,
			color: x.categoryColor,
			percent: total > 0 ? (x.amount / total) * 100 : 0,
		}));
	}, [data]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Spending by Category</CardTitle>
			</CardHeader>
			<CardContent>
				<div className='h-80'>
					{isLoading ? (
						<div className='h-full flex items-center justify-center text-muted-foreground'>
							Loading chart...
						</div>
					) : (
						<ResponsiveContainer width='100%' height='100%'>
							<PieChart>
								<Tooltip formatter={(value, name) => [formatCurrency(value as number), name]} />
								<Legend />
								<Pie
									data={pieData}
									dataKey='value'
									nameKey='name'
									cx='50%'
									cy='50%'
									innerRadius={60}
									outerRadius={100}
									paddingAngle={2}
								>
									{pieData.map((entry, idx) => (
										<Cell key={`cell-${idx}`} fill={entry.color} />
									))}
								</Pie>
							</PieChart>
						</ResponsiveContainer>
					)}
				</div>
			</CardContent>
		</Card>
	);
};

export default SpendingByCategoryPie;
