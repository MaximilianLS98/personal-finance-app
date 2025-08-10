import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

export const metadata: Metadata = {
	title: 'Max Personal Finance',
	description: 'Import and visualize your personal finance data',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='en' suppressHydrationWarning>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				<Providers>
					<SidebarProvider>
						<AppSidebar />
						<SidebarInset>
							<div className='border-b px-4 h-12 flex items-center gap-2'>
								<SidebarTrigger />
								<div className='text-sm text-muted-foreground'>
									Max Personal Finance
								</div>
							</div>
							<div className='p-4'>{children}</div>
						</SidebarInset>
					</SidebarProvider>
				</Providers>
			</body>
		</html>
	);
}
