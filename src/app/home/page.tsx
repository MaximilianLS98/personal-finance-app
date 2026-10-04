'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { displayMoney } from '@/lib/money';
import type { monthlyOverview } from '@/lib/overview-service';
import { requestJson } from '../components/TransactionDetails';

export default function Home() {
	const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
	const query = useQuery({
		queryKey: ['overview', month],
		queryFn: () => requestJson<ReturnType<typeof monthlyOverview>>(`/api/overview?month=${month}`),
	});
	const data = query.data;
	return (
		<div className='max-w-6xl mx-auto space-y-6'>
			<div className='flex flex-wrap justify-between items-end gap-4'>
				<div>
					<p className='text-sm text-muted-foreground'>Your money, month by month</p>
					<h1 className='text-3xl font-bold'>Monthly overview</h1>
				</div>
				<div className='flex gap-3 items-end'>
					<label>
						Month
						<Input type='month' value={month} onChange={(e) => setMonth(e.target.value)} />
					</label>
					<Button asChild>
						<Link href='/imports'>Import statement</Link>
					</Button>
				</div>
			</div>
			{query.isPending ? (
				<p>Loading your overview…</p>
			) : query.isError ? (
				<div role='alert'>
					{query.error.message}
					<Button variant='outline' onClick={() => query.refetch()}>
						Retry
					</Button>
				</div>
			) : (
				data && (
					<>
						<p className='text-sm text-muted-foreground'>
							{data.latestDate
								? `Latest transaction: ${data.latestDate.slice(0, 10)}. Totals reflect imported data; currencies are kept separate.`
								: 'Import a bank statement to build your first monthly overview.'}
						</p>
						{!data.totals.length ? (
							<Card>
								<CardContent className='pt-6'>
									No transactions for this month. Choose another month or import a statement.
								</CardContent>
							</Card>
						) : (
							data.totals.map((t) => (
								<Card key={t.currency}>
									<CardHeader>
										<CardTitle>
											{t.currency === 'UNKNOWN' ? 'Currency unknown' : t.currency}
										</CardTitle>
										<CardDescription>
											{t.count} transactions · linked refunds reduce spending
										</CardDescription>
									</CardHeader>
									<CardContent className='grid sm:grid-cols-3 gap-6'>
										{[
											['Income', t.income],
											['Net spending', t.expenses],
											['Cash surplus', t.net],
										].map(([label, value]) => (
											<div key={String(label)}>
												<p className='text-muted-foreground'>{label}</p>
												<p className='text-2xl font-semibold'>
													{displayMoney(Number(value), t.currency)}
												</p>
											</div>
										))}
									</CardContent>
								</Card>
							))
						)}
						<div className='grid md:grid-cols-2 gap-6'>
							<Card>
								<CardHeader>
									<CardTitle>Ready to review</CardTitle>
								</CardHeader>
								<CardContent>
									<p className='text-3xl font-semibold'>{data.reviewCount}</p>
									<p className='text-muted-foreground mb-4'>
										Uncategorized transactions this month
									</p>
									<Link className='underline' href={`/review?month=${month}`}>
										Open review inbox
									</Link>
									<p className='mt-3'>
										<Link className='underline' href='/subscriptions/detect'>
											Review recurring payments
										</Link>
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle>Budgets to watch</CardTitle>
									<CardDescription>
										Budgets near their allowance or projected to exceed it
									</CardDescription>
								</CardHeader>
								<CardContent className='space-y-3'>
									{data.budgetRisks.length ? (
										data.budgetRisks.map((b) => (
											<div key={b.id}>
												<Link className='underline font-medium' href={`/budgets/${b.id}/analytics`}>
													{b.name}
												</Link>
												<p>
													{displayMoney(b.spent, b.currency)} of{' '}
													{displayMoney(b.amount, b.currency)}
												</p>
											</div>
										))
									) : (
										<p>No active budgets above this threshold.</p>
									)}
									<Link className='underline' href='/budgets'>
										Open budgets and commitments
									</Link>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle>Scheduled bills</CardTitle>
									<CardDescription>Next scheduled subscription payments in {month}</CardDescription>
								</CardHeader>
								<CardContent className='space-y-3'>
									{data.upcoming.length ? (
										data.upcoming.map((s) => (
											<div key={s.id} className='flex justify-between gap-3'>
												<span>
													{s.date.slice(0, 10)} · {s.name}
												</span>
												<span>{displayMoney(s.amount, s.currency)}</span>
											</div>
										))
									) : (
										<p>No payments scheduled for this month.</p>
									)}
									<Link className='underline' href='/subscriptions'>
										Manage subscriptions
									</Link>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle>Put your savings to work</CardTitle>
								</CardHeader>
								<CardContent className='space-y-3'>
									{data.goals.length ? (
										data.goals.map((g) => (
											<div key={g.id}>
												<p className='font-medium'>{g.name}</p>
												<p>
													{displayMoney(g.saved, g.currency)} of{' '}
													{displayMoney(g.target, g.currency)}
												</p>
												<progress
													className='w-full'
													aria-label={`${g.name} progress`}
													value={Math.min(g.saved, g.target)}
													max={g.target}
												/>
											</div>
										))
									) : (
										<p>
											Set a target, record contributions, and see how subscription savings can bring
											a goal closer.
										</p>
									)}
									<Link className='underline' href='/goals'>
										Open savings goals
									</Link>
									<p>
										<Link className='underline' href='/budgets/scenarios'>
											Compare budget scenarios
										</Link>
									</p>
								</CardContent>
							</Card>
						</div>
						<Card>
							<CardHeader>
								<CardTitle>Where your money went</CardTitle>
								<CardDescription>
									Category totals include splits and refunds. Select a row to inspect transactions.
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-3'>
								{data.categories.length ? (
									data.categories.slice(0, 10).map((c, i) => (
										<div
											className='flex justify-between gap-3'
											key={`${c.categoryId}-${c.currency}-${i}`}
										>
											<Link
												className='underline'
												href={`/transactions?category=${c.categoryId}&month=${month}`}
											>
												{c.name} · {c.count} transactions
											</Link>
											<span>{displayMoney(c.amount, c.currency)}</span>
										</div>
									))
								) : (
									<p>No categorized spending yet.</p>
								)}
								<Link className='underline' href='/categories'>
									All category analytics
								</Link>
							</CardContent>
						</Card>
					</>
				)
			)}
		</div>
	);
}
