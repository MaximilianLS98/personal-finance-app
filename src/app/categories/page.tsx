'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Layout from '@/app/components/Layout';
import { 
	Plus, 
	Pencil, 
	Trash2, 
	Palette, 
	Brain, 
	Target,
	TrendingUp,
	Settings,
	Sparkles,
	AlertTriangle,
	Eye,
	EyeOff
} from 'lucide-react';
import type { Category, CategoryRule } from '@/lib/types';

// Common colors for categories
const PRESET_COLORS = [
	'#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', 
	'#EC4899', '#06B6D4', '#84CC16', '#6B7280', '#9333EA', 
	'#059669', '#9CA3AF', '#F97316', '#14B8A6', '#A855F7'
];

// Common icons for categories
const PRESET_ICONS = [
	{ value: 'shopping-cart', label: 'Shopping Cart', emoji: '🛒' },
	{ value: 'car', label: 'Car', emoji: '🚗' },
	{ value: 'home', label: 'Home', emoji: '🏠' },
	{ value: 'utensils', label: 'Utensils', emoji: '🍽️' },
	{ value: 'heart', label: 'Heart', emoji: '❤️' },
	{ value: 'film', label: 'Film', emoji: '🎬' },
	{ value: 'shopping-bag', label: 'Shopping Bag', emoji: '🛍️' },
	{ value: 'zap', label: 'Zap', emoji: '⚡' },
	{ value: 'credit-card', label: 'Credit Card', emoji: '💳' },
	{ value: 'shield', label: 'Shield', emoji: '🛡️' },
	{ value: 'trending-up', label: 'Trending Up', emoji: '📈' },
	{ value: 'help-circle', label: 'Help Circle', emoji: '❓' }
];

interface CategoryFormData {
	name: string;
	description: string;
	color: string;
	icon: string;
	parentId?: string;
}

export default function CategoriesPage() {
	const [categories, setCategories] = useState<Category[]>([]);
	const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	
	// Category CRUD state
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState<Category | null>(null);
	const [formData, setFormData] = useState<CategoryFormData>({
		name: '',
		description: '',
		color: PRESET_COLORS[0],
		icon: PRESET_ICONS[0].value,
	});
	
	// AI Rules state
	const [newRuleData, setNewRuleData] = useState({
		categoryId: '',
		pattern: '',
		patternType: 'contains' as CategoryRule['patternType'],
		confidenceScore: 0.8,
	});
	const [showSystemRules, setShowSystemRules] = useState(false);

	useEffect(() => {
		fetchData();
	}, []);

	const fetchData = async () => {
		setIsLoading(true);
		try {
			const [categoriesResponse, rulesResponse] = await Promise.all([
				fetch('/api/categories'),
				fetch('/api/category-rules')
			]);

			if (!categoriesResponse.ok || !rulesResponse.ok) {
				throw new Error('Failed to fetch data');
			}

			const [categoriesData, rulesData] = await Promise.all([
				categoriesResponse.json(),
				rulesResponse.json()
			]);

			setCategories(categoriesData);
			setCategoryRules(rulesData);
		} catch (error) {
			console.error('Error fetching data:', error);
			setError('Failed to load categories and rules');
		} finally {
			setIsLoading(false);
		}
	};

	const handleCreateCategory = async () => {
		try {
			const response = await fetch('/api/categories', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData),
			});

			if (!response.ok) {
				throw new Error('Failed to create category');
			}

			await fetchData();
			setIsCreateDialogOpen(false);
			resetForm();
		} catch (error) {
			console.error('Error creating category:', error);
			setError('Failed to create category');
		}
	};

	const handleEditCategory = async () => {
		if (!editingCategory) return;

		try {
			const response = await fetch(`/api/categories/${editingCategory.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData),
			});

			if (!response.ok) {
				throw new Error('Failed to update category');
			}

			await fetchData();
			setEditingCategory(null);
			resetForm();
		} catch (error) {
			console.error('Error updating category:', error);
			setError('Failed to update category');
		}
	};

	const handleDeleteCategory = async (categoryId: string) => {
		if (!confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
			return;
		}

		try {
			const response = await fetch(`/api/categories/${categoryId}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				throw new Error('Failed to delete category');
			}

			await fetchData();
		} catch (error) {
			console.error('Error deleting category:', error);
			setError('Failed to delete category');
		}
	};

	const handleCreateRule = async () => {
		try {
			const response = await fetch('/api/category-rules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newRuleData),
			});

			if (!response.ok) {
				throw new Error('Failed to create rule');
			}

			await fetchData();
			setNewRuleData({
				categoryId: '',
				pattern: '',
				patternType: 'contains',
				confidenceScore: 0.8,
			});
		} catch (error) {
			console.error('Error creating rule:', error);
			setError('Failed to create rule');
		}
	};

	const handleDeleteRule = async (ruleId: string) => {
		if (!confirm('Are you sure you want to delete this AI rule?')) {
			return;
		}

		try {
			const response = await fetch(`/api/category-rules/${ruleId}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				throw new Error('Failed to delete rule');
			}

			await fetchData();
		} catch (error) {
			console.error('Error deleting rule:', error);
			setError('Failed to delete rule');
		}
	};

	const openEditDialog = (category: Category) => {
		setEditingCategory(category);
		setFormData({
			name: category.name,
			description: category.description || '',
			color: category.color,
			icon: category.icon,
			parentId: category.parentId,
		});
	};

	const resetForm = () => {
		setFormData({
			name: '',
			description: '',
			color: PRESET_COLORS[0],
			icon: PRESET_ICONS[0].value,
		});
	};

	const getCategoryName = (categoryId: string) => {
		const category = categories.find(c => c.id === categoryId);
		return category?.name || 'Unknown Category';
	};

	const filteredRules = showSystemRules 
		? categoryRules 
		: categoryRules.filter(rule => rule.createdBy === 'user');

	const aiStats = {
		totalRules: categoryRules.length,
		userRules: categoryRules.filter(r => r.createdBy === 'user').length,
		systemRules: categoryRules.filter(r => r.createdBy === 'system').length,
		avgConfidence: categoryRules.length > 0 
			? Math.round((categoryRules.reduce((sum, r) => sum + r.confidenceScore, 0) / categoryRules.length) * 100)
			: 0,
	};

	if (isLoading) {
		return (
			<Layout>
				<div className="flex justify-center items-center h-64">
					<div className="animate-pulse text-lg">Loading categories...</div>
				</div>
			</Layout>
		);
	}

	return (
		<Layout>
			<div className="space-y-6">
				<div className="flex justify-between items-center">
					<div>
						<h1 className="text-3xl font-bold">Category Management</h1>
						<p className="text-muted-foreground">
							Manage your expense categories and AI categorization rules
						</p>
					</div>
					<Button onClick={() => setIsCreateDialogOpen(true)}>
						<Plus className="w-4 h-4 mr-2" />
						Add Category
					</Button>
				</div>

				{error && (
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<Tabs defaultValue="categories" className="space-y-6">
					<TabsList>
						<TabsTrigger value="categories">Categories</TabsTrigger>
						<TabsTrigger value="ai-rules">AI Rules</TabsTrigger>
						<TabsTrigger value="analytics">Analytics</TabsTrigger>
					</TabsList>

					<TabsContent value="categories">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Settings className="w-5 h-5" />
									Expense Categories
								</CardTitle>
							</CardHeader>
							<CardContent>
								<Table>
									<TableCaption>
										{categories.length === 0 
											? 'No categories found. Create your first category to get started.'
											: `You have ${categories.length} expense categories.`
										}
									</TableCaption>
									<TableHeader>
										<TableRow>
											<TableHead>Category</TableHead>
											<TableHead>Description</TableHead>
											<TableHead>Color</TableHead>
											<TableHead>Icon</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{categories.map((category) => (
											<TableRow key={category.id}>
												<TableCell className="font-medium">
													{category.name}
												</TableCell>
												<TableCell>
													{category.description || 'No description'}
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<div
															className="w-4 h-4 rounded-full"
															style={{ backgroundColor: category.color }}
														/>
														<code className="text-xs">{category.color}</code>
													</div>
												</TableCell>
												<TableCell>
													<Badge variant="outline">
														{category.icon}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													<div className="flex justify-end gap-2">
														<Button
															size="sm"
															variant="outline"
															onClick={() => openEditDialog(category)}
														>
															<Pencil className="w-4 h-4" />
														</Button>
														<Button
															size="sm"
															variant="outline"
															onClick={() => handleDeleteCategory(category.id)}
														>
															<Trash2 className="w-4 h-4" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="ai-rules">
						<div className="space-y-6">
							{/* AI Stats Overview */}
							<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
								<Card>
									<CardContent className="p-6">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium text-muted-foreground">Total Rules</p>
												<p className="text-2xl font-bold">{aiStats.totalRules}</p>
											</div>
											<Brain className="w-8 h-8 text-blue-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-6">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium text-muted-foreground">User Rules</p>
												<p className="text-2xl font-bold">{aiStats.userRules}</p>
											</div>
											<Target className="w-8 h-8 text-green-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-6">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium text-muted-foreground">System Rules</p>
												<p className="text-2xl font-bold">{aiStats.systemRules}</p>
											</div>
											<Settings className="w-8 h-8 text-gray-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-6">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium text-muted-foreground">Avg Confidence</p>
												<p className="text-2xl font-bold">{aiStats.avgConfidence}%</p>
											</div>
											<TrendingUp className="w-8 h-8 text-purple-500" />
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Add New Rule */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Sparkles className="w-5 h-5" />
										Add New AI Rule
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-1 md:grid-cols-5 gap-4">
										<Select
											value={newRuleData.categoryId}
											onValueChange={(value) => setNewRuleData(prev => ({ ...prev, categoryId: value }))}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select category" />
											</SelectTrigger>
											<SelectContent>
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
										<Input
											placeholder="Pattern (e.g., STARBUCKS)"
											value={newRuleData.pattern}
											onChange={(e) => setNewRuleData(prev => ({ ...prev, pattern: e.target.value }))}
										/>
										<Select
											value={newRuleData.patternType}
											onValueChange={(value: CategoryRule['patternType']) => 
												setNewRuleData(prev => ({ ...prev, patternType: value }))
											}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="contains">Contains</SelectItem>
												<SelectItem value="starts_with">Starts With</SelectItem>
												<SelectItem value="exact">Exact Match</SelectItem>
												<SelectItem value="regex">Regex</SelectItem>
											</SelectContent>
										</Select>
										<Input
											type="number"
											min="0"
											max="1"
											step="0.1"
											placeholder="Confidence (0.0-1.0)"
											value={newRuleData.confidenceScore}
											onChange={(e) => setNewRuleData(prev => ({ 
												...prev, 
												confidenceScore: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
											}))}
										/>
										<Button
											onClick={handleCreateRule}
											disabled={!newRuleData.categoryId || !newRuleData.pattern}
										>
											<Plus className="w-4 h-4 mr-2" />
											Add Rule
										</Button>
									</div>
								</CardContent>
							</Card>

							{/* Rules List */}
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle className="flex items-center gap-2">
											<Brain className="w-5 h-5" />
											AI Categorization Rules
										</CardTitle>
										<div className="flex items-center gap-2">
											<Label htmlFor="show-system" className="text-sm">
												Show system rules
											</Label>
											<Switch
												id="show-system"
												checked={showSystemRules}
												onCheckedChange={setShowSystemRules}
											/>
											{showSystemRules ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<Table>
										<TableCaption>
											{filteredRules.length === 0 
												? showSystemRules 
													? 'No rules found.'
													: 'No user rules found. System rules are hidden.'
												: `Showing ${filteredRules.length} AI rules.`
											}
										</TableCaption>
										<TableHeader>
											<TableRow>
												<TableHead>Category</TableHead>
												<TableHead>Pattern</TableHead>
												<TableHead>Type</TableHead>
												<TableHead>Confidence</TableHead>
												<TableHead>Usage</TableHead>
												<TableHead>Source</TableHead>
												<TableHead className="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredRules.map((rule) => (
												<TableRow key={rule.id}>
													<TableCell>
														<Badge 
															variant="secondary"
															style={{ 
																backgroundColor: categories.find(c => c.id === rule.categoryId)?.color + '20',
																color: categories.find(c => c.id === rule.categoryId)?.color
															}}
														>
															{getCategoryName(rule.categoryId)}
														</Badge>
													</TableCell>
													<TableCell className="font-mono text-sm">
														{rule.pattern}
													</TableCell>
													<TableCell>
														<Badge variant="outline">{rule.patternType}</Badge>
													</TableCell>
													<TableCell>
														<Badge variant={rule.confidenceScore >= 0.8 ? "default" : "secondary"}>
															{Math.round(rule.confidenceScore * 100)}%
														</Badge>
													</TableCell>
													<TableCell>
														{rule.usageCount} uses
													</TableCell>
													<TableCell>
														<Badge variant={rule.createdBy === 'user' ? "default" : "secondary"}>
															{rule.createdBy === 'user' ? 'User' : 'System'}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														{rule.createdBy === 'user' && (
															<Button
																size="sm"
																variant="outline"
																onClick={() => handleDeleteRule(rule.id)}
															>
																<Trash2 className="w-4 h-4" />
															</Button>
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</CardContent>
							</Card>
						</div>
					</TabsContent>

					<TabsContent value="analytics">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<TrendingUp className="w-5 h-5" />
									Category Analytics
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-center text-muted-foreground py-12">
									<TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
									<p>Category analytics and spending insights coming soon!</p>
									<p className="text-sm mt-2">
										This will show category spending trends, budget tracking, and AI performance metrics.
									</p>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>

				{/* Create/Edit Category Dialog */}
				<Dialog open={isCreateDialogOpen || editingCategory !== null} onOpenChange={(open) => {
					if (!open) {
						setIsCreateDialogOpen(false);
						setEditingCategory(null);
						resetForm();
					}
				}}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>
								{editingCategory ? 'Edit Category' : 'Create New Category'}
							</DialogTitle>
							<DialogDescription>
								{editingCategory 
									? 'Update the category details below.'
									: 'Add a new expense category to organize your transactions.'
								}
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="category-name" className="text-right">
									Name
								</Label>
								<Input
									id="category-name"
									value={formData.name}
									onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
									className="col-span-3"
									placeholder="e.g., Groceries"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="category-description" className="text-right">
									Description
								</Label>
								<Textarea
									id="category-description"
									value={formData.description}
									onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
									className="col-span-3"
									placeholder="Optional description"
									rows={2}
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label className="text-right">Color</Label>
								<div className="col-span-3">
									<div className="flex flex-wrap gap-2 mb-2">
										{PRESET_COLORS.map((color) => (
											<button
												key={color}
												className={`w-8 h-8 rounded-full border-2 ${
													formData.color === color ? 'border-gray-900' : 'border-gray-300'
												}`}
												style={{ backgroundColor: color }}
												onClick={() => setFormData(prev => ({ ...prev, color }))}
											/>
										))}
									</div>
									<Input
										type="color"
										value={formData.color}
										onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
										className="w-20 h-8"
									/>
								</div>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label htmlFor="category-icon" className="text-right">
									Icon
								</Label>
								<Select
									value={formData.icon}
									onValueChange={(value) => setFormData(prev => ({ ...prev, icon: value }))}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PRESET_ICONS.map((icon) => (
											<SelectItem key={icon.value} value={icon.value}>
												<div className="flex items-center gap-2">
													<span>{icon.emoji}</span>
													{icon.label}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex justify-end space-x-2 pt-4">
								<Button
									variant="outline"
									onClick={() => {
										setIsCreateDialogOpen(false);
										setEditingCategory(null);
										resetForm();
									}}
								>
									Cancel
								</Button>
								<Button
									onClick={editingCategory ? handleEditCategory : handleCreateCategory}
									disabled={!formData.name || !formData.color || !formData.icon}
								>
									{editingCategory ? 'Update Category' : 'Create Category'}
								</Button>
							</div>
						</div>
					</DialogContent>
				</Dialog>
			</div>
		</Layout>
	);
}