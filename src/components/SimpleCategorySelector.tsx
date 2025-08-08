'use client';

import React, { useState, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import type { Category, CategorySuggestion } from '@/lib/types';

interface SimpleCategorySelectorProps {
	categories: Category[];
	currentCategoryId?: string;
	onCategoryChange: (categoryId: string | undefined) => void;
	onSuggestRequest?: () => void;
	suggestion?: CategorySuggestion | null;
	isLoadingSuggestion?: boolean;
	disabled?: boolean;
	compact?: boolean;
}

export default function SimpleCategorySelector({ 
	categories,
	currentCategoryId, 
	onCategoryChange,
	onSuggestRequest,
	suggestion,
	isLoadingSuggestion = false,
	disabled = false,
	compact = false
}: SimpleCategorySelectorProps) {
	const [isOpen, setIsOpen] = useState(false);

	// Don't auto-open popover as it's too intrusive, but we'll show visual indicators
	
	const currentCategory = categories.find(cat => cat.id === currentCategoryId);

	const handleManualSelection = (categoryId: string) => {
		const actualCategoryId = categoryId === "__none__" ? undefined : categoryId;
		onCategoryChange(actualCategoryId);
		setIsOpen(false);
	};

	const handleSuggestionAccept = () => {
		if (suggestion) {
			onCategoryChange(suggestion.category.id);
		}
	};

	if (compact) {
		return (
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger asChild>
					<Button variant="ghost" size="sm" className="h-auto p-1 relative">
						{currentCategory ? (
							<Badge 
								variant="secondary" 
								style={{ 
									backgroundColor: currentCategory.color + '20', 
									color: currentCategory.color,
									fontSize: '11px',
									padding: '2px 6px'
								}}
							>
								{currentCategory.name}
							</Badge>
						) : suggestion ? (
							<div className="flex items-center gap-1">
								<Badge 
									variant="secondary"
									className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse"
									style={{ fontSize: '11px', padding: '2px 6px' }}
								>
									<Sparkles className="h-2 w-2 mr-1" />
									{suggestion.category.name}
								</Badge>
							</div>
						) : (
							<span className="text-xs text-muted-foreground">No category</span>
						)}
						{suggestion && !currentCategory && (
							<div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-80">
					<div className="space-y-3">
						{/* AI Suggestion */}
						{suggestion && (
							<div className="p-2 border rounded-md bg-blue-50 border-blue-200">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<Sparkles className="h-3 w-3 text-blue-600" />
										<span className="text-sm font-medium">Suggestion:</span>
										<Badge 
											variant="secondary"
											style={{ 
												backgroundColor: suggestion.category.color + '20', 
												color: suggestion.category.color 
											}}
										>
											{suggestion.category.name}
										</Badge>
										<span className="text-xs text-muted-foreground">
											{Math.round(suggestion.confidence * 100)}%
										</span>
									</div>
									<Button size="sm" onClick={handleSuggestionAccept}>
										Accept
									</Button>
								</div>
							</div>
						)}

						{/* Get Suggestion Button */}
						{!suggestion && !currentCategory && onSuggestRequest && (
							<Button
								variant="outline"
								size="sm"
								onClick={onSuggestRequest}
								disabled={isLoadingSuggestion}
								className="w-full"
							>
								{isLoadingSuggestion ? (
									<>
										<Loader2 className="h-3 w-3 mr-2 animate-spin" />
										Getting suggestion...
									</>
								) : (
									<>
										<Sparkles className="h-3 w-3 mr-2" />
										Get AI suggestion
									</>
								)}
							</Button>
						)}

						{/* Manual Selection */}
						<Select
							value={currentCategoryId || "__none__"}
							onValueChange={handleManualSelection}
							disabled={disabled}
						>
							<SelectTrigger>
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
				</PopoverContent>
			</Popover>
		);
	}

	// Full version (for edit dialogs)
	return (
		<div className="space-y-2">
			{currentCategory && (
				<Badge 
					variant="secondary" 
					style={{ backgroundColor: currentCategory.color + '20', color: currentCategory.color }}
				>
					{currentCategory.name}
				</Badge>
			)}

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