import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DetectSubscriptionsPage from '../page';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/app/providers', () => ({
	useCurrencySettings: () => ({ currency: 'NOK', locale: 'en-US' }),
}));
const match = {
	transaction: {
		id: 'payment-1',
		date: '2026-10-01',
		description: 'Synthetic stream charge',
		amount: -15,
		currency: 'USD',
		type: 'expense',
	},
	subscription: {
		id: 'sub1',
		name: 'Synthetic streaming',
		amount: 14,
		currency: 'USD',
		billingFrequency: 'monthly',
	},
	confidence: 0.95,
};
it('exposes existing matches from detection and explicitly confirms selected payment links', async () => {
	const requests: Array<{ url: string; body: unknown }> = [];
	const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
		const body =
			url === '/api/transactions'
				? []
				: url === '/api/categories'
					? []
					: url === '/api/subscriptions/detect'
						? { success: true, data: { candidates: [], matches: [match] } }
						: { success: true, data: { errors: [] } };
		return { ok: true, json: async () => body } as Response;
	});
	global.fetch = fetchMock as unknown as typeof fetch;
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<DetectSubscriptionsPage />
		</QueryClientProvider>,
	);
	const start = screen.getByRole('button', { name: 'Start Detection' });
	await waitFor(() => expect(start).toBeEnabled());
	fireEvent.click(start);
	fireEvent.click(await screen.findByRole('button', { name: 'Review 1 existing payment matches' }));
	expect(screen.getByLabelText('Link payment-1 to Synthetic streaming')).not.toBeChecked();
	expect(requests.filter((request) => request.url === '/api/subscriptions/confirm')).toHaveLength(
		0,
	);
	fireEvent.click(screen.getByLabelText('Link payment-1 to Synthetic streaming'));
	fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 Items' }));
	await screen.findByText('Linked 1 payment to existing subscriptions.');
	expect(requests.find((request) => request.url === '/api/subscriptions/confirm')?.body).toEqual({
		matches: [match],
	});
	expect(
		screen.queryByRole('button', { name: 'Review 1 existing payment matches' }),
	).not.toBeInTheDocument();
	client.clear();
});
