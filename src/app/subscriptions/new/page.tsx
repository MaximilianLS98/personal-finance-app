'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubscriptionForm } from '@/app/components/subscriptions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * New subscription creation page
 * Provides form for adding new subscriptions
 */
export default function NewSubscriptionPage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	// Fetch categories for the form
	const {
		data: categories,
		isLoading: categoriesLoading,
		isError: categoriesError,
		error: categoriesErrorMessage,
	} = useQuery({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await fetch('/api/categories');
			if (!response.ok) {
				throw new Error('Failed to fetch categories');
			}
			return response.json();
		},
	});

	// Create subscription mutation
	const createSubscriptionMutation = useMutation({
		mutationFn: async (subscriptionData: any) => {
			const response = await fetch('/api/subscriptions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(subscriptionData),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to create subscription');
			}

			return response.json();
		},
		onSuccess: (data) => {
			// Invalidate and refetch subscriptions
			queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
			setSuccessMessage(`Subscription "${data.name}" created successfully!`);

			// Redirect to subscription details after a short delay
			setTimeout(() => {
				router.push(`/subscriptions/${data.id}`);
			}, 2000);
		},
	});

	const handleSubmit = (formData: any) => {
		createSubscriptionMutation.mutate(formData);
	};

	const handleCancel = () => {
		router.push('/subscriptions');
	};

	return (
		<div className='max-w-4xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center gap-4'>
				<Button asChild variant='ghost' size='sm'>
					<Link href='/subscriptions'>
						<ArrowLeft className='mr-2 h-4 w-4' />
						Back to Dashboard
					</Link>
				</Button>
				<div>
					<h2 className='text-2xl font-semibold mb-2'>Add New Subscription</h2>
					<p className='text-muted-foreground'>
						Create a new subscription to track recurring payments
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
			{(categoriesError || createSubscriptionMutation.isError) && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{createSubscriptionMutation.error?.message ||
							(categoriesErrorMessage as Error)?.message ||
							'An error occurred'}
					</AlertDescription>
				</Alert>
			)}

			{/* Subscription Form */}
			<Card>
				<CardHeader>
					<CardTitle>Subscription Details</CardTitle>
				</CardHeader>
				<CardContent>
					<SubscriptionForm
						categories={categories}
						isLoading={categoriesLoading}
						onSubmit={handleSubmit}
						onCancel={handleCancel}
						isSubmitting={createSubscriptionMutation.isPending}
						submitButtonText='Create Subscription'
					/>
				</CardContent>
			</Card>

			{/* Help Text */}
			<Card className='border-dashed'>
				<CardContent className='pt-6'>
					<div className='text-sm text-muted-foreground space-y-2'>
						<h4 className='font-medium text-foreground'>
							Tips for adding subscriptions:
						</h4>
						<ul className='list-disc list-inside space-y-1'>
							<li>Use the exact name as it appears on your bank statement</li>
							<li>Set the next payment date to when you expect the next charge</li>
							<li>Choose the appropriate category to help with expense tracking</li>
							<li>Add notes for cancellation URLs or important details</li>
						</ul>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
