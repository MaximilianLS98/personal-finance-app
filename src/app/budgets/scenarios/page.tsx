/**
 * Budget Scenarios Management Page
 * Interface for creating, managing, and switching between budget scenarios
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Plus,
	Settings,
	Archive,
	Copy,
	CheckCircle,
	Circle,
	Trash2,
	BarChart3,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
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
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import type { BudgetScenario } from '@/lib/types';

interface CreateScenarioForm {
	name: string;
	description: string;
	copyFromScenarioId?: string;
}

export default function BudgetScenariosPage() {
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [createForm, setCreateForm] = useState<CreateScenarioForm>({
		name: '',
		description: '',
		copyFromScenarioId: undefined,
	});
	const queryClient = useQueryClient();
	const router = useRouter();

	// Fetch all scenarios
	const {
		data: scenarios,
		isLoading,
		error,
	} = useQuery<BudgetScenario[]>({
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

	// Create scenario mutation
	const createScenarioMutation = useMutation({
		mutationFn: async (data: CreateScenarioForm) => {
			const response = await fetch('/api/budget-scenarios', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			});
			if (!response.ok) {
				throw new Error('Failed to create scenario');
			}
			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budget-scenarios'] });
			setIsCreateDialogOpen(false);
			setCreateForm({ name: '', description: '', copyFromScenarioId: undefined });
		},
	});

	// Activate scenario mutation
	const activateScenarioMutation = useMutation({
		mutationFn: async (scenarioId: string) => {
			const response = await fetch(`/api/budget-scenarios/${scenarioId}/activate`, {
				method: 'PUT',
			});
			if (!response.ok) {
				throw new Error('Failed to activate scenario');
			}
			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budget-scenarios'] });
			queryClient.invalidateQueries({ queryKey: ['budget-dashboard'] });
		},
	});

	// Delete scenario mutation
	const deleteScenarioMutation = useMutation({
		mutationFn: async (scenarioId: string) => {
			const response = await fetch(`/api/budget-scenarios/${scenarioId}`, {
				method: 'DELETE',
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to delete scenario');
			}
			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budget-scenarios'] });
		},
	});

	const handleCreateScenario = () => {
		if (!createForm.name.trim()) return;
		createScenarioMutation.mutate(createForm);
	};

	const handleActivateScenario = (scenarioId: string) => {
		activateScenarioMutation.mutate(scenarioId);
	};

	const handleDeleteScenario = (scenarioId: string) => {
		deleteScenarioMutation.mutate(scenarioId);
	};

	if (isLoading) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='animate-pulse space-y-4'>
					<div className='h-8 bg-gray-200 rounded w-1/4'></div>
					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
						{[1, 2, 3].map((i) => (
							<div key={i} className='h-48 bg-gray-200 rounded'></div>
						))}
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<div className='text-center py-8'>
					<p className='text-red-600 mb-4'>Error loading budget scenarios</p>
					<Button
						onClick={() =>
							queryClient.invalidateQueries({ queryKey: ['budget-scenarios'] })
						}>
						Retry
					</Button>
				</div>
			</div>
		);
	}

	const activeScenario = scenarios?.find((s) => s.isActive);
	const inactiveScenarios = scenarios?.filter((s) => !s.isActive) || [];

	return (
		<div className='container mx-auto px-4 py-8'>
			{/* Header */}
			<div className='flex justify-between items-center mb-8'>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>Budget Scenarios</h1>
					<p className='text-muted-foreground mt-2'>
						Manage different budget scenarios for various financial situations
					</p>
				</div>
				<div className='flex gap-2'>
					<Button
						variant='outline'
						onClick={() => router.push('/budgets/scenarios/compare')}>
						<BarChart3 className='w-4 h-4 mr-2' />
						Compare
					</Button>
					<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
						<DialogTrigger asChild>
							<Button>
								<Plus className='w-4 h-4 mr-2' />
								New Scenario
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Create Budget Scenario</DialogTitle>
								<DialogDescription>
									Create a new budget scenario to manage different financial
									plans.
								</DialogDescription>
							</DialogHeader>
							<div className='space-y-4'>
								<div>
									<Label htmlFor='name'>Scenario Name</Label>
									<Input
										id='name'
										value={createForm.name}
										onChange={(e) =>
											setCreateForm({ ...createForm, name: e.target.value })
										}
										placeholder='e.g., Conservative, Vacation Planning'
									/>
								</div>
								<div>
									<Label htmlFor='description'>Description (Optional)</Label>
									<Textarea
										id='description'
										value={createForm.description}
										onChange={(e) =>
											setCreateForm({
												...createForm,
												description: e.target.value,
											})
										}
										placeholder='Describe this scenario...'
										rows={3}
									/>
								</div>
								<div>
									<Label htmlFor='copyFrom'>
										Copy From Existing Scenario (Optional)
									</Label>
									<Select
										value={createForm.copyFromScenarioId || 'none'}
										onValueChange={(value) =>
											setCreateForm({
												...createForm,
												copyFromScenarioId:
													value === 'none' ? undefined : value,
											})
										}>
										<SelectTrigger>
											<SelectValue placeholder='Select scenario to copy from' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='none'>
												Don&apos;t copy from existing
											</SelectItem>
											{scenarios?.map((scenario) => (
												<SelectItem key={scenario.id} value={scenario.id}>
													{scenario.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
							<DialogFooter>
								<Button
									variant='outline'
									onClick={() => setIsCreateDialogOpen(false)}>
									Cancel
								</Button>
								<Button
									onClick={handleCreateScenario}
									disabled={
										!createForm.name.trim() || createScenarioMutation.isPending
									}>
									{createScenarioMutation.isPending
										? 'Creating...'
										: 'Create Scenario'}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			{/* Active Scenario */}
			{activeScenario && (
				<div className='mb-8'>
					<h2 className='text-xl font-semibold mb-4 flex items-center'>
						<CheckCircle className='w-5 h-5 text-green-600 mr-2' />
						Active Scenario
					</h2>
					<Card className='border-green-200 bg-green-50'>
						<CardHeader>
							<div className='flex items-center justify-between'>
								<div>
									<CardTitle className='flex items-center gap-2'>
										{activeScenario.name}
										<Badge variant='default' className='bg-green-600'>
											Active
										</Badge>
									</CardTitle>
									{activeScenario.description && (
										<CardDescription className='mt-2'>
											{activeScenario.description}
										</CardDescription>
									)}
								</div>
								<div className='flex gap-2'>
									<Button
										variant='outline'
										size='sm'
										onClick={() => router.push('/budgets')}>
										<Settings className='w-4 h-4 mr-2' />
										Manage Budgets
									</Button>
									<Button
										size='sm'
										onClick={() =>
											router.push(
												`/budgets/new?scenarioId=${activeScenario.id}`,
											)
										}>
										<Plus className='w-4 h-4 mr-2' />
										Add Budget
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
								<div>
									<p className='text-sm text-muted-foreground'>Total Budgets</p>
									<p className='text-2xl font-bold'>
										{activeScenario.budgets.length}
									</p>
								</div>
								<div>
									<p className='text-sm text-muted-foreground'>Total Budgeted</p>
									<p className='text-2xl font-bold'>
										{activeScenario.totalBudgeted.toLocaleString('nb-NO', {
											style: 'currency',
											currency: 'NOK',
										})}
									</p>
								</div>
								<div>
									<p className='text-sm text-muted-foreground'>Created</p>
									<p className='text-sm'>
										{new Date(activeScenario.createdAt).toLocaleDateString(
											'nb-NO',
										)}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Inactive Scenarios */}
			<div>
				<h2 className='text-xl font-semibold mb-4 flex items-center'>
					<Archive className='w-5 h-5 text-gray-600 mr-2' />
					Other Scenarios ({inactiveScenarios.length})
				</h2>

				{inactiveScenarios.length === 0 ? (
					<Card>
						<CardContent className='flex flex-col items-center justify-center py-16'>
							<Archive className='w-12 h-12 text-muted-foreground mb-4' />
							<h3 className='text-lg font-semibold mb-2'>No other scenarios</h3>
							<p className='text-muted-foreground text-center mb-4'>
								Create additional scenarios to plan for different financial
								situations.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
						{inactiveScenarios.map((scenario) => (
							<Card key={scenario.id} className='hover:shadow-md transition-shadow'>
								<CardHeader>
									<div className='flex items-center justify-between'>
										<div>
											<CardTitle className='flex items-center gap-2'>
												<Circle className='w-4 h-4 text-gray-400' />
												{scenario.name}
											</CardTitle>
											{scenario.description && (
												<CardDescription className='mt-2'>
													{scenario.description}
												</CardDescription>
											)}
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<div className='space-y-4'>
										<div className='grid grid-cols-2 gap-4 text-sm'>
											<div>
												<p className='text-muted-foreground'>Budgets</p>
												<p className='font-medium'>
													{scenario.budgets.length}
												</p>
											</div>
											<div>
												<p className='text-muted-foreground'>Total</p>
												<p className='font-medium'>
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

										<div className='space-y-2'>
											<div className='flex gap-2'>
												<Button
													variant='default'
													size='sm'
													onClick={() =>
														handleActivateScenario(scenario.id)
													}
													disabled={activateScenarioMutation.isPending}
													className='flex-1'>
													{activateScenarioMutation.isPending
														? 'Activating...'
														: 'Activate'}
												</Button>
												<Button
													variant='outline'
													size='sm'
													onClick={() => {
														setCreateForm({
															name: `${scenario.name} Copy`,
															description: scenario.description || '',
															copyFromScenarioId: scenario.id,
														});
														setIsCreateDialogOpen(true);
													}}>
													<Copy className='w-4 h-4' />
												</Button>
												<AlertDialog>
													<AlertDialogTrigger asChild>
														<Button variant='outline' size='sm'>
															<Trash2 className='w-4 h-4' />
														</Button>
													</AlertDialogTrigger>
													<AlertDialogContent>
														<AlertDialogHeader>
															<AlertDialogTitle>
																Delete Scenario
															</AlertDialogTitle>
															<AlertDialogDescription>
																Are you sure you want to delete
																&quot;
																{scenario.name}&quot;? This action
																cannot be undone and will remove all
																budgets in this scenario.
															</AlertDialogDescription>
														</AlertDialogHeader>
														<AlertDialogFooter>
															<AlertDialogCancel>
																Cancel
															</AlertDialogCancel>
															<AlertDialogAction
																onClick={() =>
																	handleDeleteScenario(
																		scenario.id,
																	)
																}
																className='bg-red-600 hover:bg-red-700'>
																Delete Scenario
															</AlertDialogAction>
														</AlertDialogFooter>
													</AlertDialogContent>
												</AlertDialog>
											</div>
											<Button
												variant='outline'
												size='sm'
												onClick={() =>
													router.push(
														`/budgets/new?scenarioId=${scenario.id}`,
													)
												}
												className='w-full'>
												<Plus className='w-4 h-4 mr-2' />
												Add Budget
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
