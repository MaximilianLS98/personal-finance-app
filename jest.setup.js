import '@testing-library/jest-dom';

// Mock Next.js globals for API routes
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Web APIs
global.ReadableStream = global.ReadableStream || class ReadableStream {};

// Mock NextResponse for API route tests
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

// Mock fetch for tests
global.fetch = global.fetch || jest.fn();
