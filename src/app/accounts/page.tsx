'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, postJson, deleteJson } from '@/lib/api';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import { displayMoney } from '@/lib/money';
import type { Account } from '@/lib/ledger-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Link from 'next/link';
type Transfer = {
	id: string;
	description: string;
	account_name: string;
	date: string;
	amount: number;
	currency: string;
};
type Transfers = {
	candidates: { outgoing: Transfer; incoming: Transfer }[];
	matches: {
		id: string;
		outgoing_description: string;
		incoming_description: string;
		amount: number;
		currency: string;
	}[];
};
export default function AccountsPage() {
	const client = useQueryClient();
	const { data: accounts = [] } = useQuery({
		queryKey: ['accounts'],
		queryFn: () => getJson<Account[]>('/api/accounts'),
	});
	const { data: transfers } = useQuery({
		queryKey: ['transfers'],
		queryFn: () => getJson<Transfers>('/api/transfers'),
	});
	const [name, setName] = useState(''),
		[currency, setCurrency] = useState('NOK'),
		[kind, setKind] = useState('bank'),
		[balance, setBalance] = useState('0'),
		[date, setDate] = useState(new Date().toISOString().slice(0, 10)),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false),
		[result, setResult] = useState('');
	const [reconcileId, setReconcileId] = useState(''),
		[asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10)),
		[statement, setStatement] = useState('');
	async function act(fn: () => Promise<unknown>) {
		setError('');
		setBusy(true);
		try {
			await fn();
			await invalidateFinanceQueries(client);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Operation failed');
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className='max-w-5xl mx-auto space-y-6'>
			<div className='flex flex-wrap justify-between gap-3'>
				<h1 className='text-2xl font-semibold'>Accounts and transfers</h1>
				<Button asChild>
					<Link href='/imports'>Import statement</Link>
				</Button>
			</div>
			{error && (
				<p role='alert' className='text-destructive'>
					{error}
				</p>
			)}
			<div className='grid gap-4 sm:grid-cols-2'>
				{accounts.map((a) => (
					<Card key={a.id}>
						<CardHeader>
							<CardTitle>{a.name}</CardTitle>
						</CardHeader>
						<CardContent>
							<p className='text-2xl'>{displayMoney(a.balance, a.currency)}</p>
							<p className='text-sm text-muted-foreground'>
								{a.kind} · opening {displayMoney(a.opening_balance, a.currency)} on {a.opening_date}
							</p>
						</CardContent>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Add account</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						className='grid gap-4 sm:grid-cols-2'
						onSubmit={(e) => {
							e.preventDefault();
							void act(async () => {
								await postJson('/api/accounts', {
									name,
									currency,
									kind,
									openingBalance: Number(balance),
									openingDate: date,
								});
								setName('');
							});
						}}
					>
						<label>
							Name
							<Input required value={name} onChange={(e) => setName(e.target.value)} />
						</label>
						<label>
							Currency
							<Input
								required
								maxLength={3}
								value={currency}
								onChange={(e) => setCurrency(e.target.value.toUpperCase())}
							/>
						</label>
						<label>
							Type
							<select
								className='block border rounded p-2 w-full'
								value={kind}
								onChange={(e) => setKind(e.target.value)}
							>
								<option value='bank'>Bank</option>
								<option value='credit'>Credit card</option>
								<option value='cash'>Cash</option>
							</select>
						</label>
						<label>
							Opening date
							<Input required type='date' value={date} onChange={(e) => setDate(e.target.value)} />
						</label>
						<label>
							Opening balance
							<Input
								required
								type='number'
								step='0.01'
								value={balance}
								onChange={(e) => setBalance(e.target.value)}
							/>
						</label>
						<p className='text-sm text-muted-foreground'>
							Balance immediately before transactions on the opening date. Credit card debt is
							negative.
						</p>
						<Button disabled={busy}>Create account</Button>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Reconcile statement balance</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						className='grid gap-4 sm:grid-cols-3'
						onSubmit={(e) => {
							e.preventDefault();
							void act(async () => {
								const r = await postJson<
									{ calculated: number; difference: number; currency: string },
									unknown
								>('/api/accounts', {
									action: 'reconcile',
									id: reconcileId,
									asOf,
									statementBalance: Number(statement),
								});
								setResult(
									`Calculated: ${displayMoney(r.calculated, r.currency)}. Difference: ${displayMoney(r.difference, r.currency)}${r.difference === 0 ? ' — reconciled.' : '. Check missing or duplicated transactions and the opening balance.'}`,
								);
							});
						}}
					>
						<label>
							Account
							<select
								required
								className='block border rounded p-2 w-full'
								value={reconcileId}
								onChange={(e) => setReconcileId(e.target.value)}
							>
								<option value=''>Select account</option>
								{accounts.map((a) => (
									<option key={a.id} value={a.id}>
										{a.name}
									</option>
								))}
							</select>
						</label>
						<label>
							Statement date
							<Input required type='date' value={asOf} onChange={(e) => setAsOf(e.target.value)} />
						</label>
						<label>
							Closing balance
							<Input
								required
								type='number'
								step='0.01'
								value={statement}
								onChange={(e) => setStatement(e.target.value)}
							/>
						</label>
						<Button disabled={busy}>Compare balances</Button>
					</form>
					{result && (
						<p role='status' className='mt-4'>
							{result}
						</p>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Suggested transfers</CardTitle>
				</CardHeader>
				<CardContent className='space-y-3'>
					<p className='text-sm text-muted-foreground'>
						Equal opposite payments between different accounts within three days. Confirm only
						transfers between your own accounts; they will be excluded from income and expenses.
					</p>
					{!transfers?.candidates.length && <p>No unmatched transfer pairs.</p>}
					{transfers?.candidates.map((p) => (
						<div
							key={p.outgoing.id + p.incoming.id}
							className='border rounded p-3 flex flex-wrap justify-between gap-3'
						>
							<div>
								{p.outgoing.account_name} → {p.incoming.account_name}
								<p className='text-sm'>
									{p.outgoing.date.slice(0, 10)} · {p.outgoing.description} ·{' '}
									{displayMoney(-p.outgoing.amount, p.outgoing.currency)}
								</p>
							</div>
							<Button
								disabled={busy}
								onClick={() =>
									act(() =>
										postJson('/api/transfers', {
											outgoingId: p.outgoing.id,
											incomingId: p.incoming.id,
										}),
									)
								}
							>
								Match transfer
							</Button>
						</div>
					))}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Matched transfers</CardTitle>
				</CardHeader>
				<CardContent>
					{transfers?.matches.map((m) => (
						<div key={m.id} className='flex flex-wrap justify-between gap-3 py-3'>
							<p>
								{m.outgoing_description} → {m.incoming_description} ·{' '}
								{displayMoney(-m.amount, m.currency)}
							</p>
							<Button
								variant='outline'
								disabled={busy}
								onClick={() =>
									act(() =>
										deleteJson('/api/transfers', {
											body: JSON.stringify({ id: m.id }),
											headers: { 'Content-Type': 'application/json' },
										}),
									)
								}
							>
								Unmatch
							</Button>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
