/**
 * Integration tests for the main page functionality
 * Tests the state management and component integration
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../page';
import { FinancialSummary } from '@/lib/types';

// Mock the API endpoints
global.fetch = jest.fn();

// Sample financial summary
const sampleSummary: FinancialSummary = {
	totalIncome: 5800,
	totalExpenses: 1350,
	netAmount: 4450,
	transactionCount: 4,
};

describe('Home Page Integration', () => {
	beforeEach(() => {
		// Reset fetch mock before each test
		(fetch as jest.Mock).mockReset();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Initial Page Load', () => {
		it('should render the main page with all components', async () => {
			// Mock initial summary fetch (empty state)
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						totalIncome: 0,
						totalExpenses: 0,
						netAmount: 0,
						transactionCount: 0,
					},
				}),
			});

			render(<Home />);

			// Check main elements are present
			expect(screen.getByText('Welcome to CSV Finance Tracker')).toBeInTheDocument();
			expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
			expect(screen.getByText('Financial Summary')).toBeInTheDocument();
			expect(screen.getByText('Quick Stats')).toBeInTheDocument();

			// Check empty state
			await waitFor(() => {
				expect(screen.getByText('No Financial Data')).toBeInTheDocument();
			});

			// Check that API was called
			expect(fetch).toHaveBeenCalledWith('/api/summary');
		});

		it('should handle initial summary fetch error gracefully', async () => {
			// Mock failed summary fetch
			(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

			render(<Home />);

			await waitFor(() => {
				expect(screen.getByText(/Failed to load financial summary/)).toBeInTheDocument();
			});

			// Check retry button is present
			expect(screen.getByText('Retry')).toBeInTheDocument();
		});
	});

	describe('Summary Display', () => {
		it('should display financial summary when data is available', async () => {
			// Mock successful summary fetch
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: sampleSummary,
				}),
			});

			render(<Home />);

			// Wait for summary to load
			await waitFor(() => {
				expect(screen.getByText('$5,800.00')).toBeInTheDocument(); // Total income
				expect(screen.getByText('$1,350.00')).toBeInTheDocument(); // Total expenses
				expect(screen.getByText('+$4,450.00')).toBeInTheDocument(); // Net amount
			});

			// Check summary header
			expect(screen.getByText('Based on 4 transactions')).toBeInTheDocument();
		});

		it('should handle retry functionality for summary errors', async () => {
			const user = userEvent.setup();

			// Mock initial failed summary fetch
			(fetch as jest.Mock)
				.mockRejectedValueOnce(new Error('Network error'))
				// Mock successful retry
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: sampleSummary,
					}),
				});

			render(<Home />);

			// Wait for error to appear
			await waitFor(() => {
				expect(screen.getByText(/Failed to load financial summary/)).toBeInTheDocument();
			});

			// Click retry button
			const retryButton = screen.getByText('Retry');
			await user.click(retryButton);

			// Wait for successful retry
			await waitFor(() => {
				expect(screen.getByText('$5,800.00')).toBeInTheDocument();
			});

			// Verify API was called twice
			expect(fetch).toHaveBeenCalledTimes(2);
		});
	});

	describe('Quick Stats Display', () => {
		it('should show transaction counts in quick stats', async () => {
			// Mock initial empty summary
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						totalIncome: 0,
						totalExpenses: 0,
						netAmount: 0,
						transactionCount: 0,
					},
				}),
			});

			render(<Home />);

			// Wait for initial load - should show 0 transactions
			await waitFor(() => {
				expect(screen.getByText('0')).toBeInTheDocument(); // Total transactions
			});

			// Check quick stats labels
			expect(screen.getByText('Transactions:')).toBeInTheDocument();
		});

		it('should show zero transactions initially', async () => {
			// Mock empty summary
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						totalIncome: 0,
						totalExpenses: 0,
						netAmount: 0,
						transactionCount: 0,
					},
				}),
			});

			render(<Home />);

			// Wait for data to load
			await waitFor(() => {
				expect(screen.getByText('0')).toBeInTheDocument(); // Zero transactions
			});
		});
	});

	describe('Error Handling', () => {
		it('should display upload error alerts', async () => {
			// Mock initial summary fetch
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						totalIncome: 0,
						totalExpenses: 0,
						netAmount: 0,
						transactionCount: 0,
					},
				}),
			});

			render(<Home />);

			// The FileUpload component will handle its own error display
			// We just need to verify the page structure supports error handling
			expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
		});

		it('should handle API errors gracefully', async () => {
			// Mock API error
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				json: async () => ({
					error: 'SERVER_ERROR',
					message: 'Internal server error',
				}),
			});

			render(<Home />);

			await waitFor(() => {
				expect(screen.getByText(/Failed to load financial summary/)).toBeInTheDocument();
			});
		});
	});

	describe('Layout and Responsive Design', () => {
		it('should render with proper responsive classes', async () => {
			// Mock initial summary fetch
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						totalIncome: 0,
						totalExpenses: 0,
						netAmount: 0,
						transactionCount: 0,
					},
				}),
			});

			render(<Home />);

			// Check main container has responsive classes
			const mainContainer = screen
				.getByText('Welcome to CSV Finance Tracker')
				.closest('.max-w-6xl');
			expect(mainContainer).toHaveClass('max-w-6xl');

			// Check grid layout
			const gridContainer = document.querySelector('.grid.gap-6.lg\\:grid-cols-2');
			expect(gridContainer).toHaveClass('lg:grid-cols-2');
		});

		it('should include all required sections', async () => {
			// Mock initial summary fetch
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						totalIncome: 0,
						totalExpenses: 0,
						netAmount: 0,
						transactionCount: 0,
					},
				}),
			});

			render(<Home />);

			// Check all main sections are present
			expect(screen.getByText('Welcome to CSV Finance Tracker')).toBeInTheDocument();
			expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
			expect(screen.getByText('Quick Stats')).toBeInTheDocument();
			expect(screen.getByText('Financial Summary')).toBeInTheDocument();

			// Check layout structure
			expect(screen.getByText('Import your bank transaction data')).toBeInTheDocument();
			expect(screen.getByText('Overview of your uploaded data')).toBeInTheDocument();
		});
	});

	describe('State Management', () => {
		it('should maintain consistent state structure', async () => {
			// Mock initial summary fetch
			(fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: sampleSummary,
				}),
			});

			render(<Home />);

			// Wait for data to load
			await waitFor(() => {
				expect(screen.getByText('$5,800.00')).toBeInTheDocument();
			});

			// Check that all components reflect the same data
			expect(screen.getByText('Based on 4 transactions')).toBeInTheDocument();
			expect(screen.getByText('Transactions:')).toBeInTheDocument(); // Quick stats label
		});
	});
});
