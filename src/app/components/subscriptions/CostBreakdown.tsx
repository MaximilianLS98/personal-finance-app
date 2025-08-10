'use client';

import React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Subscription, Category } from '../../../lib/types';
import { formatCurrency } from '../../../lib/financial-calculator';
import { useCurrencySettings } from '../../providers';
import { PieChart, BarChart3, TrendingUp } from 'lucide-react';

interface CostBreakdownProps {
	/** Array of subscriptions to analyze */
	subscriptions?: Subscription[];
	/** Array of categories for integration */
	categories?: Category[];
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
}

interface CategoryBreakdown {
	category: Category;
	subscriptions: Subscription[];
	monthlyTotal: number;
	annualTotal: number;
	subscriptionCount: number;
	percentage: number;
}

/**
 * CostBreakdown component integrates with existing categories
 * to show subscription spending breakdown by category
 */
export function CostBreakdown({
	subscriptions = [],
	categories = [],
	isLoading = false,
	error,
}: CostBreakdownProps) {
	const { currency, locale } = useCurrencySettings();

	// Calculate category breakdown
	const categoryBreakdown = React.useMemo(() => {
		if (!subscriptions.length || !categories.length) return [];

		const activeSubscriptions = subscriptions.filter((sub) => sub.isActive);

		// Calculate total monthly cost for percentage calculations
		const totalMonthly = activeSubscriptions.reduce((total, sub) => {
			switch (sub.billingFrequency) {
				case 'monthly':
					return total + sub.amount;
				case 'quarterly':
					return total + sub.amount / 3;
				case 'annually':
					return total + sub.amount / 12;
				case 'custom':
					if (sub.customFrequencyDays) {
						return total + (sub.amount * 30.44) / sub.customFrequencyDays;
					}
					return total;
				default:
					return total;
			}
		}, 0);

		// Group subscriptions by category
		const breakdown: CategoryBreakdown[] = categories
			.map((category) => {
				const categorySubscriptions = activeSubscriptions.filter(
					(sub) => sub.categoryId === category.id,
				);

				if (categorySubscriptions.length === 0) return null;

				const monthlyTotal = categorySubscriptions.reduce((total, sub) => {
					switch (sub.billingFrequency) {
						case 'monthly':
							return total + sub.amount;
						case 'quarterly':
							return total + sub.amount / 3;
						case 'annually':
							return total + sub.amount / 12;
						case 'custom':
							if (sub.customFrequencyDays) {
								return total + (sub.amount * 30.44) / sub.customFrequencyDays;
							}
							return total;
						default:
							return total;
					}
				}, 0);

				return {
					category,
					subscriptions: categorySubscriptions,
					monthlyTotal,
					annualTotal: monthlyTotal * 12,
					subscriptionCount: categorySubscriptions.length,
					percentage: totalMonthly > 0 ? (monthlyTotal / totalMonthly) * 100 : 0,
				};
			})
			.filter((item): item is CategoryBreakdown => item !== null)
			.sort((a, b) => b.monthlyTotal - a.monthlyTotal);

		return breakdown;
	}, [subscriptions, categories]);

	// Calculate summary stats
	const summary = React.useMemo(() => {
		const totalMonthly = categoryBreakdown.reduce((sum, item) => sum + item.monthlyTotal, 0);
		const totalAnnual = categoryBreakdown.reduce((sum, item) => sum + item.annualTotal, 0);
		const totalSubscriptions = categoryBreakdown.reduce(
			(sum, item) => sum + item.subscriptionCount,
			0,
		);
		const topCategory = categoryBreakdown[0];

		return {
			totalMonthly,
			totalAnnual,
			totalSubscriptions,
			categoryCount: categoryBreakdown.length,
			topCategory,
		};
	}, [categoryBreakdown]);

	// Handle loading state
	if (isLoading) {
		return (
			<Card className='animate-pulse'>
				<CardHeader>
					<div className='h-6 bg-muted rounded w-1/2'></div>
					<div className='h-4 bg-muted rounded w-3/4'></div>
				</CardHeader>
				<CardContent>
					<div className='space-y-4'>
						{[...Array(4)].map((_, index) => (
							<div
								key={index}
								className='flex items-center justify-between p-3 border rounded'>
								<div className='flex items-center gap-3'>
									<div className='h-8 w-8 bg-muted rounded'></div>
									<div className='space-y-2'>
										<div className='h-4 bg-muted rounded w-24'></div>
										<div className='h-3 bg-muted rounded w-16'></div>
									</div>
								</div>
								<div className='text-right space-y-2'>
									<div className='h-4 bg-muted rounded w-16'></div>
									<div className='h-3 bg-muted rounded w-12'></div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	// Handle error state
	if (error) {
		return (
			<Card className='border-destructive'>
				<CardHeader>
					<CardTitle className='text-destructive flex items-center gap-2'>
						<BarChart3 className='h-5 w-5' />
						Error Loading Cost Breakdown
					</CardTitle>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<PieChart className='h-5 w-5' />
					Cost Breakdown by Category
				</CardTitle>
				<CardDescription>
					{summary.totalSubscriptions} subscription
					{summary.totalSubscriptions !== 1 ? 's' : ''} across {summary.categoryCount}{' '}
					categor{summary.categoryCount !== 1 ? 'ies' : 'y'} •{' '}
					{formatCurrency(summary.totalMonthly, currency, locale)}/month
				</CardDescription>
				{summary.topCategory && (
					<div className='mt-2'>
						<Badge variant='secondary' className='text-xs'>
							<TrendingUp className='h-3 w-3 mr-1' />
							{summary.topCategory.category.name} leads at{' '}
							{summary.topCategory.percentage.toFixed(1)}%
						</Badge>
					</div>
				)}
			</CardHeader>
			<CardContent>
				{categoryBreakdown.length === 0 ? (
					<div className='text-center py-8 text-muted-foreground'>
						<PieChart className='h-12 w-12 mx-auto mb-4 opacity-50' />
						<p>No subscription categories to display</p>
						<p className='text-sm mt-2'>Add subscriptions to see cost breakdown</p>
					</div>
				) : (
					<div className='space-y-4'>
						{categoryBreakdown.map((item) => (
							<CategoryBreakdownItem
								key={item.category.id}
								breakdown={item}
								currency={currency}
								locale={locale}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface CategoryBreakdownItemProps {
	breakdown: CategoryBreakdown;
	currency: string;
	locale: string;
}

/**
 * Individual category breakdown item component
 */
function CategoryBreakdownItem({ breakdown, currency, locale }: CategoryBreakdownItemProps) {
	const { category, monthlyTotal, annualTotal, subscriptionCount, percentage } = breakdown;

	return (
		<div className='flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors'>
			<div className='flex items-center gap-3 flex-1 min-w-0'>
				{/* Category icon and color */}
				<div
					className='h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium'
					style={{ backgroundColor: category.color }}>
					{category.icon ? (
						<span className='text-xs'>{category.icon}</span>
					) : (
						category.name.charAt(0).toUpperCase()
					)}
				</div>

				{/* Category info */}
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2 mb-1'>
						<h4 className='font-medium text-sm truncate'>{category.name}</h4>
						<Badge variant='outline' className='text-xs'>
							{subscriptionCount} subscription{subscriptionCount !== 1 ? 's' : ''}
						</Badge>
					</div>

					{/* Progress bar */}
					<div className='w-full bg-muted rounded-full h-2'>
						<div
							className='h-2 rounded-full transition-all duration-300'
							style={{
								width: `${Math.min(percentage, 100)}%`,
								backgroundColor: category.color,
							}}
						/>
					</div>
				</div>
			</div>

			{/* Cost info */}
			<div className='text-right ml-4'>
				<div className='font-semibold text-sm'>
					{formatCurrency(monthlyTotal, currency, locale)}/mo
				</div>
				<div className='text-xs text-muted-foreground'>
					{formatCurrency(annualTotal, currency, locale)}/yr • {percentage.toFixed(1)}%
				</div>
			</div>
		</div>
	);
}

export default CostBreakdown;
