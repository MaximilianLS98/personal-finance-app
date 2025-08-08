'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Check, X } from 'lucide-react';
import type { Category, CategorySuggestion } from '@/lib/types';
import {
	useCategoriesQuery,
	useSuggestCategoryMutation,
	useLearnFromActionMutation,
} from '@/lib/queries';

interface CategorySelectorProps {
	description: string;
	currentCategoryId?: string;
	onCategoryChange: (categoryId: string | undefined, wasCorrectSuggestion?: boolean) => void;
	disabled?: boolean;
}

export default function CategorySelector({
	description,
	currentCategoryId,
	onCategoryChange,
	disabled = false,
}: CategorySelectorProps) {
	const { data: categories = [], isLoading: isLoadingCategories, error } = useCategoriesQuery();
	const suggest = useSuggestCategoryMutation();
	const learn = useLearnFromActionMutation();

	const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
	const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
	const [showSuggestion, setShowSuggestion] = useState(false);

	// Get suggestion when description changes
	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			if (description && !currentCategoryId) {
				setIsLoadingSuggestion(true);
				try {
					const result = await suggest.mutateAsync(description);
					if (!cancelled && result) {
						setSuggestion(result);
						setShowSuggestion(true);
					}
				} finally {
					if (!cancelled) setIsLoadingSuggestion(false);
				}
			} else {
				setShowSuggestion(false);
				setSuggestion(null);
			}
		};
		run();
		return () => {
			cancelled = true;
		};
	}, [description, currentCategoryId]);

	const handleSuggestionAccept = async () => {
		if (!suggestion) return;
		try {
			await learn.mutateAsync({
				description,
				categoryId: suggestion.category.id,
				wasCorrectSuggestion: true,
			});
			onCategoryChange(suggestion.category.id, true);
			setShowSuggestion(false);
		} catch {}
	};

	const handleSuggestionReject = () => {
		setShowSuggestion(false);
	};

	const handleManualSelection = async (categoryId: string) => {
		try {
			const actualCategoryId = categoryId === '__none__' ? undefined : categoryId;
			if (suggestion && actualCategoryId && actualCategoryId !== suggestion.category.id) {
				await learn.mutateAsync({
					description,
					categoryId: actualCategoryId,
					wasCorrectSuggestion: false,
				});
			}
			onCategoryChange(actualCategoryId, false);
			setShowSuggestion(false);
		} catch {}
	};

	const currentCategory = categories.find((cat) => cat.id === currentCategoryId);

	if (error) {
		return (
			<Alert>
				<AlertDescription>Failed to load categories</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className='space-y-2'>
			{/* Current Category Display */}
			{currentCategory && (
				<div className='flex items-center gap-2'>
					<Badge
						variant='secondary'
						style={{
							backgroundColor: currentCategory.color + '20',
							color: currentCategory.color,
						}}>
						{currentCategory.name}
					</Badge>
				</div>
			)}

			{/* AI Suggestion */}
			{showSuggestion && suggestion && !currentCategoryId && (
				<Alert className='border-blue-200 bg-blue-50'>
					<Sparkles className='h-4 w-4 text-blue-600' />
					<AlertDescription className='flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<span className='text-sm'>
								Suggested: <strong>{suggestion.category.name}</strong>
							</span>
							<Badge variant='outline' className='text-xs'>
								{Math.round(suggestion.confidence * 100)}% confident
							</Badge>
						</div>
						<div className='flex gap-1'>
							<Button
								size='sm'
								variant='ghost'
								onClick={handleSuggestionAccept}
								disabled={disabled}
								className='h-6 px-2 text-green-600 hover:text-green-700'>
								<Check className='h-3 w-3' />
							</Button>
							<Button
								size='sm'
								variant='ghost'
								onClick={handleSuggestionReject}
								className='h-6 px-2 text-muted-foreground hover:text-foreground'>
								<X className='h-3 w-3' />
							</Button>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{/* Loading Suggestion */}
			{isLoadingSuggestion && (
				<Alert className='border-input bg-muted'>
					<Sparkles className='h-4 w-4 text-muted-foreground animate-pulse' />
					<AlertDescription className='text-sm text-muted-foreground'>
						Getting category suggestion...
					</AlertDescription>
				</Alert>
			)}

			{/* Category Selector */}
			<Select
				value={currentCategoryId || '__none__'}
				onValueChange={handleManualSelection}
				disabled={disabled || isLoadingCategories}>
				<SelectTrigger className='w-full'>
					<SelectValue placeholder='Select a category...' />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value='__none__'>No Category</SelectItem>
					{categories.map((category) => (
						<SelectItem key={category.id} value={category.id}>
							<div className='flex items-center gap-2'>
								<div
									className='w-3 h-3 rounded-full'
									style={{ backgroundColor: category.color }}
								/>
								{category.name}
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
