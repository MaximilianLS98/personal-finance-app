import { ApiError, getJson, postJson } from '../api';

const fetchMock = jest.fn();
beforeEach(() => {
	fetchMock.mockReset();
	global.fetch = fetchMock as unknown as typeof fetch;
});
it('preserves structured errors from the API', async () => {
	fetchMock.mockResolvedValue({
		ok: false,
		status: 400,
		text: async () => JSON.stringify({ message: 'Invalid amount' }),
	});
	await expect(getJson('/api/example')).rejects.toMatchObject({
		name: 'ApiError',
		status: 400,
		message: 'Invalid amount',
	});
});
it('rejects malformed successful responses and accepts empty responses', async () => {
	fetchMock.mockResolvedValueOnce({
		ok: true,
		status: 200,
		text: async () => '<html>Error</html>',
	});
	await expect(getJson('/api/example')).rejects.toBeInstanceOf(ApiError);
	fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
	expect(await getJson('/api/example')).toBeUndefined();
});
it('preserves Headers instances when sending JSON', async () => {
	fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
	await postJson('/api/example', { amount: 1 }, { headers: new Headers({ 'X-Test': 'value' }) });
	const init = fetchMock.mock.calls[0][1] as RequestInit;
	expect((init.headers as Headers).get('X-Test')).toBe('value');
	expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
	expect(init.body).toBe('{"amount":1}');
});
