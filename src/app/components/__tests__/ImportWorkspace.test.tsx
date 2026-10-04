import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportWorkspace from '../ImportWorkspace';
const fetchMock = jest.fn();
const response = (data: unknown) => ({
	ok: true,
	json: async () => data,
	text: async () => JSON.stringify(data),
});
const preview = {
	headers: ['Bokføringsdato', 'Beløp', 'Avsender', 'Tittel', 'Valuta'],
	columns: { date: 0, amount: 1, description: 3, currency: 4 },
	errors: [],
	totalRows: 1,
	validRows: 1,
	rows: [
		{
			rowNumber: 2,
			duplicate: false,
			transaction: { date: '2026-10-01', description: 'Synthetic', amount: -20, currency: 'NOK' },
		},
	],
};
beforeEach(() => {
	fetchMock.mockReset();
	global.fetch = fetchMock as unknown as typeof fetch;
});
function mount() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<ImportWorkspace />
		</QueryClientProvider>,
	);
}
async function selectFile() {
	await screen.findByText('Synthetic account (NOK)');
	fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account' } });
	fireEvent.change(screen.getByLabelText('CSV statement'), {
		target: {
			files: [
				new File(['Date,Description,Amount\n2026-10-01,Synthetic,-20'], 'synthetic.csv', {
					type: 'text/csv',
				}),
			],
		},
	});
}
it('locks account, file and mapping controls during an in-flight preview', async () => {
	let finish!: (value: unknown) => void;
	fetchMock.mockImplementation(async (url: string) =>
		url === '/api/accounts'
			? response([{ id: 'account', name: 'Synthetic account', currency: 'NOK' }])
			: url === '/api/imports'
				? response([])
				: null,
	);
	mount();
	await selectFile();
	fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
		options?.method === 'POST'
			? new Promise((resolve) => {
					finish = resolve;
				})
			: Promise.resolve(response([])),
	);
	fireEvent.click(screen.getByRole('button', { name: 'Preview statement' }));
	expect(screen.getByLabelText('Account')).toBeDisabled();
	expect(screen.getByLabelText('CSV statement')).toBeDisabled();
	finish(response(preview));
	await screen.findByText('Synthetic');
	expect(screen.getByLabelText('Account')).not.toBeDisabled();
});
it('retains resolved automatic indices when overriding one column and supports returning to automatic', async () => {
	fetchMock.mockImplementation(async (url: string, options?: RequestInit) =>
		url === '/api/accounts'
			? response([{ id: 'account', name: 'Synthetic account', currency: 'NOK' }])
			: options?.method === 'POST'
				? response(preview)
				: response([]),
	);
	mount();
	await selectFile();
	fireEvent.click(screen.getByRole('button', { name: 'Preview statement' }));
	await screen.findByText('Synthetic');
	fireEvent.change(screen.getByLabelText('currency column'), { target: { value: '4' } });
	expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
	fireEvent.click(screen.getByRole('button', { name: 'Apply mapping and preview again' }));
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Confirm import' })).not.toBeDisabled(),
	);
	const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
	const options = JSON.parse(calls.at(-1)[1].body.get('options'));
	expect(options.columns).toEqual({ date: 0, amount: 1, description: 3, currency: 4 });
	fireEvent.change(screen.getByLabelText('amount column'), { target: { value: '' } });
	fireEvent.click(screen.getByRole('button', { name: 'Apply mapping and preview again' }));
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Confirm import' })).not.toBeDisabled(),
	);
	const latest = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST').at(-1)!;
	expect(JSON.parse(latest[1].body.get('options')).columns.amount).toBeUndefined();
	expect(screen.getByLabelText('Import row 2')).toBeInTheDocument();
});
it('requires a selected Revolut product and a fresh preview after changing fee handling', async () => {
	fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
		if (url === '/api/accounts')
			return response([{ id: 'account', name: 'Synthetic account', currency: 'NOK' }]);
		if (options?.method === 'POST') {
			const input = JSON.parse((options.body as FormData).get('options') as string);
			return response({
				...preview,
				format: 'revolut',
				products: ['Current', 'Savings'],
				requiresProductSelection: !input.revolutProduct,
				rows: input.revolutProduct ? preview.rows : [],
				skippedRows: [{ rowNumber: 3, reason: 'REVERTED: not a completed account movement' }],
			});
		}
		return response([]);
	});
	mount();
	await selectFile();
	fireEvent.click(screen.getByRole('button', { name: 'Preview statement' }));
	await screen.findByText('Revolut statement detected');
	expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
	fireEvent.change(screen.getByLabelText('Revolut product'), { target: { value: 'Current' } });
	fireEvent.click(screen.getByRole('button', { name: 'Apply Revolut options and preview again' }));
	await screen.findByText('Synthetic');
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Confirm import' })).not.toBeDisabled(),
	);
	fireEvent.change(screen.getByLabelText('Nonzero fee handling'), { target: { value: 'deduct' } });
	expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
	fireEvent.click(screen.getByRole('button', { name: 'Apply Revolut options and preview again' }));
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Confirm import' })).not.toBeDisabled(),
	);
	const latest = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST').at(-1)!;
	expect(JSON.parse(latest[1].body.get('options'))).toMatchObject({
		revolutProduct: 'Current',
		revolutFeeMode: 'deduct',
	});
});
