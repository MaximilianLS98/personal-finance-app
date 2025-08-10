'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar as CalendarIcon } from 'lucide-react';

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';

import type { Category, Budget, BudgetScenario } from '@/lib/types';

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

const SENTINEL_END_DATE = '9999-12-31';

const toDateInput = (d: Date | string | undefined): string => {
	if (!d) return '';
	const date = typeof d === 'string' ? new Date(d) : d;
	return date.toISOString().split('T')[0];
};

const isIndefinite = (endDate: Date | string | undefined): boolean => {
	if (!endDate) return false;
	const date = typeof endDate === 'string' ? new Date(endDate) : endDate;
	return date.getFullYear() >= 9999;
};

export default function EditBudgetPage() {
	const params = useParams();
	const router = useRouter();
	const queryClient = useQueryClient();
	const budgetId = params.id as string;

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
	const [indefinite, setIndefinite] = useState<boolean>(false);

	// Fetch categories
	const { data: categories } = useQuery<Category[]>({
		queryKey: ['categories'],
		queryFn: async () => {
			const resp = await fetch('/api/categories');
			if (!resp.ok) throw new Error('Failed to fetch categories');
			const result = await resp.json();
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

	// Fetch budget details
	const {
		data: budgetData,
		isLoading,
		isError,
	} = useQuery<{ budget: Budget }>({
		queryKey: ['budget', budgetId],
		queryFn: async () => {
			const resp = await fetch(`/api/budgets/${budgetId}`);
			if (!resp.ok) throw new Error('Failed to fetch budget');
			const result = await resp.json();
			return result.data;
		},
	});

	// Initialize form from fetched budget
	useEffect(() => {
		if (!budgetData?.budget) return;
		const b = budgetData.budget;
		setFormData({
			name: b.name,
			description: b.description ?? '',
			categoryId: b.categoryId,
			amount: b.amount,
			currency: b.currency,
			period: b.period,
			startDate: format(new Date(b.startDate), 'yyyy-MM-dd'),
			endDate: format(new Date(b.endDate), 'yyyy-MM-dd'),
			alertThresholds: b.alertThresholds ?? [50, 75, 90, 100],
			scenarioId: b.scenarioId,
		});
		setIndefinite(isIndefinite(b.endDate));
	}, [budgetData]);

	// If categories load after form and categoryId is missing, try to set it
	useEffect(() => {
		if (!categories || !budgetData?.budget) return;
		if (!formData.categoryId) {
			setFormData((prev) => ({ ...prev, categoryId: budgetData.budget.categoryId }));
		}
	}, [categories, budgetData]);

	// Update end date automatically when startDate/period change (if not indefinite)
	useEffect(() => {
		if (!formData.startDate || indefinite) return;
		const start = new Date(formData.startDate);
		const end = new Date(start);
		if (formData.period === 'monthly') {
			end.setMonth(end.getMonth() + 1);
		} else {
			end.setFullYear(end.getFullYear() + 1);
		}
		setFormData((prev) => ({ ...prev, endDate: format(end, 'yyyy-MM-dd') }));
	}, [formData.startDate, formData.period, indefinite]);

	// Normalize dates when indefinite is toggled on
	useEffect(() => {
		if (!indefinite) return;
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
	}, [indefinite, formData.period]);

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: async (updates: Partial<Budget>) => {
			const resp = await fetch(`/api/budgets/${budgetId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates),
			});
			if (!resp.ok) {
				const err = await resp.json();
				throw new Error(err.message || 'Failed to update budget');
			}
			return resp.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budget-dashboard'] });
			queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
			router.push('/budgets');
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const payload: Partial<Budget> = {
			name: formData.name,
			description: formData.description || undefined,
			categoryId: formData.categoryId,
			amount: formData.amount,
			currency: formData.currency,
			period: formData.period,
			startDate: new Date(formData.startDate),
			endDate: new Date(indefinite ? SENTINEL_END_DATE : formData.endDate),
			alertThresholds: formData.alertThresholds,
			scenarioId: formData.scenarioId,
		} as Partial<Budget>;
		updateMutation.mutate(payload);
	};

	if (isLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='animate-pulse space-y-4'>
					<div className='h-8 bg-gray-200 rounded w-1/4'></div>
					<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
						{[1, 2, 3].map((i) => (
							<div key={i} className='h-32 bg-gray-200 rounded'></div>
						))}
					</div>
					<div className='h-96 bg-gray-200 rounded'></div>
				</div>
			</div>
		);
	}

	if (isError || !budgetData?.budget) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='text-center py-8'>
					<p className='text-red-600 mb-4'>Error loading budget</p>
					<Button onClick={() => router.back()}>Go Back</Button>
				</div>
			</div>
		);
	}

	return (
		<div className='container mx-auto px-4 py-8 max-w-4xl'>
			{/* Header */}
			<div className='flex items-center mb-8'>
				<Button variant='ghost' size='sm' onClick={() => router.back()} className='mr-4'>
					<ArrowLeft className='w-4 h-4 mr-2' />
					Back
				</Button>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>Edit Budget</h1>
					<p className='text-muted-foreground mt-2'>Update your budget details</p>
				</div>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
				{/* Form */}
				<div className='lg:col-span-2'>
					<form onSubmit={handleSubmit} className='space-y-6'>
						<Card>
							<CardHeader>
								<CardTitle>Budget Details</CardTitle>
								<CardDescription>Modify your budget parameters</CardDescription>
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
									/>
								</div>

								{/* Category */}
								<div>
									<Label htmlFor='category'>Category</Label>
									<Select
										value={formData.categoryId || undefined}
										onValueChange={(v) =>
											setFormData((prev) => ({ ...prev, categoryId: v }))
										}
										required>
										<SelectTrigger>
											<SelectValue placeholder='Select a category' />
										</SelectTrigger>
										<SelectContent>
											{categories?.map((c) => (
												<SelectItem key={c.id} value={c.id}>
													{c.name}
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
											onValueChange={(v: 'monthly' | 'yearly') =>
												setFormData((prev) => ({ ...prev, period: v }))
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
													disabled={indefinite}>
													<CalendarIcon className='mr-2 h-4 w-4' />
													{indefinite
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
										checked={indefinite}
										onCheckedChange={setIndefinite}
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
							<Button
								type='button'
								variant='outline'
								onClick={() => router.push('/budgets')}>
								Cancel
							</Button>
							<Button type='submit'>Save Changes</Button>
						</div>
					</form>
				</div>

				{/* Tips or side content could go here if needed */}
			</div>
		</div>
	);
}
