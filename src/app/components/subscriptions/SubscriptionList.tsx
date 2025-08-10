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
import { Input } from '../../../components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../../../components/ui/select';
import { Subscription, Category } from '../../../lib/types';
import { formatCurrency } from '../../../lib/financial-calculator';
import { useCurrencySettings } from '../../providers';
import {
	Search,
	Filter,
	Edit,
	Trash2,
	ExternalLink,
	Calendar,
	DollarSign,
	SortAsc,
	SortDesc,
	Plus,
} from 'lucide-react';

interface SubscriptionListProps {
	/** Array of subscriptions to display */
	subscriptions?: Subscription[];
	/** Array of categories for filtering */
	categories?: Category[];
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
	/** Callback when edit button is clicked */
	onEdit?: (subscription: Subscription) => void;
	/** Callback when delete button is clicked */
	onDelete?: (subscription: Subscription) => void;
	/** Callback when add new subscription is clicked */
	onAdd?: () => void;
}

type SortField = 'name' | 'amount' | 'nextPaymentDate' | 'billingFrequency';
type SortOrder = 'asc' | 'desc';

/**
 * SubscriptionList component with sorting and filtering capabilities
 */
export function SubscriptionList({
	subscriptions = [],
	categories = [],
	isLoading = false,
	error,
	onEdit,
	onDelete,
	onAdd,
}: SubscriptionListProps) {
	const { currency, locale } = useCurrencySettings();

	// Filter and sort state
	const [searchTerm, setSearchTerm] = React.useState('');
	const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
	const [showInactive, setShowInactive] = React.useState(false);
	const [sortField, setSortField] = React.useState<SortField>('name');
	const [sortOrder, setSortOrder] = React.useState<SortOrder>('asc');

	// Filter and sort subscriptions
	const filteredAndSortedSubscriptions = React.useMemo(() => {
		let filtered = subscriptions || [];

		// Apply search filter
		if (searchTerm) {
			filtered = filtered.filter(
				(sub) =>
					sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
					sub.description?.toLowerCase().includes(searchTerm.toLowerCase()),
			);
		}

		// Apply category filter
		if (selectedCategory !== 'all') {
			filtered = filtered.filter((sub) => sub.categoryId === selectedCategory);
		}

		// Apply active/inactive filter
		if (!showInactive) {
			filtered = filtered.filter((sub) => sub.isActive);
		}

		// Apply sorting
		filtered.sort((a, b) => {
			let aValue: string | number | Date;
			let bValue: string | number | Date;

			switch (sortField) {
				case 'name':
					aValue = a.name.toLowerCase();
					bValue = b.name.toLowerCase();
					break;
				case 'amount':
					// Normalize to monthly amount for comparison
					aValue = getMonthlyAmount(a);
					bValue = getMonthlyAmount(b);
					break;
				case 'nextPaymentDate':
					aValue = new Date(a.nextPaymentDate);
					bValue = new Date(b.nextPaymentDate);
					break;
				case 'billingFrequency':
					aValue = a.billingFrequency;
					bValue = b.billingFrequency;
					break;
				default:
					aValue = a.name;
					bValue = b.name;
			}

			if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
			if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [subscriptions, searchTerm, selectedCategory, showInactive, sortField, sortOrder]);

	// Helper function to get monthly amount
	const getMonthlyAmount = (subscription: Subscription) => {
		switch (subscription.billingFrequency) {
			case 'monthly':
				return subscription.amount;
			case 'quarterly':
				return subscription.amount / 3;
			case 'annually':
				return subscription.amount / 12;
			case 'custom':
				if (subscription.customFrequencyDays) {
					return (subscription.amount * 30.44) / subscription.customFrequencyDays;
				}
				return subscription.amount;
			default:
				return subscription.amount;
		}
	};

	// Handle sort change
	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
		} else {
			setSortField(field);
			setSortOrder('asc');
		}
	};

	// Handle loading state
	if (isLoading) {
		return (
			<Card className='animate-pulse'>
				<CardHeader>
					<div className='h-6 bg-muted rounded w-1/3'></div>
					<div className='h-4 bg-muted rounded w-1/2'></div>
				</CardHeader>
				<CardContent>
					<div className='space-y-4'>
						<div className='flex gap-4'>
							<div className='h-10 bg-muted rounded flex-1'></div>
							<div className='h-10 bg-muted rounded w-32'></div>
							<div className='h-10 bg-muted rounded w-24'></div>
						</div>
						{[...Array(5)].map((_, index) => (
							<div key={index} className='h-20 bg-muted rounded'></div>
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	// Handle error state
	if (error) {
		return (
			<Card className='border-destructive'>
				<CardHeader>
					<CardTitle className='text-destructive'>Error Loading Subscriptions</CardTitle>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className='flex items-center justify-between'>
					<div>
						<CardTitle className='flex items-center gap-2'>
							<DollarSign className='h-5 w-5' />
							Subscription Management
						</CardTitle>
						<CardDescription>
							{filteredAndSortedSubscriptions.length} of {subscriptions.length}{' '}
							subscription{subscriptions.length !== 1 ? 's' : ''}
						</CardDescription>
					</div>
					{onAdd && (
						<Button onClick={onAdd} className='flex items-center gap-2'>
							<Plus className='h-4 w-4' />
							Add Subscription
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{/* Filters and Search */}
				<div className='flex flex-col sm:flex-row gap-4 mb-6'>
					<div className='relative flex-1'>
						<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
						<Input
							placeholder='Search subscriptions...'
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className='pl-10'
						/>
					</div>

					<Select value={selectedCategory} onValueChange={setSelectedCategory}>
						<SelectTrigger className='w-full sm:w-48'>
							<Filter className='h-4 w-4 mr-2' />
							<SelectValue placeholder='All Categories' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All Categories</SelectItem>
							{categories.map((category) => (
								<SelectItem key={category.id} value={category.id}>
									{category.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Button
						variant={showInactive ? 'default' : 'outline'}
						onClick={() => setShowInactive(!showInactive)}
						className='w-full sm:w-auto'>
						{showInactive ? 'Hide Inactive' : 'Show Inactive'}
					</Button>
				</div>

				{/* Sort Controls */}
				<div className='flex flex-wrap gap-2 mb-4'>
					<span className='text-sm text-muted-foreground self-center'>Sort by:</span>
					{[
						{ field: 'name' as SortField, label: 'Name' },
						{ field: 'amount' as SortField, label: 'Amount' },
						{ field: 'nextPaymentDate' as SortField, label: 'Next Payment' },
						{ field: 'billingFrequency' as SortField, label: 'Frequency' },
					].map(({ field, label }) => (
						<Button
							key={field}
							variant={sortField === field ? 'default' : 'outline'}
							size='sm'
							onClick={() => handleSort(field)}
							className='flex items-center gap-1'>
							{label}
							{sortField === field &&
								(sortOrder === 'asc' ? (
									<SortAsc className='h-3 w-3' />
								) : (
									<SortDesc className='h-3 w-3' />
								))}
						</Button>
					))}
				</div>

				{/* Subscription List */}
				{filteredAndSortedSubscriptions.length === 0 ? (
					<div className='text-center py-8 text-muted-foreground'>
						<DollarSign className='h-12 w-12 mx-auto mb-4 opacity-50' />
						<p>No subscriptions found</p>
						{searchTerm || selectedCategory !== 'all' ? (
							<p className='text-sm mt-2'>Try adjusting your filters</p>
						) : (
							<p className='text-sm mt-2'>
								Add your first subscription to get started
							</p>
						)}
					</div>
				) : (
					<div className='space-y-3'>
						{filteredAndSortedSubscriptions.map((subscription) => (
							<SubscriptionItem
								key={subscription.id}
								subscription={subscription}
								categories={categories}
								currency={currency}
								locale={locale}
								onEdit={onEdit}
								onDelete={onDelete}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface SubscriptionItemProps {
	subscription: Subscription;
	categories: Category[];
	currency: string;
	locale: string;
	onEdit?: (subscription: Subscription) => void;
	onDelete?: (subscription: Subscription) => void;
}

/**
 * Individual subscription item component
 */
function SubscriptionItem({
	subscription,
	categories,
	currency,
	locale,
	onEdit,
	onDelete,
}: SubscriptionItemProps) {
	const category = categories.find((cat) => cat.id === subscription.categoryId);

	// Calculate days until next payment
	const daysUntilPayment = React.useMemo(() => {
		const now = new Date();
		const paymentDate = new Date(subscription.nextPaymentDate);
		const timeDiff = paymentDate.getTime() - now.getTime();
		return Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
	}, [subscription.nextPaymentDate]);

	// Get urgency styling
	const getUrgencyBadge = () => {
		if (!subscription.isActive) return null;

		if (daysUntilPayment < 0) {
			return (
				<Badge variant='destructive' className='text-xs'>
					Overdue
				</Badge>
			);
		}
		if (daysUntilPayment <= 3) {
			return (
				<Badge
					variant='secondary'
					className='text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'>
					Due Soon
				</Badge>
			);
		}
		return null;
	};

	return (
		<div
			className={`flex items-center justify-between p-4 rounded-lg border ${subscription.isActive ? 'bg-card' : 'bg-muted/50'} hover:bg-muted/50 transition-colors`}>
			<div className='flex items-center gap-4 flex-1 min-w-0'>
				{/* Category indicator */}
				{category && (
					<div
						className='h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0'
						style={{ backgroundColor: category.color }}>
						{category.icon ? (
							<span className='text-xs'>{category.icon}</span>
						) : (
							category.name.charAt(0).toUpperCase()
						)}
					</div>
				)}

				{/* Subscription info */}
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2 mb-1'>
						<h4 className='font-medium text-sm truncate'>{subscription.name}</h4>
						{!subscription.isActive && (
							<Badge variant='outline' className='text-xs'>
								Inactive
							</Badge>
						)}
						{getUrgencyBadge()}
					</div>

					<div className='flex items-center gap-4 text-xs text-muted-foreground'>
						<span className='flex items-center gap-1'>
							<DollarSign className='h-3 w-3' />
							{formatCurrency(subscription.amount, currency, locale)}{' '}
							{subscription.billingFrequency}
						</span>
						<span className='flex items-center gap-1'>
							<Calendar className='h-3 w-3' />
							Next:{' '}
							{new Date(subscription.nextPaymentDate).toLocaleDateString(locale)}
						</span>
						{category && <span>{category.name}</span>}
					</div>

					{subscription.description && (
						<p className='text-xs text-muted-foreground mt-1 truncate'>
							{subscription.description}
						</p>
					)}
				</div>
			</div>

			{/* Actions */}
			<div className='flex items-center gap-2 ml-4'>
				{subscription.website && (
					<Button
						variant='ghost'
						size='sm'
						onClick={() => window.open(subscription.website, '_blank')}
						className='h-8 w-8 p-0'>
						<ExternalLink className='h-4 w-4' />
					</Button>
				)}

				{onEdit && (
					<Button
						variant='ghost'
						size='sm'
						onClick={() => onEdit(subscription)}
						className='h-8 w-8 p-0'>
						<Edit className='h-4 w-4' />
					</Button>
				)}

				{onDelete && (
					<Button
						variant='ghost'
						size='sm'
						onClick={() => onDelete(subscription)}
						className='h-8 w-8 p-0 text-destructive hover:text-destructive'>
						<Trash2 className='h-4 w-4' />
					</Button>
				)}
			</div>
		</div>
	);
}

export default SubscriptionList;
