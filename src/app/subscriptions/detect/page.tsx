'use client';
import SubscriptionConfirmationDialog from '@/app/components/SubscriptionConfirmationDialog';
import type { SubscriptionMatch } from '@/lib/subscription-pattern-engine';
import type { DetectedSubscriptionInput } from '@/lib/detected-subscription';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import type { SubscriptionCandidate as WizardCandidate } from '@/app/components/subscriptions/DetectionWizard';

import { DetectionWizard } from '@/app/components/subscriptions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, CheckCircle, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

/**
 * Subscription detection wizard page
 * Guides users through the process of detecting subscriptions from transaction data
 */
export default function DetectSubscriptionsPage() {
	const router = useRouter();
	const [reviewMatches, setReviewMatches] = useState(false);
	const [confirmedMatchIds, setConfirmedMatchIds] = useState<string[]>([]);
	const queryClient = useQueryClient();
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	// Fetch transactions for detection
	const {
		data: transactions,
		isLoading: transactionsLoading,
		isError: transactionsError,
		error: transactionsErrorMessage,
	} = useQuery({
		queryKey: ['transactions'],
		queryFn: async () => {
			const response = await fetch('/api/transactions');
			if (!response.ok) {
				throw new Error('Failed to fetch transactions');
			}
			return response.json();
		},
	});

	// Fetch categories for subscription creation
	const { data: categories } = useQuery({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await fetch('/api/categories');
			if (!response.ok) {
				throw new Error('Failed to fetch categories');
			}
			return response.json();
		},
	});

	// Detect subscriptions mutation
	const detectSubscriptionsMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch('/api/subscriptions/detect', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}), // Send empty object to avoid JSON parsing error
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to detect subscriptions');
			}

			return response.json();
		},
	});

	// Create subscriptions from detection results mutation
	const createSubscriptionsMutation = useMutation({
		mutationFn: async (subscriptionCandidates: DetectedSubscriptionInput[]) => {
			const response = await fetch('/api/subscriptions/bulk-categorize', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ subscriptions: subscriptionCandidates }),
			});

			const result = await response.json();
			if (!response.ok || result.success === false || result.data?.errors?.length)
				throw new Error(result.message || 'Failed to create subscriptions');
			return result;
		},
		onSuccess: (data) => {
			// Invalidate and refetch subscriptions
			void invalidateFinanceQueries(queryClient);

			const count = data.data?.created?.length || 0;
			setSuccessMessage(`Successfully created ${count} subscription${count !== 1 ? 's' : ''}!`);
		},
	});

	const handleDetectionComplete = async (confirmedSubscriptions: WizardCandidate[]) => {
		if (!confirmedSubscriptions.length) return;
		await createSubscriptionsMutation.mutateAsync(
			confirmedSubscriptions.map((candidate) => ({
				name: candidate.name,
				description: candidate.description,
				amount: candidate.amount,
				currency: candidate.currency,
				billingFrequency: candidate.frequency,
				categoryId: candidate.suggestedCategoryId || 'cat_uncategorized',
				transactionIds: candidate.transactions.map((transaction) => transaction.id),
				isActive: candidate.isActive,
				notes: candidate.reason,
				patterns: candidate.patterns,
			})),
		);
	};

	const existingMatches = useMemo<SubscriptionMatch[]>(
		() =>
			(detectSubscriptionsMutation.data?.data?.matches ?? []).filter(
				(match: SubscriptionMatch) => !confirmedMatchIds.includes(match.transaction.id),
			),
		[detectSubscriptionsMutation.data, confirmedMatchIds],
	);
	const matchDetectionData = useMemo(
		() => ({
			candidates: [],
			matches: existingMatches,
			totalAnalyzed: existingMatches.length,
			alreadyFlagged: 0,
		}),
		[existingMatches],
	);
	const confirmExistingMatches = async ({ matches }: { matches: SubscriptionMatch[] }) => {
		const response = await fetch('/api/subscriptions/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ matches }),
		});
		const result = await response.json();
		if (!response.ok || result.success === false || result.data?.errors?.length)
			throw new Error(result.message || 'Unable to link subscription payments');
		setConfirmedMatchIds((current) => [
			...current,
			...matches.map((match) => match.transaction.id),
		]);
		void invalidateFinanceQueries(queryClient);
		setSuccessMessage(
			`Linked ${matches.length} payment${matches.length === 1 ? '' : 's'} to existing subscriptions.`,
		);
	};
	const handleStartDetection = () => {
		setSuccessMessage(null);
		setConfirmedMatchIds([]);
		detectSubscriptionsMutation.mutate();
	};

	return (
		<div className='max-w-6xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center gap-4'>
				<Button asChild variant='ghost' size='sm'>
					<Link href='/subscriptions'>
						<ArrowLeft className='mr-2 h-4 w-4' />
						Back to Dashboard
					</Link>
				</Button>
				<div>
					<h2 className='text-2xl font-semibold mb-2'>Detect Subscriptions</h2>
					<p className='text-muted-foreground'>
						Find current and historical recurring payments in your imported transaction data
					</p>
				</div>
			</div>

			{/* Success Alert */}
			{successMessage && (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<CheckCircle className='h-4 w-4 text-green-600' />
					<AlertDescription className='text-green-800 dark:text-green-200'>
						{successMessage}
					</AlertDescription>
				</Alert>
			)}

			{/* Error Alert */}
			{(transactionsError ||
				detectSubscriptionsMutation.isError ||
				createSubscriptionsMutation.isError) && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{createSubscriptionsMutation.error?.message ||
							detectSubscriptionsMutation.error?.message ||
							(transactionsErrorMessage as Error)?.message ||
							'An error occurred'}
					</AlertDescription>
				</Alert>
			)}

			{/* Detection Wizard */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Search className='h-5 w-5' />
						Subscription Detection Wizard
					</CardTitle>
				</CardHeader>
				<CardContent>
					{!detectSubscriptionsMutation.data ? (
						/* Initial State - Start Detection */
						<div className='text-center py-12 space-y-6'>
							<div className='mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center'>
								<Search className='h-8 w-8 text-primary' />
							</div>
							<div>
								<h3 className='text-xl font-semibold mb-2'>Ready to detect subscriptions?</h3>
								<p className='text-muted-foreground max-w-2xl mx-auto'>
									We&apos;ll analyze your transaction data to identify recurring payments that might
									be subscriptions. You&apos;ll be able to review and confirm each detection before
									creating subscription records.
								</p>
							</div>
							<div className='space-y-4'>
								<div className='text-sm text-muted-foreground'>
									<p>We&apos;ll look for:</p>
									<ul className='list-disc list-inside mt-2 space-y-1'>
										<li>Transactions with similar amounts occurring regularly</li>
										<li>Recurring payments to the same merchant</li>
										<li>Monthly, quarterly, and annual payment patterns</li>
										<li>Consistent payment dates with some flexibility</li>
									</ul>
								</div>
								<Button
									onClick={handleStartDetection}
									disabled={transactionsLoading || detectSubscriptionsMutation.isPending}
									size='lg'
								>
									{detectSubscriptionsMutation.isPending ? 'Analyzing...' : 'Start Detection'}
								</Button>
							</div>
						</div>
					) : (
						/* Detection Results - Show Wizard */
						<DetectionWizard
							detectionResults={detectSubscriptionsMutation.data}
							transactions={
								Array.isArray(transactions)
									? transactions
									: (transactions?.data?.transactions ?? [])
							}
							categories={categories}
							isLoading={createSubscriptionsMutation.isPending}
							onComplete={handleDetectionComplete}
							onCancel={() => router.push('/subscriptions')}
						/>
					)}
				</CardContent>
			</Card>

			{existingMatches.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Payments matching existing subscriptions</CardTitle>
					</CardHeader>
					<CardContent className='space-y-3'>
						<p>
							{existingMatches.length} imported payments may belong to subscriptions you already
							track. Review the payment, currency, and target subscription before linking.
						</p>
						<Button onClick={() => setReviewMatches(true)}>
							Review {existingMatches.length} existing payment matches
						</Button>
					</CardContent>
				</Card>
			)}
			<SubscriptionConfirmationDialog
				isOpen={reviewMatches}
				onClose={() => setReviewMatches(false)}
				detectionData={matchDetectionData}
				categories={categories ?? []}
				onConfirm={confirmExistingMatches}
			/>
			{/* Help Information */}
			{!detectSubscriptionsMutation.data && (
				<Card className='border-dashed'>
					<CardContent className='pt-6'>
						<div className='text-sm text-muted-foreground space-y-4'>
							<h4 className='font-medium text-foreground'>How subscription detection works:</h4>
							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								<div>
									<h5 className='font-medium text-foreground mb-2'>Pattern Analysis</h5>
									<ul className='list-disc list-inside space-y-1'>
										<li>Identifies transactions with consistent amounts</li>
										<li>Looks for regular payment intervals</li>
										<li>Matches merchant names and descriptions</li>
										<li>Considers date variations (±3 days)</li>
									</ul>
								</div>
								<div>
									<h5 className='font-medium text-foreground mb-2'>Review Process</h5>
									<ul className='list-disc list-inside space-y-1'>
										<li>Review each detected subscription candidate</li>
										<li>Confirm or reject suggestions</li>
										<li>Assign categories and add details</li>
										<li>Create subscription records for confirmed items</li>
									</ul>
								</div>
							</div>
							<div className='bg-blue-50 dark:bg-blue-950 p-4 rounded-lg'>
								<p className='text-blue-800 dark:text-blue-200'>
									<strong>Tip:</strong> Make sure you have uploaded recent transaction data for the
									best detection results. The system works best with at least 3-6 months of data.
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
