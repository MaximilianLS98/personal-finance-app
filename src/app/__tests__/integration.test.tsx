/**
 * Integration tests for complete CSV upload and display workflow
 * Tests the end-to-end functionality from file upload to summary display
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../page';
import { Transaction, FinancialSummary } from '@/lib/types';

// Mock the API endpoints
global.fetch = jest.fn();

// Mock file for testing
const createMockFile = (content: string, filename = 'test.csv') => {
	const blob = new Blob([content], { type: 'text/csv' });
	return new File([blob], filename, { type: 'text/csv' });
};

// Sample CSV content
const sampleCSVContent = `Date,Description,Amount
2024-01-01,Salary,5000
2024-01-02,Groceries,-150
2024-01-03,Rent,-1200
2024-01-04,Freelance,800`;

// Sample transaction data
const sampleTransactions: Transaction[] = [
	{
		id: '1',
		date: new Date('2024-01-01'),
		description: 'Salary',
		amount: 5000,
		type: 'income',
	},
	{
		id: '2',
		date: new Date('2024-01-02'),
		description: 'Groceries',
		amount: -150,
		type: 'expense',
	},
	{
		id: '3',
		date: new Date('2024-01-03'),
		description: 'Rent',
		amount: -1200,
		type: 'expense',
	},
	{
		id: '4',
		date: new Date('2024-01-04'),
		description: 'Freelance',
		amount: 800,
		type: 'income',
	},
];

// Sample financial summary
const sampleSummary: FinancialSummary = {
	totalIncome: 5800,
	totalExpenses: 1350,
	netAmount: 4450,
	transactionCount: 4,
};

describe('CSV Finance Tracker Integration', () => {
	beforeEach(() => {
		// Reset fetch mock before each test
		(fetch as jest.Mock).mockReset();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Initial Page Load', () => {
		it('should render the main page with upload interface', async () => {
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

			await act(async () => {
				render(<Home />);
			});

			// Check main elements are present
			expect(screen.getByText('Welcome to CSV Finance Tracker')).toBeInTheDocument();
			expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
			expect(screen.getByText('Financial Summary')).toBeInTheDocument();
			expect(screen.getByText('Quick Stats')).toBeInTheDocument();

			// Check empty state
			await waitFor(() => {
				expect(screen.getByText('No Financial Data')).toBeInTheDocument();
			});
		});

		it('should handle initial summary fetch error gracefully', async () => {
			// Mock failed summary fetch
			(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

			render(<Home />);

			await waitFor(() => {
				expect(screen.getByText(/Failed to load financial summary/)).toBeInTheDocument();
			});
		});
	});

	describe('File Upload Workflow', () => {
		it('should complete full upload and display workflow successfully', async () => {
			const user = userEvent.setup();

			// Mock initial summary fetch (empty state)
			(fetch as jest.Mock)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							totalIncome: 0,
							totalExpenses: 0,
							netAmount: 0,
							transactionCount: 0,
						},
					}),
				})
				// Mock successful upload
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							transactions: sampleTransactions,
							summary: sampleSummary,
						},
					}),
				})
				// Mock summary fetch after upload
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: sampleSummary,
					}),
				});

			render(<Home />);

			// Wait for initial load
			await waitFor(() => {
				expect(screen.getByText('No Financial Data')).toBeInTheDocument();
			});

			// Create and upload file
			const file = createMockFile(sampleCSVContent);
			const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

			await user.upload(fileInput, file);

			// Wait for upload to complete
			await waitFor(() => {
				expect(screen.getByText(/CSV file uploaded successfully/)).toBeInTheDocument();
			});

			// Check that summary is displayed
			await waitFor(() => {
				expect(screen.getByText(/5\s?800,00/)).toBeInTheDocument(); // Total income NOK
				expect(screen.getByText(/1\s?350,00/)).toBeInTheDocument(); // Total expenses NOK
				expect(screen.getByText(/\+\s?4\s?450,00/)).toBeInTheDocument(); // Net amount NOK
			});

			// Check quick stats
			expect(screen.getByText('4')).toBeInTheDocument(); // Transaction count
			expect(screen.getByText('Income Transactions:')).toBeInTheDocument();
			expect(screen.getByText('Expense Transactions:')).toBeInTheDocument();

			// Verify API calls
			expect(fetch).toHaveBeenCalledTimes(3);
			expect(fetch).toHaveBeenCalledWith('/api/summary'); // Initial load
			expect(fetch).toHaveBeenCalledWith(
				'/api/upload',
				expect.objectContaining({
					method: 'POST',
					body: expect.any(FormData),
				}),
			);
			expect(fetch).toHaveBeenCalledWith('/api/summary'); // After upload
		});

		it('should handle upload errors and display error message', async () => {
			const user = userEvent.setup();

			// Mock initial summary fetch
			(fetch as jest.Mock)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							totalIncome: 0,
							totalExpenses: 0,
							netAmount: 0,
							transactionCount: 0,
						},
					}),
				})
				// Mock failed upload
				.mockResolvedValueOnce({
					ok: false,
					json: async () => ({
						error: 'INVALID_CSV',
						message: 'Invalid CSV format',
					}),
				});

			render(<Home />);

			// Upload invalid file
			const file = createMockFile('invalid,csv,content');
			const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

			await user.upload(fileInput, file);

			// Wait for error to appear
			await waitFor(() => {
				expect(screen.getAllByText('Invalid CSV format')[0]).toBeInTheDocument();
			});

			// Check that error can be dismissed
			const dismissButton = screen.getByText('Dismiss');
			await user.click(dismissButton);

			await waitFor(() => {
				// The alert should be dismissed, but the FileUpload component may still show the error
				const alerts = screen.queryAllByRole('alert');
				const hasUploadErrorAlert = alerts.some(
					(alert) =>
						alert.textContent?.includes('Invalid CSV format') &&
						alert.textContent?.includes('Dismiss'),
				);
				expect(hasUploadErrorAlert).toBe(false);
			});
		});

		it('should handle file validation errors', async () => {
			const user = userEvent.setup();

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

			// Try to upload non-CSV file
			const file = new File(['content'], 'test.txt', { type: 'text/plain' });
			const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

			fireEvent.change(fileInput, {
				target: { files: [file] },
			});

			// Should show validation error
			await waitFor(
				() => {
					expect(
						screen.getAllByText('Please select a valid CSV file')[0],
					).toBeInTheDocument();
				},
				{ timeout: 3000 },
			);

			// Should not make API call for invalid file
			expect(fetch).toHaveBeenCalledTimes(1); // Only initial summary fetch
		});
	});

	describe('Drag and Drop Functionality', () => {
		it('should handle drag and drop file upload', async () => {
			// Mock API responses
			(fetch as jest.Mock)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							totalIncome: 0,
							totalExpenses: 0,
							netAmount: 0,
							transactionCount: 0,
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							transactions: sampleTransactions,
							summary: sampleSummary,
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: sampleSummary,
					}),
				});

			render(<Home />);

			// Find the drop zone
			const dropZone = screen.getByText(/Drag and drop your CSV file here/);

			// Create file and simulate drag and drop
			const file = createMockFile(sampleCSVContent);
			const dataTransfer = {
				files: [file],
				types: ['Files'],
			};

			// Simulate drag over
			fireEvent.dragOver(dropZone, { dataTransfer });

			// Simulate drop
			fireEvent.drop(dropZone, { dataTransfer });

			// Wait for upload to complete
			await waitFor(() => {
				expect(screen.getByText(/CSV file uploaded successfully/)).toBeInTheDocument();
			});
		});
	});

	describe('Summary Error Handling', () => {
		it('should handle summary fetch errors with retry functionality', async () => {
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
				expect(screen.getByText(/5\s?800,00/)).toBeInTheDocument();
			});
		});
	});

	describe('State Management', () => {
		it('should maintain state consistency throughout workflow', async () => {
			const user = userEvent.setup();

			// Mock API responses
			(fetch as jest.Mock)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							totalIncome: 0,
							totalExpenses: 0,
							netAmount: 0,
							transactionCount: 0,
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							transactions: sampleTransactions,
							summary: sampleSummary,
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: sampleSummary,
					}),
				});

			render(<Home />);

			// Initial state - no data
			await waitFor(() => {
				expect(screen.getByText('0')).toBeInTheDocument(); // Transaction count in quick stats
			});

			// Upload file
			const file = createMockFile(sampleCSVContent);
			const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
			await user.upload(fileInput, file);

			// After upload - data should be updated
			await waitFor(() => {
				expect(screen.getByText('Based on 4 transactions')).toBeInTheDocument(); // Updated transaction count
				expect(screen.getByText('Income Transactions:')).toBeInTheDocument();
				expect(screen.getByText('Expense Transactions:')).toBeInTheDocument();
			});

			// Summary should be displayed
			expect(screen.getAllByText('Financial Summary')[0]).toBeInTheDocument();
			expect(screen.getByText('Based on 4 transactions')).toBeInTheDocument();
		});
	});

	describe('Responsive Design', () => {
		it('should render properly on different screen sizes', () => {
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

			// Check that responsive classes are applied
			const mainContainer = screen
				.getByText('Welcome to CSV Finance Tracker')
				.closest('.max-w-6xl');
			expect(mainContainer).toHaveClass('max-w-6xl');

			// Check grid layout classes
			const gridContainer = document.querySelector('.grid.gap-6.lg\\:grid-cols-2');
			expect(gridContainer).toHaveClass('lg:grid-cols-2');
		});
	});
});
