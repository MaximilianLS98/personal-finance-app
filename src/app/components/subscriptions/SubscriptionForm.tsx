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
import { Textarea } from '../../../components/ui/textarea';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { Calendar } from '../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Subscription, Category } from '../../../lib/types';
import { useCurrencySettings } from '../../providers';
import { Save, X, Calendar as CalendarIcon, DollarSign, Globe, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface SubscriptionFormProps {
	/** Subscription to edit (undefined for new subscription) */
	subscription?: Subscription;
	/** Array of categories for selection */
	categories?: Category[];
	/** Loading state indicator */
	isLoading?: boolean;
	/** Callback when form is submitted */
	onSubmit?: (data: SubscriptionFormData) => void;
	/** Callback when form is cancelled */
	onCancel?: () => void;
}

export interface SubscriptionFormData {
	name: string;
	description?: string;
	amount: number;
	currency: string;
	billingFrequency: 'monthly' | 'quarterly' | 'annually' | 'custom';
	customFrequencyDays?: number;
	nextPaymentDate: Date;
	categoryId: string;
	isActive: boolean;
	notes?: string;
	website?: string;
	cancellationUrl?: string;
	usageRating?: number;
}

/**
 * SubscriptionForm component with category integration
 * Handles both creating new subscriptions and editing existing ones
 */
export function SubscriptionForm({
	subscription,
	categories = [],
	isLoading = false,
	onSubmit,
	onCancel,
}: SubscriptionFormProps) {
	const { currency: defaultCurrency } = useCurrencySettings();

	// Form state
	const [formData, setFormData] = React.useState<SubscriptionFormData>(() => ({
		name: subscription?.name || '',
		description: subscription?.description || '',
		amount: subscription?.amount || 0,
		currency: subscription?.currency || defaultCurrency,
		billingFrequency: subscription?.billingFrequency || 'monthly',
		customFrequencyDays: subscription?.customFrequencyDays,
		nextPaymentDate: subscription?.nextPaymentDate
			? new Date(subscription.nextPaymentDate)
			: new Date(),
		categoryId: subscription?.categoryId || '',
		isActive: subscription?.isActive ?? true,
		notes: subscription?.notes || '',
		website: subscription?.website || '',
		cancellationUrl: subscription?.cancellationUrl || '',
		usageRating: subscription?.usageRating,
	}));

	const [errors, setErrors] = React.useState<Record<string, string>>({});
	const [showCalendar, setShowCalendar] = React.useState(false);

	// Validation
	const validateForm = (): boolean => {
		const newErrors: Record<string, string> = {};

		if (!formData.name.trim()) {
			newErrors.name = 'Subscription name is required';
		}

		if (formData.amount <= 0) {
			newErrors.amount = 'Amount must be greater than 0';
		}

		if (!formData.categoryId) {
			newErrors.categoryId = 'Please select a category';
		}

		if (
			formData.billingFrequency === 'custom' &&
			(!formData.customFrequencyDays || formData.customFrequencyDays <= 0)
		) {
			newErrors.customFrequencyDays = 'Custom frequency days must be greater than 0';
		}

		if (formData.website && !isValidUrl(formData.website)) {
			newErrors.website = 'Please enter a valid URL';
		}

		if (formData.cancellationUrl && !isValidUrl(formData.cancellationUrl)) {
			newErrors.cancellationUrl = 'Please enter a valid URL';
		}

		if (formData.usageRating && (formData.usageRating < 1 || formData.usageRating > 5)) {
			newErrors.usageRating = 'Rating must be between 1 and 5';
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	// URL validation helper
	const isValidUrl = (url: string): boolean => {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	};

	// Handle form submission
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (validateForm() && onSubmit) {
			onSubmit(formData);
		}
	};

	// Handle input changes
	const handleInputChange = (field: keyof SubscriptionFormData, value: any) => {
		setFormData((prev) => ({ ...prev, [field]: value }));

		// Clear error for this field
		if (errors[field]) {
			setErrors((prev) => ({ ...prev, [field]: '' }));
		}
	};

	// Get selected category
	const selectedCategory = categories.find((cat) => cat.id === formData.categoryId);

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<DollarSign className='h-5 w-5' />
					{subscription ? 'Edit Subscription' : 'Add New Subscription'}
				</CardTitle>
				<CardDescription>
					{subscription
						? 'Update subscription details'
						: 'Enter details for your new subscription'}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className='space-y-6'>
					{/* Basic Information */}
					<div className='space-y-4'>
						<h3 className='text-lg font-medium'>Basic Information</h3>

						<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='name'>Subscription Name *</Label>
								<Input
									id='name'
									value={formData.name}
									onChange={(e) => handleInputChange('name', e.target.value)}
									placeholder='e.g., Netflix, Spotify'
									className={errors.name ? 'border-destructive' : ''}
								/>
								{errors.name && (
									<p className='text-sm text-destructive flex items-center gap-1'>
										<AlertCircle className='h-3 w-3' />
										{errors.name}
									</p>
								)}
							</div>

							<div className='space-y-2'>
								<Label htmlFor='category'>Category *</Label>
								<Select
									value={formData.categoryId}
									onValueChange={(value) =>
										handleInputChange('categoryId', value)
									}>
									<SelectTrigger
										className={errors.categoryId ? 'border-destructive' : ''}>
										<SelectValue placeholder='Select category' />
									</SelectTrigger>
									<SelectContent>
										{categories.map((category) => (
											<SelectItem key={category.id} value={category.id}>
												<div className='flex items-center gap-2'>
													<div
														className='h-3 w-3 rounded-full'
														style={{ backgroundColor: category.color }}
													/>
													{category.name}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{errors.categoryId && (
									<p className='text-sm text-destructive flex items-center gap-1'>
										<AlertCircle className='h-3 w-3' />
										{errors.categoryId}
									</p>
								)}
							</div>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='description'>Description</Label>
							<Input
								id='description'
								value={formData.description}
								onChange={(e) => handleInputChange('description', e.target.value)}
								placeholder='Optional description'
							/>
						</div>
					</div>

					{/* Billing Information */}
					<div className='space-y-4'>
						<h3 className='text-lg font-medium'>Billing Information</h3>

						<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='amount'>Amount *</Label>
								<Input
									id='amount'
									type='number'
									step='0.01'
									min='0'
									value={formData.amount}
									onChange={(e) =>
										handleInputChange('amount', parseFloat(e.target.value) || 0)
									}
									placeholder='0.00'
									className={errors.amount ? 'border-destructive' : ''}
								/>
								{errors.amount && (
									<p className='text-sm text-destructive flex items-center gap-1'>
										<AlertCircle className='h-3 w-3' />
										{errors.amount}
									</p>
								)}
							</div>

							<div className='space-y-2'>
								<Label htmlFor='currency'>Currency</Label>
								<Select
									value={formData.currency}
									onValueChange={(value) => handleInputChange('currency', value)}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='NOK'>NOK (Norwegian Krone)</SelectItem>
										<SelectItem value='USD'>USD (US Dollar)</SelectItem>
										<SelectItem value='EUR'>EUR (Euro)</SelectItem>
										<SelectItem value='GBP'>GBP (British Pound)</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='frequency'>Billing Frequency *</Label>
								<Select
									value={formData.billingFrequency}
									onValueChange={(value: any) =>
										handleInputChange('billingFrequency', value)
									}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='monthly'>Monthly</SelectItem>
										<SelectItem value='quarterly'>Quarterly</SelectItem>
										<SelectItem value='annually'>Annually</SelectItem>
										<SelectItem value='custom'>Custom</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{formData.billingFrequency === 'custom' && (
							<div className='space-y-2'>
								<Label htmlFor='customDays'>Custom Frequency (Days) *</Label>
								<Input
									id='customDays'
									type='number'
									min='1'
									value={formData.customFrequencyDays || ''}
									onChange={(e) =>
										handleInputChange(
											'customFrequencyDays',
											parseInt(e.target.value) || undefined,
										)
									}
									placeholder='e.g., 30 for every 30 days'
									className={
										errors.customFrequencyDays ? 'border-destructive' : ''
									}
								/>
								{errors.customFrequencyDays && (
									<p className='text-sm text-destructive flex items-center gap-1'>
										<AlertCircle className='h-3 w-3' />
										{errors.customFrequencyDays}
									</p>
								)}
							</div>
						)}

						<div className='space-y-2'>
							<Label>Next Payment Date *</Label>
							<Popover open={showCalendar} onOpenChange={setShowCalendar}>
								<PopoverTrigger asChild>
									<Button
										variant='outline'
										className='w-full justify-start text-left font-normal'>
										<CalendarIcon className='mr-2 h-4 w-4' />
										{formData.nextPaymentDate
											? format(formData.nextPaymentDate, 'PPP')
											: 'Pick a date'}
									</Button>
								</PopoverTrigger>
								<PopoverContent className='w-auto p-0'>
									<Calendar
										mode='single'
										selected={formData.nextPaymentDate}
										onSelect={(date) => {
											if (date) {
												handleInputChange('nextPaymentDate', date);
												setShowCalendar(false);
											}
										}}
										initialFocus
									/>
								</PopoverContent>
							</Popover>
						</div>
					</div>

					{/* Additional Information */}
					<div className='space-y-4'>
						<h3 className='text-lg font-medium'>Additional Information</h3>

						<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='website'>Website</Label>
								<div className='relative'>
									<Globe className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
									<Input
										id='website'
										value={formData.website}
										onChange={(e) =>
											handleInputChange('website', e.target.value)
										}
										placeholder='https://example.com'
										className={`pl-10 ${errors.website ? 'border-destructive' : ''}`}
									/>
								</div>
								{errors.website && (
									<p className='text-sm text-destructive flex items-center gap-1'>
										<AlertCircle className='h-3 w-3' />
										{errors.website}
									</p>
								)}
							</div>

							<div className='space-y-2'>
								<Label htmlFor='cancellationUrl'>Cancellation URL</Label>
								<div className='relative'>
									<Globe className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
									<Input
										id='cancellationUrl'
										value={formData.cancellationUrl}
										onChange={(e) =>
											handleInputChange('cancellationUrl', e.target.value)
										}
										placeholder='https://example.com/cancel'
										className={`pl-10 ${errors.cancellationUrl ? 'border-destructive' : ''}`}
									/>
								</div>
								{errors.cancellationUrl && (
									<p className='text-sm text-destructive flex items-center gap-1'>
										<AlertCircle className='h-3 w-3' />
										{errors.cancellationUrl}
									</p>
								)}
							</div>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='usageRating'>Usage Rating (1-5)</Label>
							<Select
								value={formData.usageRating?.toString() || 'none'}
								onValueChange={(value) =>
									handleInputChange(
										'usageRating',
										value === 'none' ? undefined : parseInt(value),
									)
								}>
								<SelectTrigger>
									<SelectValue placeholder='Rate this subscription' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='none'>No rating</SelectItem>
									<SelectItem value='1'>1 - Poor value</SelectItem>
									<SelectItem value='2'>2 - Below average</SelectItem>
									<SelectItem value='3'>3 - Average</SelectItem>
									<SelectItem value='4'>4 - Good value</SelectItem>
									<SelectItem value='5'>5 - Excellent value</SelectItem>
								</SelectContent>
							</Select>
							{errors.usageRating && (
								<p className='text-sm text-destructive flex items-center gap-1'>
									<AlertCircle className='h-3 w-3' />
									{errors.usageRating}
								</p>
							)}
						</div>

						<div className='space-y-2'>
							<Label htmlFor='notes'>Notes</Label>
							<Textarea
								id='notes'
								value={formData.notes}
								onChange={(e) => handleInputChange('notes', e.target.value)}
								placeholder='Additional notes about this subscription'
								rows={3}
							/>
						</div>

						<div className='flex items-center space-x-2'>
							<Switch
								id='isActive'
								checked={formData.isActive}
								onCheckedChange={(checked) =>
									handleInputChange('isActive', checked)
								}
							/>
							<Label htmlFor='isActive'>Active subscription</Label>
						</div>
					</div>

					{/* Form Actions */}
					<div className='flex items-center justify-end gap-4 pt-6 border-t'>
						{onCancel && (
							<Button type='button' variant='outline' onClick={onCancel}>
								<X className='h-4 w-4 mr-2' />
								Cancel
							</Button>
						)}
						<Button type='submit' disabled={isLoading}>
							<Save className='h-4 w-4 mr-2' />
							{isLoading
								? 'Saving...'
								: subscription
									? 'Update Subscription'
									: 'Create Subscription'}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

export default SubscriptionForm;
