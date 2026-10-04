'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { displayMoney } from '@/lib/money';
import type { Budget, BudgetProgress } from '@/lib/types';
import type { CycleSettings, PeriodRecord } from '@/lib/planning';
async function request(url: string, body?: unknown) {
	const r = await fetch(url, {
		method: body ? 'PUT' : 'GET',
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await r.json();
	if (!r.ok) throw new Error(data.error ?? 'Unable to load budgets');
	return data;
}
function BudgetCycle({ budget }: { budget: Budget }) {
	const client = useQueryClient();
	const [settings, setSettings] = useState<CycleSettings | null>(null);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const query = useQuery<{
		settings: CycleSettings;
		history: PeriodRecord[];
		forecast: BudgetProgress;
	}>({
		queryKey: ['budget-planning', budget.id],
		queryFn: () => request(`/api/budgets/${budget.id}/planning`),
	});
	const current = settings ?? query.data?.settings ?? { payday: 1, rollover: 'none' };
	const format = (amount: number) => displayMoney(amount, budget.currency);
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{budget.name} · {budget.currency}
				</CardTitle>
			</CardHeader>
			<CardContent className='space-y-4'>
				{(error || query.error) && (
					<p role='alert' className='text-destructive'>
						{error || query.error?.message}
					</p>
				)}
				<form
					className='flex flex-wrap gap-4 items-end'
					onSubmit={async (e) => {
						e.preventDefault();
						setSaving(true);
						setError('');
						try {
							await request(`/api/budgets/${budget.id}/planning`, current);
							await client.invalidateQueries({ queryKey: ['budget-planning', budget.id] });
							await client.invalidateQueries({ queryKey: ['budget-dashboard'] });
							setSettings(null);
						} catch (e) {
							setError(e instanceof Error ? e.message : 'Save failed');
						} finally {
							setSaving(false);
						}
					}}
				>
					<label className='space-y-1 text-sm'>
						Monthly period starts on day
						<Input
							type='number'
							min='1'
							max='31'
							value={current.payday}
							disabled={budget.period === 'yearly'}
							onChange={(e) => setSettings({ ...current, payday: Number(e.target.value) })}
						/>
					</label>
					<label className='flex flex-col gap-1 text-sm'>
						Carry remaining balance
						<select
							className='border rounded p-2 bg-background'
							value={current.rollover}
							onChange={(e) =>
								setSettings({ ...current, rollover: e.target.value as CycleSettings['rollover'] })
							}
						>
							<option value='none'>No rollover</option>
							<option value='positive'>Unused allowance only</option>
							<option value='all'>Unused allowance and overspending</option>
						</select>
					</label>
					<Button disabled={saving || query.isLoading}>Save cycle</Button>
				</form>
				<p className='text-sm text-muted-foreground'>
					Days 29–31 use the last day in shorter months. Rollover recalculates from the budget start
					date using your current allowance and settings; history includes refunds and corrections.
					Reserve for annual costs by carrying unused allowance forward.
				</p>
				{query.data && (
					<>
						<div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
							<div>
								<p className='text-sm'>Available this period</p>
								<strong>{format(query.data.forecast.availableAmount ?? budget.amount)}</strong>
							</div>
							<div>
								<p className='text-sm'>Already spent</p>
								<strong>{format(query.data.forecast.currentSpent)}</strong>
								<p className='text-xs'>
									Includes {format(query.data.forecast.subscriptionPaid ?? 0)} in linked bills
								</p>
							</div>
							<div>
								<p className='text-sm'>Bills still due</p>
								<strong>{format(query.data.forecast.upcomingCommitted ?? 0)}</strong>
							</div>
							<div>
								<p className='text-sm'>Discretionary remaining</p>
								<strong>{format(query.data.forecast.discretionaryRemaining ?? 0)}</strong>
							</div>
						</div>
						<p className='text-sm'>
							Forecast: {format(query.data.forecast.projectedSpent)} by{' '}
							{query.data.forecast.periodEnd}. Estimates extend variable spending and add unpaid
							scheduled bills. Imported payments linked to subscriptions prevent counting those
							bills twice.
						</p>
						<div className='overflow-auto'>
							<table className='w-full text-sm text-left'>
								<caption className='text-left font-medium mb-2'>
									Period history (latest 24 periods)
								</caption>
								<thead>
									<tr>
										{['Period', 'Base allowance', 'Carried', 'Available', 'Spent', 'Remaining'].map(
											(t) => (
												<th key={t} className='p-2'>
													{t}
												</th>
											),
										)}
									</tr>
								</thead>
								<tbody>
									{query.data.history.map((p) => (
										<tr key={p.start} className='border-t'>
											<td className='p-2 whitespace-nowrap'>
												{p.start} – {p.end}
											</td>
											{[p.baseAmount, p.carried, p.available, p.spent, p.remaining].map((n, i) => (
												<td key={i} className='p-2 whitespace-nowrap'>
													{format(n)}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
export default function PlanningPage() {
	const budgets = useQuery<{ data: Budget[] }>({
		queryKey: ['budgets-planning-list'],
		queryFn: () => request('/api/budgets'),
	});
	return (
		<main className='container mx-auto max-w-6xl p-6 space-y-6'>
			<div>
				<h1 className='font-bold text-3xl'>Budget cycles & commitments</h1>
				<p className='text-muted-foreground'>
					Plan around payday, preserve unused allowances, and see what remains after bills.
				</p>
				<div className='flex gap-4'>
					<Link className='underline' href='/budgets'>
						Budget dashboard
					</Link>
					<Link className='underline' href='/goals'>
						Savings goals
					</Link>
				</div>
			</div>
			{budgets.isLoading && <p>Loading budgets…</p>}
			{budgets.error && <p role='alert'>{budgets.error.message}</p>}
			{budgets.data?.data.map((b) => (
				<BudgetCycle key={b.id} budget={b} />
			))}
			{budgets.data?.data.length === 0 && (
				<p>
					<Link className='underline' href='/budgets/new'>
						Create a budget
					</Link>{' '}
					to set up your first cycle.
				</p>
			)}
		</main>
	);
}
