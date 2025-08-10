'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubscriptionForm } from '@/app/components/subscriptions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	AlertCircle,
	ArrowLeft,
	Edit,
	Trash2,
	CheckCircle,
	Calendar,
	CreditCard,
	Globe,
	FileText,
	Star,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatCurrency } from '@/lib/financial-calculator';
import { useCurrencySettings } from '@/app/providers';

interface SubscriptionDetailsPageProps {
	params: Promise<{
		id: string;
	}>;
}

/**
 * Individual subscription details and editing page
 * Displays subscription information with edit and delete capabilities
 */
export default function SubscriptionDetailsPage({ params }: SubscriptionDetailsPageProps) {
	const resolvedParams = React.use(params);
	const router = useRouter();
	const queryClient = useQueryClient();
	const { currency, locale } = useCurrencySettings();
	const [isEditing, setIsEditing] = useState(false);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	// Fetch subscription details
	const {
		data: subscriptionResponse,
		isLoading,
		isError,
		error,
	} = useQuery({
		queryKey: ['subscription', resolvedParams.id],
		queryFn: async () => {
			const response = await fetch(`/api/subscriptions/${resolvedParams.id}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error('Subscription not found');
				}
				throw new Error('Failed to fetch subscription');
			}
			return response.json();
		},
	});

	const subscription = subscriptionResponse?.data;

	// Fetch categories for editing
	const { data: categoriesResponse } = useQuery({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await fetch('/api/categories');
			if (!response.ok) {
				throw new Error('Failed to fetch categories');
			}
			return response.json();
		},
	});

	const categories = categoriesResponse || [];

	// Update subscription mutation
	const updateSubscriptionMutation = useMutation({
		mutationFn: async (subscriptionData: unknown) => {
			const response = await fetch(`/api/subscriptions/${resolvedParams.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(subscriptionData),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to update subscription');
			}

			return response.json();
		},
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ['subscription', resolvedParams.id] });
			queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
			setSuccessMessage(
				`Subscription "${response.data?.name || 'Subscription'}" updated successfully!`,
			);
			setIsEditing(false);

			// Clear success message after 3 seconds
			setTimeout(() => setSuccessMessage(null), 3000);
		},
	});

	// Delete subscription mutation
	const deleteSubscriptionMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/subscriptions/${resolvedParams.id}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to delete subscription');
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
			router.push('/subscriptions?deleted=true');
		},
	});

	const handleEdit = () => {
		setIsEditing(true);
	};

	const handleCancelEdit = () => {
		setIsEditing(false);
	};

	const handleSubmit = (formData: unknown) => {
		updateSubscriptionMutation.mutate(formData);
	};

	const handleDelete = () => {
		if (
			subscription &&
			window.confirm(
				`Are you sure you want to delete "${subscription.name}"? This action cannot be undone.`,
			)
		) {
			deleteSubscriptionMutation.mutate();
		}
	};

	// Loading state
	if (isLoading) {
		return (
			<div className='max-w-4xl mx-auto space-y-6'>
				<div className='animate-pulse'>
					<div className='h-8 bg-muted rounded w-1/3 mb-4'></div>
					<div className='h-64 bg-muted rounded'></div>
				</div>
			</div>
		);
	}

	// Error state
	if (isError) {
		return (
			<div className='max-w-4xl mx-auto space-y-6'>
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{(error as Error)?.message || 'Failed to load subscription'}
					</AlertDescription>
				</Alert>
				<Button asChild>
					<Link href='/subscriptions'>
						<ArrowLeft className='mr-2 h-4 w-4' />
						Back to Subscriptions
					</Link>
				</Button>
			</div>
		);
	}

	// Format next payment date
	const formatNextPayment = (dateString: string) => {
		const date = new Date(dateString);
		const now = new Date();
		const diffTime = date.getTime() - now.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		const formattedDate = date.toLocaleDateString(locale, {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
		});

		if (diffDays < 0) {
			return `${formattedDate} (${Math.abs(diffDays)} days overdue)`;
		} else if (diffDays === 0) {
			return `${formattedDate} (Today)`;
		} else if (diffDays === 1) {
			return `${formattedDate} (Tomorrow)`;
		} else {
			return `${formattedDate} (in ${diffDays} days)`;
		}
	};

	return (
		<div className='max-w-4xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-4'>
					<Button asChild variant='ghost' size='sm'>
						<Link href='/subscriptions'>
							<ArrowLeft className='mr-2 h-4 w-4' />
							Back to Subscriptions
						</Link>
					</Button>
					<div>
						<h2 className='text-2xl font-semibold mb-2'>{subscription?.name}</h2>
						<p className='text-muted-foreground'>Subscription details and management</p>
					</div>
				</div>
				{!isEditing && (
					<div className='flex gap-2'>
						<Button onClick={handleEdit} variant='outline'>
							<Edit className='mr-2 h-4 w-4' />
							Edit
						</Button>
						<Button
							onClick={handleDelete}
							variant='destructive'
							disabled={deleteSubscriptionMutation.isPending}>
							<Trash2 className='mr-2 h-4 w-4' />
							{deleteSubscriptionMutation.isPending ? 'Deleting...' : 'Delete'}
						</Button>
					</div>
				)}
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
			{(updateSubscriptionMutation.isError || deleteSubscriptionMutation.isError) && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{updateSubscriptionMutation.error?.message ||
							deleteSubscriptionMutation.error?.message ||
							'An error occurred'}
					</AlertDescription>
				</Alert>
			)}

			{isEditing ? (
				/* Edit Form */
				<Card>
					<CardHeader>
						<CardTitle>Edit Subscription</CardTitle>
					</CardHeader>
					<CardContent>
						<SubscriptionForm
							subscription={subscription}
							categories={categories}
							onSubmit={handleSubmit}
							onCancel={handleCancelEdit}
							isLoading={updateSubscriptionMutation.isPending}
						/>
					</CardContent>
				</Card>
			) : (
				/* Subscription Details */
				<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
					{/* Main Details */}
					<div className='lg:col-span-2 space-y-6'>
						<Card>
							<CardHeader>
								<div className='flex items-center justify-between'>
									<CardTitle className='flex items-center gap-2'>
										<CreditCard className='h-5 w-5' />
										Subscription Details
									</CardTitle>
									<Badge
										variant={subscription?.isActive ? 'default' : 'secondary'}>
										{subscription?.isActive ? 'Active' : 'Inactive'}
									</Badge>
								</div>
							</CardHeader>
							<CardContent className='space-y-4'>
								<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
									<div>
										<label className='text-sm font-medium text-muted-foreground'>
											Amount
										</label>
										<p className='text-2xl font-bold'>
											{formatCurrency(
												subscription?.amount || 0,
												currency,
												locale,
											)}
										</p>
										<p className='text-sm text-muted-foreground capitalize'>
											{subscription?.billingFrequency}
										</p>
									</div>
									<div>
										<label className='text-sm font-medium text-muted-foreground'>
											Next Payment
										</label>
										<p className='text-lg font-semibold flex items-center gap-2'>
											<Calendar className='h-4 w-4' />
											{subscription?.nextPaymentDate &&
												formatNextPayment(subscription.nextPaymentDate)}
										</p>
									</div>
								</div>

								{subscription?.description && (
									<div>
										<label className='text-sm font-medium text-muted-foreground'>
											Description
										</label>
										<p className='text-sm'>{subscription.description}</p>
									</div>
								)}

								{subscription?.notes && (
									<div>
										<label className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
											<FileText className='h-4 w-4' />
											Notes
										</label>
										<p className='text-sm'>{subscription.notes}</p>
									</div>
								)}

								{subscription?.website && (
									<div>
										<label className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
											<Globe className='h-4 w-4' />
											Website
										</label>
										<a
											href={subscription.website}
											target='_blank'
											rel='noopener noreferrer'
											className='text-sm text-blue-600 hover:underline'>
											{subscription.website}
										</a>
									</div>
								)}

								{subscription?.usageRating && (
									<div>
										<label className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
											<Star className='h-4 w-4' />
											Usage Rating
										</label>
										<div className='flex items-center gap-1'>
											{[...Array(5)].map((_, i) => (
												<Star
													key={i}
													className={`h-4 w-4 ${
														i < subscription.usageRating
															? 'text-yellow-400 fill-current'
															: 'text-gray-300'
													}`}
												/>
											))}
											<span className='text-sm text-muted-foreground ml-2'>
												{subscription.usageRating}/5
											</span>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Sidebar */}
					<div className='space-y-6'>
						{/* Quick Stats */}
						<Card>
							<CardHeader>
								<CardTitle className='text-lg'>Quick Stats</CardTitle>
							</CardHeader>
							<CardContent className='space-y-3'>
								<div className='flex justify-between'>
									<span className='text-sm text-muted-foreground'>
										Monthly Cost:
									</span>
									<span className='font-medium'>
										{subscription &&
											formatCurrency(
												subscription.billingFrequency === 'monthly'
													? subscription.amount
													: subscription.billingFrequency === 'quarterly'
														? subscription.amount / 3
														: subscription.billingFrequency ===
															  'annually'
															? subscription.amount / 12
															: subscription.customFrequencyDays
																? (subscription.amount * 30.44) /
																	subscription.customFrequencyDays
																: 0,
												currency,
												locale,
											)}
									</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-sm text-muted-foreground'>
										Annual Cost:
									</span>
									<span className='font-medium'>
										{subscription &&
											formatCurrency(
												subscription.billingFrequency === 'monthly'
													? subscription.amount * 12
													: subscription.billingFrequency === 'quarterly'
														? subscription.amount * 4
														: subscription.billingFrequency ===
															  'annually'
															? subscription.amount
															: subscription.customFrequencyDays
																? (subscription.amount * 365) /
																	subscription.customFrequencyDays
																: 0,
												currency,
												locale,
											)}
									</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-sm text-muted-foreground'>
										Start Date:
									</span>
									<span className='font-medium'>
										{subscription?.startDate &&
											new Date(subscription.startDate).toLocaleDateString(
												locale,
											)}
									</span>
								</div>
							</CardContent>
						</Card>

						{/* Quick Actions */}
						<Card>
							<CardHeader>
								<CardTitle className='text-lg'>Quick Actions</CardTitle>
							</CardHeader>
							<CardContent className='space-y-2'>
								<Button
									asChild
									variant='outline'
									size='sm'
									className='w-full justify-start'>
									<Link
										href={`/subscriptions/projections?id=${resolvedParams.id}`}>
										View Projections
									</Link>
								</Button>
								{subscription?.cancellationUrl && (
									<Button
										asChild
										variant='outline'
										size='sm'
										className='w-full justify-start'>
										<a
											href={subscription.cancellationUrl}
											target='_blank'
											rel='noopener noreferrer'>
											Cancel Subscription
										</a>
									</Button>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			)}
		</div>
	);
}
