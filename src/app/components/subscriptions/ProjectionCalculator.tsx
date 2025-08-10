'use client';

import React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Slider } from '../../../components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Badge } from '../../../components/ui/badge';
import { Subscription } from '../../../lib/types';
import { formatCurrency } from '../../../lib/financial-calculator';
import { useCurrencySettings } from '../../providers';
import {
	Calculator,
	TrendingUp,
	DollarSign,
	AlertTriangle,
	Info,
	Target,
	PiggyBank,
} from 'lucide-react';

interface ProjectionCalculatorProps {
	/** Selected subscription for analysis */
	subscription?: Subscription;
	/** Loading state indicator */
	isLoading?: boolean;
	/** Error message to display */
	error?: string;
}

interface ProjectionSettings {
	annualReturnRate: number;
	inflationRate: number;
	timeHorizon: number;
	monthlyAmount: number;
}

interface ProjectionResults {
	subscriptionCost: {
		oneYear: number;
		fiveYears: number;
		tenYears: number;
		customYears: number;
	};
	investmentValue: {
		oneYear: number;
		fiveYears: number;
		tenYears: number;
		customYears: number;
	};
	potentialSavings: {
		oneYear: number;
		fiveYears: number;
		tenYears: number;
		customYears: number;
	};
}

/**
 * ProjectionCalculator component for interactive investment comparisons
 * Allows users to adjust parameters and see real-time projections
 */
export function ProjectionCalculator({
	subscription,
	isLoading = false,
	error,
}: ProjectionCalculatorProps) {
	const { currency, locale } = useCurrencySettings();

	// Calculator settings
	const [settings, setSettings] = React.useState<ProjectionSettings>({
		annualReturnRate: 7, // 7% default
		inflationRate: 2.5, // 2.5% default
		timeHorizon: 10, // 10 years default
		monthlyAmount: subscription ? getMonthlyAmount(subscription) : 100,
	});

	// Update monthly amount when subscription changes
	React.useEffect(() => {
		if (subscription) {
			setSettings((prev) => ({
				...prev,
				monthlyAmount: getMonthlyAmount(subscription),
			}));
		}
	}, [subscription]);

	// Calculate projections
	const projections = React.useMemo(() => {
		return calculateProjections(settings);
	}, [settings]);

	// Helper function to get monthly amount
	function getMonthlyAmount(sub: Subscription): number {
		switch (sub.billingFrequency) {
			case 'monthly':
				return sub.amount;
			case 'quarterly':
				return sub.amount / 3;
			case 'annually':
				return sub.amount / 12;
			case 'custom':
				if (sub.customFrequencyDays) {
					return (sub.amount * 30.44) / sub.customFrequencyDays;
				}
				return sub.amount;
			default:
				return sub.amount;
		}
	}

	// Calculate projections based on settings
	function calculateProjections(settings: ProjectionSettings): ProjectionResults {
		const { monthlyAmount, annualReturnRate, inflationRate, timeHorizon } = settings;
		const monthlyRate = annualReturnRate / 100 / 12;
		const monthlyInflation = inflationRate / 100 / 12;

		const calculateForYears = (years: number) => {
			const months = years * 12;

			// Subscription cost with inflation
			let subscriptionCost = 0;
			let currentMonthlyAmount = monthlyAmount;

			for (let month = 1; month <= months; month++) {
				subscriptionCost += currentMonthlyAmount;
				// Apply inflation monthly
				if (month % 12 === 0) {
					currentMonthlyAmount *= 1 + inflationRate / 100;
				}
			}

			// Investment value with compound interest
			let investmentValue = 0;
			if (monthlyRate > 0) {
				investmentValue = monthlyAmount * (((1 + monthlyRate) ** months - 1) / monthlyRate);
			} else {
				investmentValue = monthlyAmount * months;
			}

			return {
				subscriptionCost,
				investmentValue,
				potentialSavings: investmentValue - subscriptionCost,
			};
		};

		const oneYear = calculateForYears(1);
		const fiveYears = calculateForYears(5);
		const tenYears = calculateForYears(10);
		const customYears = calculateForYears(timeHorizon);

		return {
			subscriptionCost: {
				oneYear: oneYear.subscriptionCost,
				fiveYears: fiveYears.subscriptionCost,
				tenYears: tenYears.subscriptionCost,
				customYears: customYears.subscriptionCost,
			},
			investmentValue: {
				oneYear: oneYear.investmentValue,
				fiveYears: fiveYears.investmentValue,
				tenYears: tenYears.investmentValue,
				customYears: customYears.investmentValue,
			},
			potentialSavings: {
				oneYear: oneYear.potentialSavings,
				fiveYears: fiveYears.potentialSavings,
				tenYears: tenYears.potentialSavings,
				customYears: customYears.potentialSavings,
			},
		};
	}

	// Handle setting changes
	const updateSetting = (key: keyof ProjectionSettings, value: number) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
	};

	// Handle loading state
	if (isLoading) {
		return (
			<Card className='animate-pulse'>
				<CardHeader>
					<div className='h-6 bg-muted rounded w-1/2'></div>
					<div className='h-4 bg-muted rounded w-3/4'></div>
				</CardHeader>
				<CardContent>
					<div className='h-96 bg-muted rounded'></div>
				</CardContent>
			</Card>
		);
	}

	// Handle error state
	if (error) {
		return (
			<Card className='border-destructive'>
				<CardHeader>
					<CardTitle className='text-destructive flex items-center gap-2'>
						<AlertTriangle className='h-5 w-5' />
						Calculator Error
					</CardTitle>
					<CardDescription>{error}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Calculator className='h-5 w-5' />
					Investment Projection Calculator
				</CardTitle>
				<CardDescription>
					{subscription
						? `Compare ${subscription.name} costs vs investment returns`
						: 'Interactive tool to compare subscription costs vs investment opportunities'}
				</CardDescription>
				<div className='flex gap-2 mt-2'>
					<Badge variant='outline' className='text-xs'>
						<Info className='h-3 w-3 mr-1' />
						Projections are estimates only
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue='calculator' className='w-full'>
					<TabsList className='grid w-full grid-cols-2'>
						<TabsTrigger value='calculator'>Calculator</TabsTrigger>
						<TabsTrigger value='results'>Results</TabsTrigger>
					</TabsList>

					<TabsContent value='calculator' className='space-y-6'>
						{/* Settings Controls */}
						<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
							<div className='space-y-4'>
								<h3 className='text-lg font-medium'>Subscription Details</h3>

								<div className='space-y-2'>
									<Label htmlFor='monthlyAmount'>Monthly Amount</Label>
									<div className='relative'>
										<DollarSign className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
										<Input
											id='monthlyAmount'
											type='number'
											step='0.01'
											min='0'
											value={settings.monthlyAmount}
											onChange={(e) =>
												updateSetting(
													'monthlyAmount',
													parseFloat(e.target.value) || 0,
												)
											}
											className='pl-10'
										/>
									</div>
									<p className='text-xs text-muted-foreground'>
										{formatCurrency(
											settings.monthlyAmount * 12,
											currency,
											locale,
										)}{' '}
										per year
									</p>
								</div>

								<div className='space-y-2'>
									<Label>Time Horizon: {settings.timeHorizon} years</Label>
									<Slider
										value={[settings.timeHorizon]}
										onValueChange={([value]) =>
											updateSetting('timeHorizon', value)
										}
										max={30}
										min={1}
										step={1}
										className='w-full'
									/>
									<div className='flex justify-between text-xs text-muted-foreground'>
										<span>1 year</span>
										<span>30 years</span>
									</div>
								</div>
							</div>

							<div className='space-y-4'>
								<h3 className='text-lg font-medium'>Investment Assumptions</h3>

								<div className='space-y-2'>
									<Label>Annual Return Rate: {settings.annualReturnRate}%</Label>
									<Slider
										value={[settings.annualReturnRate]}
										onValueChange={([value]) =>
											updateSetting('annualReturnRate', value)
										}
										max={15}
										min={0}
										step={0.1}
										className='w-full'
									/>
									<div className='flex justify-between text-xs text-muted-foreground'>
										<span>0%</span>
										<span>15%</span>
									</div>
								</div>

								<div className='space-y-2'>
									<Label>Inflation Rate: {settings.inflationRate}%</Label>
									<Slider
										value={[settings.inflationRate]}
										onValueChange={([value]) =>
											updateSetting('inflationRate', value)
										}
										max={10}
										min={0}
										step={0.1}
										className='w-full'
									/>
									<div className='flex justify-between text-xs text-muted-foreground'>
										<span>0%</span>
										<span>10%</span>
									</div>
								</div>
							</div>
						</div>

						{/* Quick Results Preview */}
						<div className='bg-muted/50 rounded-lg p-4'>
							<h4 className='font-medium mb-3'>
								Quick Preview ({settings.timeHorizon} years)
							</h4>
							<div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm'>
								<div>
									<span className='text-muted-foreground'>
										Total Subscription Cost:
									</span>
									<div className='font-medium text-red-600 dark:text-red-400'>
										{formatCurrency(
											projections.subscriptionCost.customYears,
											currency,
											locale,
										)}
									</div>
								</div>
								<div>
									<span className='text-muted-foreground'>Investment Value:</span>
									<div className='font-medium text-green-600 dark:text-green-400'>
										{formatCurrency(
											projections.investmentValue.customYears,
											currency,
											locale,
										)}
									</div>
								</div>
								<div>
									<span className='text-muted-foreground'>
										Potential Savings:
									</span>
									<div
										className={`font-medium ${projections.potentialSavings.customYears > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
										{projections.potentialSavings.customYears > 0 ? '+' : ''}
										{formatCurrency(
											projections.potentialSavings.customYears,
											currency,
											locale,
										)}
									</div>
								</div>
							</div>
						</div>
					</TabsContent>

					<TabsContent value='results' className='space-y-6'>
						{/* Detailed Results */}
						<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
							<ResultCard
								title='1 Year'
								subscriptionCost={projections.subscriptionCost.oneYear}
								investmentValue={projections.investmentValue.oneYear}
								savings={projections.potentialSavings.oneYear}
								currency={currency}
								locale={locale}
							/>
							<ResultCard
								title='5 Years'
								subscriptionCost={projections.subscriptionCost.fiveYears}
								investmentValue={projections.investmentValue.fiveYears}
								savings={projections.potentialSavings.fiveYears}
								currency={currency}
								locale={locale}
							/>
							<ResultCard
								title='10 Years'
								subscriptionCost={projections.subscriptionCost.tenYears}
								investmentValue={projections.investmentValue.tenYears}
								savings={projections.potentialSavings.tenYears}
								currency={currency}
								locale={locale}
							/>
							<ResultCard
								title={`${settings.timeHorizon} Years`}
								subscriptionCost={projections.subscriptionCost.customYears}
								investmentValue={projections.investmentValue.customYears}
								savings={projections.potentialSavings.customYears}
								currency={currency}
								locale={locale}
								isCustom={true}
							/>
						</div>

						{/* Investment Insights */}
						<div className='bg-blue-50 dark:bg-blue-950 rounded-lg p-4'>
							<h4 className='font-medium mb-2 flex items-center gap-2'>
								<Target className='h-4 w-4' />
								Investment Insights
							</h4>
							<div className='text-sm text-blue-800 dark:text-blue-200 space-y-1'>
								<p>
									• Monthly investment of{' '}
									{formatCurrency(settings.monthlyAmount, currency, locale)} at{' '}
									{settings.annualReturnRate}% annual return
								</p>
								<p>
									• Subscription costs include {settings.inflationRate}% annual
									inflation
								</p>
								<p>
									• Break-even point:{' '}
									{projections.potentialSavings.oneYear > 0
										? 'Less than 1 year'
										: projections.potentialSavings.fiveYears > 0
											? '1-5 years'
											: projections.potentialSavings.tenYears > 0
												? '5-10 years'
												: 'More than 10 years'}
								</p>
							</div>
						</div>

						{/* Disclaimer */}
						<div className='bg-yellow-50 dark:bg-yellow-950 rounded-lg p-4'>
							<h4 className='font-medium mb-2 flex items-center gap-2 text-yellow-800 dark:text-yellow-200'>
								<AlertTriangle className='h-4 w-4' />
								Important Disclaimer
							</h4>
							<p className='text-sm text-yellow-800 dark:text-yellow-200'>
								These projections are estimates based on the assumptions you've set.
								Actual investment returns can vary significantly and may be
								negative. Past performance does not guarantee future results.
								Consider consulting with a financial advisor before making
								investment decisions.
							</p>
						</div>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

interface ResultCardProps {
	title: string;
	subscriptionCost: number;
	investmentValue: number;
	savings: number;
	currency: string;
	locale: string;
	isCustom?: boolean;
}

function ResultCard({
	title,
	subscriptionCost,
	investmentValue,
	savings,
	currency,
	locale,
	isCustom = false,
}: ResultCardProps) {
	const isPositiveSavings = savings > 0;

	return (
		<Card
			className={`${isCustom ? 'border-primary bg-primary/5' : ''} ${isPositiveSavings ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'}`}>
			<CardHeader className='pb-2'>
				<CardTitle className='text-base flex items-center gap-2'>
					{isCustom && <Target className='h-4 w-4' />}
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent className='space-y-3'>
				<div className='space-y-2 text-sm'>
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Subscription:</span>
						<span className='font-medium text-red-600 dark:text-red-400'>
							{formatCurrency(subscriptionCost, currency, locale)}
						</span>
					</div>
					<div className='flex justify-between'>
						<span className='text-muted-foreground'>Investment:</span>
						<span className='font-medium text-green-600 dark:text-green-400'>
							{formatCurrency(investmentValue, currency, locale)}
						</span>
					</div>
					<div className='border-t pt-2'>
						<div className='flex justify-between items-center'>
							<span className='font-medium'>Difference:</span>
							<span
								className={`font-bold ${isPositiveSavings ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
								{isPositiveSavings ? '+' : ''}
								{formatCurrency(savings, currency, locale)}
							</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export default ProjectionCalculator;
