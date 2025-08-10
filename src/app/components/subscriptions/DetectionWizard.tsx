'use client';

import React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import { Checkbox } from '../../../components/ui/checkbox';
import { Transaction, Category } from '../../../lib/types';
import { formatCurrency } from '../../../lib/financial-calculator';
import { useCurrencySettings } from '../../providers';
import {
	Search,
	CheckCircle,
	XCircle,
	AlertTriangle,
	Calendar,
	DollarSign,
	TrendingUp,
	Loader2,
	Wand2,
} from 'lucide-react';

interface DetectionWizardProps {
	/** Detection results from API */
	detectionResults?: any;
	/** Array of transactions to analyze */
	transactions?: Transaction[];
	/** Array of categories for assignment */
	categories?: Category[];
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
	/** Callback when subscriptions are confirmed */
	onComplete?: (candidates: SubscriptionCandidate[]) => void;
	/** Callback when wizard is cancelled */
	onCancel?: () => void;
}

export interface SubscriptionCandidate {
	id: string;
	name: string;
	description: string;
	amount: number;
	frequency: 'monthly' | 'quarterly' | 'annually';
	confidence: number;
	transactionCount: number;
	firstTransaction: Date;
	lastTransaction: Date;
	nextPaymentDate: Date;
	suggestedCategoryId?: string;
	transactions: Transaction[];
	selected: boolean;
}

type WizardStep = 'start' | 'detecting' | 'review' | 'complete';

/**
 * DetectionWizard component guides users through subscription detection process
 * Provides step-by-step workflow for detecting and confirming subscriptions
 */
export function DetectionWizard({
	detectionResults,
	transactions = [],
	categories = [],
	isLoading = false,
	error,
	onComplete,
	onCancel,
}: DetectionWizardProps) {
	const { currency, locale } = useCurrencySettings();

	// Wizard state
	const [currentStep, setCurrentStep] = React.useState<WizardStep>(
		detectionResults ? 'review' : 'start',
	);
	const [detectionProgress, setDetectionProgress] = React.useState(0);
	const [candidates, setCandidates] = React.useState<SubscriptionCandidate[]>([]);

	// Simple local retry handler to reset the wizard state
	const handleStartDetection = () => {
		setCurrentStep('start');
		setDetectionProgress(0);
	};

	// Convert detection results to candidates when available
	React.useEffect(() => {
		if (detectionResults?.data?.candidates) {
			const convertedCandidates: SubscriptionCandidate[] =
				detectionResults.data.candidates.map((candidate: any, index: number) => ({
					id: candidate.id || `candidate-${index}`,
					name: candidate.name || 'Unknown Subscription',
					description: candidate.description || candidate.name || '',
					amount: candidate.amount || 0,
					frequency: candidate.billingFrequency || candidate.frequency || 'monthly',
					confidence: candidate.confidence || 0.5,
					transactionCount:
						candidate.matchingTransactions?.length || candidate.transactionCount || 0,
					firstTransaction:
						candidate.matchingTransactions?.length > 0
							? new Date(
									Math.min(
										...candidate.matchingTransactions.map((t: any) =>
											new Date(t.date).getTime(),
										),
									),
								)
							: new Date(candidate.firstTransaction || Date.now()),
					lastTransaction:
						candidate.matchingTransactions?.length > 0
							? new Date(
									Math.max(
										...candidate.matchingTransactions.map((t: any) =>
											new Date(t.date).getTime(),
										),
									),
								)
							: new Date(candidate.lastTransaction || Date.now()),
					nextPaymentDate: new Date(candidate.nextPaymentDate || Date.now()),
					suggestedCategoryId: candidate.categoryId || candidate.suggestedCategoryId,
					transactions: candidate.matchingTransactions || candidate.transactions || [],
					selected: candidate.confidence >= 0.8, // Auto-select high confidence candidates
				}));
			setCandidates(convertedCandidates);
		}
	}, [detectionResults]);

	// Handle candidate selection toggle
	const toggleCandidate = (candidateId: string) => {
		setCandidates((prev) =>
			prev.map((candidate) =>
				candidate.id === candidateId
					? { ...candidate, selected: !candidate.selected }
					: candidate,
			),
		);
	};

	// Handle confirmation
	const handleConfirm = () => {
		const selectedCandidates = candidates.filter((c) => c.selected);
		if (onComplete) {
			onComplete(selectedCandidates);
		}
		setCurrentStep('complete');
	};

	// Get step progress
	const getStepProgress = () => {
		switch (currentStep) {
			case 'start':
				return 0;
			case 'detecting':
				return detectionProgress / 4; // 25% of total
			case 'review':
				return 50;
			case 'complete':
				return 100;
			default:
				return 0;
		}
	};

	// Handle error state
	if (error) {
		return (
			<Card className='border-destructive'>
				<CardHeader>
					<CardTitle className='text-destructive flex items-center gap-2'>
						<AlertTriangle className='h-5 w-5' />
						Detection Error
					</CardTitle>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='flex gap-2'>
						<Button onClick={handleStartDetection}>Try Again</Button>
						{onCancel && (
							<Button variant='outline' onClick={onCancel}>
								Cancel
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Wand2 className='h-5 w-5' />
					Subscription Detection Wizard
				</CardTitle>
				<CardDescription>
					Automatically detect recurring subscriptions from your transaction data
				</CardDescription>
				<div className='mt-4'>
					<div className='flex items-center justify-between text-sm text-muted-foreground mb-2'>
						<span>Progress</span>
						<span>{Math.round(getStepProgress())}%</span>
					</div>
					<Progress value={getStepProgress()} className='h-2' />
				</div>
			</CardHeader>
			<CardContent>
				{currentStep === 'start' && (
					<StartStep
						transactionCount={transactions.length}
						onCancel={onCancel}
						isLoading={isLoading}
					/>
				)}

				{currentStep === 'detecting' && <DetectingStep progress={detectionProgress} />}

				{currentStep === 'review' && (
					<ReviewStep
						candidates={candidates}
						categories={categories}
						currency={currency}
						locale={locale}
						onToggleCandidate={toggleCandidate}
						onConfirm={handleConfirm}
						onCancel={onCancel}
					/>
				)}

				{currentStep === 'complete' && (
					<CompleteStep
						confirmedCount={candidates.filter((c) => c.selected).length}
						onClose={onCancel}
					/>
				)}
			</CardContent>
		</Card>
	);
}

interface StartStepProps {
	transactionCount: number;
	onCancel?: () => void;
	isLoading: boolean;
}

function StartStep({ transactionCount, onCancel, isLoading }: StartStepProps) {
	return (
		<div className='space-y-6'>
			<div className='text-center'>
				<Search className='h-16 w-16 mx-auto mb-4 text-muted-foreground' />
				<h3 className='text-lg font-medium mb-2'>Ready to Detect Subscriptions</h3>
				<p className='text-muted-foreground'>
					We'll analyze {transactionCount} transactions to find recurring payment patterns
				</p>
			</div>

			<div className='bg-muted/50 rounded-lg p-4'>
				<h4 className='font-medium mb-2'>What we'll look for:</h4>
				<ul className='text-sm text-muted-foreground space-y-1'>
					<li>• Recurring payments with similar amounts</li>
					<li>• Regular payment intervals (monthly, quarterly, annually)</li>
					<li>• Consistent merchant names and descriptions</li>
					<li>• Automatic category suggestions based on patterns</li>
				</ul>
			</div>

			<div className='flex items-center justify-center gap-4'>
				<div className='text-center'>
					<p className='text-sm text-muted-foreground mb-4'>
						Detection will be started from the main page.
					</p>
					{onCancel && (
						<Button variant='outline' onClick={onCancel}>
							Back to Dashboard
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

interface DetectingStepProps {
	progress: number;
}

function DetectingStep({ progress }: DetectingStepProps) {
	const getMessage = () => {
		if (progress < 20) return 'Analyzing transaction patterns...';
		if (progress < 40) return 'Identifying recurring payments...';
		if (progress < 60) return 'Calculating frequencies...';
		if (progress < 80) return 'Matching with categories...';
		return 'Detection complete!';
	};

	return (
		<div className='space-y-6 text-center'>
			<div>
				<Loader2 className='h-16 w-16 mx-auto mb-4 animate-spin text-primary' />
				<h3 className='text-lg font-medium mb-2'>Detecting Subscriptions</h3>
				<p className='text-muted-foreground'>{getMessage()}</p>
			</div>

			<div className='space-y-2'>
				<div className='flex items-center justify-between text-sm'>
					<span>Progress</span>
					<span>{progress}%</span>
				</div>
				<Progress value={progress} className='h-3' />
			</div>
		</div>
	);
}

interface ReviewStepProps {
	candidates: SubscriptionCandidate[];
	categories: Category[];
	currency: string;
	locale: string;
	onToggleCandidate: (id: string) => void;
	onConfirm: () => void;
	onCancel?: () => void;
}

function ReviewStep({
	candidates,
	categories,
	currency,
	locale,
	onToggleCandidate,
	onConfirm,
	onCancel,
}: ReviewStepProps) {
	const selectedCount = candidates.filter((c) => c.selected).length;

	return (
		<div className='space-y-6'>
			<div className='text-center'>
				<CheckCircle className='h-16 w-16 mx-auto mb-4 text-green-500' />
				<h3 className='text-lg font-medium mb-2'>Review Detected Subscriptions</h3>
				<p className='text-muted-foreground'>
					Found {candidates.length} potential subscription
					{candidates.length !== 1 ? 's' : ''}. Select which ones to add.
				</p>
			</div>

			<div className='space-y-3 max-h-96 overflow-y-auto'>
				{candidates.map((candidate) => (
					<CandidateItem
						key={candidate.id}
						candidate={candidate}
						categories={categories}
						currency={currency}
						locale={locale}
						onToggle={() => onToggleCandidate(candidate.id)}
					/>
				))}
			</div>

			<div className='flex items-center justify-between pt-4 border-t'>
				<div className='text-sm text-muted-foreground'>
					{selectedCount} of {candidates.length} selected
				</div>
				<div className='flex gap-2'>
					{onCancel && (
						<Button variant='outline' onClick={onCancel}>
							Cancel
						</Button>
					)}
					<Button onClick={onConfirm} disabled={selectedCount === 0}>
						<CheckCircle className='h-4 w-4 mr-2' />
						Confirm {selectedCount} Subscription{selectedCount !== 1 ? 's' : ''}
					</Button>
				</div>
			</div>
		</div>
	);
}

interface CandidateItemProps {
	candidate: SubscriptionCandidate;
	categories: Category[];
	currency: string;
	locale: string;
	onToggle: () => void;
}

function CandidateItem({ candidate, categories, currency, locale, onToggle }: CandidateItemProps) {
	const category = categories.find((cat) => cat.id === candidate.suggestedCategoryId);

	const getConfidenceBadge = () => {
		if (candidate.confidence >= 0.9) {
			return (
				<Badge
					variant='default'
					className='text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'>
					High Confidence
				</Badge>
			);
		}
		if (candidate.confidence >= 0.8) {
			return (
				<Badge variant='secondary' className='text-xs'>
					Medium Confidence
				</Badge>
			);
		}
		return (
			<Badge variant='outline' className='text-xs'>
				Low Confidence
			</Badge>
		);
	};

	return (
		<div
			className={`flex items-center gap-4 p-4 rounded-lg border ${candidate.selected ? 'border-primary bg-primary/5' : 'border-border'} hover:bg-muted/50 transition-colors`}>
			<Checkbox checked={candidate.selected} onCheckedChange={onToggle} />

			<div className='flex-1 min-w-0'>
				<div className='flex items-center gap-2 mb-1'>
					<h4 className='font-medium text-sm'>{candidate.name}</h4>
					{getConfidenceBadge()}
				</div>

				<div className='flex items-center gap-4 text-xs text-muted-foreground mb-2'>
					<span className='flex items-center gap-1'>
						<DollarSign className='h-3 w-3' />
						{formatCurrency(candidate.amount, currency, locale)} {candidate.frequency}
					</span>
					<span className='flex items-center gap-1'>
						<Calendar className='h-3 w-3' />
						{candidate.transactionCount} transactions
					</span>
					<span className='flex items-center gap-1'>
						<TrendingUp className='h-3 w-3' />
						{Math.round(candidate.confidence * 100)}% confidence
					</span>
				</div>

				<div className='flex items-center gap-2 text-xs'>
					<span className='text-muted-foreground'>Description:</span>
					<span>{candidate.description}</span>
					{category && (
						<>
							<span className='text-muted-foreground'>•</span>
							<div className='flex items-center gap-1'>
								<div
									className='h-2 w-2 rounded-full'
									style={{ backgroundColor: category.color }}
								/>
								<span>{category.name}</span>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

interface CompleteStepProps {
	confirmedCount: number;
	onClose?: () => void;
}

function CompleteStep({ confirmedCount, onClose }: CompleteStepProps) {
	return (
		<div className='space-y-6 text-center'>
			<div>
				<CheckCircle className='h-16 w-16 mx-auto mb-4 text-green-500' />
				<h3 className='text-lg font-medium mb-2'>Detection Complete!</h3>
				<p className='text-muted-foreground'>
					Successfully added {confirmedCount} subscription
					{confirmedCount !== 1 ? 's' : ''} to your account
				</p>
			</div>

			<div className='bg-green-50 dark:bg-green-950 rounded-lg p-4'>
				<p className='text-sm text-green-800 dark:text-green-200'>
					Your subscriptions are now being tracked. You can view them in the subscription
					dashboard and receive notifications for upcoming payments.
				</p>
			</div>

			{onClose && (
				<Button onClick={onClose}>
					<CheckCircle className='h-4 w-4 mr-2' />
					Done
				</Button>
			)}
		</div>
	);
}

export default DetectionWizard;
