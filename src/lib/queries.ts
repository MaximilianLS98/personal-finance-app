'use client';

import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format as formatDate } from 'date-fns';
import { deleteJson, getJson, postJson, putJson } from './api';
import type { DashboardData } from './dashboard-types';
import { invalidateFinanceQueries, queryKeys } from './query-keys';
import type {
	Category,
	CategoryRule,
	CategorySuggestion,
	FinancialSummary,
	Transaction,
} from './types';

// Summary
export const useSummaryQuery = () =>
	useQuery({
		queryKey: queryKeys.summary(),
		queryFn: async () => {
			const res = await getJson<{ success: boolean; data: FinancialSummary }>('/api/summary');
			return res.data;
		},
	});

// Categories
export const useCategoriesQuery = () =>
	useQuery({
		queryKey: queryKeys.categories(),
		queryFn: () => getJson<Category[]>('/api/categories'),
		staleTime: 1000 * 60,
	});

// Category Rules
export const useCategoryRulesQuery = () =>
	useQuery({
		queryKey: queryKeys.categoryRules(),
		queryFn: () => getJson<CategoryRule[]>('/api/category-rules'),
	});

// Dashboard data
export const useDashboardQuery = (params: {
	from?: Date;
	to?: Date;
	interval: 'day' | 'week' | 'month';
}) =>
	useQuery({
		queryKey: queryKeys.dashboard({
			from: params.from ? formatDate(params.from, 'yyyy-MM-dd') : undefined,
			to: params.to ? formatDate(params.to, 'yyyy-MM-dd') : undefined,
			interval: params.interval,
		}),
		queryFn: async () => {
			const search = new URLSearchParams();
			if (params.from) search.append('from', formatDate(params.from, 'yyyy-MM-dd'));
			if (params.to) search.append('to', formatDate(params.to, 'yyyy-MM-dd'));
			search.append('interval', params.interval);
			return getJson<DashboardData>(`/api/dashboard?${search.toString()}`);
		},
	});

// Transactions - server paginated
export interface TransactionsQueryParams {
	page: number;
	limit: number;
	sortBy?: 'date' | 'description' | 'category' | 'type' | 'amount';
	sortOrder?: 'ASC' | 'DESC';
	type?: 'all' | 'income' | 'expense' | 'transfer';
	search?: string;
	from?: Date;
	to?: Date;
	// Category filtering
	categories?: string[]; // when present, include transactions whose categoryId is in this list
	includeUncategorized?: boolean; // when true, also include categoryId IS NULL
}

export const buildTransactionsSearchParams = (params: TransactionsQueryParams) => {
	const search = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
	if (params.sortBy) search.append('sortBy', params.sortBy);
	if (params.sortOrder) search.append('sortOrder', params.sortOrder);
	if (params.type && params.type !== 'all') search.append('type', params.type);
	if (params.search) search.append('search', params.search);
	if (params.from) search.append('from', params.from.toISOString());
	if (params.to) search.append('to', params.to.toISOString());
	if (params.categories && params.categories.length > 0) {
		// Append multiple categoryIds entries for array semantics
		for (const id of params.categories) search.append('categoryIds', id);
	}
	if (params.includeUncategorized) search.append('includeUncategorized', 'true');
	return search;
};

export const transactionsKey = (params: TransactionsQueryParams) => {
	// Build a stable key object that preserves arrays (categories) and booleans
	const keyParams: Record<string, unknown> = {
		page: params.page,
		limit: params.limit,
		sortBy: params.sortBy,
		sortOrder: params.sortOrder,
		type: params.type,
		search: params.search,
		from: params.from ? params.from.toISOString() : undefined,
		to: params.to ? params.to.toISOString() : undefined,
		categories: params.categories ? [...params.categories].sort() : undefined,
		includeUncategorized: !!params.includeUncategorized,
	};
	return queryKeys.transactions(keyParams);
};

export type TransactionsResponse = {
	success: boolean;
	data: Transaction[];
	pagination: { total: number };
};

export const fetchTransactions = async (params: TransactionsQueryParams) => {
	const search = buildTransactionsSearchParams(params);
	const result = await getJson<TransactionsResponse>(`/api/transactions?${search.toString()}`);
	return {
		...result,
		data: result.data.map((transaction) => ({ ...transaction, date: new Date(transaction.date) })),
	};
};

export const prefetchTransactions = (qc: QueryClient, params: TransactionsQueryParams) =>
	qc.prefetchQuery({
		queryKey: transactionsKey(params),
		queryFn: () => fetchTransactions(params),
	});

export const useTransactionsQuery = (params: TransactionsQueryParams) => {
	return useQuery({
		queryKey: transactionsKey(params),
		queryFn: () => fetchTransactions(params),
		staleTime: 1000 * 30,
	});
};

// Transaction updates
export const useUpdateTransactionMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, updates }: { id: string; updates: Partial<Transaction> }) => {
			return putJson(`/api/transactions/${id}`, updates);
		},
		onSuccess: () => invalidateFinanceQueries(qc),
	});
};

export const useDeleteTransactionMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => deleteJson(`/api/transactions/${id}`),
		onSuccess: () => invalidateFinanceQueries(qc),
	});
};

// Category CRUD
export const useCreateCategoryMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (payload: Partial<Category>) => postJson<Category>(`/api/categories`, payload),
		onSuccess: () => invalidateFinanceQueries(qc),
	});
};

export const useUpdateCategoryMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: Partial<Category> }) =>
			putJson<Category>(`/api/categories/${id}`, payload),
		onSuccess: () => invalidateFinanceQueries(qc),
	});
};

export const useDeleteCategoryMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteJson(`/api/categories/${id}`),
		onSuccess: () => invalidateFinanceQueries(qc),
	});
};

// Suggestions
export const useSuggestCategoryMutation = () =>
	useMutation({
		mutationFn: (description: string) =>
			postJson<CategorySuggestion | null>(`/api/categories/suggest`, { description }),
	});

export const useSuggestBulkMutation = () =>
	useMutation({
		mutationFn: (transactions: Array<{ id: string; description: string }>) =>
			postJson<{ suggestions: Record<string, CategorySuggestion | null> }>(
				`/api/categories/suggest-bulk`,
				{ transactions },
			),
	});

export const useLearnFromActionMutation = () =>
	useMutation({
		mutationFn: (payload: {
			description: string;
			categoryId: string;
			wasCorrectSuggestion: boolean;
		}) => postJson(`/api/categories/learn`, payload),
	});
