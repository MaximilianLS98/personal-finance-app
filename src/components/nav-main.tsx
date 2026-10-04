'use client';
import { usePathname } from 'next/navigation';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from '@/components/ui/sidebar';

export function NavMain({
	items,
}: {
	items: {
		title: string;
		url: string;
		icon?: LucideIcon;
		isActive?: boolean;
		items?: {
			title: string;
			url: string;
		}[];
	}[];
}) {
	const { state } = useSidebar();
	const pathname = usePathname();
	return (
		<SidebarGroup>
			<SidebarGroupLabel>Finance</SidebarGroupLabel>
			<SidebarMenu>
				{items.map((item) => (
					<Collapsible
						key={item.title}
						asChild
						defaultOpen={pathname.startsWith(item.url)}
						className='group/collapsible'
					>
						<SidebarMenuItem>
							<SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url}>
								<Link href={item.url}>
									{item.icon && <item.icon />}
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
							{state !== 'collapsed' && !!item.items?.length && (
								<CollapsibleTrigger asChild>
									<SidebarMenuButton
										className='absolute right-1 top-1.5 size-5 p-0 data-[state=open]:bg-sidebar-accent/50'
										aria-label={`Toggle ${item.title} submenu`}
									>
										<ChevronRight className='transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
									</SidebarMenuButton>
								</CollapsibleTrigger>
							)}
							<CollapsibleContent>
								<SidebarMenuSub>
									{item.items?.map((subItem) => (
										<SidebarMenuSubItem key={subItem.title}>
											<SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
												<Link href={subItem.url}>
													<span>{subItem.title}</span>
												</Link>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									))}
								</SidebarMenuSub>
							</CollapsibleContent>
						</SidebarMenuItem>
					</Collapsible>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
