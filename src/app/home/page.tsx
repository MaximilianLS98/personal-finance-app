'use client';

import { useState, useCallback, useEffect } from 'react';
import Layout from '../components/Layout';
import FileUpload from '../components/FileUpload';
import FinancialSummary from '../components/FinancialSummary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Transaction, FinancialSummary as FinancialSummaryType } from '@/lib/types';

interface AppState {
	transactions: Transaction[];
	summary: FinancialSummaryType | null;
	isLoadingSummary: boolean;
	uploadError: string | null;
	summaryError: string | null;
	hasUploadedData: boolean;
	lastUploadFileName: string | null;
}

export default function Home() {
	const [state, setState] = useState<AppState>({
		transactions: [],
		summary: null,
		isLoadingSummary: false,
		uploadError: null,
		summaryError: null,
		hasUploadedData: false,
		lastUploadFileName: null,
	});

	// Fetch financial summary from API
	const fetchSummary = useCallback(async () => {
		setState((prev) => ({ ...prev, isLoadingSummary: true, summaryError: null }));

		try {
			const response = await fetch('/api/summary');
			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to fetch summary');
			}

			setState((prev) => ({
				...prev,
				summary: result.data,
				isLoadingSummary: false,
			}));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to load summary';
			setState((prev) => ({
				...prev,
				summaryError: errorMessage,
				isLoadingSummary: false,
			}));
		}
	}, []);

	// Handle successful file upload
	const handleUploadSuccess = useCallback(
		async (data: { transactions: Transaction[]; summary: FinancialSummaryType }) => {
			setState((prev) => ({
				...prev,
				transactions: data.transactions,
				uploadError: null,
				hasUploadedData: true,
				lastUploadFileName: null, // Will be set by FileUpload component
			}));

			// Fetch updated summary after successful upload
			await fetchSummary();
		},
		[fetchSummary],
	);

	// Handle upload error
	const handleUploadError = useCallback((error: string) => {
		setState((prev) => ({
			...prev,
			uploadError: error,
			hasUploadedData: false,
		}));
	}, []);

	// Clear upload error
	const clearUploadError = useCallback(() => {
		setState((prev) => ({ ...prev, uploadError: null }));
	}, []);

	// Clear summary error and retry
	const retrySummary = useCallback(() => {
		fetchSummary();
	}, [fetchSummary]);

	// Load summary on component mount if there's existing data
	useEffect(() => {
		fetchSummary();
	}, [fetchSummary]);

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

				{/* Upload Error Alert */}
				{state.uploadError && (
					<Alert variant='destructive'>
						<AlertCircle className='h-4 w-4' />
						<AlertDescription className='flex items-center justify-between'>
							<span>{state.uploadError}</span>
							<Button
								variant='outline'
								size='sm'
								onClick={clearUploadError}
								className='ml-4'>
								Dismiss
							</Button>
						</AlertDescription>
					</Alert>
				)}

				{/* Success Alert */}
				{state.hasUploadedData && !state.uploadError && (
					<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
						<CheckCircle2 className='h-4 w-4 text-green-600' />
						<AlertDescription className='text-green-800 dark:text-green-200'>
							CSV file uploaded successfully! {state.transactions.length} transactions
							processed.
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
								onUploadError={handleUploadError}
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
								<div className='flex justify-between'>
									<span className='text-sm text-muted-foreground'>
										Transactions:
									</span>
									<span className='text-sm font-medium'>
										{state.transactions.length}
									</span>
								</div>
								{state.summary && (
									<>
										<div className='flex justify-between'>
											<span className='text-sm text-muted-foreground'>
												Income Transactions:
											</span>
											<span className='text-sm font-medium text-green-600'>
												{
													state.transactions.filter(
														(t) => t.type === 'income',
													).length
												}
											</span>
										</div>
										<div className='flex justify-between'>
											<span className='text-sm text-muted-foreground'>
												Expense Transactions:
											</span>
											<span className='text-sm font-medium text-red-600'>
												{
													state.transactions.filter(
														(t) => t.type === 'expense',
													).length
												}
											</span>
										</div>
									</>
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Financial Summary Section */}
				<div className='space-y-4'>
					<div className='flex items-center justify-between'>
						<h3 className='text-xl font-semibold'>Financial Summary</h3>
						{state.summaryError && (
							<Button
								variant='outline'
								size='sm'
								onClick={retrySummary}
								disabled={state.isLoadingSummary}>
								<RefreshCw
									className={`h-4 w-4 mr-2 ${state.isLoadingSummary ? 'animate-spin' : ''}`}
								/>
								Retry
							</Button>
						)}
					</div>

					{/* Summary Error Alert */}
					{state.summaryError && (
						<Alert variant='destructive'>
							<AlertCircle className='h-4 w-4' />
							<AlertDescription>
								Failed to load financial summary: {state.summaryError}
							</AlertDescription>
						</Alert>
					)}

					{/* Financial Summary Component */}
					<FinancialSummary
						summary={state.summary || undefined}
						isLoading={state.isLoadingSummary}
						error={state.summaryError || undefined}
					/>
				</div>
			</div>
		</Layout>
	);
}