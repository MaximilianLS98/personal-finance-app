'use client';

import React, { useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CreditCard, TrendingUp, CheckCircle2 } from 'lucide-react';
import type { SubscriptionCandidate, SubscriptionMatch } from '@/lib/subscription-pattern-engine';
import type { Category } from '@/lib/types';
import { getJson } from '@/lib/api';

interface SubscriptionDetectionData {
	candidates: SubscriptionCandidate[];
	matches: SubscriptionMatch[];
	totalAnalyzed: number;
	alreadyFlagged: number;
}

interface SubscriptionConfirmationDialogProps {
	isOpen: boolean;
	onClose: () => void;
	detectionData: SubscriptionDetectionData;
	onConfirm: (confirmations: {
		candidates: Array<{
			candidate: SubscriptionCandidate;
			overrides?: { name?: string; categoryId?: string; notes?: string };
		}>;
		matches: SubscriptionMatch[];
	}) => Promise<void>;
	/** Optional preloaded categories to populate the dropdown */
	categories?: Category[];
}

interface CandidateSelection {
	selected: boolean;
	overrides: {
		name?: string;
		categoryId?: string;
		notes?: string;
	};
}

export default function SubscriptionConfirmationDialog({
	isOpen,
	onClose,
	detectionData,
	onConfirm,
	categories: providedCategories,
}: SubscriptionConfirmationDialogProps) {
	const [candidateSelections, setCandidateSelections] = useState<
		Record<number, CandidateSelection>
	>({});
	const [matchSelections, setMatchSelections] = useState<Record<number, boolean>>({});
	const [isConfirming, setIsConfirming] = useState(false);
	const [categoryOptions, setCategoryOptions] = useState<Category[]>([]);
	const [isLoadingCategories, setIsLoadingCategories] = useState(false);

	const { candidates, matches } = detectionData;

	// Initialize selections when dialog opens
	React.useEffect(() => {
		if (isOpen) {
			// Pre-select high-confidence candidates
			const initialCandidateSelections: Record<number, CandidateSelection> = {};
			candidates.forEach((candidate, index) => {
				initialCandidateSelections[index] = {
					selected: candidate.confidence >= 0.8, // Auto-select high confidence
					overrides: {},
				};
			});
			setCandidateSelections(initialCandidateSelections);

			// Pre-select all matches (they're already high confidence)
			const initialMatchSelections: Record<number, boolean> = {};
			matches.forEach((_, index) => {
				initialMatchSelections[index] = true;
			});
			setMatchSelections(initialMatchSelections);
		}
	}, [isOpen, candidates, matches]);

	// Prefer provided categories; otherwise fetch when dialog opens
	React.useEffect(() => {
		if (providedCategories && providedCategories.length > 0) {
			setCategoryOptions(providedCategories);
			return;
		}
		if (!isOpen) return;
		let isCancelled = false;
		(async () => {
			setIsLoadingCategories(true);
			try {
				const cats = await getJson<Category[]>('/api/categories');
				if (!isCancelled) setCategoryOptions(cats);
			} catch (e) {
				console.error('Failed to load categories for subscription confirmation:', e);
			} finally {
				if (!isCancelled) setIsLoadingCategories(false);
			}
		})();
		return () => {
			isCancelled = true;
		};
	}, [isOpen, providedCategories]);

	const handleCandidateToggle = (index: number, selected: boolean) => {
		setCandidateSelections((prev) => ({
			...prev,
			[index]: {
				...prev[index],
				selected,
			},
		}));
	};

	const handleCandidateOverride = (index: number, field: string, value: string) => {
		setCandidateSelections((prev) => ({
			...prev,
			[index]: {
				...prev[index],
				overrides: {
					...prev[index]?.overrides,
					[field]: value,
				},
			},
		}));
	};

	const handleMatchToggle = (index: number, selected: boolean) => {
		setMatchSelections((prev) => ({
			...prev,
			[index]: selected,
		}));
	};

	const handleConfirm = async () => {
		setIsConfirming(true);
		try {
			// Prepare selected candidates
			const selectedCandidates = candidates
				.map((candidate, index) => ({
					candidate,
					selection: candidateSelections[index],
				}))
				.filter(({ selection }) => selection?.selected)
				.map(({ candidate, selection }) => ({
					candidate,
					overrides: selection.overrides,
				}));

			// Prepare selected matches
			const selectedMatches = matches.filter((_, index) => matchSelections[index]);

			await onConfirm({
				candidates: selectedCandidates,
				matches: selectedMatches,
			});

			onClose();
		} catch (error) {
			console.error('Error confirming subscriptions:', error);
		} finally {
			setIsConfirming(false);
		}
	};

	const formatCurrency = (amount: number, currency: string = 'NOK') => {
		return new Intl.NumberFormat('nb-NO', {
			style: 'currency',
			currency,
		}).format(amount);
	};

	const formatFrequency = (frequency: string) => {
		const frequencyMap = {
			monthly: 'Monthly',
			quarterly: 'Quarterly',
			annually: 'Annually',
		};
		return frequencyMap[frequency as keyof typeof frequencyMap] || frequency;
	};

	const getConfidenceColor = (confidence: number) => {
		if (confidence >= 0.8)
			return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
		if (confidence >= 0.6)
			return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
		return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
	};

	const selectedCandidatesCount = Object.values(candidateSelections).filter(
		(s) => s?.selected,
	).length;
	const selectedMatchesCount = Object.values(matchSelections).filter(Boolean).length;

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<TrendingUp className='h-5 w-5' />
						Subscription Detection Results
					</DialogTitle>
					<DialogDescription>
						We found {candidates.length} potential new subscriptions and{' '}
						{matches.length} existing subscription matches. Review and confirm which
						ones you’d like to add or update.
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue='candidates' className='w-full'>
					<TabsList className='grid w-full grid-cols-2'>
						<TabsTrigger value='candidates' className='flex items-center gap-2'>
							<CreditCard className='h-4 w-4' />
							New Subscriptions ({candidates.length})
						</TabsTrigger>
						<TabsTrigger value='matches' className='flex items-center gap-2'>
							<CheckCircle2 className='h-4 w-4' />
							Existing Matches ({matches.length})
						</TabsTrigger>
					</TabsList>

					<TabsContent value='candidates' className='space-y-4'>
						{candidates.length === 0 ? (
							<Card>
								<CardContent className='flex items-center justify-center py-8'>
									<div className='text-center text-muted-foreground'>
										<Calendar className='h-12 w-12 mx-auto mb-4 opacity-50' />
										<p>No new subscription candidates detected</p>
									</div>
								</CardContent>
							</Card>
						) : (
							candidates.map((candidate, index) => {
								const selection = candidateSelections[index];
								return (
									<Card
										key={index}
										className={
											selection?.selected ? 'ring-2 ring-blue-500' : ''
										}>
										<CardHeader className='pb-3'>
											<div className='flex items-start justify-between'>
												<div className='flex items-center gap-3'>
													<Checkbox
														checked={selection?.selected || false}
														onCheckedChange={(checked) =>
															handleCandidateToggle(
																index,
																checked as boolean,
															)
														}
													/>
													<div>
														<CardTitle className='text-lg'>
															{candidate.name}
														</CardTitle>
														<div className='flex items-center gap-2 mt-1'>
															<Badge
																className={getConfidenceColor(
																	candidate.confidence,
																)}>
																{Math.round(
																	candidate.confidence * 100,
																)}
																% confidence
															</Badge>
															<Badge variant='outline'>
																{formatFrequency(
																	candidate.billingFrequency,
																)}
															</Badge>
														</div>
													</div>
												</div>
												<div className='text-right'>
													<div className='text-2xl font-bold'>
														{formatCurrency(
															candidate.amount,
															candidate.currency,
														)}
													</div>
													<div className='text-sm text-muted-foreground'>
														per{' '}
														{candidate.billingFrequency.replace(
															'ly',
															'',
														)}
													</div>
												</div>
											</div>
										</CardHeader>
										<CardContent className='space-y-4'>
											<div className='text-sm text-muted-foreground'>
												<p>
													<strong>Detection reason:</strong>{' '}
													{candidate.reason}
												</p>
												<p>
													<strong>Matching transactions:</strong>{' '}
													{candidate.matchingTransactions.length}
												</p>
											</div>

											{selection?.selected && (
												<div className='grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg'>
													<div>
														<Label htmlFor={`name-${index}`}>
															Subscription Name
														</Label>
														<Input
															id={`name-${index}`}
															placeholder={candidate.name}
															value={selection.overrides.name || ''}
															onChange={(e) =>
																handleCandidateOverride(
																	index,
																	'name',
																	e.target.value,
																)
															}
														/>
													</div>
													<div>
														<Label htmlFor={`category-${index}`}>
															Category
														</Label>
														<Select
															value={
																selection.overrides.categoryId || ''
															}
															onValueChange={(value: string) =>
																handleCandidateOverride(
																	index,
																	'categoryId',
																	value,
																)
															}
															disabled={
																isLoadingCategories ||
																categoryOptions.length === 0
															}>
															<SelectTrigger>
																<SelectValue
																	placeholder={
																		isLoadingCategories
																			? 'Loading categories...'
																			: 'Select category'
																	}
																/>
															</SelectTrigger>
															<SelectContent>
																{categoryOptions.map((cat) => (
																	<SelectItem
																		key={cat.id}
																		value={cat.id}>
																		<div className='flex items-center gap-2'>
																			<div
																				className='h-3 w-3 rounded-full'
																				style={{
																					backgroundColor:
																						cat.color,
																				}}
																			/>
																			<span>{cat.name}</span>
																		</div>
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
													<div className='md:col-span-2'>
														<Label htmlFor={`notes-${index}`}>
															Notes
														</Label>
														<Textarea
															id={`notes-${index}`}
															placeholder='Optional notes about this subscription'
															value={selection.overrides.notes || ''}
															onChange={(e) =>
																handleCandidateOverride(
																	index,
																	'notes',
																	e.target.value,
																)
															}
															rows={2}
														/>
													</div>
												</div>
											)}
										</CardContent>
									</Card>
								);
							})
						)}
					</TabsContent>

					<TabsContent value='matches' className='space-y-4'>
						{matches.length === 0 ? (
							<Card>
								<CardContent className='flex items-center justify-center py-8'>
									<div className='text-center text-muted-foreground'>
										<CheckCircle2 className='h-12 w-12 mx-auto mb-4 opacity-50' />
										<p>No existing subscription matches found</p>
									</div>
								</CardContent>
							</Card>
						) : (
							matches.map((match, index) => (
								<Card
									key={index}
									className={
										matchSelections[index] ? 'ring-2 ring-green-500' : ''
									}>
									<CardHeader className='pb-3'>
										<div className='flex items-start justify-between'>
											<div className='flex items-center gap-3'>
												<Checkbox
													checked={matchSelections[index] || false}
													onCheckedChange={(checked) =>
														handleMatchToggle(index, checked as boolean)
													}
												/>
												<div>
													<CardTitle className='text-lg'>
														{match.subscription.name}
													</CardTitle>
													<div className='flex items-center gap-2 mt-1'>
														<Badge className='bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'>
															{Math.round(match.confidence * 100)}%
															match
														</Badge>
														<Badge variant='outline'>
															Existing subscription
														</Badge>
													</div>
												</div>
											</div>
											<div className='text-right'>
												<div className='text-2xl font-bold'>
													{formatCurrency(
														match.subscription.amount,
														match.subscription.currency,
													)}
												</div>
												<div className='text-sm text-muted-foreground'>
													per{' '}
													{match.subscription.billingFrequency.replace(
														'ly',
														'',
													)}
												</div>
											</div>
										</div>
									</CardHeader>
									<CardContent>
										<div className='text-sm text-muted-foreground'>
											<p>
												<strong>Transaction:</strong>{' '}
												{match.transaction.description}
											</p>
											<p>
												<strong>Amount:</strong>{' '}
												{formatCurrency(
													Math.abs(match.transaction.amount),
													match.transaction.currency,
												)}
											</p>
											<p>
												<strong>Date:</strong>{' '}
												{match.transaction.date.toLocaleDateString()}
											</p>
										</div>
									</CardContent>
								</Card>
							))
						)}
					</TabsContent>
				</Tabs>

				<DialogFooter className='flex items-center justify-between'>
					<div className='text-sm text-muted-foreground'>
						{selectedCandidatesCount} new subscriptions and {selectedMatchesCount}{' '}
						matches selected
					</div>
					<div className='flex gap-2'>
						<Button variant='outline' onClick={onClose} disabled={isConfirming}>
							Cancel
						</Button>
						<Button
							onClick={handleConfirm}
							disabled={
								isConfirming ||
								(selectedCandidatesCount === 0 && selectedMatchesCount === 0)
							}>
							{isConfirming
								? 'Confirming...'
								: `Confirm ${selectedCandidatesCount + selectedMatchesCount} Items`}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
