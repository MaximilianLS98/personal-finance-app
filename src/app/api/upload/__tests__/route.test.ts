import { POST } from '../route';
import { NextRequest } from 'next/server';

describe('/api/upload', () => {
	const createMockRequest = (formData: FormData): NextRequest => {
		return new NextRequest('http://localhost:3000/api/upload', {
			method: 'POST',
			body: formData,
		});
	};

	const createMockFile = (
		content: string,
		name: string = 'test.csv',
		type: string = 'text/csv',
		size?: number,
	): File => {
		const blob = new Blob([content], { type });
		const file = new File([blob], name, { type });

		// Mock the size property if provided
		if (size !== undefined) {
			Object.defineProperty(file, 'size', {
				value: size,
				writable: false,
				configurable: true,
			});
		}

		return file;
	};

	describe('File validation', () => {
		it('should return error when no file is provided', async () => {
			const formData = new FormData();
			const request = createMockRequest(formData);

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('MISSING_FILE');
			expect(data.message).toBe('No file provided in the request');
		});

		it('should return error when file is too large', async () => {
			const formData = new FormData();
			// Create a large content string that will actually be large
			const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB of content
			const largeFile = createMockFile(largeContent, 'large.csv', 'text/csv');
			formData.append('file', largeFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('FILE_TOO_LARGE');
			expect(data.message).toContain('File size exceeds maximum limit');
		});

		it('should return error for invalid file type', async () => {
			const formData = new FormData();
			const invalidFile = createMockFile('test content', 'test.txt', 'text/plain');
			// Override the name to not end with .csv
			Object.defineProperty(invalidFile, 'name', { value: 'test.txt' });
			formData.append('file', invalidFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('INVALID_FILE_TYPE');
			expect(data.message).toBe('File must be a CSV file');
		});

		it('should accept CSV file with .csv extension even with text/plain MIME type', async () => {
			const csvContent = 'Date,Description,Amount\n2024-01-01,Test,100';
			const formData = new FormData();
			const csvFile = createMockFile(csvContent, 'test.csv', 'text/plain');
			formData.append('file', csvFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.transactions).toHaveLength(1);
			expect(data.data.transactions[0].description).toBe('Test');
			expect(data.data.transactions[0].amount).toBe(100);
		});
	});

	describe('CSV content validation', () => {
		it('should return error for invalid CSV content', async () => {
			const formData = new FormData();
			const csvFile = createMockFile('', 'empty.csv', 'text/csv');
			formData.append('file', csvFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('INVALID_CSV_CONTENT');
			expect(data.message).toBe('CSV content is empty');
		});

		it('should return error for CSV with only headers', async () => {
			const formData = new FormData();
			const csvFile = createMockFile(
				'Date,Description,Amount',
				'headers-only.csv',
				'text/csv',
			);
			formData.append('file', csvFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('INVALID_CSV_CONTENT');
			expect(data.message).toBe('CSV must contain at least a header row and one data row');
		});
	});

	describe('CSV parsing', () => {
		it('should return error when parsing fails completely', async () => {
			const csvContent = 'Invalid,CSV,Content\nBad,Data,Here';
			const formData = new FormData();
			const csvFile = createMockFile(csvContent, 'bad.csv', 'text/csv');
			formData.append('file', csvFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('CSV_PARSE_ERROR');
			expect(data.message).toBe('Failed to parse CSV file');
			expect(data.details.errors).toContain(
				'Required columns not found. Expected: Date, Description, Amount',
			);
		});

		it('should return success with parsed transactions', async () => {
			const csvContent =
				'Date,Description,Amount\n2024-01-01,Salary,2500\n2024-01-02,Groceries,-150';
			const formData = new FormData();
			const csvFile = createMockFile(csvContent, 'transactions.csv', 'text/csv');
			formData.append('file', csvFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.transactions).toHaveLength(2);

			const [salary, groceries] = data.data.transactions;
			expect(salary.description).toBe('Salary');
			expect(salary.amount).toBe(2500);
			expect(salary.type).toBe('income');

			expect(groceries.description).toBe('Groceries');
			expect(groceries.amount).toBe(-150);
			expect(groceries.type).toBe('expense');

			expect(data.data.summary).toEqual({
				totalRows: 2,
				validRows: 2,
				errorCount: 0,
			});
			expect(data.data.errors).toBeUndefined();
		});

		it('should return success with partial parsing errors', async () => {
			const csvContent = 'Date,Description,Amount\n2024-01-01,Salary,2500\ninvalid,row,data';
			const formData = new FormData();
			const csvFile = createMockFile(csvContent, 'partial.csv', 'text/csv');
			formData.append('file', csvFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.transactions).toHaveLength(1);
			expect(data.data.transactions[0].description).toBe('Salary');
			expect(data.data.summary.totalRows).toBe(2);
			expect(data.data.summary.validRows).toBe(1);
			expect(data.data.summary.errorCount).toBe(1);
			expect(data.data.errors).toHaveLength(1);
			expect(data.data.errors[0]).toContain('Row 3: Invalid date format');
		});

		it('should handle Norwegian CSV format', async () => {
			const csvContent =
				'Bokføringsdato,Tittel,Beløp\n15.01.2024,Lønn,25000\n16.01.2024,Dagligvarer,-855';
			const formData = new FormData();
			const csvFile = createMockFile(csvContent, 'norwegian.csv', 'text/csv');
			formData.append('file', csvFile);

			const request = createMockRequest(formData);
			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.transactions).toHaveLength(2);

			const [salary, groceries] = data.data.transactions;
			expect(salary.description).toBe('Lønn');
			expect(salary.amount).toBe(25000);
			expect(groceries.description).toBe('Dagligvarer');
			expect(groceries.amount).toBe(-855);
		});
	});

	describe('Accepted file types', () => {
		const acceptedTypes = [
			{ type: 'text/csv', name: 'test.csv' },
			{ type: 'application/csv', name: 'test.csv' },
			{ type: 'text/plain', name: 'test.csv' },
			{ type: 'application/vnd.ms-excel', name: 'test.csv' },
		];

		acceptedTypes.forEach(({ type, name }) => {
			it(`should accept file with MIME type ${type}`, async () => {
				const csvContent = 'Date,Description,Amount\n2024-01-01,Test,100';
				const formData = new FormData();
				const csvFile = createMockFile(csvContent, name, type);
				formData.append('file', csvFile);

				const request = createMockRequest(formData);
				const response = await POST(request);

				expect(response.status).toBe(200);
			});
		});
	});
});
