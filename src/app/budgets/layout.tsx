import React from 'react';
import Link from 'next/link';

export default function BudgetsSegmentLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<nav aria-label='Budget planning' className='container mx-auto px-4 pt-4 flex gap-4 text-sm'>
				<Link className='underline' href='/budgets'>
					Overview
				</Link>
				<Link className='underline' href='/budgets/planning'>
					Cycles & commitments
				</Link>
				<Link className='underline' href='/goals'>
					Savings goals
				</Link>
			</nav>
			{children}
		</>
	);
}
