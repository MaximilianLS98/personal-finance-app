'use client';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import { useQueryClient } from '@tanstack/react-query';
import FinancialSummary from '../components/FinancialSummary';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSummaryQuery } from '@/lib/queries';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useCallback } from 'react';
import FileUpload from '../components/FileUpload';

export default function Home() {
	const { data: summary, isLoading, refetch, isError } = useSummaryQuery();
	const queryClient = useQueryClient();
	const handleUploadSuccess = useCallback(
		() => invalidateFinanceQueries(queryClient),
		[queryClient],
	);

	return (
		<div className='max-w-6xl mx-auto space-y-8'>
			{/* Header Section */}
			<div className='text-center'>
				<h2 className='text-2xl font-semibold mb-4'>Welcome to CSV Finance Tracker</h2>
				<p className='text-muted-foreground'>
					Upload your monthly bank CSV file to get started with tracking your finances
				</p>
			</div>

			{/* Main Content Grid */}
			<div className='grid gap-6 lg:grid-cols-2'>
				{/* File Upload Section */}
				<Card>
					<CardHeader>
						<CardTitle>Upload CSV File</CardTitle>
						<CardDescription>Import your bank transaction data</CardDescription>
					</CardHeader>
					<CardContent>
						<FileUpload onUploadSuccess={handleUploadSuccess} onUploadError={() => void 0} />
					</CardContent>
				</Card>

				{/* Quick Stats Card */}
				<Card>
					<CardHeader>
						<CardTitle>Quick Stats</CardTitle>
						<CardDescription>Overview of your uploaded data</CardDescription>
					</CardHeader>
					<CardContent>
						<div className='space-y-2'>
							{/* This could be extended with more client-side stats if needed */}
							<div className='flex justify-between'>
								<span className='text-sm text-muted-foreground'>Summary Available:</span>
								<span className='text-sm font-medium'>
									{summary ? 'Yes' : isLoading ? 'Loading…' : 'No'}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Financial Summary Section */}
			<div className='space-y-4'>
				<div className='flex items-center justify-between'>
					<h3 className='text-xl font-semibold'>Financial Summary</h3>
					{isError && (
						<Button variant='outline' size='sm' onClick={() => refetch()} disabled={isLoading}>
							<RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
							Retry
						</Button>
					)}
				</div>

				{/* Summary Error Alert */}
				{isError && (
					<Alert variant='destructive'>
						<AlertCircle className='h-4 w-4' />
						<AlertDescription>Failed to load financial summary</AlertDescription>
					</Alert>
				)}

				{/* Financial Summary Component */}
				<FinancialSummary summary={summary || undefined} isLoading={isLoading} />
			</div>
		</div>
	);
}
