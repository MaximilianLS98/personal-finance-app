import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BackupSettings } from '../BackupSettings';

it('requires file validation and explicit typed confirmation before replacing data', async () => {
	const previousFetch = global.fetch;
	const fetchMock = jest.fn(async (_url: string | URL | Request, options?: RequestInit) => {
		const body =
			options?.method === 'POST'
				? {
						preview: {
							createdAt: '2026-10-01T00:00:00Z',
							schemaVersion: 10,
							checksum: 'test',
							totalRecords: 2,
							tables: [{ name: 'transactions', records: 2 }],
						},
					}
				: { restored: { totalRecords: 2 } };
		return { ok: true, json: async () => body } as Response;
	});
	global.fetch = fetchMock as unknown as typeof fetch;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<BackupSettings />
		</QueryClientProvider>,
	);
	expect(screen.queryByText('Review replacement')).not.toBeInTheDocument();
	fireEvent.change(screen.getByLabelText('Select full JSON backup'), {
		target: { files: [{ name: 'saved.json', size: 100, text: async () => '{"format":"test"}' }] },
	});
	await screen.findByText('Review replacement');
	expect(fetchMock).toHaveBeenCalledTimes(1);
	fireEvent.click(screen.getByText('Review replacement'));
	const replace = screen.getByRole('button', { name: 'Replace finance data' });
	expect(replace).toBeDisabled();
	fireEvent.change(screen.getByLabelText('Type RESTORE to confirm'), {
		target: { value: 'RESTORE' },
	});
	expect(replace).toBeEnabled();
	fireEvent.click(replace);
	await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
	expect(fetchMock.mock.calls[1][1]?.headers).toEqual({
		'Content-Type': 'application/json',
		'X-Confirm-Restore': 'REPLACE ALL FINANCE DATA',
	});
	await screen.findByText(
		'Restored 2 records. A backup of the previous data was saved automatically.',
	);
	expect(screen.getByRole('link', { name: 'Download pre-restore backup' })).toHaveAttribute(
		'href',
		'/api/backups?safety=latest',
	);
	global.fetch = previousFetch;
});
