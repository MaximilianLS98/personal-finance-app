# Implementation Plan

- [x]   1. Set up subscription data models and database schema

    - Create TypeScript interfaces for Subscription, SubscriptionPattern, and enhanced Transaction models
    - Implement database migration for subscriptions and subscription_patterns tables
    - Add is_subscription and subscription_id columns to existing transactions table
    - Create appropriate database indexes for performance optimization
    - _Requirements: 2.1, 2.5_

- [x]   2. Extend existing repository with subscription operations

    - [x] 2.1 Add subscription CRUD methods to existing repository interface

        - Implement create, findAll, findById, update, delete methods for subscriptions
        - Add subscription-specific queries (findActiveSubscriptions, findUpcomingPayments, etc.)
        - Integrate with existing transaction repository for subscription flagging
        - _Requirements: 2.1, 2.2, 2.3, 2.4_

    - [x] 2.2 Implement subscription pattern management
        - Create methods for managing subscription detection patterns
        - Add pattern matching logic that integrates with existing categorization system
        - Implement confidence scoring and pattern learning capabilities
        - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x]   3. Build subscription detection engine

    - [x] 3.1 Create core detection algorithm

        - Implement recurring pattern analysis for transactions
        - Build frequency detection (monthly, quarterly, annual) with date flexibility
        - Create amount consistency checking with tolerance for small variations
        - Add description matching with fuzzy logic for vendor name variations
        - _Requirements: 1.1, 1.2, 1.5_

    - [x] 3.2 Implement subscription suggestion system
        - Create user confirmation workflow for detected subscriptions
        - Build integration with existing category system using isSubscription flag
        - Implement retroactive transaction flagging for existing data
        - Add learning mechanism to improve detection accuracy over time
        - _Requirements: 1.3, 1.4, 1.6_

- [-] 4. Develop financial projection engine

    - [x] 4.1 Create investment calculation system

        - Implement compound interest calculations for investment projections
        - Build comparison engine for subscription costs vs investment returns
        - Create configurable return rate system with default 7% annual return
        - Add time horizon projections (1, 5, 10, 20 years)
        - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

    - [x] 4.2 Build long-term cost analysis
        - Implement subscription cost projections with inflation considerations
        - Create potential savings calculations for cancelled subscriptions
        - Add visual data formatting for charts and tables
        - Include appropriate disclaimers for investment risk
        - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x]   5. Create subscription management API endpoints

    - [x] 5.1 Implement core subscription CRUD endpoints

        - Create GET /api/subscriptions with filtering and pagination
        - Build POST /api/subscriptions for creating new subscriptions
        - Implement GET /api/subscriptions/:id for subscription details
        - Add PUT /api/subscriptions/:id for updates and DELETE for removal
        - _Requirements: 2.1, 2.2, 2.3, 2.4_

    - [x] 5.2 Build detection and analysis endpoints

        - Create POST /api/subscriptions/detect for CSV-based detection
        - Implement GET /api/subscriptions/dashboard for summary data
        - Build GET /api/subscriptions/projections/:id for financial analysis
        - Add POST /api/subscriptions/bulk-categorize for batch operations
        - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.3, 4.4, 4.5_

    - [x] 5.3 Create notification and insights endpoints
        - Implement GET /api/subscriptions/upcoming for payment reminders
        - Build GET /api/subscriptions/unused for underutilized subscriptions
        - Create GET /api/subscriptions/insights for cost analysis and recommendations
        - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x]   6. Build subscription dashboard UI components

    - [x] 6.1 Create subscription overview dashboard

        - Build SubscriptionOverview component showing total monthly/annual costs
        - Implement UpcomingPayments component with 30-day payment calendar
        - Create CostBreakdown component integrating with existing categories
        - Add ProjectionCharts component for long-term cost visualization
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2_

    - [x] 6.2 Implement subscription management interface
        - Create SubscriptionList component with sorting and filtering
        - Build SubscriptionForm component with category integration
        - Implement DetectionWizard for guiding users through subscription detection
        - Add ProjectionCalculator for interactive investment comparisons
        - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x]   7. Create Next.js routes and pages for subscription functionality

    - [x] 7.1 Create main subscriptions page

        - Build src/app/subscriptions/page.tsx as the main subscriptions dashboard
        - Integrate SubscriptionOverview and UpcomingPayments components
        - Add navigation integration with existing app structure
        - Implement responsive layout matching existing design system
        - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

    - [x] 7.2 Create subscription management pages

        - Build src/app/subscriptions/manage/page.tsx for subscription list and CRUD operations
        - Create src/app/subscriptions/new/page.tsx for adding new subscriptions
        - Implement src/app/subscriptions/[id]/page.tsx for individual subscription details and editing
        - Add src/app/subscriptions/detect/page.tsx for the detection wizard workflow
        - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 1.1, 1.2, 1.3_

    - [x] 7.3 Create projection and analysis pages
        - Build src/app/subscriptions/projections/page.tsx for financial projection tools
        - Create src/app/subscriptions/insights/page.tsx for cost analysis and recommendations
        - Implement interactive projection calculator with investment comparison charts
        - Add export functionality for projection data and reports
        - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x]   8. Integrate subscription detection with CSV upload workflow

    - Modify existing CSV upload process to trigger subscription detection
    - Add user confirmation step for detected subscriptions before creation
    - Implement automatic transaction flagging for confirmed subscriptions
    - Create feedback mechanism to improve detection accuracy
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ]   9. Add subscription value tracking and notifications

    - [ ] 9.1 Implement usage tracking system

        - Create interface for users to log subscription usage
        - Build cost-per-use calculation system
        - Add subscription rating system (1-5 scale)
        - Implement value-based sorting and filtering
        - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

    - [ ] 9.2 Build notification system
        - Create upcoming payment notifications (7 days advance)
        - Implement annual renewal reminders (30 days advance)
        - Add unused subscription alerts based on usage patterns
        - Build prioritization system based on cost impact and urgency
        - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]   10. Create comprehensive test suite

    - [ ] 10.1 Write unit tests for core functionality

        - Test subscription detection engine with various transaction patterns
        - Verify financial projection calculations with known inputs
        - Test repository CRUD operations and complex queries
        - Validate API endpoint request/response handling
        - Note: Skip tests that encounter bun:sqlite or Jest/Bun runtime issues, document expected behavior instead
        - _Requirements: All requirements validation_

    - [ ] 10.2 Implement integration tests
        - Test end-to-end subscription detection workflow
        - Verify category integration preserves existing functionality
        - Test dashboard data aggregation and display
        - Validate retroactive transaction flagging
        - Note: Use manual verification for components with Bun/Node runtime conflicts
        - _Requirements: All requirements integration_

- [ ]   11. Performance optimization and error handling
    - Implement caching for frequently accessed subscription data
    - Add batch processing for large transaction datasets
    - Create comprehensive error handling with user-friendly messages
    - Optimize database queries with appropriate indexing
    - Add input validation and sanitization for all endpoints
    - _Requirements: All requirements performance and reliability_
