'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { displayMoney } from '@/lib/money';
import type { Goal, GoalInput } from '@/lib/planning';

type Contribution = { id: string; amount: number; date: string; note: string };
type Plan = {
	id: string;
	name: string;
	amount: number;
	billing_frequency: string;
	is_active: number;
};
async function api(url: string, method = 'GET', body?: unknown) {
	const response = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const result = await response.json();
	if (!response.ok) throw new Error(result.error ?? 'Request failed');
	return result;
}
const empty: GoalInput = { name: '', description: '', target: 0, currency: 'NOK', deadline: '' };
const field = 'flex flex-col gap-1 text-sm';
export default function GoalsPage() {
	const client = useQueryClient();
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<string | null>(null);
	const [form, setForm] = useState<GoalInput>(empty);
	const [selected, setSelected] = useState<string>('');
	const [contribution, setContribution] = useState({
		id: '',
		amount: 0,
		date: new Date().toISOString().slice(0, 10),
		note: '',
	});
	const [subscription, setSubscription] = useState('');
	const goals = useQuery<{ data: Goal[] }>({
		queryKey: ['goals'],
		queryFn: () => api('/api/goals'),
	});
	const detail = useQuery<{ goal: Goal; contributions: Contribution[]; plans: Plan[] }>({
		queryKey: ['goal', selected],
		queryFn: () => api(`/api/goals/${selected}`),
		enabled: !!selected,
	});
	const subscriptions = useQuery({
		queryKey: ['goal-subscriptions'],
		queryFn: () => api('/api/subscriptions'),
	});
	async function act(operation: () => Promise<unknown>) {
		setError('');
		setBusy(true);
		try {
			await operation();
			await client.invalidateQueries({ queryKey: ['goals'] });
			await client.invalidateQueries({ queryKey: ['goal'] });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Request failed');
		} finally {
			setBusy(false);
		}
	}
	const list = goals.data?.data ?? [];
	const totals = list.reduce<Record<string, number>>(
		(acc, g) => ({ ...acc, [g.currency]: (acc[g.currency] ?? 0) + g.saved }),
		{},
	);
	const subscriptionRows = (
		Array.isArray(subscriptions.data) ? subscriptions.data : (subscriptions.data?.data ?? [])
	) as Array<{ id: string; name: string; currency: string; isActive: boolean }>;
	return (
		<main className='container mx-auto max-w-6xl space-y-6 p-6'>
			<div>
				<h1 className='text-3xl font-bold'>Savings goals</h1>
				<p className='text-muted-foreground'>
					Give your savings a purpose. Contributions record money you have set aside; they do not
					move money between accounts.
				</p>
				<Link href='/budgets/planning' className='underline'>
					Budget cycles and commitments
				</Link>
			</div>
			{(error || goals.error || detail.error) && (
				<p role='alert' className='text-destructive'>
					{error || goals.error?.message || detail.error?.message}
				</p>
			)}
			{goals.isLoading ? (
				<p>Loading goals…</p>
			) : (
				<div className='flex gap-6 flex-wrap'>
					{Object.entries(totals).map(([currency, total]) => (
						<p key={currency}>
							Saved: <strong>{displayMoney(total, currency)}</strong>
						</p>
					))}
				</div>
			)}
			<Card>
				<CardHeader>
					<CardTitle>{editing ? 'Edit goal' : 'Create a savings goal'}</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						className='grid gap-4 md:grid-cols-3'
						onSubmit={(e) => {
							e.preventDefault();
							void act(async () => {
								await api(
									editing ? `/api/goals/${editing}` : '/api/goals',
									editing ? 'PUT' : 'POST',
									form,
								);
								setEditing(null);
								setForm(empty);
							});
						}}
					>
						<label className={field}>
							Name
							<Input
								required
								value={form.name}
								maxLength={120}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
							/>
						</label>
						<label className={field}>
							Target amount
							<Input
								required
								type='number'
								min='0.01'
								step='0.01'
								value={form.target || ''}
								onChange={(e) => setForm({ ...form, target: Number(e.target.value) })}
							/>
						</label>
						<label className={field}>
							Currency
							<Input
								required
								pattern='[A-Z]{3}'
								maxLength={3}
								value={form.currency}
								onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
							/>
						</label>
						<label className={field}>
							Deadline
							<Input
								required
								type='date'
								value={form.deadline}
								onChange={(e) => setForm({ ...form, deadline: e.target.value })}
							/>
						</label>
						<label className={field}>
							Description
							<Input
								value={form.description}
								onChange={(e) => setForm({ ...form, description: e.target.value })}
							/>
						</label>
						<div className='flex gap-2 items-end'>
							<Button disabled={busy} type='submit'>
								{editing ? 'Save changes' : 'Create goal'}
							</Button>
							{editing && (
								<Button
									type='button'
									variant='outline'
									onClick={() => {
										setEditing(null);
										setForm(empty);
									}}
								>
									Cancel
								</Button>
							)}
						</div>
					</form>
				</CardContent>
			</Card>
			{!goals.isLoading && !list.length && (
				<p>Create your first goal for an emergency fund, a holiday, or a future purchase.</p>
			)}
			<div className='grid gap-4 md:grid-cols-2'>
				{list.map((goal) => (
					<Card key={goal.id}>
						<CardHeader>
							<CardTitle>
								{goal.name} {goal.progress >= 100 ? '✓ Achieved' : goal.overdue ? '— overdue' : ''}
							</CardTitle>
							<p>{goal.description}</p>
						</CardHeader>
						<CardContent className='space-y-3'>
							<p>
								{displayMoney(goal.saved, goal.currency)} of{' '}
								{displayMoney(goal.target, goal.currency)} · {goal.progress.toFixed(0)}%
							</p>
							<Progress value={goal.progress} />
							<p>
								Remaining {displayMoney(goal.remaining, goal.currency)} · Due {goal.deadline}
							</p>
							<p>Plan {displayMoney(goal.monthlyRequired, goal.currency)} per month.</p>
							<p className='text-sm text-muted-foreground'>
								{goal.capacity === null
									? 'Import income and expenses to estimate savings capacity.'
									: `Average monthly capacity: ${displayMoney(goal.capacity, goal.currency)}; other goals require ${displayMoney(goal.otherGoalsMonthly, goal.currency)}. Based on the last three complete months.`}
							</p>
							{goal.affordable === false && (
								<p className='text-amber-700'>
									This goal exceeds the capacity left after other goals.
									{goal.suggestedMonths
										? ` Allow approximately ${goal.suggestedMonths} months at the remaining capacity.`
										: ' Reduce other commitments or extend your timeline.'}
								</p>
							)}
							{goal.plannedMonthly > 0 && (
								<p>
									Cancellation scenario: {displayMoney(goal.plannedMonthly, goal.currency)}/month
									could fund this goal.{' '}
									{goal.plannedMonthly >= goal.monthlyRequired
										? 'This could cover the monthly target.'
										: `Still needed: ${displayMoney(Math.max(0, goal.monthlyRequired - goal.plannedMonthly), goal.currency)}/month.`}
								</p>
							)}
							<div className='flex flex-wrap gap-2'>
								<Button
									variant={selected === goal.id ? 'default' : 'outline'}
									onClick={() => {
										setSelected(goal.id);
										setContribution({
											id: '',
											amount: 0,
											date: new Date().toISOString().slice(0, 10),
											note: '',
										});
									}}
								>
									Contributions & plans
								</Button>
								<Button
									variant='outline'
									onClick={() => {
										setEditing(goal.id);
										setForm({
											name: goal.name,
											description: goal.description,
											target: goal.target,
											currency: goal.currency,
											deadline: goal.deadline,
										});
										window.scrollTo({ top: 0, behavior: 'smooth' });
									}}
								>
									Edit
								</Button>
								<Button
									variant='destructive'
									disabled={busy}
									onClick={() => {
										if (
											window.confirm(
												`Delete ${goal.name} and its contribution records? ${displayMoney(goal.saved, goal.currency)} stays in your real accounts and becomes unassigned in this tracker.`,
											)
										)
											void act(async () => {
												await api(`/api/goals/${goal.id}`, 'DELETE');
												if (selected === goal.id) setSelected('');
											});
									}}
								>
									Delete
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
			{detail.data && selected && (
				<Card>
					<CardHeader>
						<CardTitle>{detail.data.goal.name}: contributions and plans</CardTitle>
					</CardHeader>
					<CardContent className='space-y-5'>
						<form
							className='flex flex-wrap gap-3 items-end'
							onSubmit={(e) => {
								e.preventDefault();
								void act(async () => {
									await api(
										`/api/goals/${selected}/contributions${contribution.id ? `/${contribution.id}` : ''}`,
										contribution.id ? 'PUT' : 'POST',
										contribution,
									);
									setContribution({
										id: '',
										amount: 0,
										date: new Date().toISOString().slice(0, 10),
										note: '',
									});
								});
							}}
						>
							<label className={field}>
								Amount ({detail.data.goal.currency})
								<Input
									required
									type='number'
									min='0.01'
									step='0.01'
									value={contribution.amount || ''}
									onChange={(e) =>
										setContribution({ ...contribution, amount: Number(e.target.value) })
									}
								/>
							</label>
							<label className={field}>
								Date
								<Input
									required
									type='date'
									value={contribution.date}
									onChange={(e) => setContribution({ ...contribution, date: e.target.value })}
								/>
							</label>
							<label className={field}>
								Note
								<Input
									value={contribution.note}
									onChange={(e) => setContribution({ ...contribution, note: e.target.value })}
								/>
							</label>
							<Button disabled={busy}>
								{contribution.id ? 'Update contribution' : 'Record contribution'}
							</Button>
							{contribution.id && (
								<Button
									type='button'
									variant='outline'
									onClick={() =>
										setContribution({
											id: '',
											amount: 0,
											date: new Date().toISOString().slice(0, 10),
											note: '',
										})
									}
								>
									Cancel edit
								</Button>
							)}
						</form>
						<div className='overflow-x-auto'>
							<table className='w-full text-sm'>
								<caption className='text-left font-medium'>Contribution history</caption>
								<thead>
									<tr>
										<th className='text-left'>Date</th>
										<th className='text-left'>Amount</th>
										<th className='text-left'>Note</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{detail.data.contributions.map((c) => (
										<tr key={c.id}>
											<td>{c.date}</td>
											<td>{displayMoney(c.amount, detail.data.goal.currency)}</td>
											<td>{c.note}</td>
											<td className='flex gap-2 justify-end py-2'>
												<Button variant='outline' size='sm' onClick={() => setContribution(c)}>
													Edit
												</Button>
												<Button
													variant='outline'
													size='sm'
													disabled={busy}
													onClick={() => {
														if (window.confirm('Remove this contribution record?'))
															void act(() =>
																api(`/api/goals/${selected}/contributions/${c.id}`, 'DELETE'),
															);
													}}
												>
													Remove
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
							{!detail.data.contributions.length && <p>No contributions recorded yet.</p>}
						</div>
						<div>
							<h2 className='font-semibold'>What if I cancel a subscription?</h2>
							<p className='text-sm text-muted-foreground'>
								Assign potential savings to one goal. This does not cancel a subscription or record
								a contribution.
							</p>
							<form
								className='flex flex-wrap gap-3 mt-3'
								onSubmit={(e) => {
									e.preventDefault();
									void act(() =>
										api(`/api/goals/${selected}/subscriptions`, 'POST', {
											subscriptionId: subscription,
										}),
									);
								}}
							>
								<select
									aria-label='Subscription to allocate'
									className='rounded border p-2 bg-background'
									required
									value={subscription}
									onChange={(e) => setSubscription(e.target.value)}
								>
									<option value=''>Select a subscription</option>
									{subscriptionRows
										.filter((s) => s.isActive && s.currency === detail.data.goal.currency)
										.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
											</option>
										))}
								</select>
								<Button disabled={busy || !subscription}>Assign potential savings</Button>
							</form>
							{detail.data.plans.map((p) => (
								<div key={p.id} className='flex justify-between py-2'>
									<span>
										{p.name} — {displayMoney(p.amount, detail.data.goal.currency)} /{' '}
										{p.billing_frequency}
										{!p.is_active ? ' (inactive; excluded from potential savings)' : ''}
									</span>
									<Button
										variant='outline'
										size='sm'
										disabled={busy}
										onClick={() =>
											void act(() =>
												api(`/api/goals/${selected}/subscriptions`, 'DELETE', {
													subscriptionId: p.id,
												}),
											)
										}
									>
										Unassign
									</Button>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</main>
	);
}
