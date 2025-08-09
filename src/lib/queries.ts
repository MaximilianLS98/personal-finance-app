'use client';

import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { getJson, postJson, putJson, deleteJson } from './api';
import { queryKeys } from './query-keys';
import type {
	FinancialSummary,
	Transaction,
	Category,
	CategoryRule,
	CategorySuggestion,
} from './types';
import { format as formatDate } from 'date-fns';

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
			return getJson<any>(`/api/dashboard?${search.toString()}`);
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
}

export const buildTransactionsSearchParams = (params: TransactionsQueryParams) => {
	const search = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
	if (params.sortBy) search.append('sortBy', params.sortBy);
	if (params.sortOrder) search.append('sortOrder', params.sortOrder);
	if (params.type && params.type !== 'all') search.append('type', params.type);
	if (params.search) search.append('search', params.search);
	if (params.from) search.append('from', params.from.toISOString());
	if (params.to) search.append('to', params.to.toISOString());
	return search;
};

export const transactionsKey = (params: TransactionsQueryParams) =>
	queryKeys.transactions(Object.fromEntries(buildTransactionsSearchParams(params).entries()));

export type TransactionsResponse = {
	success: boolean;
	data: Transaction[];
	pagination: { total: number };
};

export const fetchTransactions = (params: TransactionsQueryParams) => {
	const search = buildTransactionsSearchParams(params);
	return getJson<TransactionsResponse>(`/api/transactions?${search.toString()}`);
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

// Upload CSV
export const useUploadMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (file: File) => {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch('/api/upload', { method: 'POST', body: formData });
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data?.message || 'Upload failed');
			}
			return res.json();
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.summary() });
			qc.invalidateQueries({ queryKey: ['dashboard'] });
		},
	});
};

// Transaction updates
export const useUpdateTransactionMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, updates }: { id: string; updates: Partial<Transaction> }) => {
			return putJson(`/api/transactions/${id}`, updates);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['transactions'] });
			qc.invalidateQueries({ queryKey: queryKeys.summary() });
			qc.invalidateQueries({ queryKey: ['dashboard'] });
		},
	});
};

export const useDeleteTransactionMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => deleteJson(`/api/transactions/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['transactions'] });
			qc.invalidateQueries({ queryKey: queryKeys.summary() });
			qc.invalidateQueries({ queryKey: ['dashboard'] });
		},
	});
};

// Category CRUD
export const useCreateCategoryMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (payload: Partial<Category>) => postJson<Category>(`/api/categories`, payload),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories() }),
	});
};

export const useUpdateCategoryMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: Partial<Category> }) =>
			putJson<Category>(`/api/categories/${id}`, payload),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories() }),
	});
};

export const useDeleteCategoryMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteJson(`/api/categories/${id}`),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories() }),
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
