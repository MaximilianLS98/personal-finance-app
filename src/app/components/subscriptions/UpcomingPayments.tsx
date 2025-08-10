'use client';

import React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Subscription } from '../../../lib/types';
import { formatCurrency } from '../../../lib/financial-calculator';
import { useCurrencySettings } from '../../providers';
import { Calendar, Clock, AlertTriangle } from 'lucide-react';

interface UpcomingPaymentsProps {
	/** Array of subscriptions with upcoming payments */
	subscriptions?: Subscription[];
	/** Number of days to look ahead (default: 30) */
	daysAhead?: number;
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
}

interface UpcomingPayment {
	subscription: Subscription;
	daysUntilPayment: number;
	isOverdue: boolean;
	urgency: 'overdue' | 'urgent' | 'soon' | 'normal';
}

/**
 * UpcomingPayments component displays a 30-day payment calendar
 * showing upcoming subscription payments with urgency indicators
 */
export function UpcomingPayments({
	subscriptions = [],
	daysAhead = 30,
	isLoading = false,
	error,
}: UpcomingPaymentsProps) {
	const { currency, locale } = useCurrencySettings();

	// Calculate upcoming payments
	const upcomingPayments = React.useMemo(() => {
		if (!subscriptions.length) return [];

		const now = new Date();
		const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

		return subscriptions
			.filter((sub) => sub.isActive)
			.map((sub) => {
				const paymentDate = new Date(sub.nextPaymentDate);
				const timeDiff = paymentDate.getTime() - now.getTime();
				const daysUntilPayment = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

				let urgency: UpcomingPayment['urgency'] = 'normal';
				if (daysUntilPayment < 0) {
					urgency = 'overdue';
				} else if (daysUntilPayment <= 3) {
					urgency = 'urgent';
				} else if (daysUntilPayment <= 7) {
					urgency = 'soon';
				}

				return {
					subscription: sub,
					daysUntilPayment,
					isOverdue: daysUntilPayment < 0,
					urgency,
				};
			})
			.filter((payment) => payment.daysUntilPayment <= daysAhead || payment.isOverdue)
			.sort((a, b) => a.daysUntilPayment - b.daysUntilPayment);
	}, [subscriptions, daysAhead]);

	// Calculate summary stats
	const summary = React.useMemo(() => {
		const totalAmount = upcomingPayments.reduce(
			(sum, payment) => sum + payment.subscription.amount,
			0,
		);
		const overdueCount = upcomingPayments.filter((p) => p.isOverdue).length;
		const urgentCount = upcomingPayments.filter((p) => p.urgency === 'urgent').length;

		return {
			totalAmount,
			totalCount: upcomingPayments.length,
			overdueCount,
			urgentCount,
		};
	}, [upcomingPayments]);

	// Handle loading state
	if (isLoading) {
		return (
			<Card className='animate-pulse'>
				<CardHeader>
					<div className='h-6 bg-muted rounded w-1/2'></div>
					<div className='h-4 bg-muted rounded w-3/4'></div>
				</CardHeader>
				<CardContent>
					<div className='space-y-3'>
						{[...Array(5)].map((_, index) => (
							<div
								key={index}
								className='flex items-center justify-between p-3 border rounded'>
								<div className='space-y-2'>
									<div className='h-4 bg-muted rounded w-32'></div>
									<div className='h-3 bg-muted rounded w-24'></div>
								</div>
								<div className='h-6 bg-muted rounded w-16'></div>
							</div>
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
					<CardTitle className='text-destructive flex items-center gap-2'>
						<AlertTriangle className='h-5 w-5' />
						Error Loading Upcoming Payments
					</CardTitle>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Calendar className='h-5 w-5' />
					Upcoming Payments
				</CardTitle>
				<CardDescription>
					Next {daysAhead} days • {summary.totalCount} payment
					{summary.totalCount !== 1 ? 's' : ''} •{' '}
					{formatCurrency(summary.totalAmount, currency, locale)}
				</CardDescription>
				{(summary.overdueCount > 0 || summary.urgentCount > 0) && (
					<div className='flex gap-2 mt-2'>
						{summary.overdueCount > 0 && (
							<Badge variant='destructive' className='text-xs'>
								{summary.overdueCount} overdue
							</Badge>
						)}
						{summary.urgentCount > 0 && (
							<Badge
								variant='secondary'
								className='text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'>
								{summary.urgentCount} urgent
							</Badge>
						)}
					</div>
				)}
			</CardHeader>
			<CardContent>
				{upcomingPayments.length === 0 ? (
					<div className='text-center py-8 text-muted-foreground'>
						<Calendar className='h-12 w-12 mx-auto mb-4 opacity-50' />
						<p>No upcoming payments in the next {daysAhead} days</p>
					</div>
				) : (
					<div className='space-y-3 max-h-96 overflow-y-auto'>
						{upcomingPayments.map((payment) => (
							<PaymentItem
								key={payment.subscription.id}
								payment={payment}
								currency={currency}
								locale={locale}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface PaymentItemProps {
	payment: UpcomingPayment;
	currency: string;
	locale: string;
}

/**
 * Individual payment item component
 */
function PaymentItem({ payment, currency, locale }: PaymentItemProps) {
	const { subscription, daysUntilPayment, urgency } = payment;

	// Format the payment date
	const formatPaymentDate = () => {
		const paymentDate = new Date(subscription.nextPaymentDate);
		return paymentDate.toLocaleDateString(locale, {
			month: 'short',
			day: 'numeric',
			year: paymentDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
		});
	};

	// Get urgency styling
	const getUrgencyStyles = () => {
		switch (urgency) {
			case 'overdue':
				return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
			case 'urgent':
				return 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950';
			case 'soon':
				return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950';
			default:
				return 'border-border bg-card';
		}
	};

	// Get urgency badge
	const getUrgencyBadge = () => {
		if (urgency === 'overdue') {
			return (
				<Badge variant='destructive' className='text-xs'>
					Overdue
				</Badge>
			);
		}
		if (urgency === 'urgent') {
			return (
				<Badge
					variant='secondary'
					className='text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'>
					Urgent
				</Badge>
			);
		}
		return null;
	};

	// Format days until payment
	const formatDaysUntil = () => {
		if (daysUntilPayment < 0) {
			return `${Math.abs(daysUntilPayment)} day${Math.abs(daysUntilPayment) !== 1 ? 's' : ''} overdue`;
		}
		if (daysUntilPayment === 0) {
			return 'Today';
		}
		if (daysUntilPayment === 1) {
			return 'Tomorrow';
		}
		return `In ${daysUntilPayment} days`;
	};

	return (
		<div
			className={`flex items-center justify-between p-3 rounded-lg border ${getUrgencyStyles()}`}>
			<div className='flex-1 min-w-0'>
				<div className='flex items-center gap-2 mb-1'>
					<h4 className='font-medium text-sm truncate'>{subscription.name}</h4>
					{getUrgencyBadge()}
				</div>
				<div className='flex items-center gap-4 text-xs text-muted-foreground'>
					<span className='flex items-center gap-1'>
						<Calendar className='h-3 w-3' />
						{formatPaymentDate()}
					</span>
					<span className='flex items-center gap-1'>
						<Clock className='h-3 w-3' />
						{formatDaysUntil()}
					</span>
				</div>
			</div>
			<div className='text-right'>
				<div className='font-semibold text-sm'>
					{formatCurrency(subscription.amount, currency, locale)}
				</div>
				<div className='text-xs text-muted-foreground capitalize'>
					{subscription.billingFrequency}
				</div>
			</div>
		</div>
	);
}

export default UpcomingPayments;
