'use client';

import { useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import FileUpload from '../components/FileUpload';
import FinancialSummary from '../components/FinancialSummary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Transaction } from '@/lib/types';
import { useSummaryQuery, useUploadMutation } from '@/lib/queries';

export default function Home() {
	const { data: summary, isLoading, error, refetch, isError } = useSummaryQuery();
	const upload = useUploadMutation();

	const uploadStatus = useMemo(() => {
		if (upload.isPending) return { text: 'Uploading...', type: 'info' as const };
		if (upload.isError)
			return {
				text: (upload.error as Error)?.message || 'Upload failed',
				type: 'error' as const,
			};
		if (upload.isSuccess) return { text: 'Upload successful', type: 'success' as const };
		return null;
	}, [upload.isPending, upload.isError, upload.isSuccess, upload.error]);

	const handleUploadSuccess = useCallback(
		async (data: { transactions: Transaction[]; summary: any }) => {
			// Server will have updated data; ensure summary is up to date
			await refetch();
		},
		[refetch],
	);

	return (
		<Layout>
			<div className='max-w-6xl mx-auto space-y-8'>
				{/* Header Section */}
				<div className='text-center'>
					<h2 className='text-2xl font-semibold mb-4'>Welcome to CSV Finance Tracker</h2>
					<p className='text-muted-foreground'>
						Upload your monthly bank CSV file to get started with tracking your finances
					</p>
				</div>

				{/* Upload Alert */}
				{uploadStatus?.type === 'error' && (
					<Alert variant='destructive'>
						<AlertCircle className='h-4 w-4' />
						<AlertDescription>{uploadStatus.text}</AlertDescription>
					</Alert>
				)}
				{uploadStatus?.type === 'success' && (
					<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
						<CheckCircle2 className='h-4 w-4 text-green-600' />
						<AlertDescription className='text-green-800 dark:text-green-200'>
							CSV file uploaded successfully!
						</AlertDescription>
					</Alert>
				)}

				{/* Main Content Grid */}
				<div className='grid gap-6 lg:grid-cols-2'>
					{/* File Upload Section */}
					<Card>
						<CardHeader>
							<CardTitle>Upload CSV File</CardTitle>
							<CardDescription>Import your bank transaction data</CardDescription>
						</CardHeader>
						<CardContent>
							<FileUpload
								onUploadSuccess={handleUploadSuccess}
								onUploadError={() => void 0}
							/>
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
									<span className='text-sm text-muted-foreground'>
										Summary Available:
									</span>
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
							<Button
								variant='outline'
								size='sm'
								onClick={() => refetch()}
								disabled={isLoading}>
								<RefreshCw
									className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
								/>
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
		</Layout>
	);
}
