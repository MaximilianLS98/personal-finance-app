'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getJson, deleteJson } from '@/lib/api';
import { invalidateFinanceQueries } from '@/lib/query-keys';
import { displayMoney } from '@/lib/money';
import type { Account, ImportOptions } from '@/lib/ledger-service';
import Link from 'next/link';
type Preview = {
	format?: string;
	products?: string[];
	requiresProductSelection?: boolean;
	skippedRows?: Array<{ rowNumber: number; reason: string }>;
	headers: string[];
	columns?: NonNullable<ImportOptions['columns']>;
	errors: string[];
	totalRows: number;
	validRows: number;
	rows: {
		rowNumber: number;
		classification?: { decision: string; reason: string } | null;
		source?: { product: string; type: string; fee: number; originalAmount: number };
		duplicate: boolean;
		duplicateReason?: string;
		transaction: { date: string; description: string; amount: number; currency: string };
	}[];
};
type Batch = {
	id: string;
	filename: string;
	created_at: string;
	row_count: number;
	skipped_count: number;
	undone_at: string | null;
	account_name: string;
};
export default function ImportWorkspace() {
	const client = useQueryClient();
	const { data: accounts = [] } = useQuery({
		queryKey: ['accounts'],
		queryFn: () => getJson<Account[]>('/api/accounts'),
	});
	const { data: history = [] } = useQuery({
		queryKey: ['imports'],
		queryFn: () => getJson<Batch[]>('/api/imports'),
	});
	const [file, setFile] = useState<File | null>(null),
		[accountId, setAccount] = useState(''),
		[preview, setPreview] = useState<Preview | null>(null),
		[error, setError] = useState(''),
		[message, setMessage] = useState(''),
		[busy, setBusy] = useState(false),
		[confirmedErrors, setConfirmedErrors] = useState(false);
	const [mappingDirty, setMappingDirty] = useState(false);
	const [revolutProduct, setRevolutProduct] = useState('');
	const [revolutFeeMode, setRevolutFeeMode] = useState<ImportOptions['revolutFeeMode']>();
	const [keep, setKeep] = useState<number[]>([]),
		[exclude, setExclude] = useState<number[]>([]),
		[mapping, setMapping] = useState<NonNullable<ImportOptions['columns']> | undefined>();
	async function process(commit = false) {
		if (!file) return;
		setBusy(true);
		setError('');
		setMessage('');
		try {
			const form = new FormData();
			form.set('file', file);
			form.set('action', commit ? 'commit' : 'preview');
			form.set(
				'options',
				JSON.stringify({
					accountId,
					revolutProduct: revolutProduct || undefined,
					revolutFeeMode,
					columns: mapping,
					acceptErrors: confirmedErrors,
					keepDuplicates: keep,
					excludeRows: exclude,
				}),
			);
			const response = await fetch('/api/imports', { method: 'POST', body: form });
			const body = await response.json();
			if (!response.ok) throw new Error(body.message);
			if (commit) {
				setMessage(
					`Imported ${body.created} transactions; skipped ${body.skipped}.${body.detection ? ` Transfer detection: ${body.detection.classified} classifications, ${body.detection.matched} matched pairs.` : ''}`,
				);
				setPreview(null);
				setFile(null);
				await invalidateFinanceQueries(client);
			} else {
				setPreview(body);
				setMappingDirty(false);
				setConfirmedErrors(false);
				setKeep([]);
				setExclude([]);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Import failed');
		} finally {
			setBusy(false);
		}
	}
	async function undo(id: string) {
		if (
			!window.confirm(
				'Remove all transactions created by this import? Edits and links on those records will also be removed.',
			)
		)
			return;
		setBusy(true);
		try {
			await deleteJson('/api/imports', {
				body: JSON.stringify({ id }),
				headers: { 'Content-Type': 'application/json' },
			});
			await invalidateFinanceQueries(client);
			setMessage('Import undone.');
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	const toggle = (values: number[], n: number) =>
		values.includes(n) ? values.filter((v) => v !== n) : [...values, n];
	return (
		<div className='space-y-6'>
			<Card>
				<CardHeader>
					<CardTitle>Import bank statement</CardTitle>
				</CardHeader>
				<CardContent className='space-y-4'>
					<fieldset disabled={busy} className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Preview your statement before saving. Imports retain their account and currency.{' '}
							<Link className='underline' href='/accounts'>
								Manage accounts
							</Link>
						</p>
						<label className='block'>
							Account
							<select
								className='block border rounded p-2 w-full'
								value={accountId}
								onChange={(e) => {
									setAccount(e.target.value);
									setPreview(null);
								}}
							>
								<option value=''>Choose an account</option>
								{accounts.map((a) => (
									<option key={a.id} value={a.id}>
										{a.name} ({a.currency})
									</option>
								))}
							</select>
						</label>
						<label className='block'>
							CSV statement
							<Input
								type='file'
								accept='.csv'
								onChange={(e) => {
									setFile(e.target.files?.[0] || null);
									setRevolutProduct('');
									setRevolutFeeMode(undefined);
									setPreview(null);
									setMapping(undefined);
									setMessage('');
								}}
							/>
						</label>
						<Button disabled={!file || !accountId || busy} onClick={() => process()}>
							{busy ? 'Processing…' : 'Preview statement'}
						</Button>
						{error && (
							<p role='alert' className='text-destructive'>
								{error}
							</p>
						)}
						{message && (
							<p role='status'>
								{message}{' '}
								<Link href='/review' className='underline'>
									Review transactions
								</Link>{' '}
								·{' '}
								<Link href='/subscriptions/detect' className='underline'>
									Detect subscriptions
								</Link>
							</p>
						)}
						{preview && (
							<div className='space-y-4'>
								{preview.format === 'revolut' && (
									<div className='space-y-3 rounded border p-3'>
										<h3 className='font-medium'>Revolut statement detected</h3>
										<p className='text-sm'>
											Only COMPLETED movements are imported using Completed Date. Timestamps without
											a timezone retain the statement clock. Choose one product per account; use
											separate accounts for Current, Savings, and Pocket balances. Transfers remain
											cash flows until matched in Accounts.
										</p>
										<label className='block'>
											Revolut product
											<select
												className='block border rounded p-2 bg-background w-full'
												value={revolutProduct}
												onChange={(e) => {
													setRevolutProduct(e.target.value);
													setMappingDirty(true);
												}}
											>
												<option value=''>
													{(preview.products?.length ?? 0) > 1
														? 'Choose a product before importing'
														: 'Automatic (single product)'}
												</option>
												{preview.products?.map((product) => (
													<option key={product} value={product}>
														{product}
													</option>
												))}
											</select>
										</label>
										<label className='block'>
											Nonzero fee handling
											<select
												className='block border rounded p-2 bg-background w-full'
												value={revolutFeeMode ?? ''}
												onChange={(e) => {
													setRevolutFeeMode(
														(e.target.value || undefined) as ImportOptions['revolutFeeMode'],
													);
													setMappingDirty(true);
												}}
											>
												<option value=''>Review nonzero fees before importing</option>
												<option value='deduct'>Amount excludes fee — subtract Fee once</option>
												<option value='included'>Amount already includes fee — keep Amount</option>
											</select>
										</label>
										<p className='text-sm text-muted-foreground'>
											Check your statement balance to select fee handling. No extra fee transaction
											is created. Zero-fee rows need no fee choice. Revolut column mapping uses its
											recognized headers.
										</p>
										<Button variant='outline' onClick={() => process()}>
											Apply Revolut options and preview again
										</Button>
									</div>
								)}
								<details>
									<summary className='cursor-pointer'>Column mapping and saved profile</summary>
									<div className='grid gap-3 sm:grid-cols-4 mt-3'>
										{(['date', 'description', 'amount', 'currency'] as const).map((key) => (
											<label key={key}>
												{key}
												<select
													aria-label={`${key} column`}
													className='border rounded p-2 w-full'
													value={mapping?.[key] ?? ''}
													onChange={(e) => (
														setMappingDirty(true),
														setMapping((old) => ({
															...preview.columns,
															...old,
															[key]: e.target.value === '' ? undefined : Number(e.target.value),
														}))
													)}
												>
													<option value=''>
														Automatic
														{preview.columns?.[key] !== undefined
															? ` (${preview.headers[preview.columns[key]!]})`
															: ''}
													</option>
													{preview.headers.map((h, i) => (
														<option value={i} key={i}>
															{h}
														</option>
													))}
												</select>
											</label>
										))}
									</div>
									<div className='flex flex-wrap gap-2 mt-3'>
										<Button
											variant='outline'
											onClick={() => {
												localStorage.setItem(
													'finance-import-mapping',
													JSON.stringify(mapping || null),
												);
												setMessage('Mapping saved on this device.');
											}}
										>
											Save mapping
										</Button>
										<Button
											variant='outline'
											onClick={() => {
												try {
													setMapping(
														JSON.parse(localStorage.getItem('finance-import-mapping') || 'null') ||
															undefined,
													);
													setPreview(null);
													setMessage('Mapping loaded. Preview again to apply.');
												} catch {
													setError('Saved mapping is invalid');
												}
											}}
										>
											Load mapping
										</Button>
										<Button variant='outline' disabled={busy} onClick={() => process()}>
											Apply mapping and preview again
										</Button>
									</div>
								</details>
								<p>
									{preview.validRows} valid of {preview.totalRows} rows.{' '}
									{preview.rows.filter((r) => r.duplicate).length} suspected duplicates are skipped
									unless selected. Identical repeated purchases within this statement are preserved.
								</p>
								{(preview.skippedRows?.length ?? 0) > 0 && (
									<details className='border rounded p-3'>
										<summary>
											{preview.skippedRows!.length} excluded rows (state or another product)
										</summary>
										<ul className='max-h-40 overflow-auto text-sm'>
											{preview.skippedRows!.map((row) => (
												<li key={row.rowNumber}>
													Row {row.rowNumber}: {row.reason}
												</li>
											))}
										</ul>
									</details>
								)}
								{preview.errors.length > 0 && (
									<div role='alert' className='border rounded p-3'>
										<p>{preview.errors.length} rejected rows</p>
										<ul className='max-h-40 overflow-auto'>
											{preview.errors.map((e, i) => (
												<li key={i}>{e}</li>
											))}
										</ul>
										<label>
											<input
												type='checkbox'
												checked={confirmedErrors}
												onChange={(e) => setConfirmedErrors(e.target.checked)}
											/>{' '}
											Import valid rows and skip these errors
										</label>
									</div>
								)}
								<div className='max-h-96 overflow-auto border rounded'>
									<table className='w-full text-sm'>
										<thead>
											<tr>
												<th>Import (CSV row)</th>
												<th>Date</th>
												<th>Description</th>
												<th>Amount</th>
												<th>Status</th>
											</tr>
										</thead>
										<tbody>
											{preview.rows.map((r) => (
												<tr key={r.rowNumber} className='border-t'>
													<td className='p-2'>
														<input
															aria-label={`Import row ${r.rowNumber}`}
															type='checkbox'
															checked={
																!exclude.includes(r.rowNumber) &&
																(!r.duplicate || keep.includes(r.rowNumber))
															}
															onChange={() =>
																r.duplicate
																	? setKeep(toggle(keep, r.rowNumber))
																	: setExclude(toggle(exclude, r.rowNumber))
															}
														/>{' '}
														{r.rowNumber}
													</td>
													<td className='p-2 whitespace-nowrap'>
														{r.transaction.date.slice(0, 10)}
													</td>
													<td className='p-2'>
														{r.transaction.description}
														{r.classification && (
															<p className='text-xs font-medium'>
																{r.classification.decision === 'transfer'
																	? 'Excluded from income and spending'
																	: 'Included in totals'}{' '}
																· {r.classification.reason}
															</p>
														)}
														{r.source && (
															<p className='text-xs text-muted-foreground'>
																{r.source.product} · {r.source.type} · Amount{' '}
																{displayMoney(r.source.originalAmount, r.transaction.currency)} ·
																Fee {displayMoney(r.source.fee, r.transaction.currency)}
															</p>
														)}
													</td>
													<td className='p-2 whitespace-nowrap'>
														{displayMoney(r.transaction.amount, r.transaction.currency)}
													</td>
													<td className='p-2'>
														{r.duplicate ? r.duplicateReason || 'Possible duplicate' : 'New'}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
								<Button
									disabled={
										busy ||
										mappingDirty ||
										!preview.rows.length ||
										preview.requiresProductSelection ||
										(preview.errors.length > 0 && !confirmedErrors)
									}
									onClick={() => process(true)}
								>
									Confirm import
								</Button>
							</div>
						)}
					</fieldset>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Import history</CardTitle>
				</CardHeader>
				<CardContent className='space-y-3'>
					{!history.length && <p>No imports yet.</p>}
					{history.map((b) => (
						<div
							key={b.id}
							className='flex flex-wrap items-center justify-between gap-3 border-b py-3'
						>
							<div>
								<p>{b.filename}</p>
								<p className='text-sm text-muted-foreground'>
									{b.account_name} · {new Date(b.created_at).toLocaleString()} · {b.row_count}{' '}
									imported · {b.skipped_count} skipped {b.undone_at ? '· Undone' : ''}
								</p>
							</div>
							{!b.undone_at && (
								<Button variant='outline' disabled={busy} onClick={() => undo(b.id)}>
									Undo import
								</Button>
							)}
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
