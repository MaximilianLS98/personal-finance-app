import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DetectionWizard } from '../DetectionWizard';
import type { SubscriptionCandidate } from '@/lib/subscription-pattern-engine';
jest.mock('@/app/providers', () => ({
	useCurrencySettings: () => ({ currency: 'USD', locale: 'en-US' }),
}));
const historical = {
	name: 'Synthetic gym',
	amount: 499,
	currency: 'NOK',
	billingFrequency: 'monthly',
	confidence: 0.98,
	matchingTransactions: [
		{
			id: 'gym-1',
			date: new Date('2025-01-31'),
			description: 'Synthetic gym',
			amount: -499,
			currency: 'NOK',
			type: 'expense',
		},
	],
	detectedPatterns: [],
	reason: 'Three monthly payments with matching amounts',
	lastPaymentDate: '2025-01-31',
	activity: 'no_recent_payment',
} satisfies SubscriptionCandidate & { lastPaymentDate: string; activity: 'no_recent_payment' };
const recent = {
	...historical,
	name: 'Synthetic streaming',
	currency: 'USD',
	activity: 'recent' as const,
	lastPaymentDate: '2026-10-01',
	matchingTransactions: [
		{
			...historical.matchingTransactions[0],
			id: 'stream-1',
			currency: 'USD',
			date: new Date('2026-10-01'),
		},
	],
};
const results = { data: { candidates: [historical, recent] } };
describe('detected payment review', () => {
	it('keeps historical patterns visible, unchecked, and inactive while preserving candidate currencies', async () => {
		const onComplete = jest.fn().mockResolvedValue(undefined);
		render(<DetectionWizard detectionResults={results} onComplete={onComplete} />);
		expect(screen.getByLabelText('Select Synthetic gym')).not.toBeChecked();
		expect(screen.getByLabelText('Select Synthetic streaming')).toBeChecked();
		expect(screen.getByLabelText('Save Synthetic gym as')).toHaveValue('inactive');
		expect(screen.getByText('2025-01-31')).toBeInTheDocument();
		expect(screen.getByText('No recent payment')).toBeInTheDocument();
		expect(screen.getAllByText(historical.reason)).toHaveLength(2);
		expect(screen.getByText(/NOK.*499.*monthly/)).toBeInTheDocument();
		fireEvent.click(screen.getByLabelText('Select Synthetic gym'));
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 Subscriptions' }));
		await screen.findByText('Detection Complete!');
		expect(onComplete.mock.calls[0][0]).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: historical.name, currency: 'NOK', isActive: false }),
				expect.objectContaining({ name: recent.name, currency: 'USD', isActive: true }),
			]),
		);
	});
	it('allows explicitly reactivating history, waits for persistence, and prevents duplicate submission', async () => {
		let resolve!: () => void;
		const onComplete = jest.fn<Promise<void>, [unknown[]]>(
			() =>
				new Promise<void>((done) => {
					resolve = done;
				}),
		);
		render(
			<DetectionWizard
				detectionResults={{ data: { candidates: [historical] } }}
				onComplete={onComplete}
			/>,
		);
		fireEvent.click(screen.getByLabelText('Select Synthetic gym'));
		fireEvent.change(screen.getByLabelText('Save Synthetic gym as'), {
			target: { value: 'active' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 Subscription' }));
		expect(screen.queryByText('Detection Complete!')).not.toBeInTheDocument();
		const saving = screen.getByRole('button', { name: 'Saving subscriptions…' });
		expect(saving).toBeDisabled();
		fireEvent.click(saving);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete.mock.calls[0][0]).toEqual([
			expect.objectContaining({ isActive: true, currency: 'NOK' }),
		]);
		await act(async () => resolve());
		expect(screen.getByText('Detection Complete!')).toBeInTheDocument();
	});
	it('retains selection and allows a retry after failed atomic persistence', async () => {
		const onComplete = jest
			.fn()
			.mockRejectedValueOnce(new Error('Storage unavailable'))
			.mockResolvedValue(undefined);
		render(
			<DetectionWizard
				detectionResults={{ data: { candidates: [recent] } }}
				onComplete={onComplete}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 Subscription' }));
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Storage unavailable'));
		expect(screen.queryByText('Detection Complete!')).not.toBeInTheDocument();
		expect(screen.getByLabelText('Select Synthetic streaming')).toBeChecked();
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 Subscription' }));
		await screen.findByText('Detection Complete!');
		expect(onComplete).toHaveBeenCalledTimes(2);
	});
});
