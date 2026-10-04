'use client';
import React from 'react';
import type { SubscriptionCandidate as ApiCandidate } from '@/lib/subscription-pattern-engine';
import type { Category, Transaction } from '@/lib/types';
import { currencyCode, displayMoney } from '@/lib/money';
import { nextDetectedPayment } from '@/lib/detected-subscription';
import { useCurrencySettings } from '@/app/providers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

// Optional metadata keeps older import responses compatible while the engine rolls forward.
type CandidateMetadata = { lastPaymentDate?: string; activity?: 'recent' | 'no_recent_payment' };
export interface SubscriptionCandidate {
	id: string;
	name: string;
	description: string;
	amount: number;
	currency: string;
	frequency: 'monthly' | 'quarterly' | 'annually';
	confidence: number;
	transactionCount: number;
	firstTransaction: Date;
	lastTransaction: Date;
	nextPaymentDate: Date;
	suggestedCategoryId?: string;
	transactions: Transaction[];
	selected: boolean;
	isActive: boolean;
	activity?: CandidateMetadata['activity'];
	reason: string;
	patterns: ApiCandidate['detectedPatterns'];
}
interface DetectionWizardProps {
	detectionResults?: { data: { candidates: (ApiCandidate & CandidateMetadata)[] } };
	transactions?: Transaction[];
	categories?: Category[];
	isLoading?: boolean;
	error?: string;
	onComplete?: (candidates: SubscriptionCandidate[]) => void | Promise<void>;
	onCancel?: () => void;
}
function convert(
	candidate: ApiCandidate & CandidateMetadata,
	index: number,
): SubscriptionCandidate {
	const dates = candidate.matchingTransactions
		.map((t) => new Date(t.date))
		.sort((a, b) => a.getTime() - b.getTime());
	const last = candidate.lastPaymentDate
		? new Date(candidate.lastPaymentDate)
		: (dates.at(-1) ?? new Date());
	const historical = candidate.activity === 'no_recent_payment';
	return {
		id: `candidate-${index}`,
		name: candidate.name,
		description: candidate.name,
		amount: candidate.amount,
		currency: currencyCode(candidate.currency),
		frequency: candidate.billingFrequency,
		confidence: candidate.confidence,
		transactionCount: dates.length,
		firstTransaction: dates[0] ?? last,
		lastTransaction: last,
		nextPaymentDate: nextDetectedPayment(last, candidate.billingFrequency),
		suggestedCategoryId: candidate.categoryId,
		transactions: candidate.matchingTransactions,
		selected: !historical && candidate.confidence >= 0.8,
		isActive: !historical,
		activity: candidate.activity,
		reason: candidate.reason,
		patterns: candidate.detectedPatterns,
	};
}
export function DetectionWizard({
	detectionResults,
	transactions = [],
	categories = [],
	isLoading = false,
	error,
	onComplete,
	onCancel,
}: DetectionWizardProps) {
	const { locale } = useCurrencySettings();
	const [candidates, setCandidates] = React.useState<SubscriptionCandidate[]>([]);
	const [saving, setSaving] = React.useState(false);
	const [saveError, setSaveError] = React.useState('');
	const [complete, setComplete] = React.useState(false);
	const pending = React.useRef(false);
	React.useEffect(() => {
		if (detectionResults?.data.candidates) {
			setCandidates(detectionResults.data.candidates.map(convert));
			setComplete(false);
			setSaveError('');
		}
	}, [detectionResults]);
	const change = (id: string, values: Partial<SubscriptionCandidate>) =>
		setCandidates((current) =>
			current.map((candidate) => (candidate.id === id ? { ...candidate, ...values } : candidate)),
		);
	const selected = candidates.filter((candidate) => candidate.selected);
	async function confirm() {
		if (pending.current || isLoading || !selected.length || !onComplete) return;
		pending.current = true;
		setSaving(true);
		setSaveError('');
		try {
			await onComplete(selected);
			setComplete(true);
		} catch (failure) {
			setSaveError(failure instanceof Error ? failure.message : 'Unable to save subscriptions');
		} finally {
			pending.current = false;
			setSaving(false);
		}
	}
	const busy = saving || isLoading;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Subscription Detection Wizard</CardTitle>
				<CardDescription>
					Review recurring payment history before choosing what to track.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-6'>
				{error && (
					<p role='alert' className='text-destructive'>
						{error}
					</p>
				)}
				{!detectionResults ? (
					<div>
						<h3 className='font-medium'>Ready to Detect Subscriptions</h3>
						<p>
							We&apos;ll analyze {transactions.length} transactions. Start detection from the main
							page.
						</p>
					</div>
				) : complete ? (
					<div className='space-y-3'>
						<h3 className='text-lg font-semibold'>Detection Complete!</h3>
						<p>
							Successfully saved {selected.length} subscription{selected.length !== 1 ? 's' : ''}.
						</p>
						<p className='text-sm text-muted-foreground'>
							Active subscriptions appear in forecasts and upcoming payments. Inactive history
							preserves linked payments without adding future costs.
						</p>
						{onCancel && <Button onClick={onCancel}>Done</Button>}
					</div>
				) : (
					<>
						<div>
							<h3 className='text-lg font-medium'>Review Detected Subscriptions</h3>
							<p className='text-muted-foreground'>
								Found {candidates.length} potential subscriptions. Historical patterns remain
								visible even when payments stopped. No recent payment does not confirm cancellation.
							</p>
						</div>
						{!candidates.length && (
							<p>No unlinked recurring payment patterns found in the imported history.</p>
						)}
						<div className='space-y-4'>
							{candidates.map((candidate) => (
								<section
									key={candidate.id}
									aria-label={candidate.name}
									className={`rounded-lg border p-4 space-y-3 ${candidate.selected ? 'border-primary bg-primary/5' : ''}`}
								>
									<div className='flex flex-wrap items-center gap-3'>
										<Checkbox
											aria-label={`Select ${candidate.name}`}
											checked={candidate.selected}
											disabled={busy}
											onCheckedChange={(checked) =>
												change(candidate.id, { selected: checked === true })
											}
										/>
										<h4 className='font-medium'>{candidate.name}</h4>
										<Badge variant='outline'>
											{Math.round(candidate.confidence * 100)}% confidence
										</Badge>
										<Badge
											variant={candidate.activity === 'no_recent_payment' ? 'secondary' : 'outline'}
										>
											{candidate.activity === 'no_recent_payment'
												? 'No recent payment'
												: candidate.activity === 'recent'
													? 'Recent payment'
													: 'Payment history'}
										</Badge>
									</div>
									<p>
										{displayMoney(candidate.amount, candidate.currency, locale)}{' '}
										{candidate.frequency} · {candidate.currency}
									</p>
									<p className='text-sm'>
										Last payment:{' '}
										<time dateTime={candidate.lastTransaction.toISOString().slice(0, 10)}>
											{candidate.lastTransaction.toISOString().slice(0, 10)}
										</time>{' '}
										· {candidate.transactionCount} matching transactions
									</p>
									<p className='text-sm text-muted-foreground'>{candidate.reason}</p>
									<div className='grid gap-3 sm:grid-cols-2'>
										<label className='text-sm space-y-1'>
											Save {candidate.name} as
											<select
												aria-label={`Save ${candidate.name} as`}
												className='block w-full rounded border bg-background p-2'
												disabled={busy}
												value={candidate.isActive ? 'active' : 'inactive'}
												onChange={(e) =>
													change(candidate.id, { isActive: e.target.value === 'active' })
												}
											>
												<option value='active'>Active subscription</option>
												<option value='inactive'>Inactive history</option>
											</select>
										</label>
										<label className='text-sm space-y-1'>
											Category
											<select
												aria-label={`Category for ${candidate.name}`}
												className='block w-full rounded border bg-background p-2'
												disabled={busy}
												value={candidate.suggestedCategoryId ?? ''}
												onChange={(e) =>
													change(candidate.id, { suggestedCategoryId: e.target.value || undefined })
												}
											>
												<option value=''>Uncategorized</option>
												{categories.map((category) => (
													<option key={category.id} value={category.id}>
														{category.name}
													</option>
												))}
											</select>
										</label>
									</div>
									<p className='text-xs text-muted-foreground'>
										{candidate.isActive
											? 'Future payments will use this billing cadence. Check the saved next-payment date if your billing schedule changed.'
											: 'History only: excluded from active totals, forecasts, and payment reminders.'}
									</p>
								</section>
							))}
						</div>
						{saveError && (
							<p role='alert' className='text-destructive'>
								{saveError}
							</p>
						)}
						<div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
							<p className='text-sm'>
								{selected.length} of {candidates.length} selected
							</p>
							<div className='flex gap-2'>
								{onCancel && (
									<Button variant='outline' disabled={busy} onClick={onCancel}>
										Cancel
									</Button>
								)}
								<Button
									disabled={busy || !selected.length || !onComplete}
									onClick={() => void confirm()}
								>
									{busy
										? 'Saving subscriptions…'
										: `Confirm ${selected.length} Subscription${selected.length !== 1 ? 's' : ''}`}
								</Button>
							</div>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
export default DetectionWizard;
