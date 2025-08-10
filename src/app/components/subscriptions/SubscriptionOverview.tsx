'use client';

import React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/card';
import { Subscription } from '../../../lib/types';
import { formatCurrency } from '../../../lib/financial-calculator';
import { useCurrencySettings } from '../../providers';
import { Calendar, CreditCard, TrendingUp, Users } from 'lucide-react';

interface SubscriptionOverviewProps {
	/** Array of active subscriptions */
	subscriptions?: Subscription[];
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
}

/**
 * SubscriptionOverview component displays aggregated subscription data
 * including total monthly/annual costs and subscription count
 */
export function SubscriptionOverview({
	subscriptions = [],
	isLoading = false,
	error,
}: SubscriptionOverviewProps) {
	const { currency, locale } = useCurrencySettings();

	// Calculate totals from subscriptions
	const totals = React.useMemo(() => {
		if (!subscriptions.length) {
			return {
				monthlyTotal: 0,
				annualTotal: 0,
				activeCount: 0,
				averageMonthly: 0,
			};
		}

		const activeSubscriptions = subscriptions.filter((sub) => sub.isActive);

		const monthlyTotal = activeSubscriptions.reduce((total, sub) => {
			switch (sub.billingFrequency) {
				case 'monthly':
					return total + sub.amount;
				case 'quarterly':
					return total + sub.amount / 3;
				case 'annually':
					return total + sub.amount / 12;
				case 'custom':
					if (sub.customFrequencyDays) {
						return total + (sub.amount * 30.44) / sub.customFrequencyDays; // Average month = 30.44 days
					}
					return total;
				default:
					return total;
			}
		}, 0);

		return {
			monthlyTotal,
			annualTotal: monthlyTotal * 12,
			activeCount: activeSubscriptions.length,
			averageMonthly:
				activeSubscriptions.length > 0 ? monthlyTotal / activeSubscriptions.length : 0,
		};
	}, [subscriptions]);

	// Handle loading state
	if (isLoading) {
		return (
			<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
				{[...Array(4)].map((_, index) => (
					<Card key={index} className='animate-pulse'>
						<CardHeader className='pb-2'>
							<div className='h-4 bg-muted rounded w-3/4'></div>
							<div className='h-3 bg-muted rounded w-1/2'></div>
						</CardHeader>
						<CardContent>
							<div className='h-8 bg-muted rounded w-full'></div>
						</CardContent>
					</Card>
				))}
			</div>
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
		<div className='space-y-4'>
			{/* Overview header */}
			<div className='text-center'>
				<h2 className='text-2xl font-bold'>Subscription Overview</h2>
				<p className='text-muted-foreground'>
					Managing {totals.activeCount} active subscription
					{totals.activeCount !== 1 ? 's' : ''}
				</p>
			</div>

			{/* Overview cards grid */}
			<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
				<OverviewCard
					title='Monthly Total'
					amount={totals.monthlyTotal}
					description='Total monthly cost'
					icon={Calendar}
					variant='monthly'
					currency={currency}
					locale={locale}
				/>
				<OverviewCard
					title='Annual Total'
					amount={totals.annualTotal}
					description='Total yearly cost'
					icon={TrendingUp}
					variant='annual'
					currency={currency}
					locale={locale}
				/>
				<OverviewCard
					title='Active Subscriptions'
					amount={totals.activeCount}
					description='Currently active'
					icon={Users}
					variant='count'
					currency={currency}
					locale={locale}
				/>
				<OverviewCard
					title='Average Monthly'
					amount={totals.averageMonthly}
					description='Per subscription'
					icon={CreditCard}
					variant='average'
					currency={currency}
					locale={locale}
				/>
			</div>
		</div>
	);
}

interface OverviewCardProps {
	title: string;
	amount: number;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	variant: 'monthly' | 'annual' | 'count' | 'average';
	currency: string;
	locale: string;
}

/**
 * Individual overview card component for displaying subscription metrics
 */
function OverviewCard({
	title,
	amount,
	description,
	icon: Icon,
	variant,
	currency,
	locale,
}: OverviewCardProps) {
	// Determine card styling based on variant
	const getCardStyles = () => {
		switch (variant) {
			case 'monthly':
				return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950';
			case 'annual':
				return 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950';
			case 'count':
				return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950';
			case 'average':
				return 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950';
			default:
				return '';
		}
	};

	// Determine amount text color
	const getAmountColor = () => {
		switch (variant) {
			case 'monthly':
				return 'text-blue-700 dark:text-blue-300';
			case 'annual':
				return 'text-purple-700 dark:text-purple-300';
			case 'count':
				return 'text-green-700 dark:text-green-300';
			case 'average':
				return 'text-orange-700 dark:text-orange-300';
			default:
				return 'text-foreground';
		}
	};

	// Format the display value
	const formatValue = () => {
		if (variant === 'count') {
			return amount.toString();
		}
		return formatCurrency(amount, currency, locale);
	};

	return (
		<Card className={getCardStyles()}>
			<CardHeader className='pb-2'>
				<div className='flex items-center justify-between'>
					<CardTitle className='text-sm font-medium'>{title}</CardTitle>
					<Icon className='h-4 w-4 text-muted-foreground' />
				</div>
				<CardDescription className='text-xs'>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className={`text-2xl font-bold ${getAmountColor()}`}>{formatValue()}</div>
			</CardContent>
		</Card>
	);
}

export default SubscriptionOverview;
