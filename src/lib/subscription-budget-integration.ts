/**
 * Subscription Budget Integration Service
 * Handles automatic subscription cost allocation in budget calculations
 * and subscription change impact analysis for affected budgets
 */

import type {
	Subscription,
	Budget,
	BudgetProgress,
	BudgetAlert,
	Transaction,
	TransactionRepository,
} from './types';
export interface SubscriptionBudgetIntegration {
	/**
	 * Update budgets when subscriptions are created
	 */
	onSubscriptionCreated(subscription: Subscription): Promise<void>;

	/**
	 * Update budgets when subscriptions are updated
	 */
	onSubscriptionUpdated(
		subscriptionId: string,
		oldSubscription: Subscription,
		newSubscription: Subscription,
	): Promise<void>;

	/**
	 * Update budgets when subscriptions are deleted/cancelled
	 */
	onSubscriptionDeleted(subscription: Subscription): Promise<void>;

	/**
	 * Calculate subscription allocation for budget suggestions
	 */
	calculateSubscriptionAllocation(categoryId: string): Promise<SubscriptionAllocation>;

	/**
	 * Analyze subscription change impact on budgets
	 */
	analyzeSubscriptionImpact(
		subscription: Subscription,
		changeType: 'created' | 'updated' | 'deleted',
	): Promise<SubscriptionImpactAnalysis>;

	/**
	 * Generate subscription-aware budget suggestions
	 */
	generateSubscriptionAwareSuggestions(
		categoryId: string,
		historicalSpending: number,
		period: 'monthly' | 'yearly',
	): Promise<SubscriptionAwareSuggestion>;

	/**
	 * Create subscription renewal notifications in budget context
	 */
	createSubscriptionRenewalNotifications(upcomingDays: number): Promise<BudgetAlert[]>;
}

export interface SubscriptionAllocation {
	fixedAmount: number;
	subscriptionCount: number;
	subscriptions: Array<{
		id: string;
		name: string;
		monthlyAmount: number;
		nextPaymentDate: Date;
	}>;
	variableSpendingBudget: number; // Suggested budget minus fixed costs
}

export interface SubscriptionImpactAnalysis {
	impactedBudgets: Budget[];
	budgetAdjustmentSuggestions: Array<{
		budgetId: string;
		currentAmount: number;
		suggestedAmount: number;
		reason: string;
	}>;
	alertsCreated: BudgetAlert[];
	totalImpact: number; // Monthly impact amount
}

export interface SubscriptionAwareSuggestion {
	totalSuggestion: number;
	fixedCosts: number;
	variableBudget: number;
	subscriptionBreakdown: Array<{
		name: string;
		monthlyAmount: number;
	}>;
	confidence: number;
	reasoning: string;
}

export class SubscriptionBudgetIntegrationService implements SubscriptionBudgetIntegration {
	constructor(private repository: TransactionRepository) {}

	/**
	 * Update budgets when subscriptions are created
	 */
	async onSubscriptionCreated(subscription: Subscription): Promise<void> {
		try {
			// Find budgets for this subscription's category
			const budgets = await this.repository.findBudgetsByCategory(subscription.categoryId);
			const activeBudgets = budgets.filter((b) => b.isActive);

			if (activeBudgets.length === 0) {
				return; // No budgets to update
			}

			// Calculate monthly impact
			const monthlyImpact = this.calculateMonthlyAmount(subscription);

			// Create alerts for budget impact
			for (const budget of activeBudgets) {
				const impactPercentage = monthlyImpact / budget.amount;

				if (impactPercentage > 0.05) {
					// 5% threshold for subscription impact
					await this.repository.createBudgetAlert({
						budgetId: budget.id,
						alertType: 'subscription_added',
						message: `New subscription "${subscription.name}" added to ${budget.name} budget: ${monthlyImpact.toFixed(2)} ${subscription.currency}/month (${(impactPercentage * 100).toFixed(1)}% of budget)`,
						isRead: false,
					});
				}
			}

			// Recalculate budget progress for affected budgets
			await this.recalculateBudgetProgress(activeBudgets);
		} catch (error) {
			console.error('Error updating budgets after subscription creation:', error);
		}
	}

	/**
	 * Update budgets when subscriptions are updated
	 */
	async onSubscriptionUpdated(
		subscriptionId: string,
		oldSubscription: Subscription,
		newSubscription: Subscription,
	): Promise<void> {
		try {
			// Handle category changes
			if (oldSubscription.categoryId !== newSubscription.categoryId) {
				// Remove impact from old category
				await this.handleSubscriptionCategoryChange(
					oldSubscription,
					newSubscription,
					'removed',
				);

				// Add impact to new category
				await this.handleSubscriptionCategoryChange(
					oldSubscription,
					newSubscription,
					'added',
				);
			}

			// Handle amount changes
			else if (oldSubscription.amount !== newSubscription.amount) {
				await this.handleSubscriptionAmountChange(oldSubscription, newSubscription);
			}

			// Handle frequency changes
			else if (oldSubscription.billingFrequency !== newSubscription.billingFrequency) {
				await this.handleSubscriptionFrequencyChange(oldSubscription, newSubscription);
			}
		} catch (error) {
			console.error('Error updating budgets after subscription update:', error);
		}
	}

	/**
	 * Update budgets when subscriptions are deleted/cancelled
	 */
	async onSubscriptionDeleted(subscription: Subscription): Promise<void> {
		try {
			// Find budgets for this subscription's category
			const budgets = await this.repository.findBudgetsByCategory(subscription.categoryId);
			const activeBudgets = budgets.filter((b) => b.isActive);

			if (activeBudgets.length === 0) {
				return;
			}

			// Calculate monthly impact (negative since it's being removed)
			const monthlyImpact = this.calculateMonthlyAmount(subscription);

			// Create alerts for budget impact
			for (const budget of activeBudgets) {
				const impactPercentage = monthlyImpact / budget.amount;

				if (impactPercentage > 0.05) {
					// 5% threshold
					await this.repository.createBudgetAlert({
						budgetId: budget.id,
						alertType: 'subscription_removed',
						message: `Subscription "${subscription.name}" removed from ${budget.name} budget: -${monthlyImpact.toFixed(2)} ${subscription.currency}/month (${(impactPercentage * 100).toFixed(1)}% budget reduction)`,
						isRead: false,
					});
				}
			}

			// Recalculate budget progress for affected budgets
			await this.recalculateBudgetProgress(activeBudgets);
		} catch (error) {
			console.error('Error updating budgets after subscription deletion:', error);
		}
	}

	/**
	 * Calculate subscription allocation for budget suggestions
	 */
	async calculateSubscriptionAllocation(categoryId: string): Promise<SubscriptionAllocation> {
		try {
			// Get active subscriptions for this category
			const subscriptions = await this.repository.findSubscriptionsByCategory(categoryId);
			const activeSubscriptions = subscriptions.filter((s) => s.isActive);

			let fixedAmount = 0;
			const subscriptionDetails: SubscriptionAllocation['subscriptions'] = [];

			for (const subscription of activeSubscriptions) {
				const monthlyAmount = this.calculateMonthlyAmount(subscription);
				fixedAmount += monthlyAmount;

				subscriptionDetails.push({
					id: subscription.id,
					name: subscription.name,
					monthlyAmount,
					nextPaymentDate: subscription.nextPaymentDate,
				});
			}

			return {
				fixedAmount,
				subscriptionCount: activeSubscriptions.length,
				subscriptions: subscriptionDetails,
				variableSpendingBudget: 0, // Will be calculated by the caller
			};
		} catch (error) {
			console.error('Error calculating subscription allocation:', error);
			return {
				fixedAmount: 0,
				subscriptionCount: 0,
				subscriptions: [],
				variableSpendingBudget: 0,
			};
		}
	}

	/**
	 * Analyze subscription change impact on budgets
	 */
	async analyzeSubscriptionImpact(
		subscription: Subscription,
		changeType: 'created' | 'updated' | 'deleted',
	): Promise<SubscriptionImpactAnalysis> {
		const result: SubscriptionImpactAnalysis = {
			impactedBudgets: [],
			budgetAdjustmentSuggestions: [],
			alertsCreated: [],
			totalImpact: 0,
		};

		try {
			// Find budgets for this subscription's category
			const budgets = await this.repository.findBudgetsByCategory(subscription.categoryId);
			const activeBudgets = budgets.filter((b) => b.isActive);

			if (activeBudgets.length === 0) {
				return result;
			}

			// Calculate impact
			const monthlyImpact = this.calculateMonthlyAmount(subscription);
			result.totalImpact = changeType === 'deleted' ? -monthlyImpact : monthlyImpact;
			result.impactedBudgets = activeBudgets;

			// Generate adjustment suggestions
			for (const budget of activeBudgets) {
				const currentProgress = await this.repository.calculateBudgetProgress(budget.id);
				if (!currentProgress) continue;

				// Calculate suggested adjustment
				let suggestedAmount = budget.amount;
				let reason = '';

				if (changeType === 'created') {
					// Suggest increasing budget to accommodate new subscription
					suggestedAmount = budget.amount + monthlyImpact;
					reason = `Increase budget to accommodate new subscription "${subscription.name}"`;
				} else if (changeType === 'deleted') {
					// Suggest decreasing budget or reallocating funds
					const newAmount = Math.max(
						budget.amount - monthlyImpact,
						currentProgress.currentSpent,
					);
					suggestedAmount = newAmount;
					reason = `Decrease budget after removing subscription "${subscription.name}"`;
				} else {
					// Updated subscription - analyze the change
					reason = `Adjust budget for updated subscription "${subscription.name}"`;
				}

				if (suggestedAmount !== budget.amount) {
					result.budgetAdjustmentSuggestions.push({
						budgetId: budget.id,
						currentAmount: budget.amount,
						suggestedAmount,
						reason,
					});
				}
			}
		} catch (error) {
			console.error('Error analyzing subscription impact:', error);
		}

		return result;
	}

	/**
	 * Generate subscription-aware budget suggestions
	 */
	async generateSubscriptionAwareSuggestions(
		categoryId: string,
		historicalSpending: number,
		period: 'monthly' | 'yearly',
	): Promise<SubscriptionAwareSuggestion> {
		try {
			// Get subscription allocation
			const allocation = await this.calculateSubscriptionAllocation(categoryId);

			// Convert to appropriate period
			const fixedCosts =
				period === 'yearly' ? allocation.fixedAmount * 12 : allocation.fixedAmount;

			// Calculate variable budget suggestion
			const variableBudget = Math.max(0, historicalSpending - fixedCosts);
			const totalSuggestion = fixedCosts + variableBudget;

			// Calculate confidence based on subscription data quality
			let confidence = 0.7; // Base confidence
			if (allocation.subscriptionCount > 0) {
				confidence += 0.2; // Higher confidence with subscription data
			}
			if (variableBudget > 0) {
				confidence += 0.1; // Higher confidence with variable spending
			}

			const reasoning = this.generateSuggestionReasoning(
				allocation,
				historicalSpending,
				variableBudget,
				period,
			);

			return {
				totalSuggestion,
				fixedCosts,
				variableBudget,
				subscriptionBreakdown: allocation.subscriptions.map((s) => ({
					name: s.name,
					monthlyAmount: s.monthlyAmount,
				})),
				confidence: Math.min(confidence, 1.0),
				reasoning,
			};
		} catch (error) {
			console.error('Error generating subscription-aware suggestions:', error);
			return {
				totalSuggestion: historicalSpending,
				fixedCosts: 0,
				variableBudget: historicalSpending,
				subscriptionBreakdown: [],
				confidence: 0.5,
				reasoning: 'Unable to analyze subscription data',
			};
		}
	}

	/**
	 * Create subscription renewal notifications in budget context
	 */
	async createSubscriptionRenewalNotifications(upcomingDays: number): Promise<BudgetAlert[]> {
		const alerts: BudgetAlert[] = [];

		try {
			// Get upcoming subscription payments
			const upcomingSubscriptions = await this.repository.findUpcomingPayments(upcomingDays);

			for (const subscription of upcomingSubscriptions) {
				// Find budgets for this subscription's category
				const budgets = await this.repository.findBudgetsByCategory(
					subscription.categoryId,
				);
				const activeBudgets = budgets.filter((b) => b.isActive);

				for (const budget of activeBudgets) {
					// Check if budget has enough remaining for the subscription
					const progress = await this.repository.calculateBudgetProgress(budget.id);
					if (!progress) continue;

					const subscriptionAmount = subscription.amount;
					const daysUntilPayment = Math.ceil(
						(subscription.nextPaymentDate.getTime() - Date.now()) /
							(1000 * 60 * 60 * 24),
					);

					let alertMessage = '';
					let alertType: BudgetAlert['alertType'] = 'subscription_renewal';

					if (progress.remainingAmount < subscriptionAmount) {
						// Insufficient budget
						alertMessage = `Upcoming subscription renewal for "${subscription.name}" in ${daysUntilPayment} days (${subscriptionAmount.toFixed(2)} ${subscription.currency}) exceeds remaining budget (${progress.remainingAmount.toFixed(2)} ${budget.currency})`;
						alertType = 'subscription_insufficient_budget';
					} else {
						// Normal renewal notification
						alertMessage = `Upcoming subscription renewal for "${subscription.name}" in ${daysUntilPayment} days: ${subscriptionAmount.toFixed(2)} ${subscription.currency}`;
					}

					const alert = await this.repository.createBudgetAlert({
						budgetId: budget.id,
						alertType,
						message: alertMessage,
						isRead: false,
					});

					alerts.push(alert);
				}
			}
		} catch (error) {
			console.error('Error creating subscription renewal notifications:', error);
		}

		return alerts;
	}

	// ===== PRIVATE HELPER METHODS =====

	/**
	 * Calculate monthly amount for any subscription frequency
	 */
	private calculateMonthlyAmount(subscription: Subscription): number {
		switch (subscription.billingFrequency) {
			case 'monthly':
				return subscription.amount;
			case 'quarterly':
				return subscription.amount / 3;
			case 'annually':
				return subscription.amount / 12;
			case 'custom':
				if (subscription.customFrequencyDays) {
					return (subscription.amount * 30.44) / subscription.customFrequencyDays; // Average month length
				}
				return subscription.amount; // Fallback to monthly
			default:
				return subscription.amount;
		}
	}

	/**
	 * Handle subscription category changes
	 */
	private async handleSubscriptionCategoryChange(
		oldSubscription: Subscription,
		newSubscription: Subscription,
		operation: 'added' | 'removed',
	): Promise<void> {
		const categoryId =
			operation === 'added' ? newSubscription.categoryId : oldSubscription.categoryId;
		const budgets = await this.repository.findBudgetsByCategory(categoryId);
		const activeBudgets = budgets.filter((b) => b.isActive);

		const monthlyImpact = this.calculateMonthlyAmount(newSubscription);
		const sign = operation === 'added' ? '+' : '-';

		for (const budget of activeBudgets) {
			await this.repository.createBudgetAlert({
				budgetId: budget.id,
				alertType: 'subscription_category_changed',
				message: `Subscription "${newSubscription.name}" ${operation} ${operation === 'added' ? 'to' : 'from'} ${budget.name} budget: ${sign}${monthlyImpact.toFixed(2)} ${newSubscription.currency}/month`,
				isRead: false,
			});
		}

		await this.recalculateBudgetProgress(activeBudgets);
	}

	/**
	 * Handle subscription amount changes
	 */
	private async handleSubscriptionAmountChange(
		oldSubscription: Subscription,
		newSubscription: Subscription,
	): Promise<void> {
		const budgets = await this.repository.findBudgetsByCategory(newSubscription.categoryId);
		const activeBudgets = budgets.filter((b) => b.isActive);

		const oldMonthlyAmount = this.calculateMonthlyAmount(oldSubscription);
		const newMonthlyAmount = this.calculateMonthlyAmount(newSubscription);
		const difference = newMonthlyAmount - oldMonthlyAmount;

		for (const budget of activeBudgets) {
			const sign = difference > 0 ? '+' : '';
			await this.repository.createBudgetAlert({
				budgetId: budget.id,
				alertType: 'subscription_amount_changed',
				message: `Subscription "${newSubscription.name}" amount changed: ${sign}${difference.toFixed(2)} ${newSubscription.currency}/month impact on ${budget.name} budget`,
				isRead: false,
			});
		}

		await this.recalculateBudgetProgress(activeBudgets);
	}

	/**
	 * Handle subscription frequency changes
	 */
	private async handleSubscriptionFrequencyChange(
		oldSubscription: Subscription,
		newSubscription: Subscription,
	): Promise<void> {
		const budgets = await this.repository.findBudgetsByCategory(newSubscription.categoryId);
		const activeBudgets = budgets.filter((b) => b.isActive);

		const oldMonthlyAmount = this.calculateMonthlyAmount(oldSubscription);
		const newMonthlyAmount = this.calculateMonthlyAmount(newSubscription);
		const difference = newMonthlyAmount - oldMonthlyAmount;

		for (const budget of activeBudgets) {
			const sign = difference > 0 ? '+' : '';
			await this.repository.createBudgetAlert({
				budgetId: budget.id,
				alertType: 'subscription_frequency_changed',
				message: `Subscription "${newSubscription.name}" billing frequency changed from ${oldSubscription.billingFrequency} to ${newSubscription.billingFrequency}: ${sign}${difference.toFixed(2)} ${newSubscription.currency}/month impact`,
				isRead: false,
			});
		}

		await this.recalculateBudgetProgress(activeBudgets);
	}

	/**
	 * Recalculate budget progress for multiple budgets
	 */
	private async recalculateBudgetProgress(budgets: Budget[]): Promise<void> {
		try {
			await Promise.all(
				budgets.map((budget) => this.repository.calculateBudgetProgress(budget.id)),
			);
		} catch (error) {
			console.error('Error recalculating budget progress:', error);
		}
	}

	/**
	 * Generate reasoning text for subscription-aware suggestions
	 */
	private generateSuggestionReasoning(
		allocation: SubscriptionAllocation,
		historicalSpending: number,
		variableBudget: number,
		period: 'monthly' | 'yearly',
	): string {
		const parts: string[] = [];

		if (allocation.subscriptionCount > 0) {
			const fixedCosts =
				period === 'yearly' ? allocation.fixedAmount * 12 : allocation.fixedAmount;
			parts.push(`Fixed subscription costs: ${fixedCosts.toFixed(2)} ${period}`);

			if (allocation.subscriptionCount === 1) {
				parts.push(`(1 subscription: ${allocation.subscriptions[0].name})`);
			} else {
				parts.push(`(${allocation.subscriptionCount} subscriptions)`);
			}
		}

		if (variableBudget > 0) {
			parts.push(
				`Variable spending budget: ${variableBudget.toFixed(2)} based on historical patterns`,
			);
		}

		if (parts.length === 0) {
			return `Based on historical spending of ${historicalSpending.toFixed(2)} ${period}`;
		}

		return parts.join('. ');
	}
}
