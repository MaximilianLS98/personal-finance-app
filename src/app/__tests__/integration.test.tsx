import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '../home/page';

const empty = { totalIncome: 0, totalExpenses: 0, netAmount: 0, transactionCount: 0 };
const populated = { totalIncome: 1000, totalExpenses: 100, netAmount: 900, transactionCount: 2 };
const fetchMock = jest.fn();
function response(data: unknown, ok = true) {
	return {
		ok,
		status: ok ? 200 : 500,
		text: async () => JSON.stringify(data),
		json: async () => data,
	};
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

it('loads the persisted summary and offers CSV import', async () => {
	fetchMock.mockResolvedValue(response({ success: true, data: populated }));
	renderHome();
	expect(screen.getByRole('button', { name: 'Choose File' })).toBeInTheDocument();
	await waitFor(() => expect(screen.getByText('Yes')).toBeInTheDocument());
	expect(fetchMock).toHaveBeenCalledWith(
		'/api/summary',
		expect.objectContaining({ method: 'GET' }),
	);
});

it('shows an error and retries loading the summary', async () => {
	fetchMock.mockResolvedValueOnce(response({ message: 'Unavailable' }, false));
	renderHome();
	expect(await screen.findByText('Failed to load financial summary')).toBeInTheDocument();
	fetchMock.mockResolvedValue(response({ success: true, data: populated }));
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await waitFor(() =>
		expect(screen.queryByText('Failed to load financial summary')).not.toBeInTheDocument(),
	);
});

it('imports a CSV then refreshes reports and cached transaction data', async () => {
	let uploaded = false;
	fetchMock.mockImplementation(async (url: string) => {
		if (url === '/api/upload') {
			uploaded = true;
			return response({ success: true, data: { transactions: [], summary: populated } });
		}
		return response({ success: true, data: uploaded ? populated : empty });
	});
	const client = renderHome();
	client.setQueryData(['transactions', { page: 1 }], []);
	await screen.findByText('Yes');
	fireEvent.change(screen.getByTestId('file-input'), {
		target: {
			files: [
				new File(['date,description,amount\n2026-10-01,Test,100'], 'synthetic.csv', {
					type: 'text/csv',
				}),
			],
		},
	});
	await waitFor(() => expect(uploaded).toBe(true));
	await waitFor(() => expect(client.getQueryData(['summary'])).toEqual(populated));
	expect(client.getQueryState(['transactions', { page: 1 }])?.isInvalidated).toBe(true);
});

it('reports upload failures and rejects invalid files before sending', async () => {
	fetchMock.mockResolvedValue(response({ success: true, data: empty }));
	renderHome();
	await screen.findByText('Yes');
	fireEvent.change(screen.getByTestId('file-input'), {
		target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })] },
	});
	expect(await screen.findByText('Please select a valid CSV file')).toBeInTheDocument();
	expect(fetchMock).toHaveBeenCalledTimes(1);
	fetchMock.mockResolvedValue(response({ message: 'Could not import CSV' }, false));
	fireEvent.change(screen.getByTestId('file-input'), {
		target: { files: [new File(['csv'], 'test.csv', { type: 'text/csv' })] },
	});
	expect(await screen.findByText('Could not import CSV')).toBeInTheDocument();
});
