import { create } from 'zustand';

export type Interval = 'day' | 'week' | 'month';

export interface DateRange {
	from?: Date;
	to?: Date;
}

export interface DashboardFiltersState {
	dateRange: DateRange;
	preset: string;
	interval: Interval;
	setFilters: (updater: (prev: DashboardFiltersState) => DashboardFiltersState) => void;
}

export const useDashboardFilters = create<DashboardFiltersState>((set) => ({
	dateRange: { from: undefined, to: undefined },
	preset: 'all',
	interval: 'day',
	setFilters: (updater) => set((state) => updater(state)),
}));

export interface TransactionsFiltersState {
	dateRange: DateRange;
	transactionType: 'all' | 'income' | 'expense' | 'transfer';
	searchTerm: string;
	preset: string;
	sortField: 'date' | 'description' | 'category' | 'type' | 'amount' | null;
	sortDirection: 'asc' | 'desc';
	page: number;
	pageSize: number;
	setState: (updater: (prev: TransactionsFiltersState) => TransactionsFiltersState) => void;
}

export const useTransactionsFilters = create<TransactionsFiltersState>((set) => ({
	dateRange: { from: undefined, to: undefined },
	transactionType: 'all',
	searchTerm: '',
	preset: 'all',
	sortField: 'date',
	sortDirection: 'desc',
	page: 1,
	pageSize: 50,
	setState: (updater) => set((state) => updater(state)),
}));
