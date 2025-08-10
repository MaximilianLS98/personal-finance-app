'use client';

import React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Badge } from '../../../components/ui/badge';
import { Subscription } from '../../../lib/types';
import { formatCurrency } from '../../../lib/financial-calculator';
import { useCurrencySettings } from '../../providers';
import {
	ResponsiveContainer,
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	BarChart,
	Bar,
	Area,
	AreaChart,
} from 'recharts';
import { TrendingUp, Calculator, AlertTriangle, Info } from 'lucide-react';

interface ProjectionChartsProps {
	/** Array of subscriptions to project */
	subscriptions?: Subscription[];
	/** Annual investment return rate (default: 7%) */
	investmentReturnRate?: number;
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
}

interface ProjectionData {
	year: number;
	subscriptionCost: number;
	cumulativeSubscriptionCost: number;
	investmentValue: number;
	potentialSavings: number;
}

/**
 * ProjectionCharts component for long-term cost visualization
 * Shows subscription costs vs investment opportunities over time
 */
export function ProjectionCharts({
	subscriptions = [],
	investmentReturnRate = 0.07,
	isLoading = false,
	error,
}: ProjectionChartsProps) {
	const { currency, locale } = useCurrencySettings();

	// Calculate projection data
	const projectionData = React.useMemo(() => {
		if (!subscriptions.length) return [];

		const activeSubscriptions = subscriptions.filter((sub) => sub.isActive);

		// Calculate total monthly cost
		const monthlyTotal = activeSubscriptions.reduce((total, sub) => {
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

		// Generate projection data for 20 years
		const data: ProjectionData[] = [];
		let cumulativeSubscriptionCost = 0;
		let investmentValue = 0;

		for (let year = 1; year <= 20; year++) {
			const annualSubscriptionCost = monthlyTotal * 12;
			cumulativeSubscriptionCost += annualSubscriptionCost;

			// Calculate compound investment growth
			// Monthly contributions with compound interest
			const monthlyContribution = monthlyTotal;
			const monthlyRate = investmentReturnRate / 12;
			const months = year * 12;

			// Future value of annuity formula
			if (monthlyRate > 0) {
				investmentValue =
					monthlyContribution * (((1 + monthlyRate) ** months - 1) / monthlyRate);
			} else {
				investmentValue = monthlyContribution * months;
			}

			const potentialSavings = investmentValue - cumulativeSubscriptionCost;

			data.push({
				year,
				subscriptionCost: annualSubscriptionCost,
				cumulativeSubscriptionCost,
				investmentValue,
				potentialSavings,
			});
		}

		return data;
	}, [subscriptions, investmentReturnRate]);

	// Calculate key milestones
	const milestones = React.useMemo(() => {
		if (!projectionData.length) return null;

		const oneYear = projectionData[0];
		const fiveYears = projectionData[4];
		const tenYears = projectionData[9];
		const twentyYears = projectionData[19];

		return {
			oneYear,
			fiveYears,
			tenYears,
			twentyYears,
			monthlyAmount: projectionData[0]?.subscriptionCost / 12 || 0,
		};
	}, [projectionData]);

	// Handle loading state
	if (isLoading) {
		return (
			<Card className='animate-pulse'>
				<CardHeader>
					<div className='h-6 bg-muted rounded w-1/2'></div>
					<div className='h-4 bg-muted rounded w-3/4'></div>
				</CardHeader>
				<CardContent>
					<div className='h-80 bg-muted rounded'></div>
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
						<AlertTriangle className='h-5 w-5' />
						Error Loading Projections
					</CardTitle>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	// Handle empty state
	if (!projectionData.length || !milestones) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<TrendingUp className='h-5 w-5' />
						Long-term Cost Projections
					</CardTitle>
					<CardDescription>
						Add active subscriptions to see long-term cost analysis
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='text-center py-8 text-muted-foreground'>
						<Calculator className='h-12 w-12 mx-auto mb-4 opacity-50' />
						<p>No active subscriptions to project</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<TrendingUp className='h-5 w-5' />
					Long-term Cost Projections
				</CardTitle>
				<CardDescription>
					{formatCurrency(milestones.monthlyAmount, currency, locale)}/month •{' '}
					{(investmentReturnRate * 100).toFixed(1)}% annual return assumption
				</CardDescription>
				<div className='flex gap-2 mt-2'>
					<Badge variant='outline' className='text-xs'>
						<Info className='h-3 w-3 mr-1' />
						Investment projections are estimates
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue='comparison' className='w-full'>
					<TabsList className='grid w-full grid-cols-3'>
						<TabsTrigger value='comparison'>Cost vs Investment</TabsTrigger>
						<TabsTrigger value='cumulative'>Cumulative Costs</TabsTrigger>
						<TabsTrigger value='milestones'>Key Milestones</TabsTrigger>
					</TabsList>

					<TabsContent value='comparison' className='space-y-4'>
						<div className='h-80'>
							<ResponsiveContainer width='100%' height='100%'>
								<AreaChart data={projectionData}>
									<CartesianGrid strokeDasharray='3 3' />
									<XAxis
										dataKey='year'
										label={{
											value: 'Years',
											position: 'insideBottom',
											offset: -5,
										}}
									/>
									<YAxis
										tickFormatter={(value) =>
											formatCurrency(value, currency, locale).replace(
												/\.\d{2}/,
												'',
											)
										}
									/>
									<Tooltip
										formatter={(value: number, name: string) => [
											formatCurrency(value, currency, locale),
											name === 'investmentValue'
												? 'Investment Value'
												: name === 'cumulativeSubscriptionCost'
													? 'Subscription Cost'
													: name,
										]}
										labelFormatter={(year) => `Year ${year}`}
									/>
									<Legend />
									<Area
										type='monotone'
										dataKey='cumulativeSubscriptionCost'
										stackId='1'
										stroke='#ef4444'
										fill='#ef4444'
										fillOpacity={0.3}
										name='Subscription Cost'
									/>
									<Area
										type='monotone'
										dataKey='investmentValue'
										stackId='2'
										stroke='#22c55e'
										fill='#22c55e'
										fillOpacity={0.3}
										name='Investment Value'
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</TabsContent>

					<TabsContent value='cumulative' className='space-y-4'>
						<div className='h-80'>
							<ResponsiveContainer width='100%' height='100%'>
								<LineChart data={projectionData}>
									<CartesianGrid strokeDasharray='3 3' />
									<XAxis
										dataKey='year'
										label={{
											value: 'Years',
											position: 'insideBottom',
											offset: -5,
										}}
									/>
									<YAxis
										tickFormatter={(value) =>
											formatCurrency(value, currency, locale).replace(
												/\.\d{2}/,
												'',
											)
										}
									/>
									<Tooltip
										formatter={(value: number, name: string) => [
											formatCurrency(value, currency, locale),
											name === 'potentialSavings' ? 'Opportunity Cost' : name,
										]}
										labelFormatter={(year) => `Year ${year}`}
									/>
									<Legend />
									<Line
										type='monotone'
										dataKey='potentialSavings'
										stroke='#3b82f6'
										strokeWidth={3}
										dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
										name='Opportunity Cost'
									/>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</TabsContent>

					<TabsContent value='milestones' className='space-y-4'>
						<div className='grid gap-4 md:grid-cols-2'>
							<MilestoneCard
								title='1 Year'
								subscriptionCost={milestones.oneYear.cumulativeSubscriptionCost}
								investmentValue={milestones.oneYear.investmentValue}
								savings={milestones.oneYear.potentialSavings}
								currency={currency}
								locale={locale}
							/>
							<MilestoneCard
								title='5 Years'
								subscriptionCost={milestones.fiveYears.cumulativeSubscriptionCost}
								investmentValue={milestones.fiveYears.investmentValue}
								savings={milestones.fiveYears.potentialSavings}
								currency={currency}
								locale={locale}
							/>
							<MilestoneCard
								title='10 Years'
								subscriptionCost={milestones.tenYears.cumulativeSubscriptionCost}
								investmentValue={milestones.tenYears.investmentValue}
								savings={milestones.tenYears.potentialSavings}
								currency={currency}
								locale={locale}
							/>
							<MilestoneCard
								title='20 Years'
								subscriptionCost={milestones.twentyYears.cumulativeSubscriptionCost}
								investmentValue={milestones.twentyYears.investmentValue}
								savings={milestones.twentyYears.potentialSavings}
								currency={currency}
								locale={locale}
							/>
						</div>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

interface MilestoneCardProps {
	title: string;
	subscriptionCost: number;
	investmentValue: number;
	savings: number;
	currency: string;
	locale: string;
}

/**
 * Individual milestone card component
 */
function MilestoneCard({
	title,
	subscriptionCost,
	investmentValue,
	savings,
	currency,
	locale,
}: MilestoneCardProps) {
	const isPositiveSavings = savings > 0;

	return (
		<Card
			className={
				isPositiveSavings
					? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
					: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
			}>
			<CardHeader className='pb-2'>
				<CardTitle className='text-lg'>{title}</CardTitle>
			</CardHeader>
			<CardContent className='space-y-3'>
				<div className='space-y-2 text-sm'>
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Subscription Cost:</span>
						<span className='font-medium text-red-600 dark:text-red-400'>
							{formatCurrency(subscriptionCost, currency, locale)}
						</span>
					</div>
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Investment Value:</span>
						<span className='font-medium text-green-600 dark:text-green-400'>
							{formatCurrency(investmentValue, currency, locale)}
						</span>
					</div>
					<div className='border-t pt-2'>
						<div className='flex justify-between items-center'>
							<span className='font-medium'>Opportunity Cost:</span>
							<span
								className={`font-bold ${isPositiveSavings ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
								{isPositiveSavings ? '+' : ''}
								{formatCurrency(savings, currency, locale)}
							</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export default ProjectionCharts;
