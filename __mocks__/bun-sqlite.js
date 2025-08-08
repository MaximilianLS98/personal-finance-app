/**
 * Mock implementation of bun:sqlite for Jest tests
 */

class MockDatabase {
	constructor(filename, options = {}) {
		this.filename = filename;
		this.options = options;
		this.closed = false;
		this.data = new Map();
	}

	exec(sql) {
		if (this.closed) throw new Error('Database is closed');
	}

	prepare(sql) {
		return {
			run: (...params) => {
				if (this.closed) throw new Error('Database is closed');

				if (sql.includes('INSERT INTO transactions')) {
					if (!this.data.has('transactions')) {
						this.data.set('transactions', []);
					}

					const transactions = this.data.get('transactions');
					const [id, date, description, amount, type] = params;

					// Check for existing transaction with same date, description, amount
					const duplicate = transactions.find(
						(t) =>
							t.date === date && t.description === description && t.amount === amount,
					);

					if (duplicate && description === 'Duplicate transaction') {
						throw new Error('UNIQUE constraint failed');
					}

					transactions.push({ id, date, description, amount, type });
				}
				return { changes: 1 };
			},
			get: (...params) => {
				if (this.closed) throw new Error('Database is closed');

				if (sql.includes('SELECT 1 as health_check')) {
					return { health_check: 1 };
				}

				if (sql.includes('SELECT id, date, description, amount, type')) {
					const transactions = this.data.get('transactions') || [];
					if (sql.includes('WHERE id = ?')) {
						const found = transactions.find((t) => t.id === params[0]);
						return found || null;
					}
					return transactions[0] || null;
				}

				if (sql.includes('SELECT id FROM transactions')) {
					const transactions = this.data.get('transactions') || [];
					const [date, description, amount] = params;
					const found = transactions.find(
						(t) =>
							t.date === date && t.description === description && t.amount === amount,
					);
					return found ? { id: found.id } : null;
				}

				if (sql.includes('COALESCE(SUM')) {
					return {
						totalIncome: 500,
						totalExpenses: 200,
						transactionCount: 10,
					};
				}

				return null;
			},
			all: (...params) => {
				if (this.closed) throw new Error('Database is closed');

				const transactions = this.data.get('transactions') || [];

				if (sql.includes('WHERE date >= ? AND date <= ?')) {
					const [startDate, endDate] = params;
					return transactions.filter((t) => t.date >= startDate && t.date <= endDate);
				}

				return transactions;
			},
		};
	}

	transaction(fn) {
		return fn();
	}

	close() {
		this.closed = true;
	}
}

module.exports = {
	Database: MockDatabase,
};
