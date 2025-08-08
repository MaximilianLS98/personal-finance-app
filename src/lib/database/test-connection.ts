#!/usr/bin/env bun
/**
 * Simple integration test for database connection manager
 * Run with: bun run src/lib/database/test-connection.ts
 */

import {
	SQLiteConnectionManager,
	getConnectionManager,
	resetConnectionManager,
} from './connection';
import { DatabaseErrorType } from './types';

async function testConnectionManager() {
	console.log('🧪 Testing SQLite Connection Manager...\n');

	// Test 1: Basic initialization
	console.log('1. Testing basic initialization...');
	const manager = new SQLiteConnectionManager({ filename: ':memory:' });

	try {
		await manager.initialize();
		console.log('✅ Database initialized successfully');
		console.log(`   Ready: ${manager.isReady()}`);
	} catch (error) {
		console.log('❌ Failed to initialize database:', error);
		return;
	}

	// Test 2: Connection retrieval
	console.log('\n2. Testing connection retrieval...');
	try {
		const db = manager.getConnection();
		console.log('✅ Database connection retrieved');
		console.log(`   Connection type: ${typeof db}`);
	} catch (error) {
		console.log('❌ Failed to get connection:', error);
	}

	// Test 3: Health check
	console.log('\n3. Testing health check...');
	try {
		const isHealthy = await manager.isHealthy();
		console.log(`✅ Health check result: ${isHealthy}`);
	} catch (error) {
		console.log('❌ Health check failed:', error);
	}

	// Test 4: Basic query execution
	console.log('\n4. Testing basic query execution...');
	try {
		const db = manager.getConnection();
		const result = db.query('SELECT 1 as test_value').get();
		console.log('✅ Query executed successfully');
		console.log(`   Result: ${JSON.stringify(result)}`);
	} catch (error) {
		console.log('❌ Query execution failed:', error);
	}

	// Test 5: Pragma checks
	console.log('\n5. Testing database pragmas...');
	try {
		const db = manager.getConnection();
		const foreignKeys = db.query('PRAGMA foreign_keys').get();
		const busyTimeout = db.query('PRAGMA busy_timeout').get();
		console.log('✅ Pragmas checked successfully');
		console.log(`   Foreign keys: ${JSON.stringify(foreignKeys)}`);
		console.log(`   Busy timeout: ${JSON.stringify(busyTimeout)}`);
	} catch (error) {
		console.log('❌ Pragma check failed:', error);
	}

	// Test 6: Migration runner
	console.log('\n6. Testing migration runner...');
	try {
		await manager.runMigrations();
		console.log('✅ Migrations completed successfully');
	} catch (error) {
		console.log('❌ Migration failed:', error);
	}

	// Test 7: Singleton pattern
	console.log('\n7. Testing singleton pattern...');
	try {
		const singleton1 = getConnectionManager({ filename: ':memory:' });
		const singleton2 = getConnectionManager();
		console.log(
			`✅ Singleton test: ${
				singleton1 === singleton2 ? 'Same instance' : 'Different instances'
			}`,
		);
	} catch (error) {
		console.log('❌ Singleton test failed:', error);
	}

	// Test 8: Error handling
	console.log('\n8. Testing error handling...');
	try {
		const uninitializedManager = new SQLiteConnectionManager({ filename: ':memory:' });
		try {
			uninitializedManager.getConnection();
			console.log('❌ Should have thrown error for uninitialized connection');
		} catch (error: any) {
			if (error.type === DatabaseErrorType.CONNECTION_FAILED) {
				console.log('✅ Proper error thrown for uninitialized connection');
			} else {
				console.log('❌ Wrong error type thrown:', error.type);
			}
		}
	} catch (error) {
		console.log('❌ Error handling test failed:', error);
	}

	// Test 9: Connection cleanup
	console.log('\n9. Testing connection cleanup...');
	try {
		await manager.close();
		console.log('✅ Connection closed successfully');
		console.log(`   Ready after close: ${manager.isReady()}`);

		const isHealthyAfterClose = await manager.isHealthy();
		console.log(`   Healthy after close: ${isHealthyAfterClose}`);
	} catch (error) {
		console.log('❌ Connection cleanup failed:', error);
	}

	// Cleanup singleton
	resetConnectionManager();

	console.log('\n🎉 Connection manager tests completed!');
}

// Run tests if this file is executed directly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((import.meta as any).main) {
	testConnectionManager().catch(console.error);
}
