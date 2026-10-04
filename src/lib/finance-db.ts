import { getConnectionManager } from './database/connection';

/** Borrow the application connection; only its manager owns its lifetime. */
export async function financeDb() {
	const manager = getConnectionManager();
	await manager.initialize();
	await manager.runMigrations();
	return manager.getConnection();
}
