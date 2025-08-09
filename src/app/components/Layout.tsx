'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Receipt, Settings as SettingsIcon, BarChart3 } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import SettingsPanel from '@/app/components/SettingsPanel';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface LayoutProps {
	children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
	const pathname = usePathname();

	const isActive = (path: string) => pathname === path;

	return (
		<div className='min-h-screen bg-background'>
			<header className='border-b'>
				<div className='container mx-auto px-4 py-6'>
					<div className='flex justify-between items-center'>
						<div>
							<h1 className='text-3xl font-bold text-foreground'>
								Max Personal Finance
							</h1>
							<p className='text-muted-foreground mt-2'>
								Import and visualize your personal finance data
							</p>
						</div>
						<nav className='flex space-x-4 items-center'>
							<Link
								href='/home'
								className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
									isActive('/home')
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:text-foreground hover:bg-muted'
								}`}>
								<Home className='mr-2 h-4 w-4' />
								Home
							</Link>
							<Link
								href='/dashboard'
								className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
									isActive('/dashboard')
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:text-foreground hover:bg-muted'
								}`}>
								<BarChart3 className='mr-2 h-4 w-4' />
								Dashboard
							</Link>
							<Link
								href='/transactions'
								className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
									isActive('/transactions')
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:text-foreground hover:bg-muted'
								}`}>
								<Receipt className='mr-2 h-4 w-4' />
								Transactions
							</Link>
							<Sheet>
								<SheetTrigger className='flex items-center px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted'>
									<SettingsIcon className='mr-2 h-4 w-4' />
									Settings
								</SheetTrigger>
								<SheetContent side='right' className='w-full max-w-lg'>
									<SheetHeader>
										<SheetTitle className='sr-only'>Settings</SheetTitle>
									</SheetHeader>
									<SettingsPanel />
								</SheetContent>
							</Sheet>
						</nav>
					</div>
				</div>
			</header>

			<main className='container mx-auto px-4 py-8'>{children}</main>

			<footer className='border-t mt-auto'>
				<div className='container mx-auto px-4 py-6'>
					<p className='text-sm text-muted-foreground text-center'>
						CSV Finance Tracker - Built with Next.js and shadcn/ui
					</p>
				</div>
			</footer>
		</div>
	);
}
