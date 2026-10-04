'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { displayMoney } from '@/lib/money';
import type { monthlyOverview } from '@/lib/overview-service';
import { requestJson } from './TransactionDetails';
export default function CategoryAnalytics() {
	const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
		[currency, setCurrency] = useState('');
	const query = useQuery({
		queryKey: ['overview', month],
		queryFn: () => requestJson<ReturnType<typeof monthlyOverview>>(`/api/overview?month=${month}`),
	});
	const currencies = [...new Set(query.data?.categories.map((c) => c.currency) ?? [])];
	const selected = currencies.includes(currency) ? currency : currencies[0];
	const rows = query.data?.categories.filter((c) => c.currency === selected) ?? [];
	const total = rows.reduce((sum, c) => sum + c.amount, 0),
		max = Math.max(1, ...rows.map((c) => Math.abs(c.amount)));
	return (
		<Card>
			<CardHeader>
				<CardTitle>Category spending</CardTitle>
			</CardHeader>
			<CardContent className='space-y-5'>
				<div className='flex gap-3'>
					<label>
						Month
						<Input type='month' value={month} onChange={(e) => setMonth(e.target.value)} />
					</label>
					<label>
						Currency
						<select
							className='border rounded p-2 block'
							aria-label='Analytics currency'
							value={selected ?? ''}
							onChange={(e) => setCurrency(e.target.value)}
						>
							{currencies.map((c) => (
								<option key={c}>{c}</option>
							))}
						</select>
					</label>
				</div>
				<p className='text-sm text-muted-foreground'>
					Net spending includes category splits and deducts linked refunds in the month received.
					Each currency is reported separately.
				</p>
				{query.isPending ? (
					<p>Loading…</p>
				) : query.isError ? (
					<p role='alert'>{query.error.message}</p>
				) : !rows.length ? (
					<p>No expenses in this month.</p>
				) : (
					<>
						<p className='text-xl font-semibold'>{displayMoney(total, selected)} net spending</p>
						{rows.map((row) => (
							<div key={row.categoryId} className='space-y-1'>
								<div className='flex justify-between gap-3'>
									<Link
										className='underline'
										href={`/transactions?category=${row.categoryId}&month=${month}`}
									>
										{row.name} · {row.count} transactions
									</Link>
									<span>{displayMoney(row.amount, row.currency)}</span>
								</div>
								<div className='h-2 bg-muted rounded'>
									<div
										className='h-2 rounded'
										style={{
											background: row.color,
											width: `${(Math.abs(row.amount) / max) * 100}%`,
										}}
									/>
								</div>
							</div>
						))}
					</>
				)}
			</CardContent>
		</Card>
	);
}
