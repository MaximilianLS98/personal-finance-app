import { monthlySubscriptionCost } from '../subscription-costs';

it.each([
	['monthly', 120, undefined, 120],
	['quarterly', 120, undefined, 40],
	['annually', 120, undefined, 10],
	['custom', 120, 30.44, 120],
] as const)(
	'normalizes %s billing consistently',
	(billingFrequency, amount, customFrequencyDays, expected) => {
		expect(monthlySubscriptionCost({ billingFrequency, amount, customFrequencyDays })).toBeCloseTo(
			expected,
		);
	},
);
it.each([undefined, 0, -1, NaN])('rejects invalid custom intervals: %s', (customFrequencyDays) => {
	expect(() =>
		monthlySubscriptionCost({ billingFrequency: 'custom', amount: 100, customFrequencyDays }),
	).toThrow('Custom frequency requires');
});
