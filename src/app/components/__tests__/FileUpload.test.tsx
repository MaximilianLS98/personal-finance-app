import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUpload from '../FileUpload';
import { Transaction } from '@/lib/types';

// Mock fetch globally
global.fetch = jest.fn();

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
	Upload: () => <div data-testid='upload-icon'>Upload</div>,
	FileText: () => <div data-testid='file-text-icon'>FileText</div>,
	AlertCircle: () => <div data-testid='alert-circle-icon'>AlertCircle</div>,
	CheckCircle2: () => <div data-testid='check-circle-icon'>CheckCircle2</div>,
	Loader2: () => <div data-testid='loader-icon'>Loader2</div>,
}));

describe('FileUpload Component', () => {
	const mockOnUploadSuccess = jest.fn();
	const mockOnUploadError = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		(fetch as jest.Mock).mockClear();
	});

	const createMockFile = (name: string, type: string, size: number = 1000): File => {
		const file = new File(['test content'], name, { type });
		Object.defineProperty(file, 'size', { value: size });
		return file;
	};

	it('renders the upload interface correctly', () => {
		render(<FileUpload />);

		expect(screen.getByTestId('upload-icon')).toBeInTheDocument();
		expect(
			screen.getByText('Drag and drop your CSV file here, or click to browse'),
		).toBeInTheDocument();
		expect(screen.getByText('Choose File')).toBeInTheDocument();
		expect(screen.getByText('CSV files up to 5MB')).toBeInTheDocument();
	});

	it('validates file type correctly', async () => {
		const user = userEvent.setup();
		render(<FileUpload onUploadError={mockOnUploadError} />);

		const fileInput = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
		const invalidFile = createMockFile('test.txt', 'text/plain');

		await user.upload(fileInput, invalidFile);

		expect(mockOnUploadError).toHaveBeenCalledWith('Please select a valid CSV file');
		expect(screen.getByText('Please select a valid CSV file')).toBeInTheDocument();
		expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
	});

	it('validates file size correctly', async () => {
		const user = userEvent.setup();
		render(<FileUpload onUploadError={mockOnUploadError} />);

		const fileInput = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
		const largeFile = createMockFile('large.csv', 'text/csv', 6 * 1024 * 1024); // 6MB

		await user.upload(fileInput, largeFile);

		expect(mockOnUploadError).toHaveBeenCalledWith('File size must be less than 5MB');
		expect(screen.getByText('File size must be less than 5MB')).toBeInTheDocument();
	});

	it('handles drag and drop functionality', () => {
		render(<FileUpload />);

		const dropZone = screen.getByRole('button');
		const file = createMockFile('test.csv', 'text/csv');

		// Test drag over
		fireEvent.dragOver(dropZone, {
			dataTransfer: { files: [file] },
		});

		// Should show drag over state (border color change)
		expect(dropZone.closest('.border-blue-400')).toBeInTheDocument();

		// Test drag leave
		fireEvent.dragLeave(dropZone);

		// Should remove drag over state
		expect(dropZone.closest('.border-blue-400')).not.toBeInTheDocument();
	});

	it('handles successful file upload', async () => {
		const user = userEvent.setup();
		const mockTransactions: Transaction[] = [
			{
				id: '1',
				date: new Date('2024-01-01'),
				description: 'Test transaction',
				amount: 100,
				type: 'income',
			},
		];

		const mockResponse = {
			success: true,
			data: {
				transactions: mockTransactions,
				summary: { totalRows: 1, validRows: 1, errorCount: 0 },
			},
		};

		(fetch as jest.Mock).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		});

		render(<FileUpload onUploadSuccess={mockOnUploadSuccess} />);

		const fileInput = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
		const validFile = createMockFile('transactions.csv', 'text/csv');

		await user.upload(fileInput, validFile);

		// Should show uploading state
		await waitFor(() => {
			expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
		});

		// Wait for upload to complete
		await waitFor(() => {
			expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
		});

		expect(screen.getByText('Successfully uploaded transactions.csv')).toBeInTheDocument();
		expect(mockOnUploadSuccess).toHaveBeenCalledWith(mockResponse.data);
		expect(fetch).toHaveBeenCalledWith('/api/upload', {
			method: 'POST',
			body: expect.any(FormData),
		});
	});

	it('handles upload errors from API', async () => {
		const user = userEvent.setup();
		const mockErrorResponse = {
			error: 'INVALID_CSV_CONTENT',
			message: 'Invalid CSV format',
		};

		(fetch as jest.Mock).mockResolvedValueOnce({
			ok: false,
			json: async () => mockErrorResponse,
		});

		render(<FileUpload onUploadError={mockOnUploadError} />);

		const fileInput = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
		const validFile = createMockFile('invalid.csv', 'text/csv');

		await user.upload(fileInput, validFile);

		await waitFor(() => {
			expect(screen.getByText('Invalid CSV format')).toBeInTheDocument();
		});

		expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
		expect(mockOnUploadError).toHaveBeenCalledWith('Invalid CSV format');
	});

	it('accepts CSV files with .csv extension regardless of MIME type', async () => {
		const user = userEvent.setup();

		(fetch as jest.Mock).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true, data: { transactions: [], summary: {} } }),
		});

		render(<FileUpload />);

		const fileInput = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
		// File with generic MIME type but .csv extension
		const csvFile = createMockFile('data.csv', 'application/octet-stream');

		await user.upload(fileInput, csvFile);

		// Should not show validation error
		await waitFor(() => {
			expect(screen.queryByText('Please select a valid CSV file')).not.toBeInTheDocument();
		});
	});
});
