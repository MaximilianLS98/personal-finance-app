'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCategoriesQuery } from '@/lib/queries';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import { displayMoney } from '@/lib/money';
import { requestJson } from '@/app/components/TransactionDetails';
import type { reviewInbox } from '@/lib/review-service';
type Inbox = ReturnType<typeof reviewInbox>;
export default function ReviewPage() {
	const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
		[selected, setSelected] = useState<string[]>([]),
		[category, setCategory] = useState(''),
		[pattern, setPattern] = useState(''),
		[history, setHistory] = useState(false),
		[rule, setRule] = useState(false),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false),
		[notice, setNotice] = useState('');
	const client = useQueryClient(),
		{ data: categories = [] } = useCategoriesQuery();
	useEffect(() => {
		const value = new URLSearchParams(window.location.search).get('month');
		if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) setMonth(value);
	}, []);
	const query = useQuery({
		queryKey: ['review', month],
		queryFn: () => requestJson<Inbox>(`/api/review?month=${month}`),
	});
	async function act(body: unknown) {
		setError('');
		setBusy(true);
		try {
			const result = await requestJson<{ count: number }>('/api/review', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			setNotice(`${result.count} transactions updated`);
			setSelected([]);
			await Promise.all([
				query.refetch(),
				invalidateFinanceQueries(client),
				client.invalidateQueries({ queryKey: ['overview'] }),
			]);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Review failed');
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className='max-w-6xl mx-auto space-y-6'>
			<div>
				<h1 className='text-3xl font-bold'>Monthly review inbox</h1>
				<p className='text-muted-foreground'>
					Review uncategorized spending by merchant. Your selection covers all matching rows in this
					inbox.
				</p>
			</div>
			<div className='flex gap-4 items-center flex-wrap'>
				<label>
					Month{' '}
					<Input
						type='month'
						value={month}
						onChange={(e) => {
							setMonth(e.target.value);
							setSelected([]);
						}}
					/>
				</label>
				<Button
					variant='outline'
					onClick={() => {
						setMonth('');
						setSelected([]);
					}}
				>
					All history
				</Button>
				<Link className='underline' href='/subscriptions/detect'>
					Review subscription candidates
				</Link>
				<Link className='underline' href='/transactions'>
					All transactions
				</Link>
			</div>
			{query.isPending ? (
				<p>Loading review…</p>
			) : query.isError ? (
				<p role='alert'>{query.error.message}</p>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>{query.data.total} transactions to categorize</CardTitle>
						</CardHeader>
						<CardContent className='space-y-3'>
							{!query.data.groups.length && <p>All caught up for this period.</p>}
							{query.data.groups.map((group) => (
								<label
									key={group.merchant + group.currency}
									className='flex items-start gap-3 border-b pb-3'
								>
									<input
										type='checkbox'
										className='mt-1'
										checked={group.ids.every((id) => selected.includes(id))}
										onChange={(e) => {
											setSelected(
												e.target.checked
													? [...new Set([...selected, ...group.ids])]
													: selected.filter((id) => !group.ids.includes(id)),
											);
											if (!pattern) setPattern(group.merchant);
										}}
									/>
									<span className='flex-1'>
										<span className='font-medium'>{group.merchant}</span>
										<span className='block text-sm text-muted-foreground'>
											{group.ids.length} transactions ·{' '}
											{group.suggestion
												? `${categories.find((c) => c.id === group.suggestion?.categoryId)?.name ?? 'Category'} suggested (${Math.round(group.suggestion.confidence * 100)}% confidence)`
												: 'No suggestion yet'}
										</span>
									</span>
									<span>{displayMoney(group.amount, group.currency)}</span>
									{group.suggestion && (
										<Button
											size='sm'
											variant='outline'
											disabled={busy}
											onClick={(e) => {
												e.preventDefault();
												void act({ ids: group.ids, categoryId: group.suggestion!.categoryId });
											}}
										>
											Accept suggestion
										</Button>
									)}
								</label>
							))}
							<div className='space-y-3 border-t pt-4'>
								<p>{selected.length} selected</p>
								<select
									className='border p-2 rounded'
									aria-label='Assign category'
									value={category}
									onChange={(e) => setCategory(e.target.value)}
								>
									<option value=''>Choose category</option>
									{categories.map((c) => (
										<option key={c.id} value={c.id}>
											{c.name}
										</option>
									))}
								</select>
								<Input
									aria-label='Merchant rule pattern'
									placeholder='Merchant text to match'
									value={pattern}
									onChange={(e) => setPattern(e.target.value)}
								/>
								<label className='block'>
									<input
										type='checkbox'
										checked={history}
										onChange={(e) => setHistory(e.target.checked)}
									/>{' '}
									Apply to all matching historical expenses (including already categorized rows)
								</label>
								<label className='block'>
									<input
										type='checkbox'
										checked={rule}
										onChange={(e) => setRule(e.target.checked)}
									/>{' '}
									Remember a rule for future imports
								</label>
								<p className='text-sm text-muted-foreground'>
									History and future rules match descriptions containing this text. Split purchases
									are preserved.
								</p>
								<Button
									disabled={busy || !selected.length || !category}
									onClick={() =>
										act({
											ids: selected,
											categoryId: category,
											pattern,
											applyHistory: history,
											createRule: rule,
										})
									}
								>
									Apply category
								</Button>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Possible duplicates ({query.data.duplicates.length})</CardTitle>
						</CardHeader>
						<CardContent>
							<p className='text-sm text-muted-foreground mb-3'>
								Identical statement entries may be legitimate repeated purchases. Inspect them
								before deleting.
							</p>
							{(
								query.data.duplicates as {
									date: string;
									description: string;
									currency: string;
									amount: number;
									count: number;
								}[]
							).map((d, i) => (
								<p key={i}>
									{d.date.slice(0, 10)} · {d.description} · {displayMoney(d.amount, d.currency)} ·{' '}
									{d.count} entries{' '}
									<Link
										className='underline'
										href={`/transactions?search=${encodeURIComponent(d.description)}`}
									>
										Inspect
									</Link>
								</p>
							))}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Recent reviews</CardTitle>
						</CardHeader>
						<CardContent className='space-y-3'>
							{(
								query.data.actions as {
									id: string;
									created_at: string;
									count: number;
									undone_at: string | null;
								}[]
							).map((a) => (
								<div className='flex justify-between gap-3' key={a.id}>
									<span>
										{a.created_at} · {a.count} transactions
									</span>
									<Button
										size='sm'
										variant='outline'
										disabled={busy || !!a.undone_at}
										onClick={() => act({ action: 'undo', id: a.id })}
									>
										{a.undone_at ? 'Undone' : 'Undo'}
									</Button>
								</div>
							))}
						</CardContent>
					</Card>
				</>
			)}
			{error && (
				<p role='alert' className='text-destructive'>
					{error}
				</p>
			)}
			{notice && <p role='status'>{notice}</p>}
		</div>
	);
}
