/**
 * Budget Management Dashboard
 * Main page for viewing and managing budgets with progress tracking
 */

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { Budget, BudgetProgress } from '@/lib/types';
import type { Category } from '@/lib/types';

interface BudgetDashboardData {
	activeBudgets: Budget[];
	budgetProgress: BudgetProgress[];
	totalBudgeted: number;
	totalSpent: number;
	overallStatus: 'on-track' | 'at-risk' | 'over-budget';
	alerts: Array<{
		id: string;
		message: string;
		alertType: string;
		isRead: boolean;
	}>;
}

export default function BudgetsPage() {
	const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
	const queryClient = useQueryClient();
	const router = useRouter();

	// Load categories to display category names on cards
	const { data: categories } = useQuery<Category[]>({
		queryKey: ['categories'],
		queryFn: async () => {
			const res = await fetch('/api/categories');
			if (!res.ok) throw new Error('Failed to fetch categories');
			const body = await res.json();
			return Array.isArray(body) ? body : body.data;
		},
	});

	const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));

	// Fetch dashboard data
	const {
		data: dashboardData,
		isLoading,
		error,
	} = useQuery<BudgetDashboardData>({
		queryKey: ['budget-dashboard'],
		queryFn: async () => {
			const response = await fetch('/api/budgets/dashboard');
			if (!response.ok) {
				throw new Error('Failed to fetch dashboard data');
			}
			const result = await response.json();
			return result.data;
		},
		refetchInterval: 30000, // Refresh every 30 seconds
	});

	// Status color mapping
	const getStatusColor = (status: BudgetProgress['status']) => {
		switch (status) {
			case 'on-track':
				return 'text-green-600';
			case 'at-risk':
				return 'text-yellow-600';
			case 'over-budget':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	};

	const getStatusIcon = (status: BudgetProgress['status']) => {
		switch (status) {
			case 'on-track':
				return <TrendingUp className='w-4 h-4' />;
			case 'at-risk':
				return <AlertTriangle className='w-4 h-4' />;
			case 'over-budget':
				return <TrendingDown className='w-4 h-4' />;
			default:
				return <DollarSign className='w-4 h-4' />;
		}
	};

	const isIndefiniteDate = (dateLike: string | Date) => {
		const d = new Date(dateLike);
		return d.getFullYear() >= 9999;
	};

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

	if (error) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='text-center py-8'>
					<p className='text-red-600 mb-4'>Error loading budget data</p>
					<Button
						onClick={() =>
							queryClient.invalidateQueries({ queryKey: ['budget-dashboard'] })
						}>
						Retry
					</Button>
				</div>
			</div>
		);
	}

	if (!dashboardData) {
		return <div className='container mx-auto px-4 py-8'>No data available</div>;
	}

	const { activeBudgets, budgetProgress, totalBudgeted, totalSpent, overallStatus, alerts } =
		dashboardData;

	return (
		<div className='container mx-auto px-4 py-8'>
			{/* Header */}
			<div className='flex justify-between items-center mb-8'>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>Budget Management</h1>
					<p className='text-muted-foreground mt-2'>
						Track your spending and stay within your financial goals
					</p>
				</div>
				<div className='flex gap-2'>
					<Button variant='outline' onClick={() => router.push('/budgets/scenarios')}>
						<Settings className='w-4 h-4 mr-2' />
						Scenarios
					</Button>
					<Button onClick={() => router.push('/budgets/new')}>
						<Plus className='w-4 h-4 mr-2' />
						New Budget
					</Button>
				</div>
			</div>

			{/* Summary Cards */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-8'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Total Budgeted</CardTitle>
						<DollarSign className='w-4 h-4 text-muted-foreground' />
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{totalBudgeted.toLocaleString('nb-NO', {
								style: 'currency',
								currency: 'NOK',
							})}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Total Spent</CardTitle>
						<TrendingUp className='w-4 h-4 text-muted-foreground' />
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{totalSpent.toLocaleString('nb-NO', {
								style: 'currency',
								currency: 'NOK',
							})}
						</div>
						<p className='text-xs text-muted-foreground'>
							{((totalSpent / Math.max(totalBudgeted, 1)) * 100).toFixed(1)}% of
							budget
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Remaining</CardTitle>
						<TrendingDown className='w-4 h-4 text-muted-foreground' />
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{(totalBudgeted - totalSpent).toLocaleString('nb-NO', {
								style: 'currency',
								currency: 'NOK',
							})}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
						<CardTitle className='text-sm font-medium'>Overall Status</CardTitle>
						{getStatusIcon(overallStatus)}
					</CardHeader>
					<CardContent>
						<Badge
							variant={
								overallStatus === 'on-track'
									? 'default'
									: overallStatus === 'at-risk'
										? 'secondary'
										: 'destructive'
							}
							className='text-sm'>
							{overallStatus
								.replace('-', ' ')
								.replace(/\b\w/g, (l) => l.toUpperCase())}
						</Badge>
					</CardContent>
				</Card>
			</div>

			{/* Alerts */}
			{alerts.length > 0 && (
				<Card className='mb-8 border-yellow-200 bg-yellow-50'>
					<CardHeader>
						<CardTitle className='flex items-center text-yellow-800'>
							<AlertTriangle className='w-5 h-5 mr-2' />
							Budget Alerts ({alerts.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-2'>
							{alerts.slice(0, 3).map((alert) => (
								<div
									key={alert.id}
									className='flex items-center justify-between p-2 bg-white rounded border'>
									<span className='text-sm text-yellow-800'>{alert.message}</span>
									<Badge variant='outline' className='text-xs'>
										{alert.alertType}
									</Badge>
								</div>
							))}
							{alerts.length > 3 && (
								<p className='text-xs text-yellow-700'>
									+{alerts.length - 3} more alerts
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Budget Cards */}
			<Tabs
				value={viewMode}
				onValueChange={(value) => setViewMode(value as 'monthly' | 'yearly')}>
				<div className='flex items-center justify-between mb-6'>
					<TabsList>
						<TabsTrigger value='monthly'>Monthly Budgets</TabsTrigger>
						<TabsTrigger value='yearly'>Yearly Budgets</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value={viewMode}>
					{budgetProgress.length === 0 ? (
						<Card>
							<CardContent className='flex flex-col items-center justify-center py-16'>
								<DollarSign className='w-12 h-12 text-muted-foreground mb-4' />
								<h3 className='text-lg font-semibold mb-2'>
									No {viewMode} budgets found
								</h3>
								<p className='text-muted-foreground text-center mb-4'>
									Create your first {viewMode} budget to start tracking your
									spending goals.
								</p>
								<Button onClick={() => router.push('/budgets/new')}>
									<Plus className='w-4 h-4 mr-2' />
									Create Budget
								</Button>
							</CardContent>
						</Card>
					) : (
						<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
							{budgetProgress
								.filter((progress) => progress.budget.period === viewMode)
								.map((progress) => (
									<Card
										key={progress.budgetId}
										className='hover:shadow-md transition-shadow'>
										<CardHeader>
											<div className='flex items-center justify-between'>
												<CardTitle className='text-lg flex items-center gap-2'>
													{progress.budget.name}
													<span className='text-xs text-muted-foreground'>
														•{' '}
														{categoryNameById.get(
															progress.budget.categoryId,
														) ?? 'Unknown category'}
													</span>
												</CardTitle>
												<Badge
													variant={
														progress.status === 'on-track'
															? 'default'
															: progress.status === 'at-risk'
																? 'secondary'
																: 'destructive'
													}>
													{progress.status.replace('-', ' ')}
												</Badge>
											</div>
											{progress.budget.description && (
												<CardDescription>
													{progress.budget.description}
												</CardDescription>
											)}
											<div className='mt-2 flex gap-2'>
												<Button
													variant='outline'
													size='sm'
													onClick={() =>
														router.push(
															`/budgets/${progress.budgetId}/edit`,
														)
													}>
													Edit
												</Button>
												<Button
													variant='ghost'
													size='sm'
													onClick={() =>
														router.push(
															`/budgets/${progress.budgetId}/analytics`,
														)
													}>
													View Analytics
												</Button>
											</div>
										</CardHeader>
										<CardContent>
											<div className='space-y-4'>
												{/* Progress Bar */}
												<div>
													<div className='flex justify-between text-sm mb-2'>
														<span>
															Spent:{' '}
															{progress.currentSpent.toLocaleString(
																'nb-NO',
																{
																	style: 'currency',
																	currency: 'NOK',
																},
															)}
														</span>
														<span>
															Budget:{' '}
															{progress.budget.amount.toLocaleString(
																'nb-NO',
																{
																	style: 'currency',
																	currency: 'NOK',
																},
															)}
														</span>
													</div>
													<Progress
														value={Math.min(
															progress.percentageSpent,
															100,
														)}
														className={`h-2 ${
															progress.status === 'over-budget'
																? '[&>div]:bg-red-500'
																: progress.status === 'at-risk'
																	? '[&>div]:bg-yellow-500'
																	: '[&>div]:bg-green-500'
														}`}
													/>
													<div className='flex justify-between text-xs text-muted-foreground mt-1'>
														<span>
															{progress.percentageSpent.toFixed(1)}%
															used
														</span>
														<span>
															{isIndefiniteDate(
																progress.budget.endDate,
															)
																? 'ongoing'
																: `${progress.daysRemaining} days left`}
														</span>
													</div>
												</div>

												{/* Stats */}
												<div className='grid grid-cols-2 gap-4 text-sm'>
													<div>
														<p className='text-muted-foreground'>
															Remaining
														</p>
														<p className='font-medium'>
															{progress.remainingAmount.toLocaleString(
																'nb-NO',
																{
																	style: 'currency',
																	currency: 'NOK',
																},
															)}
														</p>
													</div>
													<div>
														<p className='text-muted-foreground'>
															Daily Average
														</p>
														<p className='font-medium'>
															{progress.averageDailySpend.toLocaleString(
																'nb-NO',
																{
																	style: 'currency',
																	currency: 'NOK',
																},
															)}
														</p>
													</div>
												</div>

												{/* Projected spending warning */}
												{progress.projectedSpent >
													progress.budget.amount && (
													<div className='flex items-center p-2 bg-red-50 rounded border border-red-200'>
														<AlertTriangle className='w-4 h-4 text-red-600 mr-2' />
														<span className='text-xs text-red-800'>
															Projected to exceed budget by{' '}
															{(
																progress.projectedSpent -
																progress.budget.amount
															).toLocaleString('nb-NO', {
																style: 'currency',
																currency: 'NOK',
															})}
														</span>
													</div>
												)}
											</div>
										</CardContent>
									</Card>
								))}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
