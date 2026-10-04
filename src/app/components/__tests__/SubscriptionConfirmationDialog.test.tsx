import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscriptionConfirmationDialog from '../SubscriptionConfirmationDialog';
import type { SubscriptionCandidate, SubscriptionMatch } from '@/lib/subscription-pattern-engine';
const candidate = {
	name: 'Synthetic historical gym',
	amount: 500,
	currency: 'NOK',
	billingFrequency: 'monthly',
	confidence: 0.99,
	activity: 'no_recent_payment',
	lastPaymentDate: '2025-01-31',
	matchingTransactions: [
		{
			id: 'old',
			date: new Date('2025-01-31'),
			description: 'Gym',
			amount: -500,
			currency: 'NOK',
			type: 'expense',
		},
	],
	detectedPatterns: [],
	reason: 'Monthly payment history',
} satisfies SubscriptionCandidate & { activity: 'no_recent_payment'; lastPaymentDate: string };
const historicalData = {
	candidates: [candidate],
	matches: [],
	totalAnalyzed: 1,
	alreadyFlagged: 0,
};
const match = {
	transaction: {
		id: 'payment-1',
		date: new Date('2026-10-01'),
		description: 'Synthetic stream charge',
		amount: -15,
		currency: 'USD',
		type: 'expense',
	},
	subscription: {
		id: 'sub1',
		name: 'Synthetic streaming',
		amount: 14,
		currency: 'USD',
		billingFrequency: 'monthly',
	},
	confidence: 0.95,
} as SubscriptionMatch;
const matchingData = { candidates: [], matches: [match], totalAnalyzed: 1, alreadyFlagged: 0 };
describe('import and existing subscription confirmation', () => {
	it('defaults history unchecked and inactive, keeps errors visible, and only closes on successful persistence', async () => {
		const onConfirm = jest
				.fn()
				.mockRejectedValueOnce(new Error('Failed to store history'))
				.mockResolvedValue(undefined),
			onClose = jest.fn();
		render(
			<SubscriptionConfirmationDialog
				isOpen
				onClose={onClose}
				detectionData={historicalData}
				categories={[]}
				onConfirm={onConfirm}
			/>,
		);
		expect(screen.getByLabelText('Select Synthetic historical gym')).not.toBeChecked();
		fireEvent.click(screen.getByLabelText('Select Synthetic historical gym'));
		expect(screen.getByLabelText('Save Synthetic historical gym as')).toHaveValue('inactive');
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 Items' }));
		await waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent('Failed to store history'),
		);
		expect(onClose).not.toHaveBeenCalled();
		expect(onConfirm.mock.calls[0][0].candidates[0].overrides.isActive).toBe(false);
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 Items' }));
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});
	it('requires explicitly selecting an existing payment link, shows currencies, and waits before closing', async () => {
		let resolve!: () => void;
		const onConfirm = jest.fn<Promise<void>, [unknown]>(
				() =>
					new Promise<void>((done) => {
						resolve = done;
					}),
			),
			onClose = jest.fn();
		render(
			<SubscriptionConfirmationDialog
				isOpen
				onClose={onClose}
				detectionData={matchingData}
				categories={[]}
				onConfirm={onConfirm}
			/>,
		);
		const checkbox = screen.getByLabelText('Link payment-1 to Synthetic streaming');
		expect(checkbox).not.toBeChecked();
		expect(screen.getByRole('button', { name: 'Confirm 0 Items' })).toBeDisabled();
		expect(screen.getByText('Synthetic stream charge', { exact: false })).toBeInTheDocument();
		expect(screen.getAllByText(/USD/)).toHaveLength(2);
		fireEvent.click(checkbox);
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 Items' }));
		expect(screen.getByRole('button', { name: 'Confirming...' })).toBeDisabled();
		expect(checkbox).toBeDisabled();
		expect(onClose).not.toHaveBeenCalled();
		expect(onConfirm).toHaveBeenCalledWith({ candidates: [], matches: [match] });
		await act(async () => resolve());
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
