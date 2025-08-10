'use client';

import React, { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProjectionCalculator, ProjectionCharts } from '@/app/components/subscriptions';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, TrendingUp, Download } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * Financial projection tools page
 * Displays interactive projection calculator with investment comparison charts
 */
export default function ProjectionsPage() {
	return (
		<Suspense fallback={<div className='max-w-7xl mx-auto p-6'>Loading...</div>}>
			<ProjectionsContent />
		</Suspense>
	);
}

function ProjectionsContent() {
	const searchParams = useSearchParams();
	const selectedSubscriptionId = searchParams.get('id');
	const [selectedSubscriptions, setSelectedSubscriptions] = useState<string[]>(
		selectedSubscriptionId ? [selectedSubscriptionId] : [],
	);
	const [projectionYears, setProjectionYears] = useState([1, 5, 10, 20]);
	const [annualReturnRate, setAnnualReturnRate] = useState(7);

	// Fetch subscriptions data
	const {
		data: subscriptionsResponse,
		isLoading: subscriptionsLoading,
		isError: subscriptionsError,
		error: subscriptionsErrorMessage,
	} = useQuery({
		queryKey: ['subscriptions'],
		queryFn: async () => {
			const response = await fetch('/api/subscriptions');
			if (!response.ok) {
				throw new Error('Failed to fetch subscriptions');
			}
			return response.json();
		},
	});

	const subscriptions = subscriptionsResponse?.data || [];

	// Fetch projection data for selected subscriptions
	const {
		data: projectionData,
		isLoading: projectionLoading,
		isError: projectionError,
		error: projectionErrorMessage,
	} = useQuery({
		queryKey: ['projections', selectedSubscriptions, projectionYears, annualReturnRate],
		queryFn: async () => {
			if (selectedSubscriptions.length === 0) return null;

			const promises = selectedSubscriptions.map(async (id) => {
				const response = await fetch(
					`/api/subscriptions/projections/${id}?years=${projectionYears.join(',')}&returnRate=${annualReturnRate}`,
				);
				if (!response.ok) {
					throw new Error(`Failed to fetch projections for subscription ${id}`);
				}
				return response.json();
			});

			const results = await Promise.all(promises);
			return results;
		},
		enabled: selectedSubscriptions.length > 0,
	});

	const handleSubscriptionSelectionChange = (subscriptionIds: string[]) => {
		setSelectedSubscriptions(subscriptionIds);
	};

	const handleProjectionSettingsChange = (years: number[], returnRate: number) => {
		setProjectionYears(years);
		setAnnualReturnRate(returnRate);
	};

	const handleExportData = () => {
		if (!projectionData) return;

		// Create CSV data
		const csvData = projectionData.flatMap((projection: any, index: number) => {
			const subscription = subscriptions?.find(
				(sub: any) => sub.id === selectedSubscriptions[index],
			);
			return projectionYears.map((year) => ({
				subscription: subscription?.name || 'Unknown',
				year,
				subscriptionCost:
					projection.subscriptionCost[`${year}Year${year === 1 ? '' : 's'}`] || 0,
				investmentValue:
					projection.investmentValue[`${year}Year${year === 1 ? '' : 's'}`] || 0,
				potentialSavings:
					projection.potentialSavings[`${year}Year${year === 1 ? '' : 's'}`] || 0,
			}));
		});

		// Convert to CSV string
		const headers = [
			'Subscription',
			'Years',
			'Subscription Cost',
			'Investment Value',
			'Opportunity Cost',
		];
		const csvContent = [
			headers.join(','),
			...csvData.map((row) =>
				[
					row.subscription,
					row.year,
					row.subscriptionCost,
					row.investmentValue,
					row.potentialSavings,
				].join(','),
			),
		].join('\n');

		// Download CSV
		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `subscription-projections-${new Date().toISOString().split('T')[0]}.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	};

	return (
		<div className='max-w-7xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-4'>
					<Button asChild variant='ghost' size='sm'>
						<Link href='/subscriptions'>
							<ArrowLeft className='mr-2 h-4 w-4' />
							Back to Dashboard
						</Link>
					</Button>
					<div>
						<h2 className='text-2xl font-semibold mb-2'>Financial Projections</h2>
						<p className='text-muted-foreground'>
							Compare subscription costs with investment opportunities
						</p>
					</div>
				</div>
				{projectionData && (
					<Button onClick={handleExportData} variant='outline'>
						<Download className='mr-2 h-4 w-4' />
						Export Data
					</Button>
				)}
			</div>

			{/* Error Alert */}
			{(subscriptionsError || projectionError) && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{(projectionErrorMessage as Error)?.message ||
							(subscriptionsErrorMessage as Error)?.message ||
							'Failed to load data'}
					</AlertDescription>
				</Alert>
			)}

			{/* Projection Calculator */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<TrendingUp className='h-5 w-5' />
						Projection Calculator
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ProjectionCalculator
						subscription={subscriptions.find((sub: any) =>
							selectedSubscriptions.includes(sub.id),
						)}
						isLoading={subscriptionsLoading}
					/>
				</CardContent>
			</Card>

			{/* Projection Charts */}
			{projectionData && projectionData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Investment Comparison Charts</CardTitle>
					</CardHeader>
					<CardContent>
						<ProjectionCharts
							subscriptions={subscriptions?.filter((sub: any) =>
								selectedSubscriptions.includes(sub.id),
							)}
							investmentReturnRate={annualReturnRate / 100}
							isLoading={projectionLoading}
						/>
					</CardContent>
				</Card>
			)}

			{/* Disclaimer */}
			<Card className='border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'>
				<CardContent className='pt-6'>
					<div className='text-sm text-yellow-800 dark:text-yellow-200 space-y-2'>
						<h4 className='font-medium flex items-center gap-2'>
							<AlertCircle className='h-4 w-4' />
							Investment Disclaimer
						</h4>
						<div className='space-y-1'>
							<p>
								The projections shown are estimates based on historical market
								averages and should not be considered as financial advice or
								guaranteed returns.
							</p>
							<ul className='list-disc list-inside space-y-1 ml-4'>
								<li>Past performance does not guarantee future results</li>
								<li>
									Investment returns can vary significantly and may include losses
								</li>
								<li>
									Consider consulting with a financial advisor for personalized
									advice
								</li>
								<li>
									Market conditions, inflation, and fees can affect actual returns
								</li>
							</ul>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Help Information */}
			<Card className='border-dashed'>
				<CardContent className='pt-6'>
					<div className='text-sm text-muted-foreground space-y-4'>
						<h4 className='font-medium text-foreground'>
							How to use the projection calculator:
						</h4>
						<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
							<div>
								<h5 className='font-medium text-foreground mb-2'>
									Select Subscriptions
								</h5>
								<ul className='list-disc list-inside space-y-1'>
									<li>Choose one or more subscriptions to analyze</li>
									<li>Compare individual subscriptions or groups</li>
									<li>See combined impact of multiple subscriptions</li>
								</ul>
							</div>
							<div>
								<h5 className='font-medium text-foreground mb-2'>
									Adjust Settings
								</h5>
								<ul className='list-disc list-inside space-y-1'>
									<li>Set projection time horizons (1-20 years)</li>
									<li>Adjust expected annual return rate</li>
									<li>Default 7% reflects historical market averages</li>
								</ul>
							</div>
						</div>
						<div className='bg-blue-50 dark:bg-blue-950 p-4 rounded-lg'>
							<p className='text-blue-800 dark:text-blue-200'>
								<strong>Understanding Opportunity Cost:</strong> A $15/month
								subscription costs $180/year. Over 10 years, you'll spend $1,800 on
								subscriptions. If you invested that same $15/month at 7% annual
								return instead, it could grow to approximately $2,484. The $684
								difference is your opportunity cost - what you're giving up by
								choosing subscriptions over investing.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
