'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
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
import Layout from '@/app/components/Layout';
import FileUpload from '@/app/components/FileUpload';
import CategorySelector from '@/components/CategorySelector';
import SimpleCategorySelector from '@/components/SimpleCategorySelector';
import { Transaction, Category, CategorySuggestion } from '@/lib/types';
import { getTransactionTypeStyle, getTransactionTypeLabel } from '@/lib/transaction-utils';
import { Pencil, Trash2, Upload, Plus, Calendar as CalendarIcon, Filter, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths, isAfter, isBefore, isWithinInterval } from 'date-fns';

interface EditTransaction {
	id: string;
	date: string;
	description: string;
	amount: string;
	type: 'income' | 'expense' | 'transfer';
	categoryId?: string;
}

interface DateRange {
	from: Date | undefined;
	to: Date | undefined;
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
	today: { label: 'Today', getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
	yesterday: { label: 'Yesterday', getValue: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
	thisWeek: { label: 'This Week', getValue: () => ({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) }) },
	lastWeek: { label: 'Last Week', getValue: () => ({ from: startOfWeek(subWeeks(new Date(), 1)), to: endOfWeek(subWeeks(new Date(), 1)) }) },
	thisMonth: { label: 'This Month', getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
	lastMonth: { label: 'Last Month', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
	last30Days: { label: 'Last 30 Days', getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
	last90Days: { label: 'Last 90 Days', getValue: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
	thisYear: { label: 'This Year', getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
	custom: { label: 'Custom Range', getValue: () => ({ from: undefined, to: undefined }) },
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export default function TransactionsPage() {
	const [transactions, setTransactions] = useState<Transaction[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editingTransaction, setEditingTransaction] = useState<EditTransaction | null>(null);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [editError, setEditError] = useState<string | null>(null);

	// Category state
	const [categories, setCategories] = useState<Category[]>([]);
	const [suggestions, setSuggestions] = useState<Record<string, CategorySuggestion | null>>({});
	const [loadingSuggestions, setLoadingSuggestions] = useState<Set<string>>(new Set());
	const [isBulkSuggesting, setIsBulkSuggesting] = useState(false);

	// Filter state
	const [filters, setFilters] = useState<FilterState>({
		dateRange: { from: undefined, to: undefined },
		transactionType: 'all',
		searchTerm: '',
		preset: 'all',
	});
	const [isFilterOpen, setIsFilterOpen] = useState(false);

	// Pagination state
	const [pagination, setPagination] = useState<PaginationState>({
		currentPage: 1,
		pageSize: 50,
	});

	// Sort state
	const [sort, setSort] = useState<SortState>({
		field: 'date',
		direction: 'desc', // Default to newest first
	});

	// Fetch transactions on component mount
	useEffect(() => {
		fetchTransactions();
	}, []);

	// Filtered and sorted transactions
	const filteredTransactions = useMemo(() => {
		let filtered = transactions.filter((transaction) => {
			const transactionDate = new Date(transaction.date);

			// Date range filter
			if (filters.dateRange.from && isBefore(transactionDate, startOfDay(filters.dateRange.from))) {
				return false;
			}
			if (filters.dateRange.to && isAfter(transactionDate, endOfDay(filters.dateRange.to))) {
				return false;
			}

			// Transaction type filter
			if (filters.transactionType !== 'all' && transaction.type !== filters.transactionType) {
				return false;
			}

			// Search term filter
			if (filters.searchTerm && !transaction.description.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
				return false;
			}

			return true;
		});

		// Apply sorting
		if (sort.field) {
			filtered = [...filtered].sort((a, b) => {
				let aValue: any;
				let bValue: any;

				switch (sort.field) {
					case 'date':
						aValue = new Date(a.date).getTime();
						bValue = new Date(b.date).getTime();
						break;
					case 'description':
						aValue = a.description.toLowerCase();
						bValue = b.description.toLowerCase();
						break;
					case 'category':
						const aCategory = categories.find(c => c.id === a.categoryId);
						const bCategory = categories.find(c => c.id === b.categoryId);
						aValue = aCategory?.name.toLowerCase() || 'zzz_uncategorized';
						bValue = bCategory?.name.toLowerCase() || 'zzz_uncategorized';
						break;
					case 'type':
						aValue = a.type;
						bValue = b.type;
						break;
					case 'amount':
						// Sort by actual amount value (including sign) for better financial sorting
						aValue = a.amount;
						bValue = b.amount;
						break;
					default:
						return 0;
				}

				if (aValue < bValue) {
					return sort.direction === 'asc' ? -1 : 1;
				}
				if (aValue > bValue) {
					return sort.direction === 'asc' ? 1 : -1;
				}
				return 0;
			});
		}

		return filtered;
	}, [transactions, filters, sort, categories]);

	// Pagination calculations
	const totalPages = Math.ceil(filteredTransactions.length / pagination.pageSize);
	const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
	const endIndex = startIndex + pagination.pageSize;
	const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

	// Active filters count
	const activeFiltersCount = useMemo(() => {
		let count = 0;
		if (filters.preset !== 'all') count++;
		if (filters.transactionType !== 'all') count++;
		if (filters.searchTerm) count++;
		return count;
	}, [filters]);

	// Reset pagination when filters or sort change
	useEffect(() => {
		setPagination(prev => ({ ...prev, currentPage: 1 }));
	}, [filters, sort]);

	// Sort handler
	const handleSort = (field: SortField) => {
		setSort(prevSort => {
			if (prevSort.field === field) {
				// Toggle direction if same field
				return {
					field,
					direction: prevSort.direction === 'asc' ? 'desc' : 'asc'
				};
			} else {
				// New field, default to descending for amount, ascending for others
				return {
					field,
					direction: field === 'amount' ? 'desc' : 'asc'
				};
			}
		});
	};

	const fetchTransactions = async () => {
		try {
			setLoading(true);
			setError(null);

			// Fetch both transactions and categories in parallel
			const [transactionsResponse, categoriesResponse] = await Promise.all([
				fetch('/api/transactions'),
				fetch('/api/categories')
			]);

			const [transactionsData, categoriesData] = await Promise.all([
				transactionsResponse.json(),
				categoriesResponse.json()
			]);

			if (!transactionsResponse.ok) {
				throw new Error(transactionsData.message || 'Failed to fetch transactions');
			}

			if (!categoriesResponse.ok) {
				throw new Error('Failed to fetch categories');
			}

			setTransactions(transactionsData.data || []);
			setCategories(categoriesData || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	const handleEdit = (transaction: Transaction) => {
		setEditingTransaction({
			id: transaction.id,
			date: new Date(transaction.date).toISOString().split('T')[0], // Format for input[type="date"]
			description: transaction.description,
			amount: Math.abs(transaction.amount).toString(),
			type: transaction.type,
			categoryId: transaction.categoryId,
		});
		setEditError(null);
		setIsEditDialogOpen(true);
	};

	const handleSaveEdit = async () => {
		if (!editingTransaction) return;

		try {
			setEditError(null);

			const updates = {
				date: new Date(editingTransaction.date),
				description: editingTransaction.description,
				amount: editingTransaction.type === 'expense' 
					? -Math.abs(Number(editingTransaction.amount))
					: editingTransaction.type === 'transfer'
					? Number(editingTransaction.amount) // Keep original sign for transfers
					: Math.abs(Number(editingTransaction.amount)), // Positive for income
				type: editingTransaction.type,
				categoryId: editingTransaction.categoryId,
			};

			const response = await fetch(`/api/transactions/${editingTransaction.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Failed to update transaction');
			}

			// Refresh transactions list
			await fetchTransactions();
			setIsEditDialogOpen(false);
			setEditingTransaction(null);
		} catch (err) {
			setEditError(err instanceof Error ? err.message : 'Unknown error');
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this transaction?')) {
			return;
		}

		try {
			setDeleteError(null);

			const response = await fetch(`/api/transactions/${id}`, {
				method: 'DELETE',
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Failed to delete transaction');
			}

			// Refresh transactions list
			await fetchTransactions();
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : 'Unknown error');
		}
	};

	const handleUploadSuccess = async () => {
		// Refresh transactions after successful upload
		await fetchTransactions();
		setIsUploadDialogOpen(false);
	};

	const handleUpdateTransactionCategory = async (transactionId: string, categoryId: string | undefined) => {
		// Store original value for potential revert
		const originalTransaction = transactions.find(t => t.id === transactionId);
		const originalCategoryId = originalTransaction?.categoryId;

		// Optimistic update - update UI immediately
		setTransactions(prevTransactions => 
			prevTransactions.map(transaction => 
				transaction.id === transactionId 
					? { ...transaction, categoryId }
					: transaction
			)
		);

		try {
			// Background API call
			const response = await fetch(`/api/transactions/${transactionId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ categoryId }),
			});

			if (!response.ok) {
				// Revert optimistic update on failure
				setTransactions(prevTransactions => 
					prevTransactions.map(transaction => 
						transaction.id === transactionId 
							? { ...transaction, categoryId: originalCategoryId }
							: transaction
					)
				);
				throw new Error('Failed to update transaction category');
			}
		} catch (error) {
			console.error('Error updating transaction category:', error);
			// Revert optimistic update on error
			setTransactions(prevTransactions => 
				prevTransactions.map(transaction => 
					transaction.id === transactionId 
						? { ...transaction, categoryId: originalCategoryId }
						: transaction
				)
			);
		}
	};

	const handleGetSuggestion = async (transactionId: string, description: string) => {
		setLoadingSuggestions(prev => new Set(prev).add(transactionId));
		
		try {
			const response = await fetch('/api/categories/suggest', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ description }),
			});

			if (response.ok) {
				const suggestion = await response.json();
				setSuggestions(prev => ({ ...prev, [transactionId]: suggestion }));
			}
		} catch (error) {
			console.error('Error getting suggestion:', error);
		} finally {
			setLoadingSuggestions(prev => {
				const newSet = new Set(prev);
				newSet.delete(transactionId);
				return newSet;
			});
		}
	};

	const handleCategoryChangeWithLearning = async (
		transactionId: string, 
		description: string, 
		categoryId: string | undefined
	) => {
		try {
			// Store suggestion before clearing it
			const suggestion = suggestions[transactionId];

			// Clear the suggestion immediately for better UX
			setSuggestions(prev => {
				const newSuggestions = { ...prev };
				delete newSuggestions[transactionId];
				return newSuggestions;
			});

			// Update the transaction with optimistic update
			await handleUpdateTransactionCategory(transactionId, categoryId);

			// Learn from the action if there was a suggestion (run in background)
			if (suggestion && categoryId) {
				const wasCorrectSuggestion = suggestion.category.id === categoryId;
				
				// Don't await this - let it run in background
				fetch('/api/categories/learn', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						description,
						categoryId,
						wasCorrectSuggestion,
					}),
				}).catch(error => {
					console.error('Error learning from user action:', error);
				});
			}
		} catch (error) {
			console.error('Error updating category:', error);
		}
	};

	const handleBulkSuggestions = async () => {
		// Only suggest for uncategorized transactions that are visible
		const uncategorizedTransactions = paginatedTransactions.filter(t => !t.categoryId);
		
		if (uncategorizedTransactions.length === 0) {
			return;
		}

		setIsBulkSuggesting(true);

		try {
			const response = await fetch('/api/categories/suggest-bulk', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					transactions: uncategorizedTransactions.map(t => ({
						id: t.id,
						description: t.description
					}))
				}),
			});

			if (response.ok) {
				const data = await response.json();
				setSuggestions(prev => ({ ...prev, ...data.suggestions }));
				
				// Count how many suggestions were found
				const suggestionsCount = Object.values(data.suggestions).filter(s => s !== null).length;
				if (suggestionsCount > 0) {
					// You could add a toast notification here if you want
					console.log(`Found ${suggestionsCount} category suggestions`);
				}
			}
		} catch (error) {
			console.error('Error getting bulk suggestions:', error);
		} finally {
			setIsBulkSuggesting(false);
		}
	};

	// Filter handlers
	const handlePresetChange = (preset: string) => {
		const presetConfig = DATE_PRESETS[preset as keyof typeof DATE_PRESETS];
		if (presetConfig) {
			setFilters(prev => ({
				...prev,
				preset,
				dateRange: presetConfig.getValue(),
			}));
		}
	};

	const handleDateRangeChange = (range: DateRange) => {
		setFilters(prev => ({
			...prev,
			dateRange: range,
			preset: 'custom',
		}));
	};

	const handleSearchChange = (searchTerm: string) => {
		setFilters(prev => ({
			...prev,
			searchTerm,
		}));
	};

	const handleTypeFilterChange = (type: 'all' | 'income' | 'expense' | 'transfer') => {
		setFilters(prev => ({
			...prev,
			transactionType: type,
		}));
	};

	const clearAllFilters = () => {
		setFilters({
			dateRange: { from: undefined, to: undefined },
			transactionType: 'all',
			searchTerm: '',
			preset: 'all',
		});
	};

	// Pagination handlers
	const handlePageChange = (page: number) => {
		setPagination(prev => ({
			...prev,
			currentPage: Math.max(1, Math.min(page, totalPages)),
		}));
	};

	const handlePageSizeChange = (pageSize: number) => {
		setPagination(prev => ({
			currentPage: 1, // Reset to first page when changing page size
			pageSize,
		}));
	};

	const canGoPrevious = pagination.currentPage > 1;
	const canGoNext = pagination.currentPage < totalPages;

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
		}).format(Math.abs(amount));
	};

	// Sortable header component
	const SortableHeader = ({ field, children, className = "" }: { 
		field: SortField | null, 
		children: React.ReactNode,
		className?: string 
	}) => {
		const isActive = sort.field === field;
		const direction = isActive ? sort.direction : null;

		return (
			<TableHead 
				className={`${field ? 'cursor-pointer select-none hover:bg-gray-50' : ''} ${
					isActive ? 'bg-blue-50' : ''
				} ${className}`}
				onClick={() => field && handleSort(field)}
			>
				<div className="flex items-center gap-1">
					<span className={isActive ? 'text-blue-900 font-medium' : ''}>{children}</span>
					{field && (
						<div className="flex flex-col opacity-60 hover:opacity-100">
							<ChevronUp 
								className={`h-3 w-3 ${
									isActive && direction === 'asc' 
										? 'text-blue-600' 
										: 'text-gray-400'
								}`} 
							/>
							<ChevronDown 
								className={`h-3 w-3 -mt-1 ${
									isActive && direction === 'desc' 
										? 'text-blue-600' 
										: 'text-gray-400'
								}`} 
							/>
						</div>
					)}
				</div>
			</TableHead>
		);
	};

	const formatDate = (date: Date | string) => {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		}).format(new Date(date));
	};

	return (
		<Layout>
			<div className="max-w-7xl mx-auto p-6 space-y-8">
				{/* Header */}
				<div className="flex justify-between items-center">
					<div>
						<h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
						<p className="text-gray-600 mt-2">
							View and manage all your uploaded transactions ({filteredTransactions.length} of {transactions.length})
						</p>
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={handleBulkSuggestions}
							disabled={isBulkSuggesting || paginatedTransactions.filter(t => !t.categoryId).length === 0}
						>
							{isBulkSuggesting ? (
								<>
									<Sparkles className="mr-2 h-4 w-4 animate-pulse" />
									Getting Suggestions...
								</>
							) : (
								<>
									<Sparkles className="mr-2 h-4 w-4" />
									Suggest Categories
								</>
							)}
						</Button>
						<Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
							<DialogTrigger asChild>
								<Button>
									<Upload className="mr-2 h-4 w-4" />
									Upload Transactions
								</Button>
							</DialogTrigger>
						<DialogContent className="sm:max-w-md">
							<DialogHeader>
								<DialogTitle>Upload New Transactions</DialogTitle>
								<DialogDescription>
									Upload a CSV file with new transactions to add to your account.
								</DialogDescription>
							</DialogHeader>
							<FileUpload 
								onUploadSuccess={handleUploadSuccess}
								onUploadError={(error) => setError(error)}
							/>
						</DialogContent>
					</Dialog>
					</div>
				</div>

				{/* Filters */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="flex items-center">
								<Filter className="mr-2 h-5 w-5" />
								Filters
								{activeFiltersCount > 0 && (
									<span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-1 text-xs">
										{activeFiltersCount}
									</span>
								)}
							</CardTitle>
							{activeFiltersCount > 0 && (
								<Button variant="outline" size="sm" onClick={clearAllFilters}>
									<X className="mr-2 h-4 w-4" />
									Clear All
								</Button>
							)}
						</div>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Search and Type Filter Row */}
						<div className="flex gap-4 flex-wrap">
							<div className="flex-1 min-w-[200px]">
								<Label htmlFor="search">Search Transactions</Label>
								<Input
									id="search"
									placeholder="Search by description..."
									value={filters.searchTerm}
									onChange={(e) => handleSearchChange(e.target.value)}
									className="mt-1"
								/>
							</div>
							<div className="min-w-[150px]">
								<Label htmlFor="type-filter">Transaction Type</Label>
								<Select value={filters.transactionType} onValueChange={handleTypeFilterChange}>
									<SelectTrigger className="mt-1">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Types</SelectItem>
										<SelectItem value="income">Income Only</SelectItem>
										<SelectItem value="expense">Expense Only</SelectItem>
										<SelectItem value="transfer">Transfer Only</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Date Filter Row */}
						<div className="flex gap-4 flex-wrap items-end">
							<div className="min-w-[200px]">
								<Label htmlFor="date-preset">Date Range</Label>
								<Select value={filters.preset} onValueChange={handlePresetChange}>
									<SelectTrigger className="mt-1">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{Object.entries(DATE_PRESETS).map(([key, preset]) => (
											<SelectItem key={key} value={key}>
												{preset.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{filters.preset === 'custom' && (
								<>
									<div className="min-w-[150px]">
										<Label>From Date</Label>
										<Popover>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													className="mt-1 w-full justify-start text-left font-normal"
												>
													<CalendarIcon className="mr-2 h-4 w-4" />
													{filters.dateRange.from ? format(filters.dateRange.from, 'MMM dd, yyyy') : 'Pick a date'}
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-auto p-0">
												<Calendar
													mode="single"
													selected={filters.dateRange.from}
													onSelect={(date) => handleDateRangeChange({ ...filters.dateRange, from: date })}
													initialFocus
												/>
											</PopoverContent>
										</Popover>
									</div>
									<div className="min-w-[150px]">
										<Label>To Date</Label>
										<Popover>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													className="mt-1 w-full justify-start text-left font-normal"
												>
													<CalendarIcon className="mr-2 h-4 w-4" />
													{filters.dateRange.to ? format(filters.dateRange.to, 'MMM dd, yyyy') : 'Pick a date'}
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-auto p-0">
												<Calendar
													mode="single"
													selected={filters.dateRange.to}
													onSelect={(date) => handleDateRangeChange({ ...filters.dateRange, to: date })}
													initialFocus
												/>
											</PopoverContent>
										</Popover>
									</div>
								</>
							)}
						</div>

						{/* Active Filters Summary */}
						{(filters.dateRange.from || filters.dateRange.to || filters.transactionType !== 'all' || filters.searchTerm) && (
							<div className="flex flex-wrap gap-2 pt-2 border-t">
								<span className="text-sm font-medium text-gray-600">Active filters:</span>
								{filters.searchTerm && (
									<span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
										Search: "{filters.searchTerm}"
									</span>
								)}
								{filters.transactionType !== 'all' && (
									<span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
										Type: {filters.transactionType}
									</span>
								)}
								{filters.dateRange.from && (
									<span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
										From: {format(filters.dateRange.from, 'MMM dd, yyyy')}
									</span>
								)}
								{filters.dateRange.to && (
									<span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
										To: {format(filters.dateRange.to, 'MMM dd, yyyy')}
									</span>
								)}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Error Alerts */}
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{deleteError && (
					<Alert variant="destructive">
						<AlertDescription>Delete Error: {deleteError}</AlertDescription>
					</Alert>
				)}

				{/* Transactions Table */}
				<Card>
					<CardHeader>
						<CardTitle>
							{filteredTransactions.length === transactions.length 
								? `All Transactions (${transactions.length})` 
								: `Filtered Transactions (${filteredTransactions.length} of ${transactions.length})`
							}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{loading ? (
							<div className="text-center py-8">Loading transactions...</div>
						) : transactions.length === 0 ? (
							<div className="text-center py-8 text-gray-500">
								No transactions found. Upload a CSV file to get started.
							</div>
						) : filteredTransactions.length === 0 ? (
							<div className="text-center py-8 text-gray-500">
								No transactions match your current filters. Try adjusting your search criteria.
							</div>
						) : (
							<Table>
								<TableCaption>
									{filteredTransactions.length === transactions.length 
										? 'A list of all your uploaded transactions.'
										: `Showing ${filteredTransactions.length} transactions matching your filters.`
									}
								</TableCaption>
								<TableHeader>
									<TableRow>
										<SortableHeader field="date">Date</SortableHeader>
										<SortableHeader field="description">Description</SortableHeader>
										<SortableHeader field="category">Category</SortableHeader>
										<SortableHeader field="type">Type</SortableHeader>
										<SortableHeader field="amount" className="text-right">Amount</SortableHeader>
										<SortableHeader field={null} className="text-right">Actions</SortableHeader>
									</TableRow>
								</TableHeader>
								<TableBody>
									{paginatedTransactions.map((transaction) => (
										<TableRow key={transaction.id}>
											<TableCell className="font-medium">
												{formatDate(transaction.date)}
											</TableCell>
											<TableCell>{transaction.description}</TableCell>
											<TableCell>
												<SimpleCategorySelector
													categories={categories}
													currentCategoryId={transaction.categoryId}
													onCategoryChange={(categoryId) => 
														handleCategoryChangeWithLearning(transaction.id, transaction.description, categoryId)
													}
													onSuggestRequest={() => 
														handleGetSuggestion(transaction.id, transaction.description)
													}
													suggestion={suggestions[transaction.id]}
													isLoadingSuggestion={loadingSuggestions.has(transaction.id)}
													compact={true}
												/>
											</TableCell>
											<TableCell>
												<span
													className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
														getTransactionTypeStyle(transaction.type).badgeClass
													}`}
												>
													{getTransactionTypeLabel(transaction.type)}
												</span>
											</TableCell>
											<TableCell className={`text-right font-medium ${
												getTransactionTypeStyle(transaction.type).amountClass
											}`}>
												{transaction.type === 'income' ? '+' : transaction.type === 'transfer' ? '±' : '-'}
												{formatCurrency(transaction.amount)}
											</TableCell>
											<TableCell className="text-right">
												<div className="flex justify-end space-x-2">
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleEdit(transaction)}
													>
														<Pencil className="h-4 w-4" />
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleDelete(transaction.id)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}

						{/* Pagination Controls */}
						{filteredTransactions.length > 0 && (
							<div className="flex items-center justify-between mt-6 pt-4 border-t">
								<div className="flex items-center space-x-2">
									<span className="text-sm text-gray-700">
										Showing {startIndex + 1} to {Math.min(endIndex, filteredTransactions.length)} of {filteredTransactions.length} transactions
									</span>
								</div>

								<div className="flex items-center space-x-4">
									{/* Page Size Selector */}
									<div className="flex items-center space-x-2">
										<span className="text-sm text-gray-700">Show:</span>
										<Select 
											value={pagination.pageSize.toString()} 
											onValueChange={(value) => handlePageSizeChange(Number(value))}
										>
											<SelectTrigger className="w-20">
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
										<div className="flex items-center space-x-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => handlePageChange(1)}
												disabled={!canGoPrevious}
											>
												<ChevronsLeft className="h-4 w-4" />
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => handlePageChange(pagination.currentPage - 1)}
												disabled={!canGoPrevious}
											>
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<span className="text-sm text-gray-700 min-w-[100px] text-center">
												Page {pagination.currentPage} of {totalPages}
											</span>
											<Button
												variant="outline"
												size="sm"
												onClick={() => handlePageChange(pagination.currentPage + 1)}
												disabled={!canGoNext}
											>
												<ChevronRight className="h-4 w-4" />
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => handlePageChange(totalPages)}
												disabled={!canGoNext}
											>
												<ChevronsRight className="h-4 w-4" />
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
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>Edit Transaction</DialogTitle>
							<DialogDescription>
								Make changes to the transaction details below.
							</DialogDescription>
						</DialogHeader>
						{editingTransaction && (
							<div className="grid gap-4 py-4">
								{editError && (
									<Alert variant="destructive">
										<AlertDescription>{editError}</AlertDescription>
									</Alert>
								)}
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="edit-date" className="text-right">
										Date
									</Label>
									<Input
										id="edit-date"
										type="date"
										value={editingTransaction.date}
										onChange={(e) =>
											setEditingTransaction({
												...editingTransaction,
												date: e.target.value,
											})
										}
										className="col-span-3"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="edit-description" className="text-right">
										Description
									</Label>
									<Textarea
										id="edit-description"
										value={editingTransaction.description}
										onChange={(e) =>
											setEditingTransaction({
												...editingTransaction,
												description: e.target.value,
											})
										}
										className="col-span-3"
										rows={2}
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="edit-amount" className="text-right">
										Amount
									</Label>
									<Input
										id="edit-amount"
										type="number"
										step="0.01"
										value={editingTransaction.amount}
										onChange={(e) =>
											setEditingTransaction({
												...editingTransaction,
												amount: e.target.value,
											})
										}
										className="col-span-3"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="edit-type" className="text-right">
										Type
									</Label>
									<Select
										value={editingTransaction.type}
										onValueChange={(value: 'income' | 'expense' | 'transfer') =>
											setEditingTransaction({
												...editingTransaction,
												type: value,
											})
										}
									>
										<SelectTrigger className="col-span-3">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="income">Income</SelectItem>
											<SelectItem value="expense">Expense</SelectItem>
											<SelectItem value="transfer">Transfer</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="grid grid-cols-4 items-start gap-4">
									<Label className="text-right pt-2">
										Category
									</Label>
									<div className="col-span-3">
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
								<div className="flex justify-end space-x-2 pt-4">
									<Button
										variant="outline"
										onClick={() => setIsEditDialogOpen(false)}
									>
										Cancel
									</Button>
									<Button onClick={handleSaveEdit}>Save Changes</Button>
								</div>
							</div>
						)}
					</DialogContent>
				</Dialog>
			</div>
		</Layout>
	);
}