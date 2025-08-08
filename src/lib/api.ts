export type JsonOkResponse<T> = { success?: boolean; data?: T } & Record<string, unknown>;

export class ApiError extends Error {
	status: number;
	details?: unknown;
	constructor(message: string, status: number, details?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.details = details;
	}
}

const parseJson = async <T>(res: Response): Promise<T> => {
	const text = await res.text();
	try {
		return JSON.parse(text) as T;
	} catch {
		// Non-JSON body
		return text as unknown as T;
	}
};

export const jsonFetch = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
	const res = await fetch(input, init);
	const body = await parseJson<T>(res);

	if (!res.ok) {
		const message = (body as any)?.message || (body as any)?.error || res.statusText;
		throw new ApiError(String(message), res.status, body);
	}

	return body;
};

export const getJson = <T>(url: string, init?: RequestInit) =>
	jsonFetch<T>(url, { ...init, method: 'GET' });

export const postJson = <T, P = unknown>(url: string, payload?: P, init?: RequestInit) =>
	jsonFetch<T>(url, {
		...init,
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
		body: payload !== undefined ? JSON.stringify(payload) : undefined,
	});

export const putJson = <T, P = unknown>(url: string, payload?: P, init?: RequestInit) =>
	jsonFetch<T>(url, {
		...init,
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
		body: payload !== undefined ? JSON.stringify(payload) : undefined,
	});

export const deleteJson = <T>(url: string, init?: RequestInit) =>
	jsonFetch<T>(url, { ...init, method: 'DELETE' });
