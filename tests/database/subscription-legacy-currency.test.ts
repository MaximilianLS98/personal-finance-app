import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';
import { migrations } from '../../src/lib/database/migrations';
import { migration010 } from '../../src/lib/database/migrations/010_subscription_history';
it('migrates legacy unknown currencies and preserves future history without relabeling money', () => {
	const db = new Database(':memory:');
	try {
		for (const migration of migrations.filter((m) => m.version < migration010.version))
			migration.up(db);
		db.query('INSERT INTO categories(id,name,color,icon) VALUES(?,?,?,?)').run(
			'legacy-category',
			'Legacy',
			'#123456',
			'Wallet',
		);
		const insert = db.query(
			'INSERT INTO subscriptions(id,name,amount,currency,billing_frequency,next_payment_date,category_id,start_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
		);
		insert.run(
			'null',
			'Legacy null',
			10,
			null,
			'monthly',
			'2026-11-01',
			'legacy-category',
			'2026-01-01',
			null,
			null,
		);
		insert.run(
			'blank',
			'Legacy blank',
			20,
			' ',
			'monthly',
			'2026-11-01',
			'legacy-category',
			'2026-01-01',
			null,
			null,
		);
		insert.run(
			'known',
			'Legacy known',
			30,
			'nok',
			'monthly',
			'2026-11-01',
			'legacy-category',
			'2026-01-01',
			null,
			null,
		);
		db.transaction(() => migration010.up(db))();
		const rows = () =>
			db
				.query('SELECT subscription_id,currency,source FROM subscription_price_history ORDER BY id')
				.all();
		expect(rows()).toHaveLength(3);
		expect(
			rows()
				.map((row) => (row as { currency: string }).currency)
				.sort(),
		).toEqual(['NOK', 'UNKNOWN', 'UNKNOWN']);
		db.query('UPDATE subscriptions SET amount=? WHERE id=?').run(11, 'null');
		insert.run(
			'new',
			'New unknown',
			40,
			null,
			'monthly',
			'2026-11-01',
			'legacy-category',
			'2026-01-01',
			null,
			null,
		);
		expect(rows().slice(-2)).toEqual([
			{ subscription_id: 'null', currency: 'UNKNOWN', source: 'edited' },
			{ subscription_id: 'new', currency: 'UNKNOWN', source: 'created' },
		]);
		expect(
			db
				.query('SELECT COUNT(*) AS count FROM subscription_price_history WHERE recorded_at IS NULL')
				.get(),
		).toEqual({ count: 0 });
	} finally {
		db.close();
	}
});
