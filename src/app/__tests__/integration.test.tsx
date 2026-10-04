import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '../home/page';

const empty = {
	month: '2026-10',
	totals: [],
	categories: [],
	latestDate: null,
	reviewCount: 0,
	upcoming: [],
	budgetRisks: [],
	goals: [],
};
const populated = {
	...empty,
	latestDate: '2026-10-02',
	reviewCount: 3,
	totals: [
		{ currency: 'NOK', income: 1000, expenses: 100, net: 900, count: 2 },
		{ currency: 'USD', income: 0, expenses: 20, net: -20, count: 1 },
	],
	categories: [
		{ categoryId: 'cat_groceries', name: 'Groceries', currency: 'NOK', amount: 100, count: 1 },
	],
	goals: [{ id: 'goal', name: 'Emergency savings', currency: 'NOK', target: 10000, saved: 2000 }],
};
const fetchMock = jest.fn();
function response(data: unknown, ok = true) {
	return { ok, status: ok ? 200 : 500, json: async () => data };
}
function renderHome() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<Home />
		</QueryClientProvider>,
	);
	return client;
}
beforeEach(() => {
	fetchMock.mockReset();
	global.fetch = fetchMock as unknown as typeof fetch;
});
it('loads a monthly overview, keeps currencies separate and offers import', async () => {
	fetchMock.mockResolvedValue(response(populated));
	renderHome();
	expect(screen.getByRole('link', { name: 'Import statement' })).toHaveAttribute(
		'href',
		'/imports',
	);
	expect(await screen.findByText('NOK')).toBeInTheDocument();
	expect(screen.getByText('USD')).toBeInTheDocument();
	expect(screen.getAllByText('Cash surplus')).toHaveLength(2);
	expect(screen.getByRole('progressbar', { name: 'Emergency savings progress' })).toHaveAttribute(
		'value',
		'2000',
	);
});
it('shows an error and retries loading', async () => {
	fetchMock.mockResolvedValueOnce(response({ error: 'Unavailable' }, false));
	renderHome();
	expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
	fetchMock.mockResolvedValue(response(populated));
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
	expect(screen.getByText('NOK')).toBeInTheDocument();
});
it('changes period and passes month/category to drill-through', async () => {
	fetchMock.mockResolvedValue(response(populated));
	renderHome();
	await screen.findByText('Groceries · 1 transactions');
	fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-09' } });
	await waitFor(() =>
		expect(fetchMock).toHaveBeenCalledWith('/api/overview?month=2026-09', undefined),
	);
	expect(await screen.findByRole('link', { name: 'Groceries · 1 transactions' })).toHaveAttribute(
		'href',
		'/transactions?category=cat_groceries&month=2026-09',
	);
	expect(screen.getByRole('link', { name: 'Open review inbox' })).toHaveAttribute(
		'href',
		'/review?month=2026-09',
	);
});
it('guides an empty account toward import without fabricated totals', async () => {
	fetchMock.mockResolvedValue(response(empty));
	renderHome();
	expect(
		await screen.findByText('Import a bank statement to build your first monthly overview.'),
	).toBeInTheDocument();
	expect(screen.queryByText('Cash surplus')).not.toBeInTheDocument();
	expect(screen.getByRole('link', { name: 'Import statement' })).toBeInTheDocument();
});
