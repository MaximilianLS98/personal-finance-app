'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ResponsiveContainer } from 'recharts';
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
	addMonths,
	isAfter,
	isBefore,
} from 'date-fns';
import {
	Calendar as CalendarIcon,
	BarChart3,
	TrendingUp,
	AlertCircle,
	ChevronLeft,
	ChevronRight,
} from 'lucide-react';
import { useDashboardQuery } from '@/lib/queries';
import { useDashboardFilters } from '@/lib/stores/filters';
import { useCurrencySettings } from '@/app/providers';
import IncomeExpensesOverTimeChart from '@/app/components/IncomeExpensesOverTimeChart';
import SpendingByCategoryPie from '@/app/components/SpendingByCategoryPie';
import MonthlySpendingTrendsChart from '@/app/components/MonthlySpendingTrendsChart';
import MonthlyIncomeVsExpensesChart from '@/app/components/MonthlyIncomeVsExpensesChart';
import TopCategoryAveragesCard from '@/app/components/TopCategoryAveragesCard';

interface DateRange {
	from: Date | undefined;
	to: Date | undefined;
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
		getValue: () => ({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) }),
	},
	lastWeek: {
		label: 'Last Week',
		getValue: () => ({
			from: startOfWeek(subWeeks(new Date(), 1)),
			to: endOfWeek(subWeeks(new Date(), 1)),
		}),
	},
	thisMonth: {
		label: 'This Month',
		getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
	},
	lastMonth: {
		label: 'Last Month',
		getValue: () => ({
			from: startOfMonth(subMonths(new Date(), 1)),
			to: endOfMonth(subMonths(new Date(), 1)),
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
} as const;

type Interval = 'day' | 'week' | 'month';

const getSmartInterval = (preset: string, fromDate?: Date, toDate?: Date): Interval => {
	if (preset && preset !== 'custom') {
		switch (preset) {
			case 'all':
			case 'thisYear':
				return 'month';
			case 'last90Days':
			case 'thisMonth':
			case 'lastMonth':
				return 'week';
			case 'today':
			case 'yesterday':
			case 'thisWeek':
			case 'lastWeek':
			case 'last30Days':
				return 'day';
			default:
				return 'day';
		}
	}
	if (fromDate && toDate) {
		const diffInDays = Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
		if (diffInDays > 180) return 'month';
		if (diffInDays > 30) return 'week';
		return 'day';
	}
	return 'day';
};

export default function DashboardPage() {
	const { dateRange, preset, interval, setFilters } = useDashboardFilters();
	const [oldestDataDate, setOldestDataDate] = useState<Date | null>(null);
	const { currency: appCurrency, locale: appLocale } = useCurrencySettings();

	const formatCurrency = (amount: number, currencyOverride?: string) =>
		new Intl.NumberFormat(appLocale, {
			style: 'currency',
			currency: currencyOverride ?? appCurrency,
		}).format(Math.abs(amount));

	const {
		data,
		isLoading,
		isError,
		error: rqError,
	} = useDashboardQuery({
		from: dateRange.from,
		to: dateRange.to,
		interval: interval,
	});

	// Set oldest data date memoized when data changes
	useMemo(() => {
		if ((data as any)?.oldestDataDate) {
			setOldestDataDate(new Date((data as any).oldestDataDate));
		}
	}, [data]);

	const handlePresetChange = (nextPreset: string) => {
		const presetConfig = DATE_PRESETS[nextPreset as keyof typeof DATE_PRESETS];
		if (!presetConfig) return;
		const nextRange = presetConfig.getValue();
		const smart = getSmartInterval(nextPreset, nextRange.from, nextRange.to);
		setFilters(() => ({
			dateRange: nextRange,
			preset: nextPreset,
			interval: smart,
			setFilters,
		}));
	};

	const handleDateRangeChange = (range: DateRange) => {
		const smart = getSmartInterval('custom', range.from, range.to);
		setFilters((prev) => ({ ...prev, dateRange: range, preset: 'custom', interval: smart }));
	};

	const handleIntervalChange = (next: Interval) => {
		setFilters((prev) => ({ ...prev, interval: next }));
	};

	const navigateToPreviousPeriod = () => {
		if (!dateRange.from || !dateRange.to) return;
		const fromDate = subMonths(dateRange.from, 1);
		const toDate = subMonths(dateRange.to, 1);
		if (oldestDataDate && isBefore(fromDate, oldestDataDate)) return;
		setFilters((prev) => ({
			...prev,
			preset: 'custom',
			dateRange: { from: fromDate, to: toDate },
		}));
	};

	const navigateToNextPeriod = () => {
		if (!dateRange.from || !dateRange.to) return;
		const fromDate = addMonths(dateRange.from, 1);
		const toDate = addMonths(dateRange.to, 1);
		if (isAfter(fromDate, new Date())) return;
		setFilters((prev) => ({
			...prev,
			preset: 'custom',
			dateRange: { from: fromDate, to: toDate },
		}));
	};

	const canNavigatePrevious =
		dateRange.from && oldestDataDate && !isBefore(subMonths(dateRange.from, 1), oldestDataDate);
	const canNavigateNext = dateRange.from && !isAfter(addMonths(dateRange.from, 1), new Date());

	const getDateRangeDisplay = () => {
		if (!dateRange.from || !dateRange.to) return 'Select Date Range';
		const fromMonth = format(dateRange.from, 'MMMM yyyy');
		const toMonth = format(dateRange.to, 'MMMM yyyy');
		return fromMonth === toMonth ? fromMonth : `${fromMonth} - ${toMonth}`;
	};

	const LineChartTooltip = ({
		active,
		payload,
		label,
	}: {
		active?: boolean;
		payload?: Array<{ dataKey: string; value: number; color: string }>;
		label?: string;
	}) => {
		if (active && payload && payload.length) {
			return (
				<div className='bg-background border border-border rounded-lg p-3 shadow-lg'>
					<p className='text-sm font-medium'>{label}</p>
					{payload.map((entry, index) => (
						<p key={index} className='text-sm' style={{ color: entry.color }}>
							{entry.dataKey}: {formatCurrency(entry.value)}
						</p>
					))}
				</div>
			);
		}
		return null;
	};

	const BarChartTooltip = ({
		active,
		payload,
		label,
	}: {
		active?: boolean;
		payload?: Array<{ value: number; payload: { count: number } }>;
		label?: string;
	}) => {
		if (active && payload && payload.length) {
			return (
				<div className='bg-background border border-border rounded-lg p-3 shadow-lg'>
					<p className='text-sm font-medium'>{label}</p>
					<p className='text-sm'>Amount: {formatCurrency(payload[0].value)}</p>
					<p className='text-sm'>Transactions: {payload[0].payload.count}</p>
				</div>
			);
		}
		return null;
	};

	// charts now live in child components

	const summaryStats = useMemo(() => {
		if (!data) return { totalIncome: 0, totalExpenses: 0, netAmount: 0 };
		const over = (data as any).expenseIncomeOverTime ?? [];
		const totalIncome = over.reduce((sum: number, item: any) => sum + item.income, 0);
		const totalExpenses = over.reduce((sum: number, item: any) => sum + item.expenses, 0);
		return { totalIncome, totalExpenses, netAmount: totalIncome - totalExpenses };
	}, [data]);

	return (
		<div className='max-w-7xl mx-auto space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h2 className='text-2xl font-semibold mb-2'>Financial Dashboard</h2>
					<p className='text-muted-foreground'>
						Visual insights into your financial data
					</p>
				</div>
			</div>

			{/* Date Navigation */}
			<div className='flex items-center justify-center gap-6 py-4'>
				<Button
					variant='ghost'
					size='sm'
					onClick={navigateToPreviousPeriod}
					disabled={!canNavigatePrevious}
					className='flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50'>
					<ChevronLeft className='h-4 w-4' />
					Previous
				</Button>

				<div className='text-center'>
					<h3 className='text-xl font-semibold'>{getDateRangeDisplay()}</h3>
					<p className='text-xs text-muted-foreground'>
						Grouped by{' '}
						{interval === 'day' ? 'Daily' : interval === 'week' ? 'Weekly' : 'Monthly'}
					</p>
				</div>

				<Button
					variant='ghost'
					size='sm'
					onClick={navigateToNextPeriod}
					disabled={!canNavigateNext}
					className='flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50'>
					Next
					<ChevronRight className='h-4 w-4' />
				</Button>
			</div>

			{/* Date Range Filter */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<BarChart3 className='h-5 w-5' />
						Date Range Filter
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='flex flex-wrap gap-4 items-center'>
						{/* Preset Selector */}
						<div className='flex items-center gap-2'>
							<label className='text-sm font-medium'>Quick Select:</label>
							<Select value={preset} onValueChange={handlePresetChange}>
								<SelectTrigger className='w-48'>
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

						{/* Time Interval Selector */}
						<div className='flex items-center gap-2'>
							<label className='text-sm font-medium'>Group by:</label>
							<Select value={interval} onValueChange={handleIntervalChange}>
								<SelectTrigger className='w-32'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='day'>Daily</SelectItem>
									<SelectItem value='week'>Weekly</SelectItem>
									<SelectItem value='month'>Monthly</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Custom Date Range */}
						<div className='flex items-center gap-2'>
							<label className='text-sm font-medium'>From:</label>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant='outline'
										className='w-48 justify-start text-left font-normal'>
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
												to: dateRange.to,
											})
										}
										initialFocus
									/>
								</PopoverContent>
							</Popover>
						</div>

						<div className='flex items-center gap-2'>
							<label className='text-sm font-medium'>To:</label>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant='outline'
										className='w-48 justify-start text-left font-normal'>
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
												from: dateRange.from,
											})
										}
										initialFocus
									/>
								</PopoverContent>
							</Popover>
						</div>
					</div>

					{/* Active Filters Display */}
					{(dateRange.from || dateRange.to || preset !== 'all') && (
						<div className='mt-4 flex flex-wrap gap-2'>
							<span className='text-sm text-muted-foreground'>Active filters:</span>
							{dateRange.from && (
								<span className='text-sm bg-secondary px-2 py-1 rounded'>
									From: {format(dateRange.from, 'MMM dd, yyyy')}
								</span>
							)}
							{dateRange.to && (
								<span className='text-sm bg-secondary px-2 py-1 rounded'>
									To: {format(dateRange.to, 'MMM dd, yyyy')}
								</span>
							)}
							<span className='text-sm bg-primary/10 text-primary px-2 py-1 rounded'>
								Grouping:{' '}
								{interval === 'day'
									? 'Daily'
									: interval === 'week'
										? 'Weekly'
										: 'Monthly'}
							</span>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Error Alert */}
			{isError && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>
						{(rqError as Error)?.message || 'Failed to load dashboard data'}
					</AlertDescription>
				</Alert>
			)}

			{/* Summary Stats */}
			{!isLoading && data && (
				<div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
					<Card>
						<CardContent className='p-6'>
							<div className='flex items-center justify-between'>
								<div>
									<p className='text-sm font-medium text-muted-foreground'>
										Total Income
									</p>
									<p className='text-2xl font-bold text-green-600'>
										{formatCurrency(summaryStats.totalIncome)}
									</p>
								</div>
								<TrendingUp className='h-8 w-8 text-green-600' />
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className='p-6'>
							<div className='flex items-center justify-between'>
								<div>
									<p className='text-sm font-medium text-muted-foreground'>
										Total Expenses
									</p>
									<p className='text-2xl font-bold text-red-600'>
										{formatCurrency(summaryStats.totalExpenses)}
									</p>
								</div>
								<TrendingUp className='h-8 w-8 text-red-600 rotate-180' />
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className='p-6'>
							<div className='flex items-center justify-between'>
								<div>
									<p className='text-sm font-medium text-muted-foreground'>
										Net Amount
									</p>
									<p
										className={`text-2xl font-bold ${summaryStats.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
										{formatCurrency(summaryStats.netAmount)}
									</p>
								</div>
								<TrendingUp
									className={`h-8 w-8 ${summaryStats.netAmount >= 0 ? 'text-green-600' : 'text-red-600 rotate-180'}`}
								/>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Top Category Averages */}
			<TopCategoryAveragesCard />

			{/* Charts */}
			{data ? (
				<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
					<IncomeExpensesOverTimeChart />
					<SpendingByCategoryPie />
				</div>
			) : null}

			{/* Additional Monthly Charts (independent of Group by) */}
			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				<MonthlySpendingTrendsChart />
				<MonthlyIncomeVsExpensesChart />
			</div>
		</div>
	);
}
