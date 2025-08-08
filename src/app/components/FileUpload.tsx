'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Transaction, ErrorResponse } from '@/lib/types';

interface FileUploadProps {
	onUploadSuccess?: (data: { transactions: Transaction[]; summary: any }) => void;
	onUploadError?: (error: string) => void;
}

interface UploadState {
	isDragOver: boolean;
	isUploading: boolean;
	uploadProgress: number;
	error: string | null;
	success: boolean;
	fileName: string | null;
}

export default function FileUpload({ onUploadSuccess, onUploadError }: FileUploadProps) {
	const [state, setState] = useState<UploadState>({
		isDragOver: false,
		isUploading: false,
		uploadProgress: 0,
		error: null,
		success: false,
		fileName: null,
	});

	const fileInputRef = useRef<HTMLInputElement>(null);

	const resetState = useCallback(() => {
		setState((prev) => ({
			...prev,
			error: null,
			success: false,
			uploadProgress: 0,
			fileName: null,
		}));
	}, []);

	const validateFile = useCallback((file: File): string | null => {
		// Check file type
		const allowedTypes = ['text/csv', 'application/csv', 'application/vnd.ms-excel'];
		const isValidType =
			allowedTypes.includes(file.type) ||
			(file.type === 'text/plain' && file.name.toLowerCase().endsWith('.csv')) ||
			file.name.toLowerCase().endsWith('.csv');

		if (!isValidType) {
			return 'Please select a valid CSV file';
		}

		// Check file size (5MB limit)
		const maxSize = 5 * 1024 * 1024;
		if (file.size > maxSize) {
			return 'File size must be less than 5MB';
		}

		return null;
	}, []);

	const uploadFile = useCallback(
		async (file: File) => {
			resetState();

			const validationError = validateFile(file);
			if (validationError) {
				setState((prev) => ({ ...prev, error: validationError }));
				onUploadError?.(validationError);
				return;
			}

			setState((prev) => ({
				...prev,
				isUploading: true,
				fileName: file.name,
				uploadProgress: 0,
			}));

			try {
				const formData = new FormData();
				formData.append('file', file);

				// Simulate upload progress
				const progressInterval = setInterval(() => {
					setState((prev) => ({
						...prev,
						uploadProgress: Math.min(prev.uploadProgress + 10, 90),
					}));
				}, 100);

				const response = await fetch('/api/upload', {
					method: 'POST',
					body: formData,
				});

				clearInterval(progressInterval);

				const result = await response.json();

				if (!response.ok) {
					const errorData = result as ErrorResponse;
					throw new Error(errorData.message || 'Upload failed');
				}

				setState((prev) => ({
					...prev,
					isUploading: false,
					uploadProgress: 100,
					success: true,
				}));

				onUploadSuccess?.(result.data);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Upload failed';
				setState((prev) => ({
					...prev,
					isUploading: false,
					error: errorMessage,
					uploadProgress: 0,
				}));
				onUploadError?.(errorMessage);
			}
		},
		[validateFile, resetState, onUploadSuccess, onUploadError],
	);

	const handleFileSelect = useCallback(
		(files: FileList | null) => {
			if (files && files.length > 0) {
				uploadFile(files[0]);
			}
		},
		[uploadFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setState((prev) => ({ ...prev, isDragOver: true }));
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setState((prev) => ({ ...prev, isDragOver: false }));
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setState((prev) => ({ ...prev, isDragOver: false }));
			handleFileSelect(e.dataTransfer.files);
		},
		[handleFileSelect],
	);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			handleFileSelect(e.target.files);
		},
		[handleFileSelect],
	);

	const handleButtonClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const getStatusIcon = () => {
		if (state.isUploading) {
			return <Loader2 className='h-8 w-8 animate-spin text-blue-500' />;
		}
		if (state.success) {
			return <CheckCircle2 className='h-8 w-8 text-green-500' />;
		}
		if (state.error) {
			return <AlertCircle className='h-8 w-8 text-red-500' />;
		}
		return <Upload className='h-8 w-8 text-muted-foreground' />;
	};

	const getStatusText = () => {
		if (state.isUploading) {
			return `Uploading ${state.fileName}... ${state.uploadProgress}%`;
		}
		if (state.success) {
			return `Successfully uploaded ${state.fileName}`;
		}
		if (state.error) {
			return state.error;
		}
		return 'Drag and drop your CSV file here, or click to browse';
	};

	const getStatusColor = () => {
		if (state.error) return 'text-red-600';
		if (state.success) return 'text-green-600';
		if (state.isUploading) return 'text-blue-600';
		return 'text-muted-foreground';
	};

	return (
		<div className='w-full'>
			<Card
				className={`
					border-2 border-dashed transition-all duration-200 cursor-pointer
					${state.isDragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-muted-foreground/25'}
					${state.error ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : ''}
					${state.success ? 'border-green-400 bg-green-50 dark:bg-green-950/20' : ''}
				`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				onClick={handleButtonClick}>
				<CardContent className='flex flex-col items-center justify-center p-8 text-center'>
					{getStatusIcon()}

					<p className={`mt-4 text-sm font-medium ${getStatusColor()}`}>
						{getStatusText()}
					</p>

					{state.isUploading && (
						<div className='w-full max-w-xs mt-4'>
							<div className='bg-gray-200 rounded-full h-2 dark:bg-gray-700'>
								<div
									className='bg-blue-600 h-2 rounded-full transition-all duration-300'
									style={{ width: `${state.uploadProgress}%` }}
								/>
							</div>
						</div>
					)}

					{!state.isUploading && (
						<div className='mt-4 flex flex-col sm:flex-row gap-2 items-center'>
							<Button
								variant='outline'
								size='sm'
								onClick={(e) => {
									e.stopPropagation();
									handleButtonClick();
								}}
								disabled={state.isUploading}>
								<FileText className='h-4 w-4 mr-2' />
								Choose File
							</Button>
							<span className='text-xs text-muted-foreground'>
								CSV files up to 5MB
							</span>
						</div>
					)}

					<Input
						ref={fileInputRef}
						type='file'
						accept='.csv,text/csv,application/csv'
						onChange={handleInputChange}
						className='hidden'
						disabled={state.isUploading}
						data-testid='file-input'
					/>
				</CardContent>
			</Card>
		</div>
	);
}
