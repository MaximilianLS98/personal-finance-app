import '@testing-library/jest-dom';

// Mock Next.js globals for API routes
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill crypto.randomUUID used in repository tests
if (!global.crypto) {
	global.crypto = {};
}
if (!global.crypto.randomUUID) {
	global.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
}

// Mock Web APIs
global.ReadableStream = global.ReadableStream || class ReadableStream {};

// Mock next/server in a minimal way for API tests
jest.mock('next/server', () => ({
	NextResponse: {
		json: (data, init) => ({
			json: async () => data,
			status: init?.status || 200,
			ok: (init?.status || 200) < 400,
		}),
	},
	NextRequest: jest.fn().mockImplementation((url, init) => ({
		url,
		method: init?.method || 'GET',
		headers: new Map(),
		formData: async () => init?.body || new FormData(),
	})),
}));

// Mock bun:sqlite for database tests
jest.mock('bun:sqlite', () => {
	class MockStatement {
		run(param) {
			this._lastRunParams = param;
			return { changes: 1 };
		}
		get() {
			return null;
		}
		all() {
			return [];
		}
	}
	class MockDatabase {
		constructor(filename, options = {}) {
			this.filename = filename;
			this.options = options;
			this.closed = false;
		}
		exec(_sql) {}
		prepare(_sql) {
			return new MockStatement();
		}
		query(_sql) {
			return {
				get: (_param) => null,
				run: (_param) => ({ changes: 1 }),
				all: () => [],
			};
		}
		transaction(fn) {
			return () => fn();
		}
		close() {
			this.closed = true;
		}
	}
	return { Database: MockDatabase };
});

// Mock fetch for tests
global.fetch = global.fetch || jest.fn();
