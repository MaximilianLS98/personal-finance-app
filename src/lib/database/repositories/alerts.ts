import type { BudgetAlert } from '../../types';
import { DatabaseConnectionError } from '../connection';
import type { RepositoryContext } from '../repository-context';
import { DatabaseErrorType } from '../types';

export class AlertsRepository {
	constructor(private readonly context: RepositoryContext) {}

	// ===== BUDGET ALERT MANAGEMENT =====

	/**
	 * Create a new budget alert
	 */
	async createBudgetAlert(alert: Omit<BudgetAlert, 'id' | 'createdAt'>): Promise<BudgetAlert> {
		try {
			const db = this.context.connection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO budget_alerts (
					id, budget_id, alert_type, threshold_percentage, message, is_read, created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				id,
				alert.budgetId,
				alert.alertType,
				alert.thresholdPercentage ?? null,
				alert.message,
				alert.isRead ? 1 : 0,
				now,
			);

			return {
				id,
				budgetId: alert.budgetId,
				alertType: alert.alertType,
				thresholdPercentage: alert.thresholdPercentage,
				message: alert.message,
				isRead: alert.isRead,
				createdAt: new Date(now),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create budget alert: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO budget_alerts',
			);
		}
	}

	/**
	 * Find budget alerts
	 */
	async findBudgetAlerts(budgetId?: string): Promise<BudgetAlert[]> {
		const rows = this.context
			.connection()
			.query(
				`SELECT * FROM budget_alerts ${budgetId ? 'WHERE budget_id = ?' : ''} ORDER BY created_at DESC`,
			)
			.all(...(budgetId ? [budgetId] : [])) as Array<{
			id: string;
			budget_id: string;
			alert_type: BudgetAlert['alertType'];
			threshold_percentage: number | null;
			message: string;
			is_read: number;
			created_at: string;
		}>;
		return rows.map((row) => ({
			id: row.id,
			budgetId: row.budget_id,
			alertType: row.alert_type,
			thresholdPercentage: row.threshold_percentage ?? undefined,
			message: row.message,
			isRead: row.is_read === 1,
			createdAt: new Date(row.created_at),
		}));
	}

	/**
	 * Find unread budget alerts
	 */
	async findUnreadBudgetAlerts(): Promise<BudgetAlert[]> {
		return (await this.findBudgetAlerts()).filter((alert) => !alert.isRead);
	}

	/**
	 * Mark budget alert as read
	 */
	async markBudgetAlertAsRead(alertId: string): Promise<boolean> {
		return (
			this.context
				.connection()
				.prepare('UPDATE budget_alerts SET is_read = 1 WHERE id = ?')
				.run(alertId).changes > 0
		);
	}

	/**
	 * Delete a budget alert
	 */
	async deleteBudgetAlert(alertId: string): Promise<boolean> {
		return (
			this.context.connection().prepare('DELETE FROM budget_alerts WHERE id = ?').run(alertId)
				.changes > 0
		);
	}
}
