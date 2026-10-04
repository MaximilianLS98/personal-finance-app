import type { QueryClient } from '@tanstack/react-query';
export const queryKeys = {
	summary: () => ['summary'] as const,
	categories: () => ['categories'] as const,
	categoryRules: () => ['category-rules'] as const,
	dashboard: (params: {
		from?: string;
		to?: string;
		interval: 'day' | 'week' | 'month';
		currency?: string;
	}) => ['dashboard', params] as const,
	transactions: (params: Record<string, unknown>) => ['transactions', params] as const,
};

/** Mutations can affect reports, subscription analysis, and budget progress together. */
export function invalidateFinanceQueries(client: QueryClient) {
	return client.invalidateQueries({
		predicate: ({ queryKey }) => {
			const root = String(queryKey[0]);
			return (
				[
					'summary',
					'accounts',
					'imports',
					'transfers',
					'review',
					'overview',
					'transaction-details',
					'goals',
					'dashboard',
					'transactions',
					'categories',
					'category-rules',
					'projections',
				].includes(root) ||
				root.startsWith('subscription') ||
				root.startsWith('budget')
			);
		},
	});
}
