'use client';

import React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../components/ui/card';
import { FinancialSummary as FinancialSummaryType } from '../../lib/types';
import { formatCurrency } from '../../lib/financial-calculator';
import { useCurrencySettings } from '../providers';

interface FinancialSummaryProps {
	/** Financial summary data to display */
	summary?: FinancialSummaryType;
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
}

/**
 * FinancialSummary component displays aggregated financial data
 * including total income, expenses, and net amount using shadcn Card components
 */
export function FinancialSummary({ summary, isLoading = false, error }: FinancialSummaryProps) {
	// Handle loading state
	if (isLoading) {
		return (
			<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
				{[...Array(3)].map((_, index) => (
					<Card key={index} className='animate-pulse'>
						<CardHeader>
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
					<CardTitle className='text-destructive'>Error Loading Summary</CardTitle>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	// Handle empty state when no data is available
	if (!summary || summary.transactionCount === 0) {
		return (
			<Card className='text-center'>
				<CardHeader>
					<CardTitle className='text-muted-foreground'>No Financial Data</CardTitle>
					<CardDescription>
						Upload a CSV file to see your financial summary
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
						<SummaryCard
							title='Total Income'
							amount={0}
							description='Money coming in'
							variant='income'
						/>
						<SummaryCard
							title='Total Expenses'
							amount={0}
							description='Money going out'
							variant='expense'
						/>
						<SummaryCard
							title='Net Amount'
							amount={0}
							description='Income - Expenses'
							variant='net'
						/>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className='space-y-4'>
			{/* Summary header with transaction count */}
			<div className='text-center'>
				<h2 className='text-2xl font-bold'>Financial Summary</h2>
				<p className='text-muted-foreground'>
					Based on {summary.transactionCount} transaction
					{summary.transactionCount !== 1 ? 's' : ''}
				</p>
			</div>

			{/* Summary cards grid - responsive design */}
			<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
				<SummaryCard
					title='Total Income'
					amount={summary.totalIncome}
					description='Money coming in'
					variant='income'
				/>
				<SummaryCard
					title='Total Expenses'
					amount={summary.totalExpenses}
					description='Money going out'
					variant='expense'
				/>
				<SummaryCard
					title='Net Amount'
					amount={summary.netAmount}
					description='Income - Expenses'
					variant='net'
					isNet={true}
				/>
			</div>
		</div>
	);
}

interface SummaryCardProps {
	title: string;
	amount: number;
	description: string;
	variant: 'income' | 'expense' | 'net';
	isNet?: boolean;
}

/**
 * Individual summary card component for displaying financial metrics
 */
function SummaryCard({ title, amount, description, variant, isNet = false }: SummaryCardProps) {
	const { currency, locale } = useCurrencySettings();
	// Determine card styling based on variant
	const getCardStyles = () => {
		switch (variant) {
			case 'income':
				return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950';
			case 'expense':
				return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
			case 'net':
				if (amount >= 0) {
					return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950';
				} else {
					return 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950';
				}
			default:
				return '';
		}
	};

	// Determine amount text color
	const getAmountColor = () => {
		switch (variant) {
			case 'income':
				return 'text-green-700 dark:text-green-300';
			case 'expense':
				return 'text-red-700 dark:text-red-300';
			case 'net':
				if (amount >= 0) {
					return 'text-blue-700 dark:text-blue-300';
				} else {
					return 'text-orange-700 dark:text-orange-300';
				}
			default:
				return 'text-foreground';
		}
	};

	return (
		<Card className={getCardStyles()}>
			<CardHeader className='pb-2'>
				<CardTitle className='text-sm font-medium'>{title}</CardTitle>
				<CardDescription className='text-xs'>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className={`text-2xl font-bold ${getAmountColor()}`}>
					{isNet && amount > 0 ? '+' : ''}
					{formatCurrency(amount, currency, locale)}
				</div>
			</CardContent>
		</Card>
	);
}

export default FinancialSummary;
