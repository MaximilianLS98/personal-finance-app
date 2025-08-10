import type { Migration } from '../types';

export const migration005: Migration = {
	version: 5,
	description:
		'Add subscriptions and subscription_patterns tables, extend transactions with subscription fields',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	up: (db: any) => {
		// Create subscriptions table
		db.exec(`
			CREATE TABLE IF NOT EXISTS subscriptions (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				amount REAL NOT NULL,
				currency TEXT DEFAULT 'NOK',
				billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('monthly', 'quarterly', 'annually', 'custom')),
				custom_frequency_days INTEGER,
				next_payment_date TEXT NOT NULL,
				category_id TEXT NOT NULL REFERENCES categories(id),
				is_active BOOLEAN DEFAULT TRUE,
				start_date TEXT NOT NULL,
				end_date TEXT,
				notes TEXT,
				website TEXT,
				cancellation_url TEXT,
				last_used_date TEXT,
				usage_rating INTEGER CHECK (usage_rating BETWEEN 1 AND 5),
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Create subscription_patterns table
		db.exec(`
			CREATE TABLE IF NOT EXISTS subscription_patterns (
				id TEXT PRIMARY KEY,
				subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
				pattern TEXT NOT NULL,
				pattern_type TEXT NOT NULL CHECK (pattern_type IN ('exact', 'contains', 'starts_with', 'regex')),
				confidence_score REAL DEFAULT 1.0,
				created_by TEXT NOT NULL CHECK (created_by IN ('user', 'system')),
				is_active BOOLEAN DEFAULT TRUE,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Add subscription fields to transactions table
		try {
			const info = db.query("PRAGMA table_info('transactions')").all() as Array<{
				name: string;
			}>;
			const hasIsSubscription = info.some((c) => c.name === 'is_subscription');
			const hasSubscriptionId = info.some((c) => c.name === 'subscription_id');

			if (!hasIsSubscription) {
				db.exec(
					'ALTER TABLE transactions ADD COLUMN is_subscription BOOLEAN DEFAULT FALSE',
				);
			}
			if (!hasSubscriptionId) {
				db.exec(
					'ALTER TABLE transactions ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id)',
				);
			}
		} catch (e) {
			// Fallback: recreate table with new columns if ALTER failed (older SQLite)
			db.exec(`
				CREATE TABLE IF NOT EXISTS transactions_new (
					id TEXT PRIMARY KEY,
					date TEXT NOT NULL,
					description TEXT NOT NULL,
					amount REAL NOT NULL,
					type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
					currency TEXT,
					category_id TEXT REFERENCES categories(id),
					is_subscription BOOLEAN DEFAULT FALSE,
					subscription_id TEXT REFERENCES subscriptions(id),
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);
			`);
			try {
				db.exec(`
					INSERT INTO transactions_new (id, date, description, amount, type, currency, category_id, is_subscription, subscription_id, created_at, updated_at)
					SELECT id, date, description, amount, type, currency, category_id, FALSE as is_subscription, NULL as subscription_id, created_at, updated_at FROM transactions;
				`);
			} catch {}
			try {
				db.exec('DROP TABLE IF EXISTS transactions;');
			} catch {}
			db.exec('ALTER TABLE transactions_new RENAME TO transactions;');
		}

		// Create indexes for performance optimization
		db.exec('CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(is_active);');
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_subscriptions_category ON subscriptions(category_id);',
		);
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment ON subscriptions(next_payment_date);',
		);
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_frequency ON subscriptions(billing_frequency);',
		);

		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_subscription_patterns_subscription ON subscription_patterns(subscription_id);',
		);
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_subscription_patterns_active ON subscription_patterns(is_active);',
		);
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_subscription_patterns_type ON subscription_patterns(pattern_type);',
		);

		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_transactions_subscription ON transactions(subscription_id);',
		);
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_transactions_is_subscription ON transactions(is_subscription);',
		);

		// Recreate existing transaction indexes to ensure they exist
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);');
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);');
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);');
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);',
		);
		db.exec(
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique ON transactions(date, description, amount);',
		);

		// Mark migration as applied
		db.exec('INSERT OR IGNORE INTO schema_metadata (version) VALUES (5);');
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	down: (db: any) => {
		// Drop subscription-related tables
		db.exec('DROP TABLE IF EXISTS subscription_patterns;');
		db.exec('DROP TABLE IF EXISTS subscriptions;');

		// Remove subscription columns from transactions table
		db.exec(`
			CREATE TABLE transactions_backup AS 
			SELECT id, date, description, amount, type, currency, category_id, created_at, updated_at FROM transactions;
		`);
		db.exec('DROP TABLE IF EXISTS transactions;');
		db.exec(`
			CREATE TABLE transactions (
				id TEXT PRIMARY KEY,
				date TEXT NOT NULL,
				description TEXT NOT NULL,
				amount REAL NOT NULL,
				type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
				currency TEXT,
				category_id TEXT REFERENCES categories(id),
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);
		db.exec(`
			INSERT INTO transactions (id, date, description, amount, type, currency, category_id, created_at, updated_at)
			SELECT id, date, description, amount, type, currency, category_id, created_at, updated_at FROM transactions_backup;
		`);
		db.exec('DROP TABLE transactions_backup;');

		// Recreate original transaction indexes
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);');
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);');
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);');
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);',
		);
		db.exec(
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique ON transactions(date, description, amount);',
		);

		// Remove migration record
		db.exec('DELETE FROM schema_metadata WHERE version = 5;');
	},
};
