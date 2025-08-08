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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Check, X } from 'lucide-react';
import type { Category, CategorySuggestion } from '@/lib/types';

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
	disabled = false 
}: CategorySelectorProps) {
	const [categories, setCategories] = useState<Category[]>([]);
	const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
	const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
	const [showSuggestion, setShowSuggestion] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch categories on component mount
	useEffect(() => {
		fetchCategories();
	}, []);

	// Get suggestion when description changes
	useEffect(() => {
		if (description && !currentCategoryId) {
			getSuggestion();
		}
	}, [description, currentCategoryId]);

	const fetchCategories = async () => {
		try {
			const response = await fetch('/api/categories');
			if (!response.ok) {
				throw new Error('Failed to fetch categories');
			}
			const data = await response.json();
			setCategories(data);
		} catch (error) {
			console.error('Error fetching categories:', error);
			setError('Failed to load categories');
		}
	};

	const getSuggestion = async () => {
		if (!description.trim()) return;
		
		setIsLoadingSuggestion(true);
		try {
			const response = await fetch('/api/categories/suggest', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ description }),
			});

			if (!response.ok) {
				throw new Error('Failed to get suggestion');
			}

			const suggestionData = await response.json();
			if (suggestionData) {
				setSuggestion(suggestionData);
				setShowSuggestion(true);
			}
		} catch (error) {
			console.error('Error getting suggestion:', error);
		} finally {
			setIsLoadingSuggestion(false);
		}
	};

	const handleSuggestionAccept = async () => {
		if (!suggestion) return;
		
		try {
			// Learn from the user action
			await fetch('/api/categories/learn', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					description,
					categoryId: suggestion.category.id,
					wasCorrectSuggestion: true,
				}),
			});

			onCategoryChange(suggestion.category.id, true);
			setShowSuggestion(false);
		} catch (error) {
			console.error('Error accepting suggestion:', error);
		}
	};

	const handleSuggestionReject = () => {
		setShowSuggestion(false);
	};

	const handleManualSelection = async (categoryId: string) => {
		try {
			// Convert special "__none__" value to undefined
			const actualCategoryId = categoryId === "__none__" ? undefined : categoryId;

			// If we had a suggestion and user chose differently, learn from it
			if (suggestion && actualCategoryId && actualCategoryId !== suggestion.category.id) {
				await fetch('/api/categories/learn', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						description,
						categoryId: actualCategoryId,
						wasCorrectSuggestion: false,
					}),
				});
			}

			onCategoryChange(actualCategoryId, false);
			setShowSuggestion(false);
		} catch (error) {
			console.error('Error with manual selection:', error);
		}
	};

	const currentCategory = categories.find(cat => cat.id === currentCategoryId);

	if (error) {
		return (
			<Alert>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="space-y-2">
			{/* Current Category Display */}
			{currentCategory && (
				<div className="flex items-center gap-2">
					<Badge 
						variant="secondary" 
						style={{ backgroundColor: currentCategory.color + '20', color: currentCategory.color }}
					>
						{currentCategory.name}
					</Badge>
				</div>
			)}

			{/* AI Suggestion */}
			{showSuggestion && suggestion && !currentCategoryId && (
				<Alert className="border-blue-200 bg-blue-50">
					<Sparkles className="h-4 w-4 text-blue-600" />
					<AlertDescription className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="text-sm">
								Suggested: <strong>{suggestion.category.name}</strong>
							</span>
							<Badge variant="outline" className="text-xs">
								{Math.round(suggestion.confidence * 100)}% confident
							</Badge>
						</div>
						<div className="flex gap-1">
							<Button
								size="sm"
								variant="ghost"
								onClick={handleSuggestionAccept}
								disabled={disabled}
								className="h-6 px-2 text-green-600 hover:text-green-700"
							>
								<Check className="h-3 w-3" />
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={handleSuggestionReject}
								className="h-6 px-2 text-gray-600 hover:text-gray-700"
							>
								<X className="h-3 w-3" />
							</Button>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{/* Loading Suggestion */}
			{isLoadingSuggestion && (
				<Alert className="border-gray-200 bg-gray-50">
					<Sparkles className="h-4 w-4 text-gray-600 animate-pulse" />
					<AlertDescription className="text-sm text-gray-600">
						Getting category suggestion...
					</AlertDescription>
				</Alert>
			)}

			{/* Category Selector */}
			<Select
				value={currentCategoryId || "__none__"}
				onValueChange={handleManualSelection}
				disabled={disabled}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Select a category..." />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="__none__">No Category</SelectItem>
					{categories.map((category) => (
						<SelectItem key={category.id} value={category.id}>
							<div className="flex items-center gap-2">
								<div
									className="w-3 h-3 rounded-full"
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