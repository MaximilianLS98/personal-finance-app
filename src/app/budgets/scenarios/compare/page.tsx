'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { budgetTotals } from '@/lib/budget-totals';
import { displayMoney, currencyCode } from '@/lib/money';
import type { BudgetScenario, Category } from '@/lib/types';
export default function ScenarioComparePage() {
	const [first, setFirst] = useState(''),
		[second, setSecond] = useState('');
	const query = useQuery<BudgetScenario[]>({
		queryKey: ['budget-scenarios'],
		queryFn: async () => {
			const response = await fetch('/api/budget-scenarios');
			if (!response.ok) throw new Error('Unable to load scenarios');
			return (await response.json()).data;
		},
	});
	const categories = useQuery<Category[]>({
		queryKey: ['categories'],
		queryFn: async () => {
			const response = await fetch('/api/categories');
			if (!response.ok) throw new Error('Unable to load categories');
			const data = await response.json();
			return Array.isArray(data) ? data : data.data;
		},
	});
	const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
	const scenarios = query.data ?? [];
	const a = scenarios.find((s) => s.id === first),
		b = scenarios.find((s) => s.id === second);
	const selected = [a, b].filter(Boolean) as BudgetScenario[];
	const units = budgetTotals(selected.flatMap((s) => s.budgets));
	return (
		<main className='container mx-auto max-w-6xl p-6 space-y-6'>
			<Link href='/budgets/scenarios' className='underline'>
				← Back to scenarios
			</Link>
			<div>
				<h1 className='text-3xl font-bold'>Compare budget scenarios</h1>
				<p className='text-muted-foreground'>
					Compare allowances in their recorded currency and budget period. No currency conversion is
					applied.
				</p>
			</div>
			{query.isLoading && <p>Loading scenarios…</p>}
			{query.error && <p role='alert'>{query.error.message}</p>}
			<div className='grid sm:grid-cols-2 gap-4'>
				{[
					['First scenario', first, setFirst],
					['Second scenario', second, setSecond],
				].map(([label, value, set]) => (
					<label key={String(label)} className='flex flex-col gap-2'>
						{String(label)}
						<select
							className='border rounded bg-background p-2'
							value={String(value)}
							onChange={(e) => (set as (id: string) => void)(e.target.value)}
						>
							<option value=''>Choose a scenario</option>
							{scenarios.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
									{s.isActive ? ' (active)' : ''}
								</option>
							))}
						</select>
					</label>
				))}
			</div>
			<div className='grid sm:grid-cols-2 gap-4'>
				{selected.map((s, index) => (
					<Card key={`${s.id}:${index}`}>
						<CardHeader>
							<CardTitle>{s.name}</CardTitle>
							<p>{s.description}</p>
						</CardHeader>
						<CardContent className='space-y-2'>
							{budgetTotals(s.budgets).map((t) => (
								<p key={`${t.currency}:${t.period}`}>
									<strong>{displayMoney(t.amount, t.currency)}</strong> / {t.period}
								</p>
							))}
							<p className='text-sm text-muted-foreground'>{s.budgets.length} budgets</p>
						</CardContent>
					</Card>
				))}
			</div>
			{a &&
				b &&
				units.map((unit) => {
					const matching = (s: BudgetScenario) =>
						s.budgets.filter(
							(budget) =>
								currencyCode(budget.currency) === unit.currency && budget.period === unit.period,
						);
					const ab = matching(a),
						bb = matching(b),
						categoryIds = [...new Set([...ab, ...bb].map((budget) => budget.categoryId))];
					const amount = (budgets: typeof ab, id?: string) =>
						budgets
							.filter((budget) => !id || budget.categoryId === id)
							.reduce((sum, budget) => sum + budget.amount, 0);
					return (
						<Card key={`${unit.currency}:${unit.period}`}>
							<CardHeader>
								<CardTitle>
									{unit.currency} · {unit.period} allowances
								</CardTitle>
								<p>
									Difference: {displayMoney(amount(bb) - amount(ab), unit.currency)} ({b.name} minus{' '}
									{a.name})
								</p>
							</CardHeader>
							<CardContent className='overflow-auto'>
								<table className='w-full text-sm text-left'>
									<thead>
										<tr>
											<th className='p-2'>Category</th>
											<th className='p-2'>{a.name}</th>
											<th className='p-2'>{b.name}</th>
											<th className='p-2'>Difference</th>
										</tr>
									</thead>
									<tbody>
										{categoryIds.map((id) => (
											<tr key={id} className='border-t'>
												<td className='p-2'>{names.get(id) ?? 'Uncategorized'}</td>
												<td className='p-2'>{displayMoney(amount(ab, id), unit.currency)}</td>
												<td className='p-2'>{displayMoney(amount(bb, id), unit.currency)}</td>
												<td className='p-2'>
													{displayMoney(amount(bb, id) - amount(ab, id), unit.currency)}
												</td>
											</tr>
										))}
									</tbody>
									<tfoot className='font-semibold border-t'>
										<tr>
											<td className='p-2'>Total</td>
											<td className='p-2'>{displayMoney(amount(ab), unit.currency)}</td>
											<td className='p-2'>{displayMoney(amount(bb), unit.currency)}</td>
											<td className='p-2'>
												{displayMoney(amount(bb) - amount(ab), unit.currency)}
											</td>
										</tr>
									</tfoot>
								</table>
								<p className='text-xs text-muted-foreground mt-3'>
									An absent category is shown as zero allowance. Differences compare planned
									allowances, not account balances.
								</p>
							</CardContent>
						</Card>
					);
				})}
		</main>
	);
}
