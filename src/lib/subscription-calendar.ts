import type { Database } from 'bun:sqlite';
import type { Subscription } from './types';
import { currencyCode } from './money';

export interface ReminderPreference {
	subscriptionId: string;
	reminderDays: number;
	cancellationNoticeDays: number;
	enabled: boolean;
}
export interface BillEvent {
	id: string;
	subscriptionId: string;
	name: string;
	date: string;
	amount: number;
	currency: string;
	cancellationDate: string;
	reminderDays: number;
	reminderEnabled: boolean;
	cancellationUrl?: string;
}
const day = 86400000;
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
/** Anchor every month to the original day so Jan 31 → Feb 28 → Mar 31. */
function occurrence(subscription: Subscription, offset: number) {
	const anchor = new Date(`${dateOnly(new Date(subscription.nextPaymentDate))}T00:00:00Z`);
	if (subscription.billingFrequency === 'custom') {
		const interval = subscription.customFrequencyDays;
		if (!interval || !Number.isInteger(interval) || interval < 1)
			throw new Error('Invalid custom billing interval');
		return new Date(anchor.getTime() + offset * interval * day);
	}
	const months =
		subscription.billingFrequency === 'monthly'
			? 1
			: subscription.billingFrequency === 'quarterly'
				? 3
				: 12;
	const result = new Date(
		Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset * months, 1),
	);
	const lastDay = new Date(
		Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
	).getUTCDate();
	result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
	return result;
}
export function billEvents(
	subscriptions: Subscription[],
	preferences: ReminderPreference[],
	from: string,
	to: string,
): BillEvent[] {
	const begin = new Date(`${from}T00:00:00Z`),
		end = new Date(`${to}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(from) ||
		!/^\d{4}-\d{2}-\d{2}$/.test(to) ||
		!Number.isFinite(begin.getTime()) ||
		!Number.isFinite(end.getTime()) ||
		dateOnly(begin) !== from ||
		dateOnly(end) !== to ||
		end < begin ||
		end.getTime() - begin.getTime() > 366 * day
	)
		throw new Error('Choose a valid date range of at most 366 days');
	const result: BillEvent[] = [];
	for (const subscription of subscriptions.filter((s) => s.isActive)) {
		const preference = preferences.find((p) => p.subscriptionId === subscription.id);
		const notice = preference?.cancellationNoticeDays ?? 0;
		// Include renewals beyond the visible range when their cancellation deadline is visible.
		const until = new Date(end.getTime() + notice * day);
		const anchor = new Date(subscription.nextPaymentDate);
		const elapsed = Math.max(0, begin.getTime() - anchor.getTime());
		const intervalDays =
			subscription.billingFrequency === 'custom'
				? (subscription.customFrequencyDays ?? 1)
				: subscription.billingFrequency === 'monthly'
					? 31
					: subscription.billingFrequency === 'quarterly'
						? 92
						: 366;
		const startOffset = Math.max(0, Math.floor(elapsed / (intervalDays * day)) - 1);
		for (let i = startOffset; i < startOffset + 20000; i++) {
			const payment = occurrence(subscription, i);
			if (payment > until) break;
			if (subscription.endDate && dateOnly(payment) > dateOnly(new Date(subscription.endDate)))
				break;
			if (dateOnly(payment) < dateOnly(new Date(subscription.startDate))) continue;
			const cancellation = new Date(payment.getTime() - notice * day);
			if ((payment < begin || payment > end) && (cancellation < begin || cancellation > end))
				continue;
			const date = dateOnly(payment);
			result.push({
				id: `${subscription.id}-${date}`,
				subscriptionId: subscription.id,
				name: subscription.name,
				date,
				amount: subscription.amount,
				currency: currencyCode(subscription.currency),
				cancellationDate: dateOnly(cancellation),
				reminderDays: preference?.reminderDays ?? 7,
				reminderEnabled: preference?.enabled ?? true,
				cancellationUrl: subscription.cancellationUrl,
			});
		}
	}
	return result.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
export function reminderPreferences(db: Database): ReminderPreference[] {
	return (
		db
			.query(
				'SELECT subscription_id AS subscriptionId, reminder_days AS reminderDays,cancellation_notice_days AS cancellationNoticeDays,enabled FROM subscription_reminders',
			)
			.all() as (Omit<ReminderPreference, 'enabled'> & { enabled: number })[]
	).map((row) => ({ ...row, enabled: row.enabled === 1 }));
}
export function saveReminder(db: Database, value: ReminderPreference) {
	if (
		!value ||
		typeof value.subscriptionId !== 'string' ||
		typeof value.enabled !== 'boolean' ||
		![value.reminderDays, value.cancellationNoticeDays].every(
			(n) => Number.isInteger(n) && n >= 0 && n <= 365,
		)
	)
		throw new Error('Reminder and cancellation notice must be whole days between 0 and 365');
	if (!db.query('SELECT id FROM subscriptions WHERE id=?').get(value.subscriptionId))
		throw new Error('Subscription not found');
	db.query(
		`INSERT INTO subscription_reminders(subscription_id,reminder_days,cancellation_notice_days,enabled) VALUES(?,?,?,?)
 ON CONFLICT(subscription_id) DO UPDATE SET reminder_days=excluded.reminder_days,cancellation_notice_days=excluded.cancellation_notice_days,enabled=excluded.enabled`,
	).run(
		value.subscriptionId,
		value.reminderDays,
		value.cancellationNoticeDays,
		value.enabled ? 1 : 0,
	);
}
function escapeICS(value: string) {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\r?\n/g, '\\n')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r/g, '');
}
// RFC 5545 content lines must be folded after 75 octets, without splitting a UTF-8 character.
function foldICS(line: string) {
	let result = '',
		segment = '',
		bytes = 0;
	for (const character of line) {
		const size = new TextEncoder().encode(character).length;
		if (bytes + size > 75) {
			result += segment + '\r\n';
			segment = ' ';
			bytes = 1;
		}
		segment += character;
		bytes += size;
	}
	return result + segment;
}
export function calendarICS(events: BillEvent[], from: string, to: string, now = new Date()) {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Personal Finance//Bill Calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
	];
	const stamp = now
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
	for (const event of events) {
		const variants = [
			{
				type: 'payment',
				date: event.date,
				title: `${event.name} payment`,
				description: `${event.amount.toFixed(2)} ${event.currency}. Forecast from current subscription schedule.`,
			},
			...(event.cancellationDate !== event.date
				? [
						{
							type: 'cancellation',
							date: event.cancellationDate,
							title: `${event.name}: cancellation deadline`,
							description: `Cancel before the ${event.date} renewal if you do not want to renew.${event.cancellationUrl ? ` ${event.cancellationUrl}` : ''}`,
						},
					]
				: []),
		];
		for (const variant of variants) {
			if (variant.date < from || variant.date > to) continue;
			const next = dateOnly(new Date(new Date(`${variant.date}T00:00:00Z`).getTime() + day));
			lines.push(
				'BEGIN:VEVENT',
				`UID:${escapeICS(event.id)}-${variant.type}@personal-finance.local`,
				`DTSTAMP:${stamp}`,
				`DTSTART;VALUE=DATE:${variant.date.replace(/-/g, '')}`,
				`DTEND;VALUE=DATE:${next.replace(/-/g, '')}`,
				`SUMMARY:${escapeICS(variant.title)}`,
				`DESCRIPTION:${escapeICS(variant.description)}`,
				'TRANSP:TRANSPARENT',
			);
			if (event.reminderEnabled)
				lines.push(
					'BEGIN:VALARM',
					`TRIGGER:-P${event.reminderDays}D`,
					'ACTION:DISPLAY',
					`DESCRIPTION:${escapeICS(variant.title)}`,
					'END:VALARM',
				);
			lines.push('END:VEVENT');
		}
	}
	return lines.concat('END:VCALENDAR').map(foldICS).join('\r\n') + '\r\n';
}
