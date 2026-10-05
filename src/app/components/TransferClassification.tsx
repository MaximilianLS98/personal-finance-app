'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { postJson } from '@/lib/api';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import type { transactionDetails } from '@/lib/transaction-ledger';

export default function TransferClassification({
	details,
}: {
	details: ReturnType<typeof transactionDetails>;
}) {
	const client = useQueryClient();
	const [remember, setRemember] = useState(false);
	const [history, setHistory] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	const { transaction: row, transferDecision: decision, transferMatch } = details;
	async function classify(value: 'transfer' | 'cashflow') {
		setBusy(true);
		setError('');
		setMessage('');
		try {
			const result = await postJson<{ changed: number }, unknown>('/api/transfers', {
				action: 'classify',
				id: row.id,
				decision: value,
				remember,
				applyHistory: history,
			});
			await invalidateFinanceQueries(client);
			setMessage(
				`${result.changed} transaction${result.changed === 1 ? '' : 's'} updated.${remember ? ' Rule saved for future imports.' : ''}`,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Classification failed');
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className='rounded-lg border p-4 space-y-3'>
			<h3 className='font-semibold'>Income and spending totals</h3>
			{details.account && (
				<p className='text-sm text-muted-foreground'>
					Account: {details.account.name} · {row.currency}
				</p>
			)}
			<p className='text-sm'>
				{row.type === 'transfer'
					? 'Excluded: transfer between your own accounts.'
					: `Included as ${row.type}.`}
			</p>
			{decision && <p className='text-sm text-muted-foreground'>{decision.reason}</p>}
			{transferMatch ? (
				<p className='text-sm'>
					Both sides are linked.{' '}
					<Link className='underline' href='/accounts'>
						Unmatch in Accounts and transfers
					</Link>{' '}
					before changing this transaction.
				</p>
			) : (
				<>
					<p className='text-sm text-muted-foreground'>
						Flag money moved between your own accounts, pockets or currencies. The other side does
						not need to be imported. Account balances stay unchanged. Payments to other people still
						count as spending.
					</p>
					{row.account_id && row.currency && (
						<>
							<label className='flex gap-2 items-start text-sm'>
								<input
									type='checkbox'
									checked={remember}
									onChange={(e) => setRemember(e.target.checked)}
								/>
								Remember for future imports with the same account, currency, direction and exact
								description
							</label>
							<label className='flex gap-2 items-start text-sm'>
								<input
									type='checkbox'
									checked={history}
									onChange={(e) => setHistory(e.target.checked)}
								/>
								Also apply to matching history (preserves individual overrides, matched pairs,
								splits and refunds)
							</label>
						</>
					)}
					<div className='flex flex-wrap gap-2'>
						<Button
							disabled={busy}
							variant={row.type === 'transfer' ? 'outline' : 'default'}
							onClick={() => classify('transfer')}
						>
							Exclude as transfer
						</Button>
						<Button disabled={busy} variant='outline' onClick={() => classify('cashflow')}>
							Count as {row.amount < 0 ? 'spending' : 'income'}
						</Button>
					</div>
				</>
			)}
			{message && (
				<p className='text-sm' role='status'>
					{message}
				</p>
			)}
			{error && (
				<p className='text-sm text-destructive' role='alert'>
					{error}
				</p>
			)}
		</section>
	);
}
