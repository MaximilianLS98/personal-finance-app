'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, postJson } from '@/lib/api';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import { currencyCode, displayMoney } from '@/lib/money';
import type { Account } from '@/lib/ledger-service';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
type Row = {
	id: string;
	date: string;
	description: string;
	amount: number;
	currency: string | null;
};
export default function LegacyAssignment({ accounts }: { accounts: Account[] }) {
	const qc = useQueryClient();
	const { data: rows = [] } = useQuery({
		queryKey: ['accounts', 'unassigned'],
		queryFn: () => getJson<Row[]>('/api/accounts?action=unassigned'),
	});
	const [selected, setSelected] = useState<string[]>([]),
		[accountId, setAccount] = useState(''),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false);
	if (!rows.length) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Assign existing history to accounts</CardTitle>
			</CardHeader>
			<CardContent className='space-y-3'>
				<p>
					{rows.length} transactions have no account. Select only records belonging to the chosen
					account. Unknown currencies will take the account currency; known currencies must match.
				</p>
				<label>
					Destination account
					<select
						className='block border rounded p-2'
						value={accountId}
						onChange={(e) => setAccount(e.target.value)}
						disabled={busy}
					>
						<option value=''>Choose account</option>
						{accounts.map((a) => (
							<option key={a.id} value={a.id}>
								{a.name} ({a.currency})
							</option>
						))}
					</select>
				</label>
				<Button
					variant='outline'
					disabled={busy}
					onClick={() => setSelected(selected.length === rows.length ? [] : rows.map((r) => r.id))}
				>
					{selected.length === rows.length ? 'Clear selection' : 'Select all unassigned'}
				</Button>
				<div className='max-h-72 overflow-auto'>
					{rows.map((r) => (
						<label key={r.id} className='flex gap-3 border-b p-2'>
							<input
								type='checkbox'
								disabled={busy}
								checked={selected.includes(r.id)}
								onChange={() =>
									setSelected((s) =>
										s.includes(r.id) ? s.filter((id) => id !== r.id) : [...s, r.id],
									)
								}
							/>
							<span>
								{r.date.slice(0, 10)} · {r.description} ·{' '}
								{displayMoney(r.amount, currencyCode(r.currency))}
							</span>
						</label>
					))}
				</div>
				{error && <p role='alert'>{error}</p>}
				<Button
					disabled={busy || !accountId || !selected.length}
					onClick={async () => {
						if (
							!window.confirm(
								`Assign ${selected.length} selected records to this account and use its currency for unknown amounts?`,
							)
						)
							return;
						setBusy(true);
						setError('');
						try {
							await postJson('/api/accounts', {
								action: 'assign',
								accountId,
								transactionIds: selected,
							});
							setSelected([]);
							await invalidateFinanceQueries(qc);
						} catch (e) {
							setError(String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					Assign selected history
				</Button>
			</CardContent>
		</Card>
	);
}
