'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import {
	AlertCircle,
	ArrowLeft,
	TrendingUp,
	TrendingDown,
	AlertTriangle,
	CheckCircle,
	DollarSign,
	Calendar,
	Target,
	Lightbulb,
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/financial-calculator';
import { useCurrencySettings } from '@/app/providers';

interface InsightData {
	totalMonthlyCost: number;
	totalAnnualCost: number;
	subscriptionCount: number;
	averageMonthlyCost: number;
	highestCostSubscription: any;
	lowestCostSubscription: any;
	upcomingRenewals: any[];
	unusedSubscriptions: any[];
	categoryBreakdown: Array<{
		category: string;
		count: number;
		totalCost: number;
		percentage: number;
	}>;
	recommendations: Array<{
		type: 'cost_saving' | 'optimization' | 'warning' | 'opportunity';
		title: string;
		description: string;
		impact: 'high' | 'medium' | 'low';
		subscriptionId?: string;
	}>;
	trends: {
		monthlyGrowth: number;
		yearOverYearChange: number;
		projectedAnnualCost: number;
	};
}

/**
 * Cost analysis and recommendations page
 * Provides insights and recommendations for subscription optimization
 */
export default function InsightsPage() {
	const { currency, locale } = useCurrencySettings();

	// Fetch insights data
	const {
		data: insights,
		isLoading,
		isError,
		error,
	} = useQuery<InsightData>({
		queryKey: ['subscription-insights'],
		queryFn: async () => {
			const response = await fetch('/api/subscriptions/insights');
			if (!response.ok) {
				throw new Error('Failed to fetch subscription insights');
			}
			const result = await response.json();

			// Transform backend response to frontend interface
			if (result.success && result.data) {
				const {
					summary,
					categoryAnalysis,
					recommendations,
					insights: backendInsights,
					actionItems,
				} = result.data;

				// Find highest and lowest cost subscriptions from cost breakdown
				const topSubs = result.data.costBreakdown?.topSubscriptions || [];
				const highestCostSub = topSubs.length > 0 ? topSubs[0] : null;
				const lowestCostSub = topSubs.length > 0 ? topSubs[topSubs.length - 1] : null;

				return {
					totalMonthlyCost: summary.totalMonthlyCost,
					totalAnnualCost: summary.totalAnnualCost,
					subscriptionCount: summary.totalSubscriptions,
					averageMonthlyCost: summary.averageMonthlyCost,
					highestCostSubscription: highestCostSub
						? {
								id: highestCostSub.id,
								name: highestCostSub.name,
								amount: highestCostSub.monthlyAmount,
							}
						: null,
					lowestCostSubscription: lowestCostSub
						? {
								id: lowestCostSub.id,
								name: lowestCostSub.name,
								amount: lowestCostSub.monthlyAmount,
							}
						: null,
					// Transform upcoming payments from insights
					upcomingRenewals:
						backendInsights
							?.filter((insight: any) => insight.type === 'payment_alert')
							.map((insight: any) => ({
								name: insight.title,
								nextPaymentDate: new Date(), // Backend doesn't provide specific dates yet
								amount: insight.value,
								id: 'upcoming-' + Math.random(), // Temporary ID
							})) || [],
					// Transform unused subscriptions from insights
					unusedSubscriptions:
						backendInsights
							?.filter((insight: any) => insight.type === 'usage_optimization')
							.map((insight: any) => ({
								name: insight.title,
								amount: insight.value,
								lastUsedDate: null, // Backend doesn't provide this yet
								id: 'unused-' + Math.random(), // Temporary ID
							})) || [],
					categoryBreakdown:
						categoryAnalysis?.map((cat) => ({
							category: cat.category.name,
							count: cat.subscriptionCount,
							totalCost: cat.totalMonthlyCost,
							percentage: (cat.totalMonthlyCost / summary.totalMonthlyCost) * 100,
						})) || [],
					recommendations:
						recommendations?.map((rec) => ({
							type:
								rec.type === 'cost_reduction'
									? 'cost_saving'
									: rec.type === 'consolidation'
										? 'optimization'
										: rec.type === 'billing_optimization'
											? 'opportunity'
											: 'optimization',
							title: rec.title,
							description: rec.description,
							impact: rec.impact,
						})) || [],
					trends: {
						monthlyGrowth: 0, // Backend doesn't provide this yet
						yearOverYearChange: 0, // Backend doesn't provide this yet
						projectedAnnualCost: summary.totalAnnualCost,
					},
				};
			}

			throw new Error('Invalid response format');
		},
	});

	const getRecommendationIcon = (type: string) => {
		switch (type) {
			case 'cost_saving':
				return <DollarSign className='h-4 w-4' />;
			case 'optimization':
				return <Target className='h-4 w-4' />;
			case 'warning':
				return <AlertTriangle className='h-4 w-4' />;
			case 'opportunity':
				return <Lightbulb className='h-4 w-4' />;
			default:
				return <CheckCircle className='h-4 w-4' />;
		}
	};

	const getRecommendationVariant = (type: string, impact: string) => {
		if (type === 'warning') return 'destructive';
		if (impact === 'high') return 'default';
		if (impact === 'medium') return 'secondary';
		return 'outline';
	};

	const getImpactColor = (impact: string) => {
		switch (impact) {
			case 'high':
				return 'text-red-600 dark:text-red-400';
			case 'medium':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'low':
				return 'text-green-600 dark:text-green-400';
			default:
				return 'text-muted-foreground';
		}
	};

	// Loading state
	if (isLoading) {
		return (
			<div className='max-w-7xl mx-auto space-y-6'>
				<div className='animate-pulse'>
					<div className='h-8 bg-muted rounded w-1/3 mb-4'></div>
					<div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
						{[...Array(6)].map((_, i) => (
							<div key={i} className='h-32 bg-muted rounded'></div>
						))}
					</div>
				</div>
			</div>
		);
	}

	// Error state
	if (isError) {
		return (
			<div className='max-w-7xl mx-auto space-y-6'>
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{(error as Error)?.message || 'Failed to load subscription insights'}
					</AlertDescription>
				</Alert>
				<Button asChild>
					<Link href='/subscriptions'>
						<ArrowLeft className='mr-2 h-4 w-4' />
						Back to Subscriptions
					</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className='max-w-7xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center gap-4'>
				<Button asChild variant='ghost' size='sm'>
					<Link href='/subscriptions'>
						<ArrowLeft className='mr-2 h-4 w-4' />
						Back to Dashboard
					</Link>
				</Button>
				<div>
					<h2 className='text-2xl font-semibold mb-2'>Subscription Insights</h2>
					<p className='text-muted-foreground'>
						Cost analysis and optimization recommendations
					</p>
				</div>
			</div>

			{/* Key Metrics */}
			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
				<Card>
					<CardContent className='p-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm font-medium text-muted-foreground'>
									Monthly Total
								</p>
								<p className='text-2xl font-bold'>
									{formatCurrency(
										insights?.totalMonthlyCost || 0,
										currency,
										locale,
									)}
								</p>
							</div>
							<DollarSign className='h-8 w-8 text-blue-600' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='p-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm font-medium text-muted-foreground'>
									Annual Total
								</p>
								<p className='text-2xl font-bold'>
									{formatCurrency(
										insights?.totalAnnualCost || 0,
										currency,
										locale,
									)}
								</p>
							</div>
							<Calendar className='h-8 w-8 text-purple-600' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='p-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm font-medium text-muted-foreground'>
									Active Subscriptions
								</p>
								<p className='text-2xl font-bold'>
									{insights?.subscriptionCount || 0}
								</p>
							</div>
							<CheckCircle className='h-8 w-8 text-green-600' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='p-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm font-medium text-muted-foreground'>
									Average Monthly
								</p>
								<p className='text-2xl font-bold'>
									{formatCurrency(
										insights?.averageMonthlyCost || 0,
										currency,
										locale,
									)}
								</p>
							</div>
							<Target className='h-8 w-8 text-orange-600' />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Trends */}
			{insights?.trends && (
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<TrendingUp className='h-5 w-5' />
							Spending Trends
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
							<div className='text-center'>
								<div className='flex items-center justify-center gap-2 mb-2'>
									{insights.trends.monthlyGrowth >= 0 ? (
										<TrendingUp className='h-4 w-4 text-green-600' />
									) : (
										<TrendingDown className='h-4 w-4 text-red-600' />
									)}
									<span
										className={
											insights.trends.monthlyGrowth >= 0
												? 'text-green-600'
												: 'text-red-600'
										}>
										{insights.trends.monthlyGrowth >= 0 ? '+' : ''}
										{insights.trends.monthlyGrowth.toFixed(1)}%
									</span>
								</div>
								<p className='text-sm text-muted-foreground'>Monthly Growth</p>
							</div>
							<div className='text-center'>
								<div className='flex items-center justify-center gap-2 mb-2'>
									{insights.trends.yearOverYearChange >= 0 ? (
										<TrendingUp className='h-4 w-4 text-green-600' />
									) : (
										<TrendingDown className='h-4 w-4 text-red-600' />
									)}
									<span
										className={
											insights.trends.yearOverYearChange >= 0
												? 'text-green-600'
												: 'text-red-600'
										}>
										{insights.trends.yearOverYearChange >= 0 ? '+' : ''}
										{insights.trends.yearOverYearChange.toFixed(1)}%
									</span>
								</div>
								<p className='text-sm text-muted-foreground'>Year over Year</p>
							</div>
							<div className='text-center'>
								<div className='text-lg font-semibold mb-2'>
									{formatCurrency(
										insights.trends.projectedAnnualCost,
										currency,
										locale,
									)}
								</div>
								<p className='text-sm text-muted-foreground'>Projected Annual</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Category Breakdown */}
			{insights?.categoryBreakdown && insights.categoryBreakdown.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Spending by Category</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-4'>
							{insights.categoryBreakdown.map((category, index) => (
								<div
									key={index}
									className='flex items-center justify-between p-3 border rounded-lg'>
									<div className='flex-1'>
										<div className='flex items-center justify-between mb-1'>
											<span className='font-medium'>{category.category}</span>
											<span className='text-sm text-muted-foreground'>
												{category.count} subscription
												{category.count !== 1 ? 's' : ''}
											</span>
										</div>
										<div className='flex items-center gap-4'>
											<div className='flex-1 bg-muted rounded-full h-2'>
												<div
													className='bg-primary rounded-full h-2 transition-all'
													style={{
														width: `${category.percentage}%`,
													}}></div>
											</div>
											<span className='text-sm font-medium'>
												{formatCurrency(
													category.totalCost,
													currency,
													locale,
												)}
											</span>
											<span className='text-sm text-muted-foreground'>
												{category.percentage.toFixed(1)}%
											</span>
										</div>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Recommendations */}
			{insights?.recommendations && insights.recommendations.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Lightbulb className='h-5 w-5' />
							Recommendations
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-4'>
							{insights.recommendations.map((recommendation, index) => (
								<div
									key={index}
									className='flex items-start gap-4 p-4 border rounded-lg'>
									<div className='flex-shrink-0 mt-1'>
										{getRecommendationIcon(recommendation.type)}
									</div>
									<div className='flex-1 min-w-0'>
										<div className='flex items-center gap-2 mb-2'>
											<h4 className='font-medium'>{recommendation.title}</h4>
											<Badge
												variant={getRecommendationVariant(
													recommendation.type,
													recommendation.impact,
												)}
												className='text-xs'>
												{recommendation.impact} impact
											</Badge>
										</div>
										<p className='text-sm text-muted-foreground mb-3'>
											{recommendation.description}
										</p>
										{recommendation.subscriptionId && (
											<Button asChild variant='outline' size='sm'>
												<Link
													href={`/subscriptions/${recommendation.subscriptionId}`}>
													View Subscription
												</Link>
											</Button>
										)}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Upcoming Renewals */}
			{insights?.upcomingRenewals && insights.upcomingRenewals.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Calendar className='h-5 w-5' />
							Upcoming Renewals
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-3'>
							{insights.upcomingRenewals.map((renewal, index) => (
								<div
									key={index}
									className='flex items-center justify-between p-3 border rounded-lg'>
									<div>
										<h4 className='font-medium'>{renewal.name}</h4>
										<p className='text-sm text-muted-foreground'>
											{new Date(renewal.nextPaymentDate).toLocaleDateString(
												locale,
											)}{' '}
											•{formatCurrency(renewal.amount, currency, locale)}
										</p>
									</div>
									<Button asChild variant='outline' size='sm'>
										<Link href={`/subscriptions/${renewal.id}`}>Review</Link>
									</Button>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Unused Subscriptions */}
			{insights?.unusedSubscriptions && insights.unusedSubscriptions.length > 0 && (
				<Card className='border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2 text-yellow-800 dark:text-yellow-200'>
							<AlertTriangle className='h-5 w-5' />
							Potentially Unused Subscriptions
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-3'>
							{insights.unusedSubscriptions.map((subscription, index) => (
								<div
									key={index}
									className='flex items-center justify-between p-3 border border-yellow-200 dark:border-yellow-800 rounded-lg bg-white dark:bg-gray-900'>
									<div>
										<h4 className='font-medium'>{subscription.name}</h4>
										<p className='text-sm text-muted-foreground'>
											{formatCurrency(subscription.amount, currency, locale)}{' '}
											• Last used:{' '}
											{subscription.lastUsedDate
												? new Date(
														subscription.lastUsedDate,
													).toLocaleDateString(locale)
												: 'Never'}
										</p>
									</div>
									<div className='flex gap-2'>
										<Button asChild variant='outline' size='sm'>
											<Link href={`/subscriptions/${subscription.id}`}>
												Review
											</Link>
										</Button>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Export and Actions */}
			<Card className='border-dashed'>
				<CardContent className='pt-6'>
					<div className='text-center space-y-4'>
						<h3 className='text-lg font-semibold'>Take Action</h3>
						<p className='text-muted-foreground'>
							Use these insights to optimize your subscription spending
						</p>
						<div className='flex gap-2 justify-center'>
							<Button asChild>
								<Link href='/subscriptions/projections'>View Projections</Link>
							</Button>
							<Button asChild variant='outline'>
								<Link href='/subscriptions/manage'>Manage Subscriptions</Link>
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
