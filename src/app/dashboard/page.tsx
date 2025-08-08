'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import Layout from '@/app/components/Layout';
import { 
	LineChart, 
	Line, 
	XAxis, 
	YAxis, 
	CartesianGrid, 
	Tooltip, 
	Legend, 
	ResponsiveContainer,
	BarChart,
	Bar
} from 'recharts';
import { Calendar as CalendarIcon, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths } from 'date-fns';

interface DateRange {
	from: Date | undefined;
	to: Date | undefined;
}

interface FilterState {
	dateRange: DateRange;
	preset: string;
	interval: 'day' | 'week' | 'month';
}

interface DashboardData {
	expenseIncomeOverTime: Array<{
		date: string;
		income: number;
		expenses: number;
		net: number;
	}>;
	categoryBreakdown: Array<{
		categoryId: string;
		categoryName: string;
		categoryColor: string;
		amount: number;
		count: number;
	}>;
	topCategoryAverages: Array<{
		categoryId: string;
		categoryName: string;
		categoryColor: string;
		totalAmount: number;
		averagePerInterval: number;
		intervalCount: number;
	}>;
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

// Helper function to get smart default interval based on date range
const getSmartInterval = (preset: string, fromDate?: Date, toDate?: Date): 'day' | 'week' | 'month' => {
	// For preset-based selection
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

	// For custom date ranges, calculate based on duration
	if (fromDate && toDate) {
		const diffInDays = Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
		if (diffInDays > 180) return 'month';
		if (diffInDays > 30) return 'week';
		return 'day';
	}

	return 'day';
};


export default function DashboardPage() {
	const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<FilterState>({
		dateRange: { from: undefined, to: undefined },
		preset: 'all',
		interval: 'month', // Default for 'all' time
	});

	// Fetch dashboard data
	const fetchDashboardData = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const params = new URLSearchParams();
			if (filters.dateRange.from) {
				params.append('from', filters.dateRange.from.toISOString());
			}
			if (filters.dateRange.to) {
				params.append('to', filters.dateRange.to.toISOString());
			}
			params.append('interval', filters.interval);

			const response = await fetch(`/api/dashboard?${params.toString()}`);
			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to fetch dashboard data');
			}

			setDashboardData(result);
		} catch (error) {
			console.error('Error fetching dashboard data:', error);
			setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
		} finally {
			setLoading(false);
		}
	}, [filters.dateRange.from, filters.dateRange.to, filters.interval]);

	// Load data when filters change
	useEffect(() => {
		fetchDashboardData();
	}, [fetchDashboardData]);

	// Handle preset change
	const handlePresetChange = (preset: string) => {
		const presetConfig = DATE_PRESETS[preset as keyof typeof DATE_PRESETS];
		if (presetConfig) {
			const dateRange = presetConfig.getValue();
			const smartInterval = getSmartInterval(preset, dateRange.from, dateRange.to);
			setFilters({
				preset,
				dateRange,
				interval: smartInterval,
			});
		}
	};

	// Handle custom date range change
	const handleDateRangeChange = (range: DateRange) => {
		const smartInterval = getSmartInterval('custom', range.from, range.to);
		setFilters({
			...filters,
			preset: 'custom',
			dateRange: range,
			interval: smartInterval,
		});
	};

	// Handle interval change
	const handleIntervalChange = (interval: 'day' | 'week' | 'month') => {
		setFilters({
			...filters,
			interval,
		});
	};

	// Custom tooltip for line chart
	const LineChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) => {
		if (active && payload && payload.length) {
			return (
				<div className="bg-background border border-border rounded-lg p-3 shadow-lg">
					<p className="text-sm font-medium">{label}</p>
					{payload.map((entry, index) => (
						<p key={index} className="text-sm" style={{ color: entry.color }}>
							{entry.dataKey}: ${Math.abs(entry.value).toFixed(2)}
						</p>
					))}
				</div>
			);
		}
		return null;
	};

	// Custom tooltip for bar chart
	const BarChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { count: number } }>; label?: string }) => {
		if (active && payload && payload.length) {
			return (
				<div className="bg-background border border-border rounded-lg p-3 shadow-lg">
					<p className="text-sm font-medium">{label}</p>
					<p className="text-sm">
						Amount: ${payload[0].value.toFixed(2)}
					</p>
					<p className="text-sm">
						Transactions: {payload[0].payload.count}
					</p>
				</div>
			);
		}
		return null;
	};

	// Prepare data for charts
	const chartData = useMemo(() => {
		if (!dashboardData) return { lineData: [], barData: [] };

		// Use the data as-is since the API already formats the dates correctly based on interval
		const lineData = dashboardData.expenseIncomeOverTime;

		// Format bar chart data (top 10 categories)
		const barData = dashboardData.categoryBreakdown.slice(0, 10);

		return { lineData, barData };
	}, [dashboardData]);

	// Calculate summary stats
	const summaryStats = useMemo(() => {
		if (!dashboardData) return { totalIncome: 0, totalExpenses: 0, netAmount: 0 };

		const totalIncome = dashboardData.expenseIncomeOverTime.reduce((sum, item) => sum + item.income, 0);
		const totalExpenses = dashboardData.expenseIncomeOverTime.reduce((sum, item) => sum + item.expenses, 0);
		const netAmount = totalIncome - totalExpenses;

		return { totalIncome, totalExpenses, netAmount };
	}, [dashboardData]);

	return (
		<Layout>
			<div className='max-w-7xl mx-auto space-y-6'>
				{/* Header */}
				<div className="flex items-center justify-between">
					<div>
						<h2 className='text-2xl font-semibold mb-2'>Financial Dashboard</h2>
						<p className='text-muted-foreground'>
							Visual insights into your financial data
						</p>
					</div>
				</div>

				{/* Date Range Filter */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BarChart3 className="h-5 w-5" />
							Date Range Filter
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-4 items-center">
							{/* Preset Selector */}
							<div className="flex items-center gap-2">
								<label className="text-sm font-medium">Quick Select:</label>
								<Select value={filters.preset} onValueChange={handlePresetChange}>
									<SelectTrigger className="w-48">
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

							{/* Time Interval Selector */}
							<div className="flex items-center gap-2">
								<label className="text-sm font-medium">Group by:</label>
								<Select value={filters.interval} onValueChange={handleIntervalChange}>
									<SelectTrigger className="w-32">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="day">Daily</SelectItem>
										<SelectItem value="week">Weekly</SelectItem>
										<SelectItem value="month">Monthly</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Custom Date Range */}
							<div className="flex items-center gap-2">
								<label className="text-sm font-medium">From:</label>
								<Popover>
									<PopoverTrigger asChild>
										<Button variant="outline" className="w-48 justify-start text-left font-normal">
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

							<div className="flex items-center gap-2">
								<label className="text-sm font-medium">To:</label>
								<Popover>
									<PopoverTrigger asChild>
										<Button variant="outline" className="w-48 justify-start text-left font-normal">
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
						</div>

						{/* Active Filters Display */}
						{(filters.dateRange.from || filters.dateRange.to || filters.preset !== 'all') && (
							<div className="mt-4 flex flex-wrap gap-2">
								<span className="text-sm text-muted-foreground">Active filters:</span>
								{filters.dateRange.from && (
									<span className="text-sm bg-secondary px-2 py-1 rounded">
										From: {format(filters.dateRange.from, 'MMM dd, yyyy')}
									</span>
								)}
								{filters.dateRange.to && (
									<span className="text-sm bg-secondary px-2 py-1 rounded">
										To: {format(filters.dateRange.to, 'MMM dd, yyyy')}
									</span>
								)}
								<span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">
									Grouping: {filters.interval === 'day' ? 'Daily' : filters.interval === 'week' ? 'Weekly' : 'Monthly'}
								</span>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Error Alert */}
				{error && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{/* Summary Stats */}
				{!loading && dashboardData && (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<Card>
							<CardContent className="p-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm font-medium text-muted-foreground">Total Income</p>
										<p className="text-2xl font-bold text-green-600">
											${summaryStats.totalIncome.toFixed(2)}
										</p>
									</div>
									<TrendingUp className="h-8 w-8 text-green-600" />
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
										<p className="text-2xl font-bold text-red-600">
											${summaryStats.totalExpenses.toFixed(2)}
										</p>
									</div>
									<TrendingUp className="h-8 w-8 text-red-600 rotate-180" />
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm font-medium text-muted-foreground">Net Amount</p>
										<p className={`text-2xl font-bold ${summaryStats.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
											${summaryStats.netAmount.toFixed(2)}
										</p>
									</div>
									<TrendingUp className={`h-8 w-8 ${summaryStats.netAmount >= 0 ? 'text-green-600' : 'text-red-600 rotate-180'}`} />
								</div>
							</CardContent>
						</Card>
					</div>
				)}

				{/* Top Category Averages */}
				{!loading && dashboardData && dashboardData.topCategoryAverages.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<BarChart3 className="h-5 w-5" />
								Top 3 Categories - Average Spending
							</CardTitle>
							<p className="text-sm text-muted-foreground">
								Average spending per {filters.interval === 'day' ? 'day' : filters.interval === 'week' ? 'week' : 'month'} for your highest spending categories
							</p>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								{dashboardData.topCategoryAverages.map((category, index) => (
									<div key={category.categoryId} className="p-4 border rounded-lg">
										<div className="flex items-center gap-3 mb-2">
											<div
												className="w-4 h-4 rounded-full"
												style={{ backgroundColor: category.categoryColor }}
											/>
											<span className="font-medium text-sm">{category.categoryName}</span>
											<span className="text-xs bg-secondary px-2 py-1 rounded">
												#{index + 1}
											</span>
										</div>
										<div className="space-y-2">
											<div>
												<p className="text-xs text-muted-foreground">
													Average per {filters.interval === 'day' ? 'day' : filters.interval === 'week' ? 'week' : 'month'}
												</p>
												<p className="text-lg font-bold" style={{ color: category.categoryColor }}>
													${category.averagePerInterval.toFixed(2)}
												</p>
											</div>
											<div className="text-xs text-muted-foreground">
												<p>Total: ${category.totalAmount.toFixed(2)}</p>
												<p>
													Over {category.intervalCount} {filters.interval === 'day' ? 'days' : filters.interval === 'week' ? 'weeks' : 'months'}
												</p>
											</div>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Charts */}
				{loading ? (
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<Card>
							<CardHeader>
								<CardTitle>Income vs Expenses Over Time</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="h-80 flex items-center justify-center">
									<p className="text-muted-foreground">Loading chart data...</p>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Spending by Category</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="h-80 flex items-center justify-center">
									<p className="text-muted-foreground">Loading chart data...</p>
								</div>
							</CardContent>
						</Card>
					</div>
				) : dashboardData ? (
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{/* Line Chart - Income vs Expenses Over Time */}
						<Card>
							<CardHeader>
								<CardTitle>Income vs Expenses Over Time</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="h-80">
									<ResponsiveContainer width="100%" height="100%">
										<LineChart data={chartData.lineData}>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis dataKey="date" />
											<YAxis />
											<Tooltip content={<LineChartTooltip />} />
											<Legend />
											<Line
												type="monotone"
												dataKey="income"
												stroke="#22c55e"
												strokeWidth={2}
												name="Income"
											/>
											<Line
												type="monotone"
												dataKey="expenses"
												stroke="#ef4444"
												strokeWidth={2}
												name="Expenses"
											/>
											<Line
												type="monotone"
												dataKey="net"
												stroke="#3b82f6"
												strokeWidth={2}
												name="Net"
												strokeDasharray="5 5"
											/>
										</LineChart>
									</ResponsiveContainer>
								</div>
							</CardContent>
						</Card>

						{/* Bar Chart - Category Spending */}
						<Card>
							<CardHeader>
								<CardTitle>Top Categories by Spending</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="h-80">
									<ResponsiveContainer width="100%" height="100%">
										<BarChart data={chartData.barData}>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis 
												dataKey="categoryName" 
												angle={-45}
												textAnchor="end"
												height={80}
											/>
											<YAxis />
											<Tooltip content={<BarChartTooltip />} />
											<Bar 
												dataKey="amount" 
												fill="#8884d8"
												name="Amount"
											/>
										</BarChart>
									</ResponsiveContainer>
								</div>
							</CardContent>
						</Card>
					</div>
				) : null}
			</div>
		</Layout>
	);
}