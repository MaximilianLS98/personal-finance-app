'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubscriptionOverview, UpcomingPayments } from '@/app/components/subscriptions';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Plus, Settings, TrendingUp, Search } from 'lucide-react';
import Link from 'next/link';

/**
 * Main subscriptions dashboard page
 * Displays subscription overview, upcoming payments, and quick actions
 */
export default function SubscriptionsPage() {
	// Fetch subscriptions data
	const {
		data: subscriptionsResponse,
		isLoading,
		isError,
		error,
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

	return (
		<div className='max-w-7xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h2 className='text-2xl font-semibold mb-2'>Subscription Tracker</h2>
					<p className='text-muted-foreground'>
						Manage and monitor your recurring subscriptions
					</p>
				</div>
				<div className='flex gap-2'>
					<Button asChild variant='outline'>
						<Link href='/subscriptions/detect'>
							<Search className='mr-2 h-4 w-4' />
							Detect Subscriptions
						</Link>
					</Button>
					<Button asChild>
						<Link href='/subscriptions/new'>
							<Plus className='mr-2 h-4 w-4' />
							Add Subscription
						</Link>
					</Button>
				</div>
			</div>

			{/* Error Alert */}
			{isError && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{(error as Error)?.message || 'Failed to load subscription data'}
					</AlertDescription>
				</Alert>
			)}

			{/* Subscription Overview */}
			<SubscriptionOverview
				subscriptions={subscriptions}
				isLoading={isLoading}
				error={isError ? (error as Error)?.message : undefined}
			/>

			{/* Main Dashboard Grid */}
			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				{/* Upcoming Payments */}
				<UpcomingPayments
					subscriptions={subscriptions}
					daysAhead={30}
					isLoading={isLoading}
					error={isError ? (error as Error)?.message : undefined}
				/>

				{/* Quick Actions */}
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center gap-2'>
							<Settings className='h-5 w-5' />
							Quick Actions
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='grid grid-cols-1 gap-3'>
							<Button asChild variant='outline' className='justify-start'>
								<Link href='/subscriptions/manage'>
									<Settings className='mr-2 h-4 w-4' />
									Manage All Subscriptions
								</Link>
							</Button>
							<Button asChild variant='outline' className='justify-start'>
								<Link href='/subscriptions/projections'>
									<TrendingUp className='mr-2 h-4 w-4' />
									View Financial Projections
								</Link>
							</Button>
							<Button asChild variant='outline' className='justify-start'>
								<Link href='/subscriptions/insights'>
									<AlertCircle className='mr-2 h-4 w-4' />
									Cost Analysis & Insights
								</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Additional Information */}
			{!isLoading && subscriptions && subscriptions.length === 0 && (
				<Card className='border-dashed'>
					<CardContent className='flex flex-col items-center justify-center py-12'>
						<div className='text-center space-y-4'>
							<div className='mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center'>
								<Plus className='h-6 w-6 text-muted-foreground' />
							</div>
							<div>
								<h3 className='text-lg font-semibold'>No subscriptions yet</h3>
								<p className='text-muted-foreground'>
									Get started by adding your first subscription or detecting them
									from your transaction data.
								</p>
							</div>
							<div className='flex gap-2 justify-center'>
								<Button asChild>
									<Link href='/subscriptions/new'>Add Subscription</Link>
								</Button>
								<Button asChild variant='outline'>
									<Link href='/subscriptions/detect'>
										Detect from Transactions
									</Link>
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
