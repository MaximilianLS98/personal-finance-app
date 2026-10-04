import { NextResponse } from 'next/server';
export function planningError(error: unknown) {
	const message = error instanceof Error ? error.message : 'Unable to save changes';
	return NextResponse.json(
		{ error: message },
		{ status: message.includes('not found') ? 404 : 400 },
	);
}
