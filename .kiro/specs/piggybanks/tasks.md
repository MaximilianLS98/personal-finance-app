# Implementation Plan

- [ ]   1. Set up core data models and database schema

    - Create TypeScript interfaces for Piggybank, PiggybankContribution, and related types in src/lib/types.ts
    - Add piggybanks and piggybank_contributions table definitions to new migration file
    - Create database migration 008_add_piggybanks.ts with proper indexes and constraints
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]   2. Implement piggybank repository layer

    - [ ] 2.1 Create core CRUD operations for piggybanks

        - Add piggybank methods to TransactionRepository interface in src/lib/types.ts
        - Implement createPiggybank, findAllPiggybanks, findPiggybankById, updatePiggybank, deletePiggybank methods in SQLiteTransactionRepository
        - Write unit tests for piggybank CRUD operations
        - _Requirements: 1.1, 1.2, 6.1, 6.2, 6.3, 6.4, 6.5_

    - [ ] 2.2 Implement contribution management methods

        - Add addPiggybankContribution, getPiggybankContributions methods to repository
        - Implement contribution validation and database operations
        - Write unit tests for contribution operations
        - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

    - [ ] 2.3 Create progress calculation and analytics methods
        - Implement calculatePiggybankProgress method with progress percentage, remaining amount, and timeline calculations
        - Add analyzeSavingsCapacity method that analyzes historical transaction data
        - Write unit tests for progress calculations and analytics
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]   3. Build piggybank service layer

    - [ ] 3.1 Create PiggybankService class with core business logic

        - Create src/lib/piggybank-service.ts with constructor accepting TransactionRepository and BudgetService
        - Implement createPiggybank, updatePiggybank, deletePiggybank methods with validation
        - Add addContribution method with business logic validation
        - Write unit tests for service layer business logic
        - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3, 6.4, 6.5_

    - [ ] 3.2 Implement analytics and recommendation features

        - Add getPiggybankWithProgress method that combines piggybank data with progress calculations
        - Implement generateSavingRecommendation method using historical spending analysis
        - Create getDashboardData method for aggregating multiple piggybank statistics
        - Write unit tests for analytics and recommendation logic
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3, 7.4, 7.5_

    - [ ] 3.3 Add budget integration functionality
        - Implement suggestBudgetAllocation method that creates budget suggestions for piggybank savings
        - Add createSavingsBudget method that integrates with existing BudgetService
        - Create budget-piggybank linking logic for tracking allocated vs actual savings
        - Write unit tests for budget integration features
        - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]   4. Create API endpoints for piggybank management

    - [ ] 4.1 Implement core piggybank CRUD endpoints

        - Create src/app/api/piggybanks/route.ts with GET (list) and POST (create) handlers
        - Create src/app/api/piggybanks/[id]/route.ts with GET, PUT, DELETE handlers for individual piggybanks
        - Add request/response validation using Zod schemas
        - Write API integration tests for CRUD operations
        - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5_

    - [ ] 4.2 Create contribution management endpoints

        - Create src/app/api/piggybanks/[id]/contributions/route.ts for adding contributions and getting history
        - Implement POST handler for adding contributions with amount validation
        - Add GET handler for retrieving contribution history with pagination
        - Write API tests for contribution endpoints
        - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

    - [ ] 4.3 Build analytics and dashboard endpoints
        - Create src/app/api/piggybanks/[id]/progress/route.ts for progress data
        - Create src/app/api/piggybanks/dashboard/route.ts for dashboard aggregation
        - Add src/app/api/piggybanks/insights/route.ts for savings analytics
        - Write API tests for analytics endpoints
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]   5. Develop core UI components

    - [ ] 5.1 Create piggybank list and overview components

        - Create src/app/components/piggybanks/PiggybankList.tsx with progress indicators and status display
        - Implement src/app/components/piggybanks/PiggybankCard.tsx for individual piggybank display
        - Add src/app/components/piggybanks/ProgressIndicator.tsx for visual progress bars
        - Write component unit tests for list and card components
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

    - [ ] 5.2 Build piggybank creation and editing forms

        - Create src/app/components/piggybanks/PiggybankForm.tsx with form validation
        - Implement target amount, target date, and description input fields with validation
        - Add category selection integration with existing category system
        - Write form component tests with validation scenarios
        - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5_

    - [ ] 5.3 Create contribution management components
        - Implement src/app/components/piggybanks/ContributionForm.tsx for adding money
        - Create src/app/components/piggybanks/ContributionHistory.tsx for displaying past contributions
        - Add amount input validation and success feedback
        - Write tests for contribution components
        - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]   6. Build piggybank pages and navigation

    - [ ] 6.1 Create main piggybanks page

        - Create src/app/piggybanks/page.tsx as the main piggybanks dashboard
        - Integrate PiggybankList component with API data fetching
        - Add "Create New Piggybank" button and modal integration
        - Write page integration tests
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

    - [ ] 6.2 Implement individual piggybank detail pages

        - Create src/app/piggybanks/[id]/page.tsx for detailed piggybank view
        - Display progress, contribution history, and recommendations
        - Add contribution form integration and edit/delete actions
        - Write detail page tests
        - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4, 6.5_

    - [ ] 6.3 Add piggybanks to main navigation
        - Update src/components/app-sidebar.tsx to include piggybanks menu item
        - Add piggybank icon and navigation link between budgets and subscriptions
        - Update navigation tests to include piggybanks section
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]   7. Implement analytics and recommendations features

    - [ ] 7.1 Create savings capacity analysis component

        - Build src/app/components/piggybanks/SavingsCapacityAnalysis.tsx
        - Display available savings capacity based on historical income/expense analysis
        - Show existing piggybank commitments and remaining capacity
        - Write component tests for capacity analysis display
        - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

    - [ ] 7.2 Build savings recommendations component

        - Create src/app/components/piggybanks/SavingsRecommendations.tsx
        - Display suggested monthly amounts and alternative timelines
        - Show feasibility scores and risk assessments
        - Write tests for recommendation display logic
        - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

    - [ ] 7.3 Implement savings insights dashboard
        - Create src/app/piggybanks/insights/page.tsx for analytics view
        - Display savings behavior patterns, completion rates, and trends
        - Add charts for savings progress over time
        - Write integration tests for insights page
        - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]   8. Add budget integration features

    - [ ] 8.1 Create budget suggestion components for piggybanks

        - Build src/app/components/piggybanks/BudgetIntegration.tsx
        - Display suggested budget allocations for each piggybank
        - Add "Create Budget" action that integrates with existing budget system
        - Write tests for budget integration components
        - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

    - [ ] 8.2 Implement piggybank-aware budget suggestions
        - Update existing budget suggestion logic to consider active piggybanks
        - Modify src/lib/budget-suggestion-generator.ts to include savings allocations
        - Add piggybank savings as a budget category suggestion
        - Write tests for enhanced budget suggestions
        - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]   9. Add notification and milestone features

    - [ ] 9.1 Implement milestone celebration components

        - Create src/app/components/piggybanks/MilestoneCelebration.tsx for achievement display
        - Add progress milestone detection (25%, 50%, 75%, 100%)
        - Implement celebration animations and congratulatory messages
        - Write tests for milestone detection and display
        - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

    - [ ] 9.2 Create reminder and notification logic
        - Add notification service integration for piggybank reminders
        - Implement logic to detect stale piggybanks (no contributions in 30 days)
        - Add approaching deadline notifications
        - Write tests for notification trigger logic
        - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]   10. Finalize integration and testing

    - [ ] 10.1 Run comprehensive integration tests

        - Test complete user workflows from piggybank creation to completion
        - Verify budget integration works correctly with existing budget system
        - Test analytics and recommendations with realistic data sets
        - Validate all API endpoints work correctly with UI components
        - _Requirements: All requirements_

    - [ ] 10.2 Add error handling and edge cases
        - Implement proper error boundaries in React components
        - Add comprehensive error handling for API failures
        - Handle edge cases like deleted categories, invalid dates, etc.
        - Write tests for error scenarios and recovery
        - _Requirements: All requirements_
