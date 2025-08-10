'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import FileUpload from '@/app/components/FileUpload';
import SimpleCategorySelector from '@/components/SimpleCategorySelector';
import { Transaction, Category, CategorySuggestion } from '@/lib/types';
import { getTransactionTypeStyle, getTransactionTypeLabel } from '@/lib/transaction-utils';
import {
	Pencil,
	Trash2,
	Upload,
	Plus,
	Calendar as CalendarIcon,
	Filter,
	X,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Sparkles,
	ChevronUp,
	ChevronDown,
	CheckCircle2,
} from 'lucide-react';
import {
	format,
	startOfDay,
	endOfDay,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	startOfYear,
	endOfYear,
	subDays,
	subWeeks,
	subMonths,
	isAfter,
	isBefore,
	isWithinInterval,
} from 'date-fns';
import {
	useCategoriesQuery,
	useDeleteTransactionMutation,
	useTransactionsQuery,
	useUpdateTransactionMutation,
	prefetchTransactions,
	useSuggestCategoryMutation,
	useSuggestBulkMutation,
	useLearnFromActionMutation,
} from '@/lib/queries';
import { useTransactionsFilters } from '@/lib/stores/filters';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrencySettings } from '@/app/providers';

interface EditTransaction {
	id: string;
	date: string;
	description: string;
	amount: string;
	type: 'income' | 'expense' | 'transfer';
	categoryId?: string;
}

interface DateRange {
	from?: Date;
	to?: Date;
}

interface FilterState {
	dateRange: DateRange;
	transactionType: 'all' | 'income' | 'expense' | 'transfer';
	searchTerm: string;
	preset: string;
}

interface PaginationState {
	currentPage: number;
	pageSize: number;
}

type SortField = 'date' | 'description' | 'category' | 'type' | 'amount';
type SortDirection = 'asc' | 'desc';

interface SortState {
	field: SortField | null;
	direction: SortDirection;
}

const DATE_PRESETS = {
	all: { label: 'All Time', getValue: () => ({ from: undefined, to: undefined }) },
	today: {
		label: 'Today',
		getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
	},
	yesterday: {
		label: 'Yesterday',
		getValue: () => ({
			from: startOfDay(subDays(new Date(), 1)),
			to: endOfDay(subDays(new Date(), 1)),
		}),
	},
	thisWeek: {
		label: 'This Week',
		getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
	},
	lastWeek: {
		label: 'Last Week',
		getValue: () => ({
			from: startOfDay(subDays(new Date(), 1)),
			to: endOfDay(subDays(new Date(), 1)),
		}),
	},
	thisMonth: {
		label: 'This Month',
		getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
	},
	lastMonth: {
		label: 'Last Month',
		getValue: () => ({
			from: startOfMonth(subDays(new Date(), 1)),
			to: endOfMonth(subDays(new Date(), 1)),
		}),
	},
	last30Days: {
		label: 'Last 30 Days',
		getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }),
	},
	last90Days: {
		label: 'Last 90 Days',
		getValue: () => ({ from: subDays(new Date(), 90), to: new Date() }),
	},
	thisYear: {
		label: 'This Year',
		getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }),
	},
	custom: { label: 'Custom Range', getValue: () => ({ from: undefined, to: undefined }) },
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

// Cache configuration for adjacent page prefetching
const PREFETCH_CONFIG = {
	maxCacheSize: 10, // Maximum number of pages to keep in memory
	adjacentPages: 1, // Number of adjacent pages to prefetch (1 = previous + next)
};

export default function TransactionsPage() {
	const [editingTransaction, setEditingTransaction] = useState<EditTransaction | null>(null);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [editError, setEditError] = useState<string | null>(null);

	// AI suggestion state
	const [suggestions, setSuggestions] = useState<Record<string, CategorySuggestion | null>>({});
	const [loadingSuggestions, setLoadingSuggestions] = useState<Set<string>>(new Set());
	const [isBulkSuggesting, setIsBulkSuggesting] = useState(false);
	const [isAcceptingAllSuggestions, setIsAcceptingAllSuggestions] = useState(false);

	const queryClient = useQueryClient();
	const { data: categories = [] } = useCategoriesQuery();
	const {
		dateRange,
		transactionType,
		searchTerm,
		preset,
		sortField,
		sortDirection,
		page,
		pageSize,
		selectedCategoryIds,
		includeUncategorized,
		setState,
	} = useTransactionsFilters();

	const currentParams = {
		page,
		limit: pageSize,
		sortBy: sortField ?? undefined,
		sortOrder: (sortDirection || 'desc').toUpperCase() as 'ASC' | 'DESC',
		type: transactionType,
		search: searchTerm || undefined,
		from: dateRange.from,
		to: dateRange.to,
		categories: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
		includeUncategorized: includeUncategorized || undefined,
	};

	const { data: txData, isLoading, isError, error } = useTransactionsQuery(currentParams);

	type TxResponse = { success: boolean; data: Transaction[]; pagination: { total: number } };
	const transactions = (txData as TxResponse | undefined)?.data ?? [];
	const totalCount = (txData as TxResponse | undefined)?.pagination?.total ?? 0;
	const totalPages = Math.ceil(totalCount / pageSize) || 1;

	// Prefetch adjacent pages when page or filters/sort change
	useEffect(() => {
		const nextPage = page + 1;
		const prevPage = page - 1;
		if (nextPage <= totalPages) {
			prefetchTransactions(queryClient, { ...currentParams, page: nextPage });
		}
		if (prevPage >= 1) {
			prefetchTransactions(queryClient, { ...currentParams, page: prevPage });
		}
	}, [
		page,
		pageSize,
		sortField,
		sortDirection,
		dateRange.from,
		dateRange.to,
		transactionType,
		searchTerm,
		totalPages,
	]);

	const updateTx = useUpdateTransactionMutation();
	const deleteTx = useDeleteTransactionMutation();

	// AI suggestion mutations
	const suggestOne = useSuggestCategoryMutation();
	const suggestBulk = useSuggestBulkMutation();
	const learnFromAction = useLearnFromActionMutation();

	const handleGetSuggestion = async (transactionId: string, description: string) => {
		setLoadingSuggestions((prev) => new Set(prev).add(transactionId));
		try {
			const suggestion = await suggestOne.mutateAsync(description);
			setSuggestions((prev) => ({ ...prev, [transactionId]: suggestion }));
		} catch (err) {
			console.warn('Failed to get suggestion', err);
		} finally {
			setLoadingSuggestions((prev) => {
				const set = new Set(prev);
				set.delete(transactionId);
				return set;
			});
		}
	};

	const handleCategoryChangeWithLearning = async (
		transactionId: string,
		description: string,
		categoryId: string | undefined,
	) => {
		try {
			await updateTx.mutateAsync({ id: transactionId, updates: { categoryId } });
			const suggestion = suggestions[transactionId];
			if (suggestion && categoryId) {
				const wasCorrectSuggestion = suggestion.category.id === categoryId;
				// fire-and-forget learning
				learnFromAction.mutate({ description, categoryId, wasCorrectSuggestion });
			}
			// Clear applied suggestion for cleaner UI
			setSuggestions((prev) => {
				const next = { ...prev };
				delete next[transactionId];
				return next;
			});
		} catch (err) {
			console.error('Error updating category', err);
		}
	};

	const handleBulkSuggestions = async () => {
		const uncategorized = transactions.filter((t) => !t.categoryId);
		if (uncategorized.length === 0) return;
		setIsBulkSuggesting(true);
		try {
			const payload = uncategorized.map((t) => ({ id: t.id, description: t.description }));
			const result = await suggestBulk.mutateAsync(payload);
			setSuggestions((prev) => ({ ...prev, ...result.suggestions }));
		} catch (err) {
			console.warn('Bulk suggestions failed', err);
		} finally {
			setIsBulkSuggesting(false);
		}
	};

	const handleAcceptAllSuggestions = async () => {
		const withSuggestions = transactions.filter((t) => suggestions[t.id] && !t.categoryId);
		if (withSuggestions.length === 0) return;
		setIsAcceptingAllSuggestions(true);
		try {
			await Promise.all(
				withSuggestions.map((t) => {
					const sug = suggestions[t.id]!;
					return updateTx.mutateAsync({
						id: t.id,
						updates: { categoryId: sug.category.id },
					});
				}),
			);
			// clear accepted suggestions
			setSuggestions((prev) => {
				const next = { ...prev };
				withSuggestions.forEach((t) => delete next[t.id]);
				return next;
			});
		} catch (err) {
			console.error('Accept all suggestions failed', err);
		} finally {
			setIsAcceptingAllSuggestions(false);
		}
	};

	const activeFiltersCount = useMemo(() => {
		let count = 0;
		if (preset !== 'all') count++;
		if (transactionType !== 'all') count++;
		if (searchTerm) count++;
		if (selectedCategoryIds.length > 0) count++;
		if (includeUncategorized) count++;
		return count;
	}, [preset, transactionType, searchTerm, selectedCategoryIds.length, includeUncategorized]);

	const handleSort = (field: SortField) => {
		setState((prev) => {
			if (prev.sortField === field) {
				return {
					...prev,
					sortField: field,
					sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc',
					page: 1,
				};
			}
			return {
				...prev,
				sortField: field,
				sortDirection: field === 'amount' ? 'desc' : 'asc',
				page: 1,
			};
		});
	};

	const handleSaveEdit = async () => {
		if (!editingTransaction) return;
		try {
			setEditError(null);
			const updates = {
				date: new Date(editingTransaction.date),
				description: editingTransaction.description,
				amount:
					editingTransaction.type === 'expense'
						? -Math.abs(Number(editingTransaction.amount))
						: editingTransaction.type === 'transfer'
							? Number(editingTransaction.amount)
							: Math.abs(Number(editingTransaction.amount)),
				type: editingTransaction.type,
				categoryId: editingTransaction.categoryId,
			};
			await updateTx.mutateAsync({ id: editingTransaction.id, updates });
			setIsEditDialogOpen(false);
			setEditingTransaction(null);
		} catch (err) {
			setEditError(err instanceof Error ? err.message : 'Unknown error');
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this transaction?')) return;
		try {
			setDeleteError(null);
			await deleteTx.mutateAsync(id);
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : 'Unknown error');
		}
	};

	const handleUpdateTransactionCategory = async (
		transactionId: string,
		categoryId: string | undefined,
	) => {
		try {
			await updateTx.mutateAsync({ id: transactionId, updates: { categoryId } });
		} catch (error) {
			console.error('Error updating transaction category:', error);
		}
	};

	const handleDateRangeChange = (range: DateRange) => {
		setState((prev) => ({ ...prev, dateRange: range, preset: 'custom', page: 1 }));
	};

	const handleSearchChange = (value: string) =>
		setState((prev) => ({ ...prev, searchTerm: value, page: 1 }));

	const handleTypeFilterChange = (type: 'all' | 'income' | 'expense' | 'transfer') =>
		setState((prev) => ({ ...prev, transactionType: type, page: 1 }));

	const handlePresetChange = (presetKey: string) => {
		const dateRange = DATE_PRESETS[presetKey as keyof typeof DATE_PRESETS]?.getValue() || {
			from: undefined,
			to: undefined,
		};
		setState((prev) => ({ ...prev, preset: presetKey, dateRange, page: 1 }));
	};

	const clearAllFilters = () =>
		setState((prev) => ({
			...prev,
			dateRange: { from: undefined, to: undefined },
			transactionType: 'all',
			searchTerm: '',
			preset: 'all',
			selectedCategoryIds: [],
			includeUncategorized: false,
			page: 1,
		}));

	const handlePageChange = (nextPage: number) =>
		setState((prev) => ({ ...prev, page: Math.max(1, Math.min(nextPage, totalPages)) }));
	const handlePageSizeChange = (size: number) =>
		setState((prev) => ({ ...prev, page: 1, pageSize: size }));

	const canGoPrevious = page > 1;
	const canGoNext = page < totalPages;

	const { currency: appCurrency, locale: appLocale } = useCurrencySettings();

	const formatCurrency = (amount: number, currencyOverride?: string) =>
		new Intl.NumberFormat(appLocale, {
			style: 'currency',
			currency: currencyOverride ?? appCurrency,
		}).format(Math.abs(amount));

	const SortableHeader = ({
		field,
		children,
		className = '',
	}: {
		field: SortField | null;
		children: React.ReactNode;
		className?: string;
	}) => {
		const isActive = sortField === field;
		const direction = isActive ? sortDirection : null;
		return (
			<TableHead
				className={`${field ? 'cursor-pointer select-none hover:bg-accent/40' : ''} ${isActive ? 'bg-accent/30 text-foreground' : ''} ${className}`}
				onClick={() => field && handleSort(field)}>
				<div className='flex items-center gap-1'>
					<span className={isActive ? 'text-blue-900 font-medium' : ''}>{children}</span>
					{field && (
						<div className='flex flex-col opacity-60 hover:opacity-100'>
							<ChevronUp
								className={`h-3 w-3 ${isActive && direction === 'asc' ? 'text-primary' : 'text-muted-foreground'}`}
							/>
							<ChevronDown
								className={`h-3 w-3 -mt-1 ${isActive && direction === 'desc' ? 'text-primary' : 'text-muted-foreground'}`}
							/>
						</div>
					)}
				</div>
			</TableHead>
		);
	};

	const formatDate = (date: Date | string) =>
		new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		}).format(new Date(date));

	return (
		<div className='max-w-7xl mx-auto p-6 space-y-8'>
			{/* Header */}
			<div className='flex justify-between items-center'>
				<div>
					<h1 className='text-3xl font-bold text-foreground'>Transactions</h1>
					<p className='text-muted-foreground mt-2'>
						View and manage all your uploaded transactions ({transactions.length} of{' '}
						{totalCount})
					</p>
				</div>
				<div className='flex gap-2'>
					<Button
						variant='outline'
						onClick={handleBulkSuggestions}
						disabled={
							isBulkSuggesting ||
							transactions.filter((t) => !t.categoryId).length === 0
						}>
						{isBulkSuggesting ? (
							<>
								<Sparkles className='mr-2 h-4 w-4 animate-pulse' />
								Getting Suggestions...
							</>
						) : (
							<>
								<Sparkles className='mr-2 h-4 w-4' />
								Suggest Categories
							</>
						)}
					</Button>

					{(() => {
						const suggestionsToAccept = transactions.filter(
							(t) => suggestions[t.id] && !t.categoryId,
						);
						return (
							suggestionsToAccept.length > 0 && (
								<Button
									variant='default'
									onClick={handleAcceptAllSuggestions}
									disabled={isAcceptingAllSuggestions}
									className='bg-green-600 hover:bg-green-700'>
									{isAcceptingAllSuggestions ? (
										<>
											<CheckCircle2 className='mr-2 h-4 w-4 animate-pulse' />
											Accepting...
										</>
									) : (
										<>
											<CheckCircle2 className='mr-2 h-4 w-4' />
											Accept All ({suggestionsToAccept.length})
										</>
									)}
								</Button>
							)
						);
					})()}
					<Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
						<DialogTrigger asChild>
							<Button>
								<Upload className='mr-2 h-4 w-4' />
								Upload Transactions
							</Button>
						</DialogTrigger>
						<DialogContent className='sm:max-w-md'>
							<DialogHeader>
								<DialogTitle>Upload New Transactions</DialogTitle>
								<DialogDescription>
									Upload a CSV file with new transactions to add to your account.
								</DialogDescription>
							</DialogHeader>
							<FileUpload
								onUploadSuccess={() => setIsUploadDialogOpen(false)}
								onUploadError={(e) => setDeleteError(e)}
							/>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			{/* Filters */}
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<CardTitle className='flex items-center'>
							<Filter className='mr-2 h-5 w-5' />
							Filters
							{activeFiltersCount > 0 && (
								<span className='ml-2 bg-primary text-primary-foreground rounded-full px-2 py-1 text-xs'>
									{activeFiltersCount}
								</span>
							)}
						</CardTitle>
						{activeFiltersCount > 0 && (
							<Button variant='outline' size='sm' onClick={clearAllFilters}>
								<X className='mr-2 h-4 w-4' />
								Clear All
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent className='space-y-4'>
					{/* Search and Type Filter Row */}
					<div className='flex gap-4 flex-wrap'>
						<div className='flex-1 min-w-[200px]'>
							<Label htmlFor='search'>Search Transactions</Label>
							<Input
								id='search'
								placeholder='Search by description...'
								value={searchTerm}
								onChange={(e) => handleSearchChange(e.target.value)}
								className='mt-1'
							/>
						</div>
						<div className='min-w-[150px]'>
							<Label htmlFor='type-filter'>Transaction Type</Label>
							<Select value={transactionType} onValueChange={handleTypeFilterChange}>
								<SelectTrigger className='mt-1'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='all'>All Types</SelectItem>
									<SelectItem value='income'>Income Only</SelectItem>
									<SelectItem value='expense'>Expense Only</SelectItem>
									<SelectItem value='transfer'>Transfer Only</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Date Filter Row */}
					<div className='flex gap-4 flex-wrap items-end'>
						<div className='min-w-[200px]'>
							<Label htmlFor='date-preset'>Date Range</Label>
							<Select value={preset} onValueChange={handlePresetChange}>
								<SelectTrigger className='mt-1'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(DATE_PRESETS).map(([key, p]) => (
										<SelectItem key={key} value={key}>
											{p.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Category Filter Row */}
						<div className='flex gap-4 flex-wrap items-end'>
							<div className='min-w-[240px] flex-1'>
								<Label htmlFor='category-filter'>Categories</Label>
								<div className='mt-1 flex flex-wrap gap-2'>
									{/* Multi-select using simple checkboxes in a popover list */}
									<Popover>
										<PopoverTrigger asChild>
											<Button variant='outline'>
												{selectedCategoryIds.length === 0 &&
												!includeUncategorized
													? 'All categories'
													: `${selectedCategoryIds.length} selected${includeUncategorized ? ' + uncategorized' : ''}`}
											</Button>
										</PopoverTrigger>
										<PopoverContent className='w-72 p-2'>
											<div className='space-y-2 max-h-72 overflow-auto'>
												<div className='flex items-center justify-between'>
													<Label className='text-sm'>
														Include uncategorized
													</Label>
													<input
														type='checkbox'
														checked={includeUncategorized}
														onChange={(e) =>
															setState((prev) => ({
																...prev,
																includeUncategorized:
																	e.target.checked,
																page: 1,
															}))
														}
													/>
												</div>
												<div className='h-px bg-border my-1' />
												<div className='space-y-1'>
													{categories.map((c) => {
														const checked =
															selectedCategoryIds.includes(c.id);
														return (
															<label
																key={c.id}
																className='flex items-center gap-2 text-sm'>
																<input
																	type='checkbox'
																	checked={checked}
																	onChange={(e) =>
																		setState((prev) => ({
																			...prev,
																			selectedCategoryIds: e
																				.target.checked
																				? [
																						...prev.selectedCategoryIds,
																						c.id,
																					]
																				: prev.selectedCategoryIds.filter(
																						(id) =>
																							id !==
																							c.id,
																					),
																			page: 1,
																		}))
																	}
																/>
																<span className='inline-flex items-center gap-2'>
																	<span
																		className='w-3 h-3 rounded-full inline-block'
																		style={{
																			backgroundColor:
																				c.color,
																		}}
																	/>
																	{c.name}
																</span>
															</label>
														);
													})}
												</div>
												<div className='h-px bg-border my-1' />
												<div className='flex justify-between'>
													<Button
														variant='ghost'
														size='sm'
														onClick={() =>
															setState((prev) => ({
																...prev,
																selectedCategoryIds: [],
																includeUncategorized: false,
																page: 1,
															}))
														}>
														Clear
													</Button>
													<Button
														variant='outline'
														size='sm'
														onClick={() =>
															setState((prev) => ({
																...prev,
																selectedCategoryIds: categories.map(
																	(c) => c.id,
																),
																page: 1,
															}))
														}>
														Select all
													</Button>
												</div>
											</div>
										</PopoverContent>
									</Popover>
								</div>
							</div>
						</div>

						{preset === 'custom' && (
							<>
								<div className='min-w-[150px]'>
									<Label>From Date</Label>
									<Popover>
										<PopoverTrigger asChild>
											<Button
												variant='outline'
												className='mt-1 w-full justify-start text-left font-normal'>
												<CalendarIcon className='mr-2 h-4 w-4' />
												{dateRange.from
													? format(dateRange.from, 'MMM dd, yyyy')
													: 'Pick a date'}
											</Button>
										</PopoverTrigger>
										<PopoverContent className='w-auto p-0'>
											<Calendar
												mode='single'
												selected={dateRange.from}
												onSelect={(date) =>
													handleDateRangeChange({
														...dateRange,
														from: date,
													})
												}
												initialFocus
											/>
										</PopoverContent>
									</Popover>
								</div>
								<div className='min-w-[150px]'>
									<Label>To Date</Label>
									<Popover>
										<PopoverTrigger asChild>
											<Button
												variant='outline'
												className='mt-1 w-full justify-start text-left font-normal'>
												<CalendarIcon className='mr-2 h-4 w-4' />
												{dateRange.to
													? format(dateRange.to, 'MMM dd, yyyy')
													: 'Pick a date'}
											</Button>
										</PopoverTrigger>
										<PopoverContent className='w-auto p-0'>
											<Calendar
												mode='single'
												selected={dateRange.to}
												onSelect={(date) =>
													handleDateRangeChange({
														...dateRange,
														to: date,
													})
												}
												initialFocus
											/>
										</PopoverContent>
									</Popover>
								</div>
							</>
						)}
					</div>

					{/* Active Filters Summary */}
					{(dateRange.from ||
						dateRange.to ||
						transactionType !== 'all' ||
						searchTerm ||
						selectedCategoryIds.length > 0 ||
						includeUncategorized) && (
						<div className='flex flex-wrap gap-2 pt-2 border-t'>
							<span className='text-sm font-medium text-muted-foreground'>
								Active filters:
							</span>
							{searchTerm && (
								<span className='bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs'>
									Search: "{searchTerm}"
								</span>
							)}
							{transactionType !== 'all' && (
								<span className='bg-green-100 text-green-800 px-2 py-1 rounded text-xs'>
									Type: {transactionType}
								</span>
							)}
							{dateRange.from && (
								<span className='bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs'>
									From: {format(dateRange.from, 'MMM dd, yyyy')}
								</span>
							)}
							{dateRange.to && (
								<span className='bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs'>
									To: {format(dateRange.to, 'MMM dd, yyyy')}
								</span>
							)}
							{(selectedCategoryIds.length > 0 || includeUncategorized) && (
								<span className='bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs'>
									Categories:{' '}
									{selectedCategoryIds.length > 0
										? `${selectedCategoryIds.length} selected`
										: 'none'}
									{includeUncategorized ? ' + uncategorized' : ''}
								</span>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Error Alerts */}
			{(isError || deleteError) && (
				<Alert variant='destructive'>
					<AlertDescription>{(error as Error)?.message || deleteError}</AlertDescription>
				</Alert>
			)}

			{/* Transactions Table */}
			<Card>
				<CardHeader>
					<CardTitle>
						{transactions.length === totalCount
							? `All Transactions (${totalCount})`
							: `Filtered Transactions (${totalCount} of ${totalCount})`}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className='text-center py-8'>Loading transactions...</div>
					) : transactions.length === 0 ? (
						<div className='text-center py-8 text-muted-foreground'>
							No transactions found. Upload a CSV file to get started.
						</div>
					) : (
						<Table>
							<TableCaption>
								{transactions.length === totalCount
									? 'A list of all your uploaded transactions.'
									: `Showing ${transactions.length} transactions matching your filters.`}
							</TableCaption>
							<TableHeader>
								<TableRow>
									<SortableHeader field='date'>Date</SortableHeader>
									<SortableHeader field='description'>Description</SortableHeader>
									<SortableHeader field='category'>Category</SortableHeader>
									<SortableHeader field='type'>Type</SortableHeader>
									<SortableHeader field='amount' className='text-right'>
										Amount
									</SortableHeader>
									<SortableHeader field={null} className='text-right'>
										Actions
									</SortableHeader>
								</TableRow>
							</TableHeader>
							<TableBody>
								{transactions.map((transaction) => (
									<TableRow key={transaction.id}>
										<TableCell className='font-medium'>
											{formatDate(transaction.date)}
										</TableCell>
										<TableCell>{transaction.description}</TableCell>
										<TableCell>
											<SimpleCategorySelector
												categories={categories}
												currentCategoryId={transaction.categoryId}
												onCategoryChange={(categoryId) =>
													handleCategoryChangeWithLearning(
														transaction.id,
														transaction.description,
														categoryId,
													)
												}
												onSuggestRequest={() =>
													handleGetSuggestion(
														transaction.id,
														transaction.description,
													)
												}
												suggestion={suggestions[transaction.id]}
												isLoadingSuggestion={loadingSuggestions.has(
													transaction.id,
												)}
												compact={true}
											/>
										</TableCell>
										<TableCell>
											<span
												className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTransactionTypeStyle(transaction.type).badgeClass}`}>
												{getTransactionTypeLabel(transaction.type)}
											</span>
										</TableCell>
										<TableCell
											className={`text-right font-medium ${getTransactionTypeStyle(transaction.type).amountClass}`}>
											{transaction.type === 'income'
												? '+'
												: transaction.type === 'transfer'
													? '±'
													: '-'}
											{formatCurrency(
												transaction.amount,
												transaction.currency,
											)}
										</TableCell>
										<TableCell className='text-right'>
											<div className='flex justify-end space-x-2'>
												<Button
													variant='outline'
													size='sm'
													onClick={() => {
														setEditingTransaction({
															id: transaction.id,
															date: new Date(transaction.date)
																.toISOString()
																.split('T')[0],
															description: transaction.description,
															amount: Math.abs(
																transaction.amount,
															).toString(),
															type: transaction.type,
															categoryId: transaction.categoryId,
														});
														setIsEditDialogOpen(true);
													}}>
													<Pencil className='h-4 w-4' />
												</Button>
												<Button
													variant='outline'
													size='sm'
													onClick={() => handleDelete(transaction.id)}>
													<Trash2 className='h-4 w-4' />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}

					{/* Pagination Controls */}
					{transactions.length > 0 && (
						<div className='flex items-center justify-between mt-6 pt-4 border-t'>
							<div className='flex items-center space-x-2'>
								<span className='text-sm text-muted-foreground'>
									{(() => {
										const startIndex = (page - 1) * pageSize + 1;
										const endIndex = Math.min(page * pageSize, totalCount);
										return `Showing ${startIndex} to ${endIndex} of ${totalCount} transactions`;
									})()}
								</span>
							</div>

							<div className='flex items-center space-x-4'>
								{/* Page Size Selector */}
								<div className='flex items-center space-x-2'>
									<span className='text-sm text-muted-foreground'>Show:</span>
									<Select
										value={pageSize.toString()}
										onValueChange={(value) =>
											handlePageSizeChange(Number(value))
										}>
										<SelectTrigger className='w-20'>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PAGE_SIZE_OPTIONS.map((size) => (
												<SelectItem key={size} value={size.toString()}>
													{size}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Pagination Navigation */}
								{totalPages > 1 && (
									<div className='flex items-center space-x-2'>
										<Button
											variant='outline'
											size='sm'
											onClick={() => handlePageChange(1)}
											disabled={!canGoPrevious}>
											<ChevronsLeft className='h-4 w-4' />
										</Button>
										<Button
											variant='outline'
											size='sm'
											onClick={() => handlePageChange(page - 1)}
											disabled={!canGoPrevious}>
											<ChevronLeft className='h-4 w-4' />
										</Button>
										<span className='text-sm text-muted-foreground min-w-[100px] text-center'>
											Page {page} of {totalPages}
										</span>
										<Button
											variant='outline'
											size='sm'
											onClick={() => handlePageChange(page + 1)}
											disabled={!canGoNext}>
											<ChevronRight className='h-4 w-4' />
										</Button>
										<Button
											variant='outline'
											size='sm'
											onClick={() => handlePageChange(totalPages)}
											disabled={!canGoNext}>
											<ChevronsRight className='h-4 w-4' />
										</Button>
									</div>
								)}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Edit Transaction Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent className='sm:max-w-[425px]'>
					<DialogHeader>
						<DialogTitle>Edit Transaction</DialogTitle>
						<DialogDescription>
							Make changes to the transaction details below.
						</DialogDescription>
					</DialogHeader>
					{editingTransaction && (
						<div className='grid gap-4 py-4'>
							{editError && (
								<Alert variant='destructive'>
									<AlertDescription>{editError}</AlertDescription>
								</Alert>
							)}
							<div className='grid grid-cols-4 items-center gap-4'>
								<Label htmlFor='edit-date' className='text-right'>
									Date
								</Label>
								<Input
									id='edit-date'
									type='date'
									value={editingTransaction.date}
									onChange={(e) =>
										setEditingTransaction({
											...editingTransaction,
											date: e.target.value,
										})
									}
									className='col-span-3'
								/>
							</div>
							<div className='grid grid-cols-4 items-center gap-4'>
								<Label htmlFor='edit-description' className='text-right'>
									Description
								</Label>
								<Textarea
									id='edit-description'
									value={editingTransaction.description}
									onChange={(e) =>
										setEditingTransaction({
											...editingTransaction,
											description: e.target.value,
										})
									}
									className='col-span-3'
									rows={2}
								/>
							</div>
							<div className='grid grid-cols-4 items-center gap-4'>
								<Label htmlFor='edit-amount' className='text-right'>
									Amount
								</Label>
								<Input
									id='edit-amount'
									type='number'
									step='0.01'
									value={editingTransaction.amount}
									onChange={(e) =>
										setEditingTransaction({
											...editingTransaction,
											amount: e.target.value,
										})
									}
									className='col-span-3'
								/>
							</div>
							<div className='grid grid-cols-4 items-center gap-4'>
								<Label htmlFor='edit-type' className='text-right'>
									Type
								</Label>
								<Select
									value={editingTransaction.type}
									onValueChange={(value: 'income' | 'expense' | 'transfer') =>
										setEditingTransaction({
											...editingTransaction,
											type: value,
										})
									}>
									<SelectTrigger className='col-span-3'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='income'>Income</SelectItem>
										<SelectItem value='expense'>Expense</SelectItem>
										<SelectItem value='transfer'>Transfer</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className='grid grid-cols-4 items-start gap-4'>
								<Label className='text-right pt-2'>Category</Label>
								<div className='col-span-3'>
									<SimpleCategorySelector
										categories={categories}
										currentCategoryId={editingTransaction.categoryId}
										onCategoryChange={(categoryId) =>
											setEditingTransaction({
												...editingTransaction,
												categoryId,
											})
										}
										compact={false}
									/>
								</div>
							</div>
							<div className='flex justify-end space-x-2 pt-4'>
								<Button
									variant='outline'
									onClick={() => setIsEditDialogOpen(false)}>
									Cancel
								</Button>
								<Button onClick={handleSaveEdit}>Save Changes</Button>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
