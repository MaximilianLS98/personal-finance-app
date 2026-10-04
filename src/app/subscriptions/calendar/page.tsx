'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { BillEvent, ReminderPreference } from '@/lib/subscription-calendar';
import type { Subscription } from '@/lib/types';
import { displayMoney } from '@/lib/money';

interface CalendarData {
	events: BillEvent[];
	subscriptions: Subscription[];
	preferences: ReminderPreference[];
}
export default function BillCalendarPage() {
	const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
	const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
	const start = new Date(`${safeMonth}-01T00:00:00Z`);
	const days = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
	const from = `${safeMonth}-01`,
		to = `${safeMonth}-${days}`;
	const { data, error, isLoading } = useQuery<CalendarData>({
		queryKey: ['subscription-calendar', from, to],
		queryFn: async () => {
			const response = await fetch(`/api/subscriptions/calendar?from=${from}&to=${to}`);
			if (!response.ok) throw new Error('Unable to load calendar');
			return response.json();
		},
	});
	const exportFrom = new Date().toISOString().slice(0, 10),
		exportTo = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
	const totals = new Map<string, number>();
	for (const event of data?.events ?? [])
		if (event.date >= from && event.date <= to)
			totals.set(event.currency, (totals.get(event.currency) ?? 0) + event.amount);
	return (
		<div className='max-w-7xl mx-auto space-y-6'>
			<Button asChild variant='ghost'>
				<Link href='/subscriptions'>← Subscriptions</Link>
			</Button>
			<div className='flex flex-wrap justify-between gap-4'>
				<div>
					<h1 className='text-2xl font-semibold'>Bill calendar</h1>
					<p className='text-muted-foreground'>Upcoming payments and cancellation deadlines.</p>
				</div>
				<Button asChild variant='outline'>
					<a href={`/api/subscriptions/calendar?from=${exportFrom}&to=${exportTo}&format=ics`}>
						Export next 12 months (.ics)
					</a>
				</Button>
			</div>
			<p className='text-sm text-muted-foreground'>
				Forecasts use current prices and billing dates. Calendar exports contain a snapshot; import
				an updated file after changes. Your calendar app delivers reminders when this app is closed.
			</p>
			<label className='flex items-center gap-3'>
				Month{' '}
				<input
					className='border rounded p-2'
					type='month'
					value={month}
					onChange={(e) => setMonth(e.target.value)}
				/>
			</label>
			{error && <p role='alert'>{error.message}</p>}
			{isLoading && <p>Loading calendar…</p>}
			<div className='flex flex-wrap gap-4'>
				{Array.from(totals, ([currency, amount]) => (
					<p key={currency}>
						<strong>{displayMoney(amount, currency)}</strong> scheduled this month
					</p>
				))}
			</div>
			<div className='overflow-x-auto'>
				<div className='grid grid-cols-7 min-w-[630px] gap-px bg-border rounded border'>
					{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
						<div key={day} className='bg-muted p-2 text-center font-medium'>
							{day}
						</div>
					))}
					{Array.from({ length: (start.getUTCDay() + 6) % 7 }, (_, i) => (
						<div key={`blank-${i}`} className='bg-muted/40' />
					))}
					{Array.from({ length: days }, (_, i) => {
						const date = `${safeMonth}-${String(i + 1).padStart(2, '0')}`;
						const due = data?.events.filter((e) => e.date === date) ?? [];
						const cancellations =
							data?.events.filter(
								(e) => e.cancellationDate === date && e.cancellationDate !== e.date,
							) ?? [];
						return (
							<div
								key={date}
								className={`bg-card min-h-28 p-2 space-y-1 ${date === new Date().toISOString().slice(0, 10) ? 'ring-2 ring-inset ring-primary' : ''}`}
							>
								<span className='text-sm font-medium'>{i + 1}</span>
								{due.map((event) => (
									<Link
										href={`/subscriptions/${event.subscriptionId}`}
										key={event.id}
										className='block rounded bg-primary/10 p-1 text-xs break-words'
									>
										{event.name}
										<br />
										{displayMoney(event.amount, event.currency)}
									</Link>
								))}
								{cancellations.map((event) => (
									<div
										key={event.id}
										className='rounded bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100 p-1 text-xs break-words'
									>
										Cancel {event.name} before renewal {event.date}
									</div>
								))}
							</div>
						);
					})}
				</div>
			</div>
			{data && data.events.length === 0 && (
				<p>No payments or cancellation deadlines scheduled this month.</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Reminder preferences</CardTitle>
				</CardHeader>
				<CardContent className='space-y-6'>
					<p className='text-sm text-muted-foreground'>
						Enter the notice period required by each provider. Reminder lead time applies before
						both payments and cancellation deadlines. Zero means the same day.
					</p>
					{data?.subscriptions.map((subscription) => (
						<ReminderEditor
							key={subscription.id}
							subscription={subscription}
							preference={data.preferences.find((p) => p.subscriptionId === subscription.id)}
						/>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
function ReminderEditor({
	subscription,
	preference,
}: {
	subscription: Subscription;
	preference?: ReminderPreference;
}) {
	const [reminderDays, setReminderDays] = useState(preference?.reminderDays ?? 7);
	const [cancellationNoticeDays, setNoticeDays] = useState(preference?.cancellationNoticeDays ?? 0);
	const [enabled, setEnabled] = useState(preference?.enabled ?? true);
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async () => {
			const response = await fetch('/api/subscriptions/calendar', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subscriptionId: subscription.id,
					reminderDays,
					cancellationNoticeDays,
					enabled,
				}),
			});
			if (!response.ok)
				throw new Error((await response.json()).message ?? 'Unable to save settings');
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscription-calendar'] }),
	});
	return (
		<form
			className='border-t pt-4 flex flex-wrap items-end gap-4'
			onSubmit={(e) => {
				e.preventDefault();
				mutation.mutate();
			}}
		>
			<div className='w-full font-medium'>{subscription.name}</div>
			<label className='text-sm space-y-1'>
				Remind me (days before)
				<input
					required
					className='block border rounded p-2 w-36'
					type='number'
					min={0}
					max={365}
					step={1}
					value={reminderDays}
					onChange={(e) => setReminderDays(e.target.valueAsNumber)}
				/>
			</label>
			<label className='text-sm space-y-1'>
				Cancellation notice (days)
				<input
					required
					className='block border rounded p-2 w-36'
					type='number'
					min={0}
					max={365}
					step={1}
					value={cancellationNoticeDays}
					onChange={(e) => setNoticeDays(e.target.valueAsNumber)}
				/>
			</label>
			<label className='flex gap-2 items-center py-2'>
				<input type='checkbox' checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
				Include calendar reminders
			</label>
			<Button disabled={mutation.isPending} type='submit'>
				{mutation.isPending ? 'Saving…' : 'Save preferences'}
			</Button>
			{mutation.isSuccess && (
				<p role='status' className='text-sm'>
					Saved. Export again to update your calendar.
				</p>
			)}
			{mutation.error && <p role='alert'>{mutation.error.message}</p>}
		</form>
	);
}
