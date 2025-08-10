'use client';

import * as React from 'react';
import {
	Home,
	BarChart3,
	Receipt,
	CreditCard,
	Target,
	Settings2,
	AudioWaveform,
	Command,
	GalleryVerticalEnd,
	Frame,
	PieChart,
	Map,
} from 'lucide-react';

import { NavMain } from '@/components/nav-main';
import { NavProjects } from '@/components/nav-projects';
import { NavUser } from '@/components/nav-user';
import { TeamSwitcher } from '@/components/team-switcher';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from '@/components/ui/sidebar';

// Application navigation data.
const data = {
	user: {
		name: 'shadcn',
		email: 'm@example.com',
		avatar: '/avatars/shadcn.jpg',
	},
	teams: [
		{
			name: 'Acme Inc',
			logo: GalleryVerticalEnd,
			plan: 'Enterprise',
		},
		{
			name: 'Acme Corp.',
			logo: AudioWaveform,
			plan: 'Startup',
		},
		{
			name: 'Evil Corp.',
			logo: Command,
			plan: 'Free',
		},
	],
	navMain: [
		{
			title: 'Home',
			url: '/home',
			icon: Home,
			items: [
				{
					title: 'Overview',
					url: '/home',
				},
			],
		},
		{
			title: 'Dashboard',
			url: '/dashboard',
			icon: BarChart3,
			items: [
				{
					title: 'Overview',
					url: '/dashboard',
				},
				{
					title: 'Reports',
					url: '#',
				},
			],
		},
		{
			title: 'Transactions',
			url: '/transactions',
			icon: Receipt,
			items: [
				{
					title: 'All Transactions',
					url: '/transactions',
				},
				{
					title: 'Categories',
					url: '/categories',
				},
				{
					title: 'Import CSV',
					url: '#',
				},
			],
		},
		{
			title: 'Subscriptions',
			url: '/subscriptions',
			icon: CreditCard,
			items: [
				{
					title: 'Overview',
					url: '/subscriptions',
				},
				{
					title: 'Manage',
					url: '/subscriptions/manage',
				},
				{
					title: 'Detect',
					url: '/subscriptions/detect',
				},
				{
					title: 'Insights',
					url: '/subscriptions/insights',
				},
				{
					title: 'Projections',
					url: '/subscriptions/projections',
				},
				{
					title: 'New',
					url: '/subscriptions/new',
				},
			],
		},
		{
			title: 'Budgets',
			url: '/budgets',
			icon: Target,
			items: [
				{
					title: 'Overview',
					url: '/budgets',
				},
				{
					title: 'Scenarios',
					url: '/budgets/scenarios',
				},
				{
					title: 'New Budget',
					url: '/budgets/new',
				},
			],
		},
		{
			title: 'Settings',
			url: '/settings',
			icon: Settings2,
			items: [
				{
					title: 'Preferences',
					url: '/settings',
				},
			],
		},
	],
	projects: [
		{
			name: 'Import CSV',
			url: '#',
			icon: Frame,
		},
		{
			name: 'Summary',
			url: '/dashboard',
			icon: PieChart,
		},
		{
			name: 'Budgets Analytics',
			url: '#',
			icon: Map,
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible='icon' {...props}>
			<SidebarHeader>
				<TeamSwitcher teams={data.teams} />
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
				<NavProjects projects={data.projects} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={data.user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
