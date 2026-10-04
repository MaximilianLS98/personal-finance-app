export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
	const res = await fetch(input, init);
	const text = await res.text();
	let body: unknown;
	try {
		body = text ? JSON.parse(text) : undefined;
	} catch {
		if (res.ok)
			throw new ApiError('The server returned an invalid JSON response', res.status, text);
		body = text;
	}
	if (!res.ok) {
		const error = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
		throw new ApiError(
			String(error.message || error.error || res.statusText || 'Request failed'),
			res.status,
			body,
		);
	}
	return body as T;
}

export const getJson = <T>(url: string, init?: RequestInit) =>
	jsonFetch<T>(url, { ...init, method: 'GET' });

function sendJson<T>(method: 'POST' | 'PUT', url: string, payload: unknown, init?: RequestInit) {
	const headers = new Headers(init?.headers);
	headers.set('Content-Type', 'application/json');
	return jsonFetch<T>(url, {
		...init,
		method,
		headers,
		body: payload === undefined ? undefined : JSON.stringify(payload),
	});
}
export const postJson = <T, P = unknown>(url: string, payload?: P, init?: RequestInit) =>
	sendJson<T>('POST', url, payload, init);
export const putJson = <T, P = unknown>(url: string, payload?: P, init?: RequestInit) =>
	sendJson<T>('PUT', url, payload, init);
export const deleteJson = <T>(url: string, init?: RequestInit) =>
	jsonFetch<T>(url, { ...init, method: 'DELETE' });
