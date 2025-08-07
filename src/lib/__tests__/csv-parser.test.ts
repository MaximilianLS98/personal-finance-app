/**
 * Unit tests for CSV parsing utility functions
 */

import { parseCSV, validateCSVContent, ParseResult } from '../csv-parser';
import { Transaction } from '../types';

describe('CSV Parser', () => {
	describe('parseCSV', () => {
		it('should parse basic English CSV format', () => {
			const csvContent = `Date,Description,Amount
2024-01-15,Salary,2500.00
2024-01-16,Groceries,-85.50
2024-01-17,Coffee,-4.25`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(3);
			expect(result.totalRows).toBe(3);
			expect(result.validRows).toBe(3);

			const [salary, groceries, coffee] = result.transactions;

			expect(salary.description).toBe('Salary');
			expect(salary.amount).toBe(2500.0);
			expect(salary.type).toBe('income');
			expect(salary.date).toEqual(new Date(2024, 0, 15));

			expect(groceries.description).toBe('Groceries');
			expect(groceries.amount).toBe(-85.5);
			expect(groceries.type).toBe('expense');

			expect(coffee.amount).toBe(-4.25);
			expect(coffee.type).toBe('expense');
		});

		it('should parse Norwegian CSV format', () => {
			const csvContent = `Bokføringsdato,Tittel,Beløp,Valuta
15.01.2024,Lønn,25000.00,NOK
16.01.2024,Dagligvarer,-855.50,NOK
17.01.2024,Kaffe,-42.25,NOK`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(3);

			const [salary, groceries, coffee] = result.transactions;

			expect(salary.description).toBe('Lønn');
			expect(salary.amount).toBe(25000.0);
			expect(salary.type).toBe('income');
			expect(salary.date).toEqual(new Date(2024, 0, 15));

			expect(groceries.description).toBe('Dagligvarer');
			expect(groceries.amount).toBe(-855.5);
			expect(groceries.type).toBe('expense');
		});

		it('should handle CSV with quoted fields', () => {
			const csvContent = `Date,Description,Amount
2024-01-15,"Salary, January",2500.00
2024-01-16,"Groceries ""Special""","-85.50"
2024-01-17,"Coffee, Morning",-4.25`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(3);

			expect(result.transactions[0].description).toBe('Salary, January');
			expect(result.transactions[1].description).toBe('Groceries "Special"');
			expect(result.transactions[1].amount).toBe(-85.5);
			expect(result.transactions[2].description).toBe('Coffee, Morning');
		});

		it('should handle different date formats', () => {
			const csvContent = `Date,Description,Amount
15.01.2024,Norwegian format,100.00
15/01/2024,Slash format,200.00
2024-01-15,ISO format,300.00
01/15/2024,US format,400.00`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(4);

			// All should parse to the same date
			const expectedDate = new Date(2024, 0, 15);
			result.transactions.forEach((transaction) => {
				expect(transaction.date).toEqual(expectedDate);
			});
		});

		it('should handle different amount formats', () => {
			const csvContent = `Date,Description,Amount
2024-01-15,Simple,1234.56
2024-01-16,With thousands,"1,234.56"
2024-01-17,Norwegian decimal,"1234,56"
2024-01-18,With spaces,"1 234.56"
2024-01-19,Currency symbol,$1234.56
2024-01-20,Negative,-1234.56`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(6);

			expect(result.transactions[0].amount).toBe(1234.56);
			expect(result.transactions[1].amount).toBe(1234.56);
			expect(result.transactions[2].amount).toBe(1234.56);
			expect(result.transactions[3].amount).toBe(1234.56);
			expect(result.transactions[4].amount).toBe(1234.56);
			expect(result.transactions[5].amount).toBe(-1234.56);
		});

		it('should categorize transactions correctly', () => {
			const csvContent = `Date,Description,Amount
2024-01-15,Income,1000.00
2024-01-16,Zero amount,0.00
2024-01-17,Expense,-500.00
2024-01-18,Small income,0.01
2024-01-19,Small expense,-0.01`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(5);

			expect(result.transactions[0].type).toBe('income');
			expect(result.transactions[1].type).toBe('income'); // Zero is considered income
			expect(result.transactions[2].type).toBe('expense');
			expect(result.transactions[3].type).toBe('income');
			expect(result.transactions[4].type).toBe('expense');
		});

		it('should generate unique IDs for transactions', () => {
			const csvContent = `Date,Description,Amount
2024-01-15,Same description,100.00
2024-01-15,Same description,200.00
2024-01-16,Same description,100.00`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(3);

			const ids = result.transactions.map((t) => t.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(3); // All IDs should be unique
		});

		it('should handle missing required columns', () => {
			const csvContent = `Date,Description
2024-01-15,Missing amount column`;

			const result = parseCSV(csvContent);

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Required columns not found');
			expect(result.transactions).toHaveLength(0);
		});

		it('should handle invalid data in rows', () => {
			const csvContent = `Date,Description,Amount
2024-01-15,Valid transaction,100.00
invalid-date,Invalid date,200.00
2024-01-17,Invalid amount,not-a-number
2024-01-18,,300.00
2024-01-19,Missing amount,`;

			const result = parseCSV(csvContent);

			expect(result.transactions).toHaveLength(1); // Only the first valid transaction
			expect(result.errors).toHaveLength(4);
			expect(result.totalRows).toBe(5);
			expect(result.validRows).toBe(1);

			expect(result.errors[0]).toContain('Row 3');
			expect(result.errors[1]).toContain('Row 4');
			expect(result.errors[2]).toContain('Row 5');
			expect(result.errors[3]).toContain('Row 6');
		});

		it('should handle empty CSV', () => {
			const result = parseCSV('');

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toBe('CSV file is empty');
			expect(result.transactions).toHaveLength(0);
		});

		it('should handle CSV with only headers', () => {
			const csvContent = 'Date,Description,Amount';

			const result = parseCSV(csvContent);

			expect(result.transactions).toHaveLength(0);
			expect(result.totalRows).toBe(0);
			expect(result.validRows).toBe(0);
			expect(result.errors).toHaveLength(0);
		});

		it('should handle custom delimiter', () => {
			const csvContent = `Date;Description;Amount
2024-01-15;Salary;2500.00
2024-01-16;Groceries;-85.50`;

			const result = parseCSV(csvContent, { delimiter: ';' });

			expect(result.errors).toHaveLength(0);
			expect(result.transactions).toHaveLength(2);
			expect(result.transactions[0].description).toBe('Salary');
			expect(result.transactions[1].description).toBe('Groceries');
		});

		it('should handle whitespace trimming options', () => {
			const csvContent = `Date,Description,Amount
 2024-01-15 , Salary , 2500.00 
 2024-01-16 , Groceries , -85.50 `;

			const resultWithTrim = parseCSV(csvContent, { trimWhitespace: true });
			const resultWithoutTrim = parseCSV(csvContent, { trimWhitespace: false });

			expect(resultWithTrim.transactions[0].description).toBe('Salary');
			expect(resultWithoutTrim.transactions[0].description).toBe(' Salary ');
		});
	});

	describe('validateCSVContent', () => {
		it('should validate valid CSV content', () => {
			const content = `Date,Description,Amount
2024-01-15,Test,100.00`;

			const result = validateCSVContent(content);

			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should reject empty content', () => {
			const result = validateCSVContent('');

			expect(result.isValid).toBe(false);
			expect(result.error).toBe('CSV content is empty');
		});

		it('should reject content with only whitespace', () => {
			const result = validateCSVContent('   \n  \n  ');

			expect(result.isValid).toBe(false);
			expect(result.error).toBe('CSV content is empty');
		});

		it('should reject content with only headers', () => {
			const result = validateCSVContent('Date,Description,Amount');

			expect(result.isValid).toBe(false);
			expect(result.error).toBe('CSV must contain at least a header row and one data row');
		});
	});
});
