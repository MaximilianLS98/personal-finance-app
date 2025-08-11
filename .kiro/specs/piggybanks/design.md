# Design Document

## Overview

The Piggybanks feature introduces a goal-oriented savings system that allows users to create multiple savings "buckets" with specific targets and deadlines. The system integrates deeply with the existing transaction tracking and budget management infrastructure to provide intelligent saving recommendations and progress tracking. The feature follows the established repository pattern and service layer architecture used throughout the application.

## Architecture

### Core Components

The piggybanks feature follows the existing architectural patterns:

1. **Data Layer**: SQLite database with repository pattern
2. **Service Layer**: Business logic and integration services
3. **API Layer**: RESTful endpoints following existing conventions
4. **UI Layer**: React components with TypeScript integration

### Integration Points

- **Transaction Repository**: For historical spending analysis
- **Budget Service**: For savings allocation recommendations
- **Category System**: For optional piggybank categorization
- **Analytics Engine**: For progress tracking and insights

## Components and Interfaces

### Data Models

```typescript
// Core piggybank entity
interface Piggybank {
	id: string;
	name: string;
	description?: string;
	targetAmount: number;
	currentAmount: number;
	currency: string;
	targetDate: Date;
	categoryId?: string; // Optional categorization
	isActive: boolean;
	isCompleted: boolean;
	completedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

// Individual contribution to a piggybank
interface PiggybankContribution {
	id: string;
	piggybankId: string;
	amount: number;
	description?: string;
	contributionDate: Date;
	createdAt: Date;
}

// Progress tracking and analytics
interface PiggybankProgress {
	piggybankId: string;
	piggybank: Piggybank;
	progressPercentage: number;
	remainingAmount: number;
	daysRemaining: number;
	averageContributionNeeded: number;
	projectedCompletionDate: Date;
	isOnTrack: boolean;
	riskLevel: 'low' | 'medium' | 'high';
	lastContributionDate?: Date;
	daysSinceLastContribution: number;
}

// Savings capacity analysis
interface SavingsCapacityAnalysis {
	monthlyIncomeAverage: number;
	monthlyExpensesAverage: number;
	availableSavingsCapacity: number;
	existingPiggybankCommitments: number;
	remainingCapacity: number;
	confidenceLevel: number;
	analysisMonths: number;
}

// Intelligent saving recommendations
interface SavingRecommendation {
	piggybankId: string;
	recommendedMonthlyAmount: number;
	alternativeTimelines: Array<{
		months: number;
		monthlyAmount: number;
		feasibilityScore: number;
	}>;
	budgetIntegrationSuggestion?: {
		suggestedCategoryName: string;
		monthlyAllocation: number;
	};
	riskAssessment: {
		achievabilityScore: number;
		potentialChallenges: string[];
		mitigationStrategies: string[];
	};
}
```

### Repository Interface

```typescript
interface PiggybankRepository {
	// Core CRUD operations
	create(piggybank: Omit<Piggybank, 'id' | 'createdAt' | 'updatedAt'>): Promise<Piggybank>;
	findAll(): Promise<Piggybank[]>;
	findById(id: string): Promise<Piggybank | null>;
	findActive(): Promise<Piggybank[]>;
	update(id: string, updates: Partial<Omit<Piggybank, 'id'>>): Promise<Piggybank | null>;
	delete(id: string): Promise<boolean>;

	// Contribution management
	addContribution(
		contribution: Omit<PiggybankContribution, 'id' | 'createdAt'>,
	): Promise<PiggybankContribution>;
	getContributions(piggybankId: string): Promise<PiggybankContribution[]>;
	getContributionHistory(piggybankId: string, limit?: number): Promise<PiggybankContribution[]>;

	// Progress and analytics
	calculateProgress(piggybankId: string): Promise<PiggybankProgress | null>;
	analyzeSavingsCapacity(months?: number): Promise<SavingsCapacityAnalysis>;
	generateSavingRecommendation(piggybankId: string): Promise<SavingRecommendation>;

	// Dashboard and insights
	getDashboardData(): Promise<{
		activePiggybanks: Piggybank[];
		totalSaved: number;
		totalTargeted: number;
		completedGoals: number;
		progressData: PiggybankProgress[];
	}>;
}
```

### Service Layer

```typescript
class PiggybankService {
	constructor(
		private piggybankRepository: PiggybankRepository,
		private transactionRepository: TransactionRepository,
		private budgetService: BudgetService,
	) {}

	// Goal management
	async createPiggybank(request: CreatePiggybankRequest): Promise<Piggybank>;
	async updatePiggybank(id: string, updates: UpdatePiggybankRequest): Promise<Piggybank | null>;
	async deletePiggybank(id: string, handleFunds?: 'transfer' | 'withdraw'): Promise<boolean>;

	// Contribution management
	async addContribution(
		piggybankId: string,
		amount: number,
		description?: string,
	): Promise<PiggybankContribution>;
	async getContributionHistory(piggybankId: string): Promise<PiggybankContribution[]>;

	// Analytics and recommendations
	async getPiggybankWithProgress(
		id: string,
	): Promise<{ piggybank: Piggybank; progress: PiggybankProgress } | null>;
	async generateSavingPlan(piggybankId: string): Promise<SavingRecommendation>;
	async analyzeSavingsCapacity(): Promise<SavingsCapacityAnalysis>;

	// Budget integration
	async suggestBudgetAllocation(piggybankId: string): Promise<BudgetSuggestion>;
	async createSavingsBudget(piggybankId: string, monthlyAmount: number): Promise<Budget>;

	// Dashboard and insights
	async getDashboardData(): Promise<PiggybankDashboard>;
	async getSavingsInsights(): Promise<SavingsInsights>;
}
```

## Data Models

### Database Schema

```sql
-- Piggybanks table
CREATE TABLE piggybanks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_amount REAL NOT NULL CHECK (target_amount > 0),
  current_amount REAL NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'NOK',
  target_date TEXT NOT NULL, -- ISO date string
  category_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  is_completed BOOLEAN NOT NULL DEFAULT 0,
  completed_at TEXT, -- ISO date string
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Piggybank contributions table
CREATE TABLE piggybank_contributions (
  id TEXT PRIMARY KEY,
  piggybank_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  description TEXT,
  contribution_date TEXT NOT NULL, -- ISO date string
  created_at TEXT NOT NULL,
  FOREIGN KEY (piggybank_id) REFERENCES piggybanks(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_piggybanks_active ON piggybanks(is_active);
CREATE INDEX idx_piggybanks_target_date ON piggybanks(target_date);
CREATE INDEX idx_piggybank_contributions_piggybank_id ON piggybank_contributions(piggybank_id);
CREATE INDEX idx_piggybank_contributions_date ON piggybank_contributions(contribution_date);
```

### Migration Strategy

The piggybanks feature will be added through a new database migration:

```typescript
// Migration 008_add_piggybanks.ts
export const migration008 = {
	version: 8,
	description: 'Add piggybanks and contributions tables',
	up: (db: Database) => {
		// Create tables and indexes as shown above
	},
	down: (db: Database) => {
		db.exec('DROP TABLE IF EXISTS piggybank_contributions');
		db.exec('DROP TABLE IF EXISTS piggybanks');
	},
};
```

## Error Handling

### Validation Rules

1. **Target Amount**: Must be positive and greater than current amount
2. **Target Date**: Must be in the future
3. **Contributions**: Must be positive amounts
4. **Currency**: Must match existing transaction currencies
5. **Name**: Required and must be unique per user

### Error Types

```typescript
enum PiggybankErrorType {
	INVALID_TARGET_AMOUNT = 'INVALID_TARGET_AMOUNT',
	INVALID_TARGET_DATE = 'INVALID_TARGET_DATE',
	PIGGYBANK_NOT_FOUND = 'PIGGYBANK_NOT_FOUND',
	PIGGYBANK_COMPLETED = 'PIGGYBANK_COMPLETED',
	INSUFFICIENT_CAPACITY = 'INSUFFICIENT_CAPACITY',
	DUPLICATE_NAME = 'DUPLICATE_NAME',
}
```

## Testing Strategy

### Unit Tests

1. **Repository Layer**

    - CRUD operations for piggybanks and contributions
    - Progress calculations and analytics
    - Data validation and constraints

2. **Service Layer**

    - Business logic validation
    - Integration with transaction and budget systems
    - Recommendation algorithms

3. **API Layer**
    - Request/response validation
    - Error handling
    - Authentication and authorization

### Integration Tests

1. **Database Integration**

    - Migration execution
    - Cross-table relationships
    - Performance with large datasets

2. **Service Integration**
    - Transaction repository integration
    - Budget service integration
    - Category system integration

### End-to-End Tests

1. **User Workflows**

    - Create piggybank → Add contributions → Track progress
    - Budget integration workflow
    - Goal completion workflow

2. **Analytics Workflows**
    - Savings capacity analysis
    - Recommendation generation
    - Dashboard data aggregation

## API Design

### REST Endpoints

```typescript
// Piggybank management
GET    /api/piggybanks                    // List all piggybanks
POST   /api/piggybanks                    // Create new piggybank
GET    /api/piggybanks/:id                // Get piggybank details
PUT    /api/piggybanks/:id                // Update piggybank
DELETE /api/piggybanks/:id                // Delete piggybank

// Contributions
POST   /api/piggybanks/:id/contributions  // Add contribution
GET    /api/piggybanks/:id/contributions  // Get contribution history

// Analytics and insights
GET    /api/piggybanks/:id/progress       // Get progress data
GET    /api/piggybanks/:id/recommendations // Get saving recommendations
GET    /api/piggybanks/dashboard          // Dashboard data
GET    /api/piggybanks/insights           // Savings insights
GET    /api/piggybanks/capacity           // Savings capacity analysis

// Budget integration
POST   /api/piggybanks/:id/budget         // Create budget for piggybank
GET    /api/piggybanks/:id/budget-suggestions // Get budget suggestions
```

## UI Components

### Core Components

1. **PiggybankList**: Display all piggybanks with progress indicators
2. **PiggybankForm**: Create/edit piggybank modal
3. **PiggybankDetail**: Detailed view with progress and contributions
4. **ContributionForm**: Add money to piggybank
5. **ProgressIndicator**: Visual progress bar with statistics
6. **SavingsRecommendations**: Display intelligent suggestions
7. **PiggybankDashboard**: Overview of all savings goals
8. **SavingsInsights**: Analytics and behavioral insights

### Navigation Integration

The piggybanks feature will be added to the main navigation as a top-level menu item, positioned between "Budgets" and "Subscriptions" to maintain logical grouping of financial planning features.

## Performance Considerations

### Database Optimization

1. **Indexes**: Strategic indexing on frequently queried fields
2. **Aggregation**: Use SQL aggregation for progress calculations
3. **Caching**: Cache dashboard data and analytics results
4. **Pagination**: Implement pagination for contribution history

### Analytics Performance

1. **Background Processing**: Calculate complex analytics asynchronously
2. **Incremental Updates**: Update progress incrementally rather than full recalculation
3. **Data Retention**: Archive old contribution data while maintaining summaries

## Security Considerations

1. **Data Validation**: Strict input validation on all endpoints
2. **Authorization**: Ensure users can only access their own piggybanks
3. **Rate Limiting**: Prevent abuse of contribution endpoints
4. **Data Integrity**: Use database constraints to maintain consistency

## Future Enhancements

1. **Shared Goals**: Allow multiple users to contribute to shared piggybanks
2. **Automated Contributions**: Set up recurring automatic contributions
3. **Goal Templates**: Pre-defined templates for common savings goals
4. **Gamification**: Achievement badges and milestone celebrations
5. **Investment Integration**: Connect with investment accounts for growth tracking
