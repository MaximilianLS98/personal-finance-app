/**
 * Budget Analytics Page
 * Detailed analysis of budget performance including variance, projections, and insights
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
	ArrowLeft,
	TrendingUp,
	TrendingDown,
	AlertTriangle,
	Calendar,
	Target,
	DollarSign,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { Budget, BudgetProgress, VarianceAnalysis } from '@/lib/types';

interface BudgetAnalytics {
	budget: Budget;
	progress: BudgetProgress;
	variance: VarianceAnalysis;
	projection: {
		projectedEndDate: Date;
		projectedTotalSpent: number;
		riskLevel: 'low' | 'medium' | 'high';
		daysUntilDepletion: number | null;
		recommendedDailySpend: number;
	};
}

export default function BudgetAnalyticsPage() {
	const params = useParams();
	const router = useRouter();
	const budgetId = params.id as string;

	// Fetch budget analytics
	const {
		data: analytics,
		isLoading,
		error,
	} = useQuery<BudgetAnalytics>({
		queryKey: ['budget-analytics', budgetId],
		queryFn: async () => {
			const response = await fetch(`/api/budgets/${budgetId}/analytics`);
			if (!response.ok) {
				throw new Error('Failed to fetch budget analytics');
			}
			const result = await response.json();
			return result.data;
		},
	});

	if (isLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='animate-pulse space-y-4'>
					<div className='h-8 bg-gray-200 rounded w-1/4'></div>
					<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
						{[1, 2, 3].map((i) => (
							<div key={i} className='h-32 bg-gray-200 rounded'></div>
						))}
					</div>
					<div className='h-96 bg-gray-200 rounded'></div>
				</div>
			</div>
		);
	}

	if (error || !analytics) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='text-center py-8'>
					<p className='text-red-600 mb-4'>Error loading budget analytics</p>
					<Button onClick={() => router.back()}>Go Back</Button>
				</div>
			</div>
		);
	}

	const { budget, progress, variance, projection } = analytics;

	// Risk level styling
	const getRiskColor = (level: string) => {
		switch (level) {
			case 'low':
				return 'text-green-600';
			case 'medium':
				return 'text-yellow-600';
			case 'high':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	};

	const getRiskIcon = (level: string) => {
		switch (level) {
			case 'low':
				return <TrendingUp className='w-4 h-4' />;
			case 'medium':
				return <AlertTriangle className='w-4 h-4' />;
			case 'high':
				return <TrendingDown className='w-4 h-4' />;
			default:
				return <DollarSign className='w-4 h-4' />;
		}
	};

	return (
		<div className='container mx-auto px-4 py-8'>
			{/* Header */}
			<div className='flex items-center mb-8'>
				<Button variant='ghost' size='sm' onClick={() => router.back()} className='mr-4'>
					<ArrowLeft className='w-4 h-4 mr-2' />
					Back
				</Button>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>{budget.name} Analytics</h1>
					<p className='text-muted-foreground mt-2'>
						Detailed performance analysis and spending insights
					</p>
				</div>
			</div>

			{/* Key Metrics */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-8'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Current Progress</CardTitle>
						<Target className='w-4 h-4 text-muted-foreground' />
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{progress.percentageSpent.toFixed(1)}%
						</div>
						<Progress
							value={Math.min(progress.percentageSpent, 100)}
							className='mt-2'
						/>
						<p className='text-xs text-muted-foreground mt-1'>
							{progress.currentSpent.toLocaleString('nb-NO', {
								style: 'currency',
								currency: 'NOK',
							})}{' '}
							of{' '}
							{budget.amount.toLocaleString('nb-NO', {
								style: 'currency',
								currency: 'NOK',
							})}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Projected Total</CardTitle>
						<TrendingUp className='w-4 h-4 text-muted-foreground' />
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{projection.projectedTotalSpent.toLocaleString('nb-NO', {
								style: 'currency',
								currency: 'NOK',
							})}
						</div>
						<p className='text-xs text-muted-foreground'>
							{((projection.projectedTotalSpent / budget.amount) * 100).toFixed(1)}%
							of budget
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Risk Level</CardTitle>
						{getRiskIcon(projection.riskLevel)}
					</CardHeader>
					<CardContent>
						<Badge
							variant={
								projection.riskLevel === 'low'
									? 'default'
									: projection.riskLevel === 'medium'
										? 'secondary'
										: 'destructive'
							}
							className='text-sm'>
							{projection.riskLevel.toUpperCase()}
						</Badge>
						<p className='text-xs text-muted-foreground mt-2'>
							{projection.daysUntilDepletion
								? `Budget depleted in ${projection.daysUntilDepletion} days`
								: 'On track to stay within budget'}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Recommended Daily</CardTitle>
						<Calendar className='w-4 h-4 text-muted-foreground' />
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{projection.recommendedDailySpend.toLocaleString('nb-NO', {
								style: 'currency',
								currency: 'NOK',
							})}
						</div>
						<p className='text-xs text-muted-foreground'>To stay within budget</p>
					</CardContent>
				</Card>
			</div>

			{/* Detailed Analytics */}
			<Tabs defaultValue='variance' className='w-full'>
				<TabsList className='grid w-full grid-cols-3'>
					<TabsTrigger value='variance'>Variance Analysis</TabsTrigger>
					<TabsTrigger value='insights'>Insights</TabsTrigger>
					<TabsTrigger value='breakdown'>Spending Breakdown</TabsTrigger>
				</TabsList>

				{/* Variance Analysis */}
				<TabsContent value='variance'>
					<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
						{/* Overall Variance */}
						<Card>
							<CardHeader>
								<CardTitle>Overall Performance</CardTitle>
								<CardDescription>
									Summary of budget vs actual spending
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='space-y-4'>
									<div className='grid grid-cols-2 gap-4'>
										<div>
											<p className='text-sm text-muted-foreground'>
												Average Variance
											</p>
											<p className='text-lg font-medium'>
												{variance.overallVariance.averageVariance.toLocaleString(
													'nb-NO',
													{
														style: 'currency',
														currency: 'NOK',
													},
												)}
											</p>
										</div>
										<div>
											<p className='text-sm text-muted-foreground'>
												Total Overspend
											</p>
											<p className='text-lg font-medium text-red-600'>
												{variance.overallVariance.totalOverspend.toLocaleString(
													'nb-NO',
													{
														style: 'currency',
														currency: 'NOK',
													},
												)}
											</p>
										</div>
									</div>
									<div className='grid grid-cols-2 gap-4'>
										<div>
											<p className='text-sm text-muted-foreground'>
												Variance Std Dev
											</p>
											<p className='text-lg font-medium'>
												{variance.overallVariance.varianceStdDev.toLocaleString(
													'nb-NO',
													{
														style: 'currency',
														currency: 'NOK',
													},
												)}
											</p>
										</div>
										<div>
											<p className='text-sm text-muted-foreground'>
												Total Underspend
											</p>
											<p className='text-lg font-medium text-green-600'>
												{variance.overallVariance.totalUnderspend.toLocaleString(
													'nb-NO',
													{
														style: 'currency',
														currency: 'NOK',
													},
												)}
											</p>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Monthly Variance */}
						<Card>
							<CardHeader>
								<CardTitle>Monthly Breakdown</CardTitle>
								<CardDescription>Month-by-month variance analysis</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='space-y-3'>
									{variance.monthlyVariances.slice(-6).map((month) => (
										<div
											key={month.month}
											className='flex items-center justify-between p-2 border rounded'>
											<div>
												<p className='font-medium'>{month.month}</p>
												<p className='text-sm text-muted-foreground'>
													{month.actual.toLocaleString('nb-NO', {
														style: 'currency',
														currency: 'NOK',
													})}{' '}
													spent
												</p>
											</div>
											<div className='text-right'>
												<p
													className={`font-medium ${month.variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
													{month.variance > 0 ? '+' : ''}
													{month.variance.toLocaleString('nb-NO', {
														style: 'currency',
														currency: 'NOK',
													})}
												</p>
												<p className='text-sm text-muted-foreground'>
													{month.variancePercentage > 0 ? '+' : ''}
													{month.variancePercentage.toFixed(1)}%
												</p>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				{/* Insights */}
				<TabsContent value='insights'>
					<Card>
						<CardHeader>
							<CardTitle>AI-Generated Insights</CardTitle>
							<CardDescription>
								Patterns and recommendations based on your spending behavior
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className='space-y-4'>
								{variance.insights.map((insight, index) => (
									<div
										key={index}
										className='flex items-start p-4 border rounded-lg'>
										<AlertTriangle className='w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0' />
										<p className='text-sm leading-relaxed'>{insight}</p>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* Spending Breakdown */}
				<TabsContent value='breakdown'>
					<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
						{/* Current Period */}
						<Card>
							<CardHeader>
								<CardTitle>Current Period Breakdown</CardTitle>
								<CardDescription>How your money is being allocated</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='space-y-4'>
									<div className='flex justify-between items-center p-3 bg-blue-50 rounded'>
										<span className='font-medium'>Subscription Costs</span>
										<span className='font-bold'>
											{progress.subscriptionAllocated.toLocaleString(
												'nb-NO',
												{
													style: 'currency',
													currency: 'NOK',
												},
											)}
										</span>
									</div>
									<div className='flex justify-between items-center p-3 bg-green-50 rounded'>
										<span className='font-medium'>Variable Spending</span>
										<span className='font-bold'>
											{progress.variableSpent.toLocaleString('nb-NO', {
												style: 'currency',
												currency: 'NOK',
											})}
										</span>
									</div>
									<div className='flex justify-between items-center p-3 bg-gray-50 rounded'>
										<span className='font-medium'>Remaining Budget</span>
										<span className='font-bold text-green-600'>
											{progress.remainingAmount.toLocaleString('nb-NO', {
												style: 'currency',
												currency: 'NOK',
											})}
										</span>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Daily Spending */}
						<Card>
							<CardHeader>
								<CardTitle>Spending Rate</CardTitle>
								<CardDescription>
									Daily spending patterns and recommendations
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='space-y-4'>
									<div>
										<p className='text-sm text-muted-foreground'>
											Current Daily Average
										</p>
										<p className='text-2xl font-bold'>
											{progress.averageDailySpend.toLocaleString('nb-NO', {
												style: 'currency',
												currency: 'NOK',
											})}
										</p>
									</div>
									<div>
										<p className='text-sm text-muted-foreground'>
											Recommended Daily Limit
										</p>
										<p className='text-2xl font-bold text-blue-600'>
											{projection.recommendedDailySpend.toLocaleString(
												'nb-NO',
												{
													style: 'currency',
													currency: 'NOK',
												},
											)}
										</p>
									</div>
									<div className='pt-2 border-t'>
										<p className='text-sm text-muted-foreground mb-2'>
											Days Remaining
										</p>
										<div className='flex items-center justify-between'>
											<span className='text-lg font-medium'>
												{progress.daysRemaining} days
											</span>
											<Badge variant='outline'>
												{Math.round((progress.daysRemaining / 30) * 100)}%
												of period left
											</Badge>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
