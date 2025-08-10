/**
 * Budget Scenarios Comparison Page
 * Side-by-side comparison of different budget scenarios
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	ArrowLeft,
	TrendingUp,
	TrendingDown,
	DollarSign,
	BarChart3,
	PieChart,
	Calendar,
	Target,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

import type { BudgetScenario, Category } from '@/lib/types';

export default function ScenarioComparePage() {
	const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
	const router = useRouter();

	// Fetch all scenarios
	const { data: scenarios, isLoading: scenariosLoading } = useQuery<BudgetScenario[]>({
		queryKey: ['budget-scenarios'],
		queryFn: async () => {
			const response = await fetch('/api/budget-scenarios');
			if (!response.ok) {
				throw new Error('Failed to fetch budget scenarios');
			}
			const result = await response.json();
			return result.data;
		},
	});

	// Fetch categories for display names
	const { data: categories } = useQuery<Category[]>({
		queryKey: ['categories'],
		queryFn: async () => {
			const res = await fetch('/api/categories');
			if (!res.ok) throw new Error('Failed to fetch categories');
			const body = await res.json();
			return Array.isArray(body) ? body : body.data;
		},
	});

	const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));

	const handleScenarioSelect = (scenarioId: string, index: number) => {
		const newSelected = [...selectedScenarios];
		newSelected[index] = scenarioId;
		setSelectedScenarios(newSelected);
	};

	const selectedScenarioData = selectedScenarios
		.map((id) => scenarios?.find((s) => s.id === id))
		.filter(Boolean) as BudgetScenario[];

	if (scenariosLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='animate-pulse space-y-4'>
					<div className='h-8 bg-gray-200 rounded w-1/4'></div>
					<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
						{[1, 2].map((i) => (
							<div key={i} className='h-96 bg-gray-200 rounded'></div>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className='container mx-auto px-4 py-8'>
			{/* Header */}
			<div className='flex items-center gap-4 mb-8'>
				<Button variant='ghost' onClick={() => router.push('/budgets/scenarios')}>
					<ArrowLeft className='w-4 h-4 mr-2' />
					Back to Scenarios
				</Button>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>Compare Scenarios</h1>
					<p className='text-muted-foreground mt-2'>
						Compare budget allocations and totals across different scenarios
					</p>
				</div>
			</div>

			{/* Scenario Selectors */}
			<div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-8'>
				{[0, 1].map((index) => (
					<Card key={index}>
						<CardHeader>
							<CardTitle>Scenario {index + 1}</CardTitle>
						</CardHeader>
						<CardContent>
							<Select
								value={selectedScenarios[index] || ''}
								onValueChange={(value) => handleScenarioSelect(value, index)}>
								<SelectTrigger>
									<SelectValue placeholder='Select a scenario to compare' />
								</SelectTrigger>
								<SelectContent>
									{scenarios?.map((scenario) => (
										<SelectItem
											key={scenario.id}
											value={scenario.id}
											disabled={selectedScenarios.includes(scenario.id)}>
											{scenario.name} {scenario.isActive && '(Active)'}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Comparison Results */}
			{selectedScenarioData.length >= 2 && (
				<Tabs defaultValue='overview' className='space-y-8'>
					<TabsList className='grid w-full grid-cols-4'>
						<TabsTrigger value='overview'>Overview</TabsTrigger>
						<TabsTrigger value='allocation'>Allocation</TabsTrigger>
						<TabsTrigger value='impact'>Impact Analysis</TabsTrigger>
						<TabsTrigger value='projections'>Projections</TabsTrigger>
					</TabsList>

					<TabsContent value='overview' className='space-y-8'>
						{/* Summary Comparison */}
						<Card>
							<CardHeader>
								<CardTitle>Summary Comparison</CardTitle>
								<CardDescription>
									High-level comparison of the selected scenarios
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
									{selectedScenarioData.map((scenario, index) => (
										<div key={scenario.id} className='space-y-4'>
											<div className='flex items-center gap-2'>
												<h3 className='text-lg font-semibold'>
													{scenario.name}
												</h3>
												{scenario.isActive && (
													<Badge variant='default'>Active</Badge>
												)}
											</div>

											<div className='grid grid-cols-2 gap-4'>
												<div>
													<p className='text-sm text-muted-foreground'>
														Total Budgets
													</p>
													<p className='text-2xl font-bold'>
														{scenario.budgets.length}
													</p>
												</div>
												<div>
													<p className='text-sm text-muted-foreground'>
														Total Budgeted
													</p>
													<p className='text-2xl font-bold'>
														{scenario.totalBudgeted.toLocaleString(
															'nb-NO',
															{
																style: 'currency',
																currency: 'NOK',
															},
														)}
													</p>
												</div>
											</div>

											{scenario.description && (
												<p className='text-sm text-muted-foreground'>
													{scenario.description}
												</p>
											)}
										</div>
									))}
								</div>

								{/* Difference Analysis */}
								<Separator className='my-6' />
								<div className='space-y-4'>
									<h4 className='font-semibold'>Difference Analysis</h4>
									<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
										<div className='flex items-center gap-2'>
											<DollarSign className='w-4 h-4 text-muted-foreground' />
											<div>
												<p className='text-sm text-muted-foreground'>
													Budget Difference
												</p>
												<p className='font-medium'>
													{Math.abs(
														selectedScenarioData[1].totalBudgeted -
															selectedScenarioData[0].totalBudgeted,
													).toLocaleString('nb-NO', {
														style: 'currency',
														currency: 'NOK',
													})}
												</p>
											</div>
										</div>
										<div className='flex items-center gap-2'>
											{selectedScenarioData[1].budgets.length >
											selectedScenarioData[0].budgets.length ? (
												<TrendingUp className='w-4 h-4 text-green-600' />
											) : (
												<TrendingDown className='w-4 h-4 text-red-600' />
											)}
											<div>
												<p className='text-sm text-muted-foreground'>
													Budget Count Difference
												</p>
												<p className='font-medium'>
													{Math.abs(
														selectedScenarioData[1].budgets.length -
															selectedScenarioData[0].budgets.length,
													)}{' '}
													budgets
												</p>
											</div>
										</div>
										<div className='flex items-center gap-2'>
											{selectedScenarioData[1].totalBudgeted >
											selectedScenarioData[0].totalBudgeted ? (
												<TrendingUp className='w-4 h-4 text-blue-600' />
											) : (
												<TrendingDown className='w-4 h-4 text-orange-600' />
											)}
											<div>
												<p className='text-sm text-muted-foreground'>
													Higher Budget
												</p>
												<p className='font-medium'>
													{selectedScenarioData[1].totalBudgeted >
													selectedScenarioData[0].totalBudgeted
														? selectedScenarioData[1].name
														: selectedScenarioData[0].name}
												</p>
											</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Detailed Budget Comparison */}
						<Card>
							<CardHeader>
								<CardTitle>Budget Breakdown</CardTitle>
								<CardDescription>
									Detailed comparison of individual budgets by category
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
									{selectedScenarioData.map((scenario) => (
										<div key={scenario.id} className='space-y-4'>
											<h3 className='text-lg font-semibold border-b pb-2'>
												{scenario.name}
											</h3>

											{scenario.budgets.length === 0 ? (
												<p className='text-muted-foreground text-center py-8'>
													No budgets in this scenario
												</p>
											) : (
												<div className='space-y-3'>
													{scenario.budgets.map((budget) => (
														<div
															key={budget.id}
															className='flex justify-between items-center p-3 bg-gray-50 rounded'>
															<div>
																<p className='font-medium'>
																	{budget.name}
																</p>
																<p className='text-sm text-muted-foreground'>
																	{categoryNameById.get(
																		budget.categoryId,
																	) || 'Unknown category'}{' '}
																	• {budget.period}
																</p>
															</div>
															<div className='text-right'>
																<p className='font-medium'>
																	{budget.amount.toLocaleString(
																		'nb-NO',
																		{
																			style: 'currency',
																			currency: 'NOK',
																		},
																	)}
																</p>
															</div>
														</div>
													))}
												</div>
											)}
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value='allocation' className='space-y-8'>
						{/* Spending Allocation Comparison */}
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<PieChart className='w-5 h-5' />
									Spending Allocation Comparison
								</CardTitle>
								<CardDescription>
									Compare how budget amounts are distributed across categories
								</CardDescription>
							</CardHeader>
							<CardContent>
								{(() => {
									// Calculate category allocations for each scenario
									const getAllocations = (
										scenario: (typeof selectedScenarioData)[0],
									) => {
										const categoryTotals = new Map<string, number>();
										scenario.budgets.forEach((budget) => {
											const categoryName =
												categoryNameById.get(budget.categoryId) ||
												'Unknown';
											categoryTotals.set(
												categoryName,
												(categoryTotals.get(categoryName) || 0) +
													budget.amount,
											);
										});
										return Array.from(categoryTotals.entries())
											.map(([category, amount]) => ({
												category,
												amount,
												percentage:
													scenario.totalBudgeted > 0
														? (amount / scenario.totalBudgeted) * 100
														: 0,
											}))
											.sort((a, b) => b.amount - a.amount);
									};

									const allocations = selectedScenarioData.map(getAllocations);
									const allCategories = new Set([
										...allocations[0].map((a) => a.category),
										...allocations[1].map((a) => a.category),
									]);

									return (
										<div className='space-y-6'>
											{Array.from(allCategories).map((category) => {
												const allocation1 = allocations[0].find(
													(a) => a.category === category,
												);
												const allocation2 = allocations[1].find(
													(a) => a.category === category,
												);

												return (
													<div key={category} className='space-y-2'>
														<div className='flex justify-between items-center'>
															<h4 className='font-medium'>
																{category}
															</h4>
															<div className='text-sm text-muted-foreground'>
																{allocation1 && allocation2 && (
																	<span>
																		Difference:{' '}
																		{Math.abs(
																			allocation1.amount -
																				allocation2.amount,
																		).toLocaleString('nb-NO', {
																			style: 'currency',
																			currency: 'NOK',
																		})}
																	</span>
																)}
															</div>
														</div>
														<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
															{selectedScenarioData.map(
																(scenario, index) => {
																	const allocation = allocations[
																		index
																	].find(
																		(a) =>
																			a.category === category,
																	);
																	return (
																		<div
																			key={scenario.id}
																			className='space-y-2'>
																			<div className='flex justify-between text-sm'>
																				<span>
																					{scenario.name}
																				</span>
																				<span>
																					{allocation
																						? allocation.amount.toLocaleString(
																								'nb-NO',
																								{
																									style: 'currency',
																									currency:
																										'NOK',
																								},
																							)
																						: 'NOK 0'}
																					{allocation &&
																						` (${allocation.percentage.toFixed(1)}%)`}
																				</span>
																			</div>
																			<Progress
																				value={
																					allocation?.percentage ||
																					0
																				}
																				className='h-2'
																			/>
																		</div>
																	);
																},
															)}
														</div>
													</div>
												);
											})}
										</div>
									);
								})()}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value='impact' className='space-y-8'>
						{/* Impact Analysis */}
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Target className='w-5 h-5' />
									Scenario Switch Impact Analysis
								</CardTitle>
								<CardDescription>
									Analyze the financial impact of switching between scenarios
								</CardDescription>
							</CardHeader>
							<CardContent>
								{(() => {
									const scenario1 = selectedScenarioData[0];
									const scenario2 = selectedScenarioData[1];
									const budgetDifference =
										scenario2.totalBudgeted - scenario1.totalBudgeted;
									const isIncrease = budgetDifference > 0;

									return (
										<div className='space-y-6'>
											<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
												<Card>
													<CardContent className='pt-6'>
														<div className='flex items-center gap-2'>
															{isIncrease ? (
																<TrendingUp className='w-4 h-4 text-green-600' />
															) : (
																<TrendingDown className='w-4 h-4 text-red-600' />
															)}
															<div>
																<p className='text-sm text-muted-foreground'>
																	Budget Change
																</p>
																<p
																	className={`text-2xl font-bold ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
																	{isIncrease ? '+' : ''}
																	{budgetDifference.toLocaleString(
																		'nb-NO',
																		{
																			style: 'currency',
																			currency: 'NOK',
																		},
																	)}
																</p>
															</div>
														</div>
													</CardContent>
												</Card>

												<Card>
													<CardContent className='pt-6'>
														<div className='flex items-center gap-2'>
															<BarChart3 className='w-4 h-4 text-blue-600' />
															<div>
																<p className='text-sm text-muted-foreground'>
																	Percentage Change
																</p>
																<p className='text-2xl font-bold text-blue-600'>
																	{scenario1.totalBudgeted > 0
																		? `${((budgetDifference / scenario1.totalBudgeted) * 100).toFixed(1)}%`
																		: 'N/A'}
																</p>
															</div>
														</div>
													</CardContent>
												</Card>

												<Card>
													<CardContent className='pt-6'>
														<div className='flex items-center gap-2'>
															<Calendar className='w-4 h-4 text-purple-600' />
															<div>
																<p className='text-sm text-muted-foreground'>
																	Monthly Impact
																</p>
																<p className='text-2xl font-bold text-purple-600'>
																	{(
																		budgetDifference / 12
																	).toLocaleString('nb-NO', {
																		style: 'currency',
																		currency: 'NOK',
																	})}
																</p>
															</div>
														</div>
													</CardContent>
												</Card>
											</div>

											<div className='space-y-4'>
												<h4 className='font-semibold'>
													Category-Level Impact
												</h4>
												{(() => {
													// Calculate category-level changes
													const categoryChanges = new Map<
														string,
														{ from: number; to: number; change: number }
													>();

													// Get all categories from both scenarios
													const allCategories = new Set([
														...scenario1.budgets.map(
															(b) => b.categoryId,
														),
														...scenario2.budgets.map(
															(b) => b.categoryId,
														),
													]);

													allCategories.forEach((categoryId) => {
														const fromAmount = scenario1.budgets
															.filter(
																(b) => b.categoryId === categoryId,
															)
															.reduce((sum, b) => sum + b.amount, 0);
														const toAmount = scenario2.budgets
															.filter(
																(b) => b.categoryId === categoryId,
															)
															.reduce((sum, b) => sum + b.amount, 0);

														if (fromAmount !== toAmount) {
															categoryChanges.set(categoryId, {
																from: fromAmount,
																to: toAmount,
																change: toAmount - fromAmount,
															});
														}
													});

													return Array.from(categoryChanges.entries())
														.sort(
															([, a], [, b]) =>
																Math.abs(b.change) -
																Math.abs(a.change),
														)
														.map(([categoryId, change]) => {
															const categoryName =
																categoryNameById.get(categoryId) ||
																'Unknown';
															const isIncrease = change.change > 0;

															return (
																<div
																	key={categoryId}
																	className='flex justify-between items-center p-3 bg-gray-50 rounded'>
																	<div>
																		<p className='font-medium'>
																			{categoryName}
																		</p>
																		<p className='text-sm text-muted-foreground'>
																			{change.from.toLocaleString(
																				'nb-NO',
																				{
																					style: 'currency',
																					currency: 'NOK',
																				},
																			)}{' '}
																			→{' '}
																			{change.to.toLocaleString(
																				'nb-NO',
																				{
																					style: 'currency',
																					currency: 'NOK',
																				},
																			)}
																		</p>
																	</div>
																	<div className='text-right'>
																		<p
																			className={`font-medium ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
																			{isIncrease ? '+' : ''}
																			{change.change.toLocaleString(
																				'nb-NO',
																				{
																					style: 'currency',
																					currency: 'NOK',
																				},
																			)}
																		</p>
																		<p className='text-sm text-muted-foreground'>
																			{change.from > 0
																				? `${((change.change / change.from) * 100).toFixed(1)}%`
																				: 'New'}
																		</p>
																	</div>
																</div>
															);
														});
												})()}
											</div>
										</div>
									);
								})()}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value='projections' className='space-y-8'>
						{/* Scenario Projections */}
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Calendar className='w-5 h-5' />
									Scenario-Based Projections
								</CardTitle>
								<CardDescription>
									Project financial outcomes based on each scenario
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='space-y-6'>
									<div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
										{selectedScenarioData.map((scenario) => (
											<div key={scenario.id} className='space-y-4'>
												<h3 className='text-lg font-semibold border-b pb-2'>
													{scenario.name} Projections
												</h3>

												<div className='space-y-4'>
													<div className='grid grid-cols-2 gap-4'>
														<div>
															<p className='text-sm text-muted-foreground'>
																3-Month Projection
															</p>
															<p className='text-xl font-bold'>
																{(
																	scenario.totalBudgeted * 0.25
																).toLocaleString('nb-NO', {
																	style: 'currency',
																	currency: 'NOK',
																})}
															</p>
														</div>
														<div>
															<p className='text-sm text-muted-foreground'>
																6-Month Projection
															</p>
															<p className='text-xl font-bold'>
																{(
																	scenario.totalBudgeted * 0.5
																).toLocaleString('nb-NO', {
																	style: 'currency',
																	currency: 'NOK',
																})}
															</p>
														</div>
														<div>
															<p className='text-sm text-muted-foreground'>
																Annual Projection
															</p>
															<p className='text-xl font-bold'>
																{scenario.totalBudgeted.toLocaleString(
																	'nb-NO',
																	{
																		style: 'currency',
																		currency: 'NOK',
																	},
																)}
															</p>
														</div>
														<div>
															<p className='text-sm text-muted-foreground'>
																Avg Monthly
															</p>
															<p className='text-xl font-bold'>
																{(
																	scenario.totalBudgeted / 12
																).toLocaleString('nb-NO', {
																	style: 'currency',
																	currency: 'NOK',
																})}
															</p>
														</div>
													</div>

													<div className='space-y-2'>
														<h4 className='font-medium'>
															Budget Distribution
														</h4>
														{scenario.budgets
															.slice(0, 5)
															.map((budget) => {
																const percentage =
																	scenario.totalBudgeted > 0
																		? (budget.amount /
																				scenario.totalBudgeted) *
																			100
																		: 0;
																return (
																	<div
																		key={budget.id}
																		className='space-y-1'>
																		<div className='flex justify-between text-sm'>
																			<span>
																				{budget.name}
																			</span>
																			<span>
																				{percentage.toFixed(
																					1,
																				)}
																				%
																			</span>
																		</div>
																		<Progress
																			value={percentage}
																			className='h-1'
																		/>
																	</div>
																);
															})}
														{scenario.budgets.length > 5 && (
															<p className='text-sm text-muted-foreground'>
																+{scenario.budgets.length - 5} more
																budgets
															</p>
														)}
													</div>
												</div>
											</div>
										))}
									</div>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			)}

			{selectedScenarioData.length < 2 && (
				<Card>
					<CardContent className='flex flex-col items-center justify-center py-16'>
						<DollarSign className='w-12 h-12 text-muted-foreground mb-4' />
						<h3 className='text-lg font-semibold mb-2'>Select Two Scenarios</h3>
						<p className='text-muted-foreground text-center'>
							Choose two scenarios from the dropdowns above to see a detailed
							comparison.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
