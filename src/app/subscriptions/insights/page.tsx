'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { displayMoney } from '@/lib/money';
import type { subscriptionInsights } from '@/lib/subscription-history';

type Insights = ReturnType<typeof subscriptionInsights>;
const percentage = (value: number | null) =>
	value === null ? 'Insufficient history' : `${value > 0 ? '+' : ''}${value}%`;
export default function InsightsPage() {
	const [selected, setSelected] = useState('');
	const { data, isLoading, error } = useQuery<Insights>({
		queryKey: ['subscription-insights'],
		queryFn: async () => {
			const response = await fetch('/api/subscriptions/insights');
			if (!response.ok) throw new Error('Unable to load subscription insights');
			return (await response.json()).data;
		},
	});
	const group = data?.find((g) => g.currency === selected) ?? data?.[0];
	return (
		<div className='max-w-7xl mx-auto space-y-6'>
			<Button asChild variant='ghost'>
				<Link href='/subscriptions'>← Subscriptions</Link>
			</Button>
			<h1 className='text-2xl font-semibold'>Subscription insights</h1>
			<p className='text-muted-foreground'>
				Actual payment history, recorded price changes, and usage reviews. Currencies are reported
				separately.
			</p>
			{isLoading && <p>Loading history…</p>}
			{error && <p role='alert'>{error.message}</p>}
			{data?.length === 0 && (
				<p>
					No subscriptions yet.{' '}
					<Link className='underline' href='/subscriptions/new'>
						Add your first subscription
					</Link>
					.
				</p>
			)}
			{group && (
				<>
					<label className='flex gap-3 items-center'>
						Currency{' '}
						<select
							className='border rounded p-2'
							value={group.currency}
							onChange={(e) => setSelected(e.target.value)}
						>
							{data?.map((g) => (
								<option key={g.currency}>{g.currency}</option>
							))}
						</select>
					</label>
					<div className='grid gap-4 md:grid-cols-3'>
						<Card>
							<CardHeader>
								<CardTitle>Current recurring cost</CardTitle>
							</CardHeader>
							<CardContent>
								<strong>{displayMoney(group.monthlyTotal, group.currency)} / month</strong>
								<p>
									{displayMoney(group.annualTotal, group.currency)} / year · {group.activeCount}{' '}
									active
								</p>
								<p className='text-sm text-muted-foreground'>
									Normalized scheduled cost, not actual spending.
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Month over month</CardTitle>
							</CardHeader>
							<CardContent>
								<strong>{percentage(group.trends.monthlyGrowth)}</strong>
								<p>
									{group.trends.latestMonth} vs {group.trends.previousMonth}
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Year over year</CardTitle>
							</CardHeader>
							<CardContent>
								<strong>{percentage(group.trends.yearOverYearChange)}</strong>
								<p>
									{group.trends.latestMonth} vs {group.trends.yearAgoMonth}
								</p>
							</CardContent>
						</Card>
					</div>
					<p className='text-sm text-muted-foreground'>
						{group.trends.note} Comparisons use the last completed calendar month.
					</p>
					<Card>
						<CardHeader>
							<CardTitle>Usage review</CardTitle>
						</CardHeader>
						<CardContent>
							<p>
								{group.unknownUsage} active subscriptions have unknown usage. Add a last-used date
								before deciding whether they are unused.
							</p>
							<p>
								{group.staleUsage} active subscriptions were last reported used over 90 days ago.
								Review whether they still provide value.
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Recorded monthly payments</CardTitle>
						</CardHeader>
						<CardContent>
							{group.trends.history.length ? (
								<div className='overflow-x-auto'>
									<table className='w-full text-left'>
										<thead>
											<tr>
												<th className='py-2'>Month</th>
												<th>Paid</th>
											</tr>
										</thead>
										<tbody>
											{group.trends.history.map((row) => (
												<tr className='border-t' key={row.month}>
													<td className='py-2'>{row.month}</td>
													<td>{displayMoney(row.amount, group.currency)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : (
								<p>Link imported transactions to subscriptions to see payment history.</p>
							)}
						</CardContent>
					</Card>
					<div className='space-y-4'>
						{group.subscriptions.map((sub) => (
							<Card key={sub.id}>
								<CardHeader>
									<CardTitle>
										<Link className='underline' href={`/subscriptions/${sub.id}`}>
											{sub.name}
										</Link>
										{!sub.isActive && ' (inactive)'}
									</CardTitle>
								</CardHeader>
								<CardContent className='space-y-3'>
									<p>
										{displayMoney(sub.monthlyAmount, group.currency)} / month · Usage:{' '}
										{sub.usage === 'unknown'
											? 'unknown'
											: sub.usage === 'stale'
												? 'last reported over 90 days ago'
												: 'recently reported'}
									</p>
									{sub.priceChange !== null && (
										<p className={sub.priceChange > 0 ? 'text-amber-700 dark:text-amber-400' : ''}>
											Recorded monthly price{' '}
											{sub.priceChange > 0
												? 'increased'
												: sub.priceChange < 0
													? 'decreased'
													: 'unchanged'}
											: {percentage(sub.priceChange)} since the preceding saved price.
										</p>
									)}
									{sub.paymentChange !== null && sub.paymentChange !== 0 && (
										<p>
											Latest payment changed {percentage(sub.paymentChange)} from the previous
											payment. Check billing periods, discounts, and refunds before treating this as
											a price change.
										</p>
									)}
									<details>
										<summary className='cursor-pointer'>
											Price history ({sub.priceHistory.length})
										</summary>
										<p className='text-sm text-muted-foreground'>
											Saved price edits are preserved from the time history tracking began. A
											baseline does not establish an earlier price.
										</p>
										<ul className='space-y-2 mt-2'>
											{sub.priceHistory
												.slice()
												.reverse()
												.map((price) => (
													<li key={price.id}>
														{new Date(price.recordedAt).toLocaleDateString()} ·{' '}
														{displayMoney(price.amount, price.currency)} / {price.billingFrequency}
														{price.customFrequencyDays
															? ` (${price.customFrequencyDays} days)`
															: ''}{' '}
														· {price.source}
													</li>
												))}
										</ul>
									</details>
									<details>
										<summary className='cursor-pointer'>
											Linked payments ({sub.paymentHistory.length})
										</summary>
										<ul className='space-y-2 mt-2'>
											{sub.paymentHistory
												.slice()
												.reverse()
												.map((payment) => (
													<li key={payment.id}>
														{payment.date.slice(0, 10)} ·{' '}
														{displayMoney(Math.abs(payment.amount), payment.currency)}
													</li>
												))}
										</ul>
									</details>
								</CardContent>
							</Card>
						))}
					</div>
				</>
			)}
		</div>
	);
}
