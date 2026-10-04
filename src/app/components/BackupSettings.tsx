'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import type { backupSummary } from '@/lib/finance-backup';

type Preview = ReturnType<typeof backupSummary>;
export function BackupSettings() {
	const queryClient = useQueryClient();
	const fileInput = useRef<HTMLInputElement>(null);
	const [backup, setBackup] = useState<string | null>(null);
	const [preview, setPreview] = useState<Preview | null>(null);
	const [filename, setFilename] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmation, setConfirmation] = useState('');
	const [restored, setRestored] = useState(false);
	async function validate(file?: File) {
		setBackup(null);
		setPreview(null);
		setError('');
		setSuccess('');
		setConfirmation('');
		setFilename(file?.name ?? '');
		if (!file) return;
		if (file.size > 50 * 1024 * 1024) {
			setError('Backup files must be under 50 MB');
			return;
		}
		setBusy(true);
		try {
			const text = await file.text();
			const response = await fetch('/api/backups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: text,
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.message || 'Unable to validate backup');
			setBackup(text);
			setPreview(body.preview);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unable to read file');
		} finally {
			setBusy(false);
		}
	}
	async function restore() {
		if (!backup || confirmation !== 'RESTORE') return;
		setBusy(true);
		setError('');
		try {
			const response = await fetch('/api/backups', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'X-Confirm-Restore': 'REPLACE ALL FINANCE DATA',
				},
				body: backup,
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.message || 'Restore failed');
			await queryClient.cancelQueries();
			queryClient.clear();
			setSuccess(
				`Restored ${body.restored.totalRecords} records. A backup of the previous data was saved automatically.`,
			);
			setRestored(true);
			setBackup(null);
			setPreview(null);
			setConfirmation('');
			setConfirmOpen(false);
			if (fileInput.current) fileInput.current.value = '';
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Restore failed');
		} finally {
			setBusy(false);
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Backup and data export</CardTitle>
				<CardDescription>
					Keep a portable copy of all your finance records and restore it on a compatible app
					version.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-6'>
				<p className='text-sm text-muted-foreground'>
					Full JSON backups include every finance table: transactions, accounts, imports,
					categories, rules, subscriptions, budgets, scenarios, goals, and history when present.
					Browser appearance preferences stay on this device.
				</p>
				<div className='flex flex-wrap gap-3'>
					<Button asChild>
						<a href='/api/backups'>Download full backup</a>
					</Button>
					<Button asChild variant='outline'>
						<a href='/api/data/export?format=json'>Export all data (JSON)</a>
					</Button>
					<Button asChild variant='outline'>
						<a href='/api/data/export?format=csv'>Export transactions (CSV)</a>
					</Button>
				</div>
				<p className='text-sm text-muted-foreground'>
					CSV includes original currencies and account identifiers. Use the full JSON backup to
					retain linked records and restore the app.
				</p>
				<div className='border-t pt-4 space-y-3'>
					<h3 className='font-medium'>Restore a backup</h3>
					<p className='text-sm text-muted-foreground'>
						Restoring replaces all current finance records. The file is checked for format, schema
						compatibility, and checksum before review; database constraints and references are
						checked before replacement completes. A pre-restore backup is retained on this computer.
					</p>
					<label className='block text-sm font-medium' htmlFor='finance-backup-file'>
						Select full JSON backup
					</label>
					<input
						id='finance-backup-file'
						ref={fileInput}
						type='file'
						accept='.json,application/json'
						disabled={busy}
						onChange={(e) => void validate(e.target.files?.[0])}
						className='block w-full rounded border p-2'
					/>
					{busy && <p role='status'>Processing backup…</p>}
					{preview && (
						<div className='rounded border p-4 space-y-3'>
							<p className='font-medium'>{filename}</p>
							<p>
								Created {new Date(preview.createdAt).toLocaleString()} · {preview.totalRecords}{' '}
								records · schema {preview.schemaVersion}
							</p>
							<details>
								<summary className='cursor-pointer'>Included data</summary>
								<ul className='mt-2 text-sm space-y-1'>
									{preview.tables.map((table) => (
										<li key={table.name}>
											{table.name.replaceAll('_', ' ')}: {table.records}
										</li>
									))}
								</ul>
							</details>
							<Button variant='destructive' disabled={busy} onClick={() => setConfirmOpen(true)}>
								Review replacement
							</Button>
						</div>
					)}
					{error && (
						<p role='alert' className='text-destructive'>
							{error}
						</p>
					)}
					{success && <p role='status'>{success}</p>}
					{restored && (
						<Button asChild variant='outline'>
							<a href='/api/backups?safety=latest'>Download pre-restore backup</a>
						</Button>
					)}
				</div>
				<Dialog
					open={confirmOpen}
					onOpenChange={(open) => {
						if (!busy) setConfirmOpen(open);
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Replace all finance data?</DialogTitle>
							<DialogDescription>
								Restore {filename}, created{' '}
								{preview ? new Date(preview.createdAt).toLocaleString() : ''}. Current records will
								be replaced with {preview?.totalRecords} backed-up records. A copy of the current
								database is saved first.
							</DialogDescription>
						</DialogHeader>
						<label className='space-y-2'>
							Type RESTORE to confirm
							<input
								className='block border rounded p-2 w-full'
								value={confirmation}
								onChange={(e) => setConfirmation(e.target.value)}
								autoComplete='off'
								disabled={busy}
							/>
						</label>
						{error && (
							<p role='alert' className='text-destructive'>
								{error}
							</p>
						)}
						<DialogFooter>
							<Button variant='outline' disabled={busy} onClick={() => setConfirmOpen(false)}>
								Cancel
							</Button>
							<Button
								variant='destructive'
								disabled={busy || confirmation !== 'RESTORE'}
								onClick={() => void restore()}
							>
								{busy ? 'Restoring…' : 'Replace finance data'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}
