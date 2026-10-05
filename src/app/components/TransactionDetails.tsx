'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCategoriesQuery } from '@/lib/queries';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import { currencyCode, displayMoney } from '@/lib/money';
import type { transactionDetails } from '@/lib/transaction-ledger';
import TransferClassification from './TransferClassification';

type Details = ReturnType<typeof transactionDetails>;
export async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(url, options),
		data = await response.json();
	if (!response.ok) throw new Error(data.error || data.message || 'Request failed');
	return data;
}
export default function TransactionDetails({ id }: { id: string }) {
	const [open, setOpen] = useState(false),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false);
	const [allocations, setAllocations] = useState<{ categoryId: string; amount: string }[]>([]),
		[purchaseId, setPurchaseId] = useState(''),
		[kind, setKind] = useState('refund');
	const client = useQueryClient();
	const { data: categories = [] } = useCategoriesQuery();
	const query = useQuery({
		queryKey: ['transaction-details', id],
		enabled: open,
		queryFn: async () => {
			const result = await requestJson<Details>(`/api/transactions/${id}/details`);
			setAllocations(
				result.allocations.map((a) => ({ categoryId: a.categoryId, amount: String(a.amount) })),
			);
			return result;
		},
	});
	async function save(body: unknown) {
		setBusy(true);
		setError('');
		try {
			await requestJson(`/api/transactions/${id}/details`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			await Promise.all([
				query.refetch(),
				invalidateFinanceQueries(client),
				client.invalidateQueries({ queryKey: ['overview'] }),
			]);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Update failed');
		} finally {
			setBusy(false);
		}
	}
	const data = query.data;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant='outline' size='sm'>
					Details
				</Button>
			</DialogTrigger>
			<DialogContent className='max-h-[85vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>Transaction details</DialogTitle>
					<DialogDescription>
						Manage transfers, split expenses or link a refund to its purchase.
					</DialogDescription>
				</DialogHeader>
				{query.isPending ? (
					<p>Loading…</p>
				) : query.isError ? (
					<p role='alert'>{query.error.message}</p>
				) : (
					data && (
						<div className='space-y-4'>
							<p>
								{data.transaction.description} ·{' '}
								{displayMoney(data.transaction.amount, currencyCode(data.transaction.currency))}
							</p>
							<TransferClassification details={data} />
							{data.transaction.type === 'expense' && (
								<>
									<h3 className='font-semibold'>Category split</h3>
									<p className='text-sm text-muted-foreground'>
										Enter positive amounts that total the purchase. Refunds follow these allocations
										proportionally.
									</p>
									{allocations.map((allocation, index) => (
										<div className='flex gap-2' key={index}>
											<select
												className='border rounded p-2 min-w-0 flex-1'
												aria-label={`Split category ${index + 1}`}
												value={allocation.categoryId}
												onChange={(e) =>
													setAllocations(
														allocations.map((a, i) =>
															i === index ? { ...a, categoryId: e.target.value } : a,
														),
													)
												}
											>
												<option value=''>Choose category</option>
												{categories.map((c) => (
													<option key={c.id} value={c.id}>
														{c.name}
													</option>
												))}
											</select>
											<Input
												className='w-28'
												aria-label={`Split amount ${index + 1}`}
												type='number'
												min='0.01'
												step='0.01'
												value={allocation.amount}
												onChange={(e) =>
													setAllocations(
														allocations.map((a, i) =>
															i === index ? { ...a, amount: e.target.value } : a,
														),
													)
												}
											/>
											<Button
												variant='ghost'
												aria-label={`Remove split ${index + 1}`}
												onClick={() => setAllocations(allocations.filter((_, i) => i !== index))}
											>
												×
											</Button>
										</div>
									))}
									<p className='text-sm'>
										Allocated:{' '}
										{displayMoney(
											allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
											currencyCode(data.transaction.currency),
										)}
									</p>
									<div className='flex gap-2 flex-wrap'>
										<Button
											variant='outline'
											onClick={() =>
												setAllocations([...allocations, { categoryId: '', amount: '' }])
											}
										>
											Add allocation
										</Button>
										<Button
											disabled={busy || allocations.length < 2}
											onClick={() =>
												save({
													action: 'split',
													allocations: allocations.map((a) => ({ ...a, amount: Number(a.amount) })),
												})
											}
										>
											Save split
										</Button>
										<Button
											variant='outline'
											disabled={busy || !data.allocations.length}
											onClick={() => save({ action: 'split', allocations: [] })}
										>
											Remove split
										</Button>
									</div>
									{!!data.receipts.length && (
										<p>
											{data.receipts.length} linked refunds / reimbursements. Unlink each receipt
											before changing this purchase amount.
										</p>
									)}
								</>
							)}
							{data.transaction.type === 'income' && (
								<>
									<h3 className='font-semibold'>Refund or reimbursement</h3>
									<p className='text-sm text-muted-foreground'>
										Linked receipts reduce expense in the receipt month instead of counting as
										income.
									</p>
									{data.refund ? (
										<>
											<p>Receipt is linked to a purchase.</p>
											<Button
												disabled={busy}
												variant='outline'
												onClick={() => save({ action: 'unlink' })}
											>
												Unlink receipt
											</Button>
										</>
									) : (
										<>
											<select
												className='border rounded p-2 w-full'
												aria-label='Original purchase'
												value={purchaseId}
												onChange={(e) => setPurchaseId(e.target.value)}
											>
												<option value=''>Choose original purchase</option>
												{(
													data.purchases as {
														id: string;
														date: string;
														description: string;
														amount: number;
													}[]
												).map((p) => (
													<option key={p.id} value={p.id}>
														{p.date.slice(0, 10)} · {p.description} ·{' '}
														{displayMoney(-p.amount, currencyCode(data.transaction.currency))}
													</option>
												))}
											</select>
											<select
												className='border rounded p-2'
												aria-label='Receipt kind'
												value={kind}
												onChange={(e) => setKind(e.target.value)}
											>
												<option value='refund'>Refund</option>
												<option value='reimbursement'>Reimbursement</option>
											</select>
											<Button
												disabled={busy || !purchaseId}
												onClick={() => save({ action: 'link', purchaseId, kind })}
											>
												Link receipt
											</Button>
										</>
									)}
								</>
							)}
							{error && (
								<p role='alert' className='text-destructive'>
									{error}
								</p>
							)}
						</div>
					)
				)}
			</DialogContent>
		</Dialog>
	);
}
