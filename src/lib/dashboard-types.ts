export interface DashboardData {
	expenseIncomeOverTime: Array<{
		date: string;
		dateKeyIso: string; // ISO-like key for interval start (yyyy-MM-dd)
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
	oldestDataDate?: string;
}
