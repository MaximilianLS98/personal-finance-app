/**
 * Create New Budget Page
 * Form for creating new budgets with intelligent suggestions
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	Lightbulb,
	TrendingUp,
	Calendar as CalendarIcon,
	DollarSign,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';

import type { Category, BudgetSuggestion, CreateBudgetRequest, BudgetScenario } from '@/lib/types';

interface FormData {
	name: string;
	description: string;
	categoryId: string;
	amount: number;
	currency: string;
	period: 'monthly' | 'yearly';
	startDate: string;
	endDate: string;
	alertThresholds: number[];
	scenarioId?: string;
}

export default function NewBudgetPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();
	const [isIndefinite, setIsIndefinite] = useState<boolean>(false);

	const [formData, setFormData] = useState<FormData>({
		name: '',
		description: '',
		categoryId: '',
		amount: 0,
		currency: 'NOK',
		period: 'monthly',
		startDate: format(new Date(), 'yyyy-MM-dd'),
		endDate: format(new Date(new Date().setMonth(new Date().getMonth() + 1)), 'yyyy-MM-dd'),
		alertThresholds: [50, 75, 90, 100],
		scenarioId: undefined,
	});

	const [selectedSuggestion, setSelectedSuggestion] = useState<
		'conservative' | 'moderate' | 'aggressive' | null
	>(null);

	// Fetch categories
	const { data: categories } = useQuery<Category[]>({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await fetch('/api/categories');
			if (!response.ok) throw new Error('Failed to fetch categories');
			const result = await response.json();
			return Array.isArray(result) ? result : result.data;
		},
	});

	// Fetch scenarios
	const { data: scenarios } = useQuery<BudgetScenario[]>({
		queryKey: ['budget-scenarios'],
		queryFn: async () => {
			const response = await fetch('/api/budget-scenarios');
			if (!response.ok) throw new Error('Failed to fetch scenarios');
			const result = await response.json();
			return result.data;
		},
	});

	// Fetch suggestions when category and dates are selected
	const { data: suggestions, isLoading: suggestionsLoading } = useQuery<BudgetSuggestion>({
		queryKey: [
			'budget-suggestions',
			formData.categoryId,
			formData.period,
			formData.startDate,
			formData.endDate,
		],
		queryFn: async () => {
			if (!formData.categoryId || !formData.startDate || !formData.endDate) return null;

			const params = new URLSearchParams({
				period: formData.period,
				startDate: formData.startDate,
				endDate: formData.endDate,
			});

			const response = await fetch(
				`/api/budgets/suggestions/${formData.categoryId}?${params}`,
			);
			if (!response.ok) throw new Error('Failed to fetch suggestions');
			const result = await response.json();
			return result.data;
		},
		enabled:
			!!formData.categoryId && !!formData.startDate && !!formData.endDate && !isIndefinite,
	});

	// Create budget mutation
	const createBudgetMutation = useMutation({
		mutationFn: async (data: CreateBudgetRequest) => {
			const response = await fetch('/api/budgets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data),
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to create budget');
			}
			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budget-dashboard'] });
			router.push('/budgets');
		},
	});

	// Handle form submission
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const SENTINEL_END_DATE = '9999-12-31';
		const request: CreateBudgetRequest = {
			name: formData.name,
			description: formData.description || undefined,
			categoryId: formData.categoryId,
			amount: formData.amount,
			currency: formData.currency,
			period: formData.period,
			startDate: new Date(formData.startDate),
			endDate: new Date(isIndefinite ? SENTINEL_END_DATE : formData.endDate),
			alertThresholds: formData.alertThresholds,
			scenarioId: formData.scenarioId,
		};

		createBudgetMutation.mutate(request);
	};

	// Apply suggestion to form
	const applySuggestion = (type: 'conservative' | 'moderate' | 'aggressive') => {
		if (!suggestions) return;

		const suggestion = suggestions.suggestions[type];
		setFormData((prev) => ({
			...prev,
			amount: suggestion.amount,
		}));
		setSelectedSuggestion(type);
	};

	// Update end date when period or start date changes
	useEffect(() => {
		if (isIndefinite || !formData.startDate) return;
		const start = new Date(formData.startDate);
		const end = new Date(start);
		if (formData.period === 'monthly') {
			end.setMonth(end.getMonth() + 1);
		} else {
			end.setFullYear(end.getFullYear() + 1);
		}
		setFormData((prev) => ({ ...prev, endDate: format(end, 'yyyy-MM-dd') }));
	}, [formData.startDate, formData.period, isIndefinite]);

	// Indefinite toggle handler: normalize period to calendar window
	useEffect(() => {
		if (!isIndefinite) return;
		const now = new Date();
		if (formData.period === 'monthly') {
			const first = new Date(now.getFullYear(), now.getMonth(), 1);
			const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			setFormData((prev) => ({
				...prev,
				startDate: format(first, 'yyyy-MM-dd'),
				endDate: format(last, 'yyyy-MM-dd'),
			}));
		} else {
			const first = new Date(now.getFullYear(), 0, 1);
			const last = new Date(now.getFullYear(), 11, 31);
			setFormData((prev) => ({
				...prev,
				startDate: format(first, 'yyyy-MM-dd'),
				endDate: format(last, 'yyyy-MM-dd'),
			}));
		}
	}, [isIndefinite, formData.period]);

	// Set scenario ID from URL parameters
	useEffect(() => {
		const scenarioId = searchParams.get('scenarioId');
		if (scenarioId) {
			setFormData((prev) => ({
				...prev,
				scenarioId,
			}));
		}
	}, [searchParams]);

	return (
		<div className='container mx-auto px-4 py-8 max-w-4xl'>
			{/* Header */}
			<div className='flex items-center mb-8'>
				<Button variant='ghost' size='sm' onClick={() => router.back()} className='mr-4'>
					<ArrowLeft className='w-4 h-4 mr-2' />
					Back
				</Button>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>Create New Budget</h1>
					<p className='text-muted-foreground mt-2'>
						Set spending limits and get intelligent suggestions based on your history
					</p>
				</div>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
				{/* Form */}
				<div className='lg:col-span-2'>
					<form onSubmit={handleSubmit} className='space-y-6'>
						<Card>
							<CardHeader>
								<CardTitle>Budget Details</CardTitle>
								<CardDescription>
									Configure your budget parameters and spending limits
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-4'>
								{/* Name */}
								<div>
									<Label htmlFor='name'>Budget Name</Label>
									<Input
										id='name'
										value={formData.name}
										onChange={(e) =>
											setFormData((prev) => ({
												...prev,
												name: e.target.value,
											}))
										}
										placeholder='e.g., Monthly Groceries'
										required
									/>
								</div>

								{/* Description */}
								<div>
									<Label htmlFor='description'>Description (Optional)</Label>
									<Textarea
										id='description'
										value={formData.description}
										onChange={(e) =>
											setFormData((prev) => ({
												...prev,
												description: e.target.value,
											}))
										}
										placeholder='Additional notes about this budget...'
									/>
								</div>

								{/* Category */}
								<div>
									<Label htmlFor='category'>Category</Label>
									<Select
										value={formData.categoryId}
										onValueChange={(value) =>
											setFormData((prev) => ({ ...prev, categoryId: value }))
										}
										required>
										<SelectTrigger>
											<SelectValue placeholder='Select a category' />
										</SelectTrigger>
										<SelectContent>
											{categories?.map((category) => (
												<SelectItem key={category.id} value={category.id}>
													{category.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Scenario */}
								<div>
									<Label htmlFor='scenario'>Budget Scenario (Optional)</Label>
									<Select
										value={formData.scenarioId || 'active'}
										onValueChange={(value) =>
											setFormData((prev) => ({
												...prev,
												scenarioId: value === 'active' ? undefined : value,
											}))
										}>
										<SelectTrigger>
											<SelectValue placeholder='Select a scenario' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='active'>Active Scenario</SelectItem>
											{scenarios?.map((scenario) => (
												<SelectItem key={scenario.id} value={scenario.id}>
													{scenario.name}
													{scenario.isActive && ' (Active)'}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Period and Dates */}
								<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
									<div>
										<Label htmlFor='period'>Period</Label>
										<Select
											value={formData.period}
											onValueChange={(value: 'monthly' | 'yearly') =>
												setFormData((prev) => ({ ...prev, period: value }))
											}>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value='monthly'>Monthly</SelectItem>
												<SelectItem value='yearly'>Yearly</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div>
										<Label>Start Date</Label>
										<Popover>
											<PopoverTrigger asChild>
												<Button
													variant='outline'
													className='w-full justify-start text-left font-normal'>
													<CalendarIcon className='mr-2 h-4 w-4' />
													{formData.startDate
														? format(
																new Date(formData.startDate),
																'MMM dd, yyyy',
															)
														: 'Pick a date'}
												</Button>
											</PopoverTrigger>
											<PopoverContent className='w-auto p-0'>
												<Calendar
													mode='single'
													selected={
														formData.startDate
															? new Date(formData.startDate)
															: undefined
													}
													onSelect={(date) => {
														if (!date) return;
														setFormData((prev) => ({
															...prev,
															startDate: format(date, 'yyyy-MM-dd'),
														}));
													}}
													initialFocus
												/>
											</PopoverContent>
										</Popover>
									</div>

									<div>
										<Label>End Date</Label>
										<Popover>
											<PopoverTrigger asChild>
												<Button
													variant='outline'
													className='w-full justify-start text-left font-normal'
													disabled={isIndefinite}>
													<CalendarIcon className='mr-2 h-4 w-4' />
													{isIndefinite
														? 'No end date'
														: formData.endDate
															? format(
																	new Date(formData.endDate),
																	'MMM dd, yyyy',
																)
															: 'Pick a date'}
												</Button>
											</PopoverTrigger>
											<PopoverContent className='w-auto p-0'>
												<Calendar
													mode='single'
													selected={
														formData.endDate
															? new Date(formData.endDate)
															: undefined
													}
													onSelect={(date) => {
														if (!date) return;
														setFormData((prev) => ({
															...prev,
															endDate: format(date, 'yyyy-MM-dd'),
														}));
													}}
													initialFocus
												/>
											</PopoverContent>
										</Popover>
									</div>
								</div>

								{/* Indefinite toggle */}
								<div className='flex items-center space-x-2'>
									<Switch
										id='indefinite'
										checked={isIndefinite}
										onCheckedChange={setIsIndefinite}
									/>
									<Label htmlFor='indefinite'>
										No end date (run indefinitely)
									</Label>
								</div>

								{/* Amount */}
								<div>
									<Label htmlFor='amount'>Budget Amount</Label>
									<div className='relative'>
										<Input
											id='amount'
											type='number'
											min='0'
											step='0.01'
											value={formData.amount}
											onChange={(e) =>
												setFormData((prev) => ({
													...prev,
													amount: parseFloat(e.target.value) || 0,
												}))
											}
											className='pl-12'
											placeholder='0.00'
											required
										/>
										<div className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground'>
											{formData.currency}
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Submit */}
						<div className='flex justify-end space-x-4'>
							<Button type='button' variant='outline' onClick={() => router.back()}>
								Cancel
							</Button>
							<Button type='submit' disabled={createBudgetMutation.isPending}>
								{createBudgetMutation.isPending ? 'Creating...' : 'Create Budget'}
							</Button>
						</div>
					</form>
				</div>

				{/* Suggestions */}
				<div className='lg:col-span-1'>
					<Card>
						<CardHeader>
							<CardTitle className='flex items-center'>
								<Lightbulb className='w-5 h-5 mr-2' />
								Smart Suggestions
							</CardTitle>
							<CardDescription>
								AI-powered recommendations based on your spending history
							</CardDescription>
						</CardHeader>
						<CardContent>
							{!formData.categoryId ? (
								<p className='text-muted-foreground text-sm'>
									Select a category to see personalized suggestions
								</p>
							) : suggestionsLoading ? (
								<div className='space-y-3'>
									{[1, 2, 3].map((i) => (
										<div
											key={i}
											className='h-20 bg-gray-200 rounded animate-pulse'></div>
									))}
								</div>
							) : suggestions ? (
								<div className='space-y-4'>
									<Tabs defaultValue='moderate' className='w-full'>
										<TabsList className='grid w-full grid-cols-3'>
											<TabsTrigger value='conservative'>Safe</TabsTrigger>
											<TabsTrigger value='moderate'>Balanced</TabsTrigger>
											<TabsTrigger value='aggressive'>Tight</TabsTrigger>
										</TabsList>

										{(['conservative', 'moderate', 'aggressive'] as const).map(
											(type) => (
												<TabsContent key={type} value={type}>
													<div className='border rounded-lg p-4 space-y-3'>
														<div className='flex items-center justify-between'>
															<span className='font-medium text-lg'>
																{suggestions.suggestions[
																	type
																].amount.toLocaleString('nb-NO', {
																	style: 'currency',
																	currency: 'NOK',
																})}
															</span>
															<Badge variant='outline'>
																{Math.round(
																	suggestions.suggestions[type]
																		.confidence * 100,
																)}
																% confidence
															</Badge>
														</div>
														<p className='text-sm text-muted-foreground'>
															{
																suggestions.suggestions[type]
																	.reasoning
															}
														</p>
														<Button
															size='sm'
															variant={
																selectedSuggestion === type
																	? 'default'
																	: 'outline'
															}
															onClick={() => applySuggestion(type)}
															className='w-full'>
															{selectedSuggestion === type
																? 'Applied'
																: 'Use This Amount'}
														</Button>
													</div>
												</TabsContent>
											),
										)}
									</Tabs>

									{/* Historical Context */}
									<div className='border-t pt-4 space-y-2'>
										<h4 className='font-medium text-sm'>Historical Data</h4>
										<div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
											<div>
												<span>Average: </span>
												<span className='font-medium'>
													{suggestions.historicalData.averageSpending.toLocaleString(
														'nb-NO',
														{
															style: 'currency',
															currency: 'NOK',
														},
													)}
												</span>
											</div>
											<div>
												<span>Range: </span>
												<span className='font-medium'>
													{suggestions.historicalData.minSpending.toLocaleString(
														'nb-NO',
														{
															style: 'currency',
															currency: 'NOK',
														},
													)}{' '}
													-{' '}
													{suggestions.historicalData.maxSpending.toLocaleString(
														'nb-NO',
														{
															style: 'currency',
															currency: 'NOK',
														},
													)}
												</span>
											</div>
										</div>
										{suggestions.subscriptionCosts.subscriptionCount > 0 && (
											<div className='text-xs text-muted-foreground'>
												<span>Fixed costs: </span>
												<span className='font-medium'>
													{suggestions.subscriptionCosts.fixedAmount.toLocaleString(
														'nb-NO',
														{
															style: 'currency',
															currency: 'NOK',
														},
													)}{' '}
													from{' '}
													{
														suggestions.subscriptionCosts
															.subscriptionCount
													}{' '}
													subscription
													{suggestions.subscriptionCosts
														.subscriptionCount > 1
														? 's'
														: ''}
												</span>
											</div>
										)}
									</div>
								</div>
							) : (
								<p className='text-muted-foreground text-sm'>
									No suggestions available for this category
								</p>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
