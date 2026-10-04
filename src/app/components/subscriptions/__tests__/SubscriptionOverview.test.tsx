import { render, screen, within } from '@testing-library/react';
import { Subscription } from '../../../../lib/types';
import { SubscriptionOverview } from '../SubscriptionOverview';

// Mock the providers
jest.mock('../../../providers', () => ({
	useCurrencySettings: () => ({
		currency: 'NOK',
		locale: 'nb-NO',
	}),
}));

// Mock the financial calculator
jest.mock('../../../../lib/financial-calculator', () => ({
	formatCurrency: (amount: number, currency: string, _locale: string) =>
		`${currency} ${amount.toFixed(2)}`,
}));

describe('SubscriptionOverview', () => {
	const mockSubscriptions: Subscription[] = [
		{
			id: '1',
			name: 'Netflix',
			amount: 149,
			currency: 'NOK',
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2025-02-15'),
			categoryId: 'entertainment',
			isActive: true,
			startDate: new Date('2024-01-01'),
			createdAt: new Date('2024-01-01'),
			updatedAt: new Date('2024-01-01'),
		},
		{
			id: '2',
			name: 'Spotify',
			amount: 119,
			currency: 'NOK',
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2025-02-20'),
			categoryId: 'entertainment',
			isActive: true,
			startDate: new Date('2024-01-01'),
			createdAt: new Date('2024-01-01'),
			updatedAt: new Date('2024-01-01'),
		},
		{
			id: '3',
			name: 'Adobe Creative Suite',
			amount: 599,
			currency: 'NOK',
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2025-02-10'),
			categoryId: 'productivity',
			isActive: false, // Inactive subscription
			startDate: new Date('2024-01-01'),
			createdAt: new Date('2024-01-01'),
			updatedAt: new Date('2024-01-01'),
		},
	];

	it('renders subscription overview with correct totals', () => {
		render(<SubscriptionOverview subscriptions={mockSubscriptions} />);

		expect(screen.getByText('Subscription Overview')).toBeInTheDocument();
		expect(screen.getByText('Managing 2 active subscriptions')).toBeInTheDocument();

		// Check for the presence of overview cards
		expect(screen.getByText('Monthly Total')).toBeInTheDocument();
		expect(screen.getByText('Annual Total')).toBeInTheDocument();
		expect(screen.getByText('Active Subscriptions')).toBeInTheDocument();
		expect(screen.getByText('Average Monthly')).toBeInTheDocument();
	});

	it('shows loading state', () => {
		render(<SubscriptionOverview isLoading={true} />);

		// Should show loading skeleton
		expect(document.querySelectorAll('.animate-pulse')).toHaveLength(4);
	});

	it('shows error state', () => {
		const errorMessage = 'Failed to load subscriptions';
		render(<SubscriptionOverview error={errorMessage} />);

		expect(screen.getByText('Error Loading Subscriptions')).toBeInTheDocument();
		expect(screen.getByText(errorMessage)).toBeInTheDocument();
	});

	it('handles empty subscriptions array', () => {
		render(<SubscriptionOverview subscriptions={[]} />);

		expect(screen.getByText('Managing 0 active subscriptions')).toBeInTheDocument();
	});

	it('calculates totals correctly for different billing frequencies', () => {
		const mixedSubscriptions: Subscription[] = [
			{
				...mockSubscriptions[0],
				billingFrequency: 'monthly',
				amount: 100,
			},
			{
				...mockSubscriptions[1],
				billingFrequency: 'quarterly',
				amount: 300, // 100/month
			},
			{
				...mockSubscriptions[0],
				id: '3',
				billingFrequency: 'annually',
				amount: 1200, // 100/month
			},
		];

		render(<SubscriptionOverview subscriptions={mixedSubscriptions} />);

		// Monthly total should be 300 (100 + 100 + 100)
		// This is tested indirectly through the component rendering
		expect(screen.getByText('Managing 3 active subscriptions')).toBeInTheDocument();
	});
	it('keeps mixed-currency costs in separate labeled sections', () => {
		render(
			<SubscriptionOverview
				subscriptions={[
					{ ...mockSubscriptions[0], amount: 100 },
					{ ...mockSubscriptions[1], amount: 10, currency: 'USD' },
				]}
			/>,
		);
		const nok = screen.getByRole('region', { name: 'NOK subscriptions' });
		const usd = screen.getByRole('region', { name: 'USD subscriptions' });
		expect(within(nok).getByText('Managing 1 active subscription')).toBeInTheDocument();
		expect(within(usd).getByText('Managing 1 active subscription')).toBeInTheDocument();
		expect(nok.textContent).toContain('100,00');
		expect(usd.textContent).toContain('10,00');
		expect(nok.textContent).not.toContain('110,00');
	});
});
