import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FinancialSummary } from '../FinancialSummary';
import { FinancialSummary as FinancialSummaryType } from '../../../lib/types';

// Mock the financial calculator module
jest.mock('../../../lib/financial-calculator', () => ({
	formatCurrency: jest.fn((amount: number) => `kr ${amount.toFixed(2)}`),
}));

describe('FinancialSummary Component', () => {
	const mockSummary: FinancialSummaryType = {
		totalIncome: 15000,
		totalExpenses: 8000,
		netAmount: 7000,
		transactionCount: 25,
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('Loading State', () => {
		it('should display loading skeleton when isLoading is true', () => {
			render(<FinancialSummary isLoading={true} />);

			// Should show 3 skeleton cards
			const skeletonCards = screen
				.getAllByRole('generic')
				.filter((el) => el.classList.contains('animate-pulse'));
			expect(skeletonCards).toHaveLength(3);
		});

		it('should not display summary data when loading', () => {
			render(<FinancialSummary summary={mockSummary} isLoading={true} />);

			expect(screen.queryByText('Financial Summary')).not.toBeInTheDocument();
			expect(screen.queryByText('Total Income')).not.toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('should display error message when error prop is provided', () => {
			const errorMessage = 'Failed to load financial data';
			render(<FinancialSummary error={errorMessage} />);

			expect(screen.getByText('Error Loading Summary')).toBeInTheDocument();
			expect(screen.getByText(errorMessage)).toBeInTheDocument();
		});

		it('should not display summary data when error is present', () => {
			render(<FinancialSummary summary={mockSummary} error='Test error' />);

			expect(screen.queryByText('Financial Summary')).not.toBeInTheDocument();
			expect(screen.getByText('Error Loading Summary')).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('should display empty state when no summary is provided', () => {
			render(<FinancialSummary />);

			expect(screen.getByText('No Financial Data')).toBeInTheDocument();
			expect(
				screen.getByText('Upload a CSV file to see your financial summary'),
			).toBeInTheDocument();
		});

		it('should display empty state when summary has zero transactions', () => {
			const emptySummary: FinancialSummaryType = {
				totalIncome: 0,
				totalExpenses: 0,
				netAmount: 0,
				transactionCount: 0,
			};

			render(<FinancialSummary summary={emptySummary} />);

			expect(screen.getByText('No Financial Data')).toBeInTheDocument();
		});

		it('should show zero values in cards for empty state', () => {
			render(<FinancialSummary />);

			// Should show three cards with zero values
			const zeroAmounts = screen.getAllByText('kr 0.00');
			expect(zeroAmounts).toHaveLength(3);
		});
	});

	describe('Data Display', () => {
		it('should display financial summary with correct data', () => {
			render(<FinancialSummary summary={mockSummary} />);

			expect(screen.getByText('Financial Summary')).toBeInTheDocument();
			expect(screen.getByText('Based on 25 transactions')).toBeInTheDocument();
		});

		it('should display singular transaction text for one transaction', () => {
			const singleTransactionSummary: FinancialSummaryType = {
				...mockSummary,
				transactionCount: 1,
			};

			render(<FinancialSummary summary={singleTransactionSummary} />);

			expect(screen.getByText('Based on 1 transaction')).toBeInTheDocument();
		});

		it('should display all three summary cards', () => {
			render(<FinancialSummary summary={mockSummary} />);

			expect(screen.getByText('Total Income')).toBeInTheDocument();
			expect(screen.getByText('Total Expenses')).toBeInTheDocument();
			expect(screen.getByText('Net Amount')).toBeInTheDocument();
		});

		it('should display card descriptions', () => {
			render(<FinancialSummary summary={mockSummary} />);

			expect(screen.getByText('Money coming in')).toBeInTheDocument();
			expect(screen.getByText('Money going out')).toBeInTheDocument();
			expect(screen.getByText('Income - Expenses')).toBeInTheDocument();
		});

		it('should format currency amounts correctly', () => {
			render(<FinancialSummary summary={mockSummary} />);

			expect(screen.getByText('kr 15000.00')).toBeInTheDocument(); // Total Income
			expect(screen.getByText('kr 8000.00')).toBeInTheDocument(); // Total Expenses
			expect(screen.getByText('+kr 7000.00')).toBeInTheDocument(); // Net Amount (positive)
		});

		it('should display negative net amount without plus sign', () => {
			const negativeNetSummary: FinancialSummaryType = {
				totalIncome: 5000,
				totalExpenses: 8000,
				netAmount: -3000,
				transactionCount: 10,
			};

			render(<FinancialSummary summary={negativeNetSummary} />);

			expect(screen.getByText('kr -3000.00')).toBeInTheDocument();
			expect(screen.queryByText('+kr -3000.00')).not.toBeInTheDocument();
		});
	});

	describe('Responsive Design', () => {
		it('should apply responsive grid classes', () => {
			render(<FinancialSummary summary={mockSummary} />);

			// Find the grid container that contains all three summary cards
			const gridContainer = screen
				.getByText('Total Income')
				.closest('[data-slot="card"]')?.parentElement;
			expect(gridContainer).toHaveClass('grid', 'gap-4', 'md:grid-cols-2', 'lg:grid-cols-3');
		});
	});

	describe('Card Styling', () => {
		it('should apply correct styling for income card', () => {
			render(<FinancialSummary summary={mockSummary} />);

			const incomeCard = screen.getByText('Total Income').closest('[data-slot="card"]');
			expect(incomeCard).toHaveClass('border-green-200', 'bg-green-50');
		});

		it('should apply correct styling for expense card', () => {
			render(<FinancialSummary summary={mockSummary} />);

			const expenseCard = screen.getByText('Total Expenses').closest('[data-slot="card"]');
			expect(expenseCard).toHaveClass('border-red-200', 'bg-red-50');
		});

		it('should apply correct styling for positive net amount card', () => {
			render(<FinancialSummary summary={mockSummary} />);

			const netCard = screen.getByText('Net Amount').closest('[data-slot="card"]');
			expect(netCard).toHaveClass('border-blue-200', 'bg-blue-50');
		});

		it('should apply correct styling for negative net amount card', () => {
			const negativeNetSummary: FinancialSummaryType = {
				totalIncome: 5000,
				totalExpenses: 8000,
				netAmount: -3000,
				transactionCount: 10,
			};

			render(<FinancialSummary summary={negativeNetSummary} />);

			const netCard = screen.getByText('Net Amount').closest('[data-slot="card"]');
			expect(netCard).toHaveClass('border-orange-200', 'bg-orange-50');
		});
	});

	describe('Accessibility', () => {
		it('should have proper heading structure', () => {
			render(<FinancialSummary summary={mockSummary} />);

			const heading = screen.getByRole('heading', { level: 2 });
			expect(heading).toHaveTextContent('Financial Summary');
		});

		it('should have descriptive text for screen readers', () => {
			render(<FinancialSummary summary={mockSummary} />);

			expect(screen.getByText('Money coming in')).toBeInTheDocument();
			expect(screen.getByText('Money going out')).toBeInTheDocument();
			expect(screen.getByText('Income - Expenses')).toBeInTheDocument();
		});
	});

	describe('Edge Cases', () => {
		it('should handle zero net amount correctly', () => {
			const zeroNetSummary: FinancialSummaryType = {
				totalIncome: 5000,
				totalExpenses: 5000,
				netAmount: 0,
				transactionCount: 10,
			};

			render(<FinancialSummary summary={zeroNetSummary} />);

			expect(screen.getByText('kr 0.00')).toBeInTheDocument();
			expect(screen.queryByText('+kr 0.00')).not.toBeInTheDocument();
		});

		it('should handle very large numbers', () => {
			const largeSummary: FinancialSummaryType = {
				totalIncome: 1000000,
				totalExpenses: 500000,
				netAmount: 500000,
				transactionCount: 1000,
			};

			render(<FinancialSummary summary={largeSummary} />);

			expect(screen.getByText('Based on 1000 transactions')).toBeInTheDocument();
		});
	});
});
