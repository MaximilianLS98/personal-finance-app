import { render, screen } from '@testing-library/react';
import { ProjectionCalculator } from '../ProjectionCalculator';
import type { Subscription } from '@/lib/types';
jest.mock('../../../providers', () => ({
	useCurrencySettings: () => ({ currency: 'NOK', locale: 'nb-NO' }),
}));
// Radix measurements are not provided by JSDOM; slider behavior is unrelated to currency rendering.
jest.mock('../../../../components/ui/slider', () => ({ Slider: () => null }));
const base: Subscription = {
	id: 'unknown',
	name: 'Imported service',
	amount: 100,
	currency: 'UNKNOWN',
	billingFrequency: 'monthly',
	nextPaymentDate: new Date('2026-11-01'),
	categoryId: 'cat',
	isActive: true,
	startDate: new Date('2026-01-01'),
	createdAt: new Date(),
	updatedAt: new Date(),
};
it.each(['UNKNOWN', '', null])(
	'does not relabel a subscription currency %s with the display preference',
	(currency) => {
		render(
			<ProjectionCalculator subscription={{ ...base, currency: currency as unknown as string }} />,
		);
		expect(screen.getAllByText(/currency unknown/).length).toBeGreaterThan(0);
		expect(screen.queryByText(/kr/)).not.toBeInTheDocument();
	},
);
