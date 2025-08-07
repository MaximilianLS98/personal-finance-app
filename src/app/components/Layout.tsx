import { ReactNode } from 'react';

interface LayoutProps {
	children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
	return (
		<div className='min-h-screen bg-background'>
			<header className='border-b'>
				<div className='container mx-auto px-4 py-6'>
					<h1 className='text-3xl font-bold text-foreground'>CSV Finance Tracker</h1>
					<p className='text-muted-foreground mt-2'>
						Import and visualize your monthly bank CSV files
					</p>
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
