/**
 * Dashboard API endpoint
 * Provides chart data for the dashboard including expense/income over time and category breakdown
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import {
	format,
	startOfDay,
	endOfDay,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	addDays,
	addWeeks,
	addMonths,
	isAfter,
} from 'date-fns';
import type { ErrorResponse } from '@/lib/types';

interface DashboardData {
	expenseIncomeOverTime: Array<{
		date: string;
		income: number;
		expenses: number;
		net: number;
	}>;
	categoryBreakdown: Array<{
		categoryId: string;
		categoryName: string;
		categoryColor: string;
		amount: number;
		count: number;
	}>;
	topCategoryAverages: Array<{
		categoryId: string;
		categoryName: string;
		categoryColor: string;
		totalAmount: number;
		averagePerInterval: number;
		intervalCount: number;
	}>;
	oldestDataDate?: string;
}

/**
 * GET /api/dashboard - Get dashboard chart data
 * Query params: from (ISO date), to (ISO date), interval (day|week|month)
 */
export async function GET(
	request: NextRequest,
): Promise<NextResponse<DashboardData | ErrorResponse>> {
	try {
		const url = new URL(request.url);
		const fromParam = url.searchParams.get('from');
		const toParam = url.searchParams.get('to');
		const intervalParam = url.searchParams.get('interval') || 'day';

		let fromDate: Date | undefined;
		let toDate: Date | undefined;
		const interval = intervalParam as 'day' | 'week' | 'month';

		// Parse date parameters
		if (fromParam) {
			fromDate = startOfDay(new Date(fromParam));
		}
		if (toParam) {
			toDate = endOfDay(new Date(toParam));
		}

		const transactionRepository = createTransactionRepository();
		await transactionRepository.initialize();

		// Get all transactions within date range
		const transactions = await transactionRepository.findAll();

		// Find the oldest transaction date for navigation limits
		const oldestTransactionDate =
			transactions.length > 0
				? transactions.reduce((oldest, transaction) => {
						const transactionDate = new Date(transaction.date);
						return transactionDate < oldest ? transactionDate : oldest;
					}, new Date(transactions[0].date))
				: null;

		const filteredTransactions = transactions.filter((transaction) => {
			const transactionDate = new Date(transaction.date);

			if (fromDate && transactionDate < fromDate) return false;
			if (toDate && transactionDate > toDate) return false;

			return true;
		});

		// Get categories for mapping
		const categories = await transactionRepository.getCategories();
		const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));

		// Helper function to get interval key and format
		const getIntervalKey = (date: Date, interval: 'day' | 'week' | 'month'): string => {
			switch (interval) {
				case 'day':
					return format(date, 'yyyy-MM-dd');
				case 'week':
					return format(startOfWeek(date), 'yyyy-MM-dd');
				case 'month':
					return format(startOfMonth(date), 'yyyy-MM-dd');
				default:
					return format(date, 'yyyy-MM-dd');
			}
		};

		const getDisplayDate = (dateKey: string, interval: 'day' | 'week' | 'month'): string => {
			const date = new Date(dateKey);
			switch (interval) {
				case 'day':
					return format(date, 'MMM dd');
				case 'week':
					return format(date, 'MMM dd') + ' - ' + format(endOfWeek(date), 'MMM dd');
				case 'month':
					return format(date, 'MMM yyyy');
				default:
					return format(date, 'MMM dd');
			}
		};

		// Calculate expense/income over time (group by interval)
		const intervalData = new Map<string, { income: number; expenses: number }>();

		filteredTransactions.forEach((transaction) => {
			const dateKey = getIntervalKey(new Date(transaction.date), interval);
			const existing = intervalData.get(dateKey) || { income: 0, expenses: 0 };

			if (transaction.type === 'income') {
				existing.income += Math.abs(transaction.amount);
			} else if (transaction.type === 'expense') {
				existing.expenses += Math.abs(transaction.amount);
			}

			intervalData.set(dateKey, existing);
		});

		// Generate complete time series with empty periods
		const expenseIncomeOverTime: Array<{
			date: string;
			income: number;
			expenses: number;
			net: number;
		}> = [];

		if (fromDate && toDate && intervalData.size > 0) {
			let currentDate = new Date(fromDate);
			const endDate = new Date(toDate);

			while (!isAfter(currentDate, endDate)) {
				const dateKey = getIntervalKey(currentDate, interval);
				const data = intervalData.get(dateKey) || { income: 0, expenses: 0 };

				expenseIncomeOverTime.push({
					date: getDisplayDate(dateKey, interval),
					income: data.income,
					expenses: data.expenses,
					net: data.income - data.expenses,
				});

				// Move to next interval
				switch (interval) {
					case 'day':
						currentDate = addDays(currentDate, 1);
						break;
					case 'week':
						currentDate = addWeeks(currentDate, 1);
						break;
					case 'month':
						currentDate = addMonths(currentDate, 1);
						break;
				}
			}
		} else {
			// Fallback for when no date range is specified - sort by actual date, not display string
			const sortedEntries = Array.from(intervalData.entries()).sort(
				([dateKeyA], [dateKeyB]) => {
					// Sort by the actual date key (yyyy-mm-dd format) not the display date
					return dateKeyA.localeCompare(dateKeyB);
				},
			);

			sortedEntries.forEach(([dateKey, data]) => {
				expenseIncomeOverTime.push({
					date: getDisplayDate(dateKey, interval),
					income: data.income,
					expenses: data.expenses,
					net: data.income - data.expenses,
				});
			});
		}

		// Calculate category breakdown (only expenses for now)
		const categoryData = new Map<string, { amount: number; count: number }>();

		filteredTransactions
			.filter((transaction) => transaction.type === 'expense' && transaction.categoryId)
			.forEach((transaction) => {
				const categoryId = transaction.categoryId!;
				const existing = categoryData.get(categoryId) || { amount: 0, count: 0 };
				existing.amount += Math.abs(transaction.amount);
				existing.count += 1;
				categoryData.set(categoryId, existing);
			});

		const categoryBreakdown = Array.from(categoryData.entries())
			.map(([categoryId, data]) => {
				const category = categoryMap.get(categoryId);
				return {
					categoryId,
					categoryName: category?.name || 'Unknown',
					categoryColor: category?.color || '#94a3b8',
					amount: data.amount,
					count: data.count,
				};
			})
			.sort((a, b) => b.amount - a.amount);

		// Calculate top 3 category averages
		const topCategoryAverages = categoryBreakdown.slice(0, 3).map((category) => {
			// Calculate the number of intervals in the date range
			let intervalCount = 1;

			if (fromDate && toDate) {
				const startDate = new Date(fromDate);
				const endDate = new Date(toDate);
				let currentDate = new Date(startDate);
				intervalCount = 0;

				while (!isAfter(currentDate, endDate)) {
					intervalCount++;
					switch (interval) {
						case 'day':
							currentDate = addDays(currentDate, 1);
							break;
						case 'week':
							currentDate = addWeeks(currentDate, 1);
							break;
						case 'month':
							currentDate = addMonths(currentDate, 1);
							break;
					}
				}
			} else {
				// For "all time", estimate intervals based on data
				if (expenseIncomeOverTime.length > 0) {
					intervalCount = expenseIncomeOverTime.length;
				}
			}

			const averagePerInterval = intervalCount > 0 ? category.amount / intervalCount : 0;

			return {
				categoryId: category.categoryId,
				categoryName: category.categoryName,
				categoryColor: category.categoryColor,
				totalAmount: category.amount,
				averagePerInterval,
				intervalCount,
			};
		});

		return NextResponse.json({
			expenseIncomeOverTime,
			categoryBreakdown,
			topCategoryAverages,
			oldestDataDate: oldestTransactionDate?.toISOString(),
		});
	} catch (error) {
		console.error('Failed to get dashboard data:', error);
		return NextResponse.json(
			{
				error: 'DASHBOARD_FAILED',
				message: 'Failed to load dashboard data',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	}
}
