'use client';

import { NavMain } from '@/components/nav-main';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from '@/components/ui/sidebar';
import { BarChart3, CreditCard, Home, Receipt, Settings2, Target, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';

const navigation = [
	{ title: 'Home', url: '/home', icon: Home },
	{ title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
	{ title: 'Accounts', url: '/accounts', icon: Wallet },
	{ title: 'Review', url: '/review', icon: Receipt },
	{ title: 'Savings Goals', url: '/goals', icon: Target },
	{ title: 'Statements', url: '/imports', icon: Receipt },
	{
		title: 'Transactions',
		url: '/transactions',
		icon: Receipt,
		items: [
			{ title: 'All Transactions', url: '/transactions' },
			{ title: 'Categories', url: '/categories' },
			{ title: 'Import CSV', url: '/imports' },
		],
	},
	{
		title: 'Subscriptions',
		url: '/subscriptions',
		icon: CreditCard,
		items: [
			{ title: 'Overview', url: '/subscriptions' },
			{ title: 'Manage', url: '/subscriptions/manage' },
			{ title: 'Detect', url: '/subscriptions/detect' },
			{ title: 'Insights', url: '/subscriptions/insights' },
			{ title: 'Projections', url: '/subscriptions/projections' },
			{ title: 'New', url: '/subscriptions/new' },
		],
	},
	{
		title: 'Budgets',
		url: '/budgets',
		icon: Target,
		items: [
			{ title: 'Overview', url: '/budgets' },
			{ title: 'Scenarios', url: '/budgets/scenarios' },
			{ title: 'Payday & Rollover', url: '/budgets/planning' },
			{ title: 'New Budget', url: '/budgets/new' },
		],
	},
	{ title: 'Settings', url: '/settings', icon: Settings2 },
];

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible='icon' {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild size='lg' tooltip='Personal Finance'>
							<Link href='/home'>
								<Wallet />
								<span className='font-semibold'>Personal Finance</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={navigation} />
			</SidebarContent>
			<SidebarFooter>
				<p className='px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden'>
					Your finances, stored locally.
				</p>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
