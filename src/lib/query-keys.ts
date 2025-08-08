export const queryKeys = {
	summary: () => ['summary'] as const,
	categories: () => ['categories'] as const,
	categoryRules: () => ['category-rules'] as const,
	dashboard: (params: { from?: string; to?: string; interval: 'day' | 'week' | 'month' }) =>
		['dashboard', params] as const,
	transactions: (params: Record<string, unknown>) => ['transactions', params] as const,
};
