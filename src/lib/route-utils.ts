import { NextResponse } from 'next/server';
export function badRequest(error: unknown) {
	return NextResponse.json(
		{
			error: 'INVALID_REQUEST',
			message: error instanceof Error ? error.message : 'Invalid request',
		},
		{ status: 400 },
	);
}
