'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { SubscriptionList } from '@/app/components/subscriptions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Plus, ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Subscription management page
 * Displays subscription list with CRUD operations
 */
export default function ManageSubscriptionsPage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [subscriptionToDelete, setSubscriptionToDelete] = React.useState<any>(null);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
	const [deleteSuccessMessage, setDeleteSuccessMessage] = React.useState<string | null>(null);
	// Fetch subscriptions data
	const {
		data: subscriptionsResponse,
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ['subscriptions'],
		queryFn: async () => {
			const response = await fetch('/api/subscriptions');
			if (!response.ok) {
				throw new Error('Failed to fetch subscriptions');
			}
			return response.json();
		},
	});

	const subscriptions = subscriptionsResponse?.data || [];

	// Fetch categories for filtering
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

	const categories = categoriesResponse?.data || [];

	// Delete subscription mutation
	const deleteSubscriptionMutation = useMutation({
		mutationFn: async (subscriptionId: string) => {
			const response = await fetch(`/api/subscriptions/${subscriptionId}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to delete subscription');
			}

			return response.json();
		},
		onSuccess: () => {
			// Invalidate and refetch subscriptions
			queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
			setDeleteSuccessMessage(
				`Subscription "${subscriptionToDelete?.name}" deleted successfully`,
			);
			setIsDeleteDialogOpen(false);
			setSubscriptionToDelete(null);

			// Clear success message after 3 seconds
			setTimeout(() => setDeleteSuccessMessage(null), 3000);
		},
	});

	const handleDeleteClick = (subscription: any) => {
		setSubscriptionToDelete(subscription);
		setIsDeleteDialogOpen(true);
	};

	const handleDeleteConfirm = () => {
		if (subscriptionToDelete) {
			deleteSubscriptionMutation.mutate(subscriptionToDelete.id);
		}
	};

	const handleDeleteCancel = () => {
		setIsDeleteDialogOpen(false);
		setSubscriptionToDelete(null);
	};

	return (
		<div className='max-w-7xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-4'>
					<Button asChild variant='ghost' size='sm'>
						<Link href='/subscriptions'>
							<ArrowLeft className='mr-2 h-4 w-4' />
							Back to Dashboard
						</Link>
					</Button>
					<div>
						<h2 className='text-2xl font-semibold mb-2'>Manage Subscriptions</h2>
						<p className='text-muted-foreground'>
							View, edit, and organize your subscriptions
						</p>
					</div>
				</div>
				<Button asChild>
					<Link href='/subscriptions/new'>
						<Plus className='mr-2 h-4 w-4' />
						Add Subscription
					</Link>
				</Button>
			</div>

			{/* Success Alert */}
			{deleteSuccessMessage && (
				<Alert className='border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'>
					<AlertCircle className='h-4 w-4 text-green-600' />
					<AlertDescription className='text-green-800 dark:text-green-200'>
						{deleteSuccessMessage}
					</AlertDescription>
				</Alert>
			)}

			{/* Error Alert */}
			{(isError || deleteSubscriptionMutation.isError) && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{deleteSubscriptionMutation.error?.message ||
							(error as Error)?.message ||
							'An error occurred'}
					</AlertDescription>
				</Alert>
			)}

			{/* Subscription List */}
			<Card>
				<CardHeader>
					<CardTitle>All Subscriptions</CardTitle>
				</CardHeader>
				<CardContent>
					<SubscriptionList
						subscriptions={subscriptions}
						categories={categories}
						isLoading={isLoading}
						error={isError ? (error as Error)?.message : undefined}
						onEdit={(subscription) => {
							// Navigate to edit page
							router.push(`/subscriptions/${subscription.id}`);
						}}
						onDelete={handleDeleteClick}
						onAdd={() => {
							// Navigate to add page
							router.push('/subscriptions/new');
						}}
					/>
				</CardContent>
			</Card>

			{/* Delete Confirmation Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							<Trash2 className='h-5 w-5 text-destructive' />
							Delete Subscription
						</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete "{subscriptionToDelete?.name}"? This
							action cannot be undone and will remove all associated data.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant='outline' onClick={handleDeleteCancel}>
							Cancel
						</Button>
						<Button
							variant='destructive'
							onClick={handleDeleteConfirm}
							disabled={deleteSubscriptionMutation.isPending}>
							{deleteSubscriptionMutation.isPending ? 'Deleting...' : 'Delete'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
