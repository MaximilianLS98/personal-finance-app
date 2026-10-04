import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { budgetForecast, budgetHistory, cycleSettings, saveCycleSettings } from '@/lib/planning';
import { planningError } from '@/lib/planning-api';
import { BudgetsRepository } from '@/lib/database/repositories/budgets';
import { RepositoryContext } from '@/lib/database/repository-context';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: Context) {
	try {
		const { id } = await params;
		const db = await financeDb();
		const context = new RepositoryContext();
		context.db = db;
		const budget = await new BudgetsRepository(context).findBudgetById(id);
		if (!budget) throw new Error('Budget not found');
		return NextResponse.json({
			settings: cycleSettings(db, id),
			history: budgetHistory(db, budget).slice(-24),
			forecast: budgetForecast(db, budget),
		});
	} catch (error) {
		return planningError(error);
	}
}
export async function PUT(request: NextRequest, { params }: Context) {
	try {
		const { id } = await params;
		saveCycleSettings(await financeDb(), id, await request.json());
		return NextResponse.json({ success: true });
	} catch (error) {
		return planningError(error);
	}
}
