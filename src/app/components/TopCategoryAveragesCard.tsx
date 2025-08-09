'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { useDashboardQuery } from '@/lib/queries';
import { useDashboardFilters } from '@/lib/stores/filters';
import { useCurrencySettings } from '@/app/providers';

const TopCategoryAveragesCard: React.FC = () => {
	const { dateRange, interval } = useDashboardFilters();
	const { currency: appCurrency, locale: appLocale } = useCurrencySettings();
	const { data, isLoading } = useDashboardQuery({
		from: dateRange.from,
		to: dateRange.to,
		interval,
	});

	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat(appLocale, { style: 'currency', currency: appCurrency }).format(
			Math.abs(amount),
		);

	if (isLoading) return null;

	const top = (data as any)?.topCategoryAverages ?? [];
	if (!top || top.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<BarChart3 className='h-5 w-5' />
					Top 3 Categories - Average Spending
				</CardTitle>
				<p className='text-sm text-muted-foreground'>
					Average spending per{' '}
					{interval === 'day' ? 'day' : interval === 'week' ? 'week' : 'month'} for your
					highest spending categories
				</p>
			</CardHeader>
			<CardContent>
				<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
					{top.map((category: any, index: number) => (
						<div key={category.categoryId} className='p-4 border rounded-lg'>
							<div className='flex items-center gap-3 mb-2'>
								<div
									className='w-4 h-4 rounded-full'
									style={{ backgroundColor: category.categoryColor }}
								/>
								<span className='font-medium text-sm'>{category.categoryName}</span>
								<span className='text-xs bg-secondary px-2 py-1 rounded'>
									#{index + 1}
								</span>
							</div>
							<div className='space-y-2'>
								<div>
									<p className='text-xs text-muted-foreground'>
										Average per{' '}
										{interval === 'day'
											? 'day'
											: interval === 'week'
												? 'week'
												: 'month'}
									</p>
									<p
										className='text-lg font-bold'
										style={{ color: category.categoryColor }}>
										{formatCurrency(category.averagePerInterval)}
									</p>
								</div>
								<div className='text-xs text-muted-foreground'>
									<p>Total: {formatCurrency(category.totalAmount)}</p>
									<p>
										Over {category.intervalCount}{' '}
										{interval === 'day'
											? 'days'
											: interval === 'week'
												? 'weeks'
												: 'months'}
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
};

export default TopCategoryAveragesCard;
