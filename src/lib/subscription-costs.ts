import type { Subscription } from './types';

type BillingDetails = Pick<Subscription, 'amount' | 'billingFrequency' | 'customFrequencyDays'>;

/** Average monthly cost; custom billing uses the same 30.44-day month in every view. */
export function monthlySubscriptionCost(subscription: BillingDetails): number {
	switch (subscription.billingFrequency) {
		case 'monthly':
			return subscription.amount;
		case 'quarterly':
			return subscription.amount / 3;
		case 'annually':
			return subscription.amount / 12;
		case 'custom':
			if (
				!subscription.customFrequencyDays ||
				!Number.isFinite(subscription.customFrequencyDays) ||
				subscription.customFrequencyDays <= 0
			) {
				throw new Error('Custom frequency requires customFrequencyDays greater than zero');
			}
			return (subscription.amount * 30.44) / subscription.customFrequencyDays;
	}
}
