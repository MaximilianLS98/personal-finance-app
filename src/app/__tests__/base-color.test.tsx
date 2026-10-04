import { runInNewContext } from 'node:vm';
import { fireEvent, render, screen } from '@testing-library/react';
import { BaseColorProvider, useBaseColor } from '../base-color-provider';
import { BASE_COLOR_INIT_SCRIPT, BASE_COLOR_STORAGE_KEY } from '@/lib/base-color';

function PageWithoutSettings() {
	const { baseColor, setBaseColor } = useBaseColor();
	return <button onClick={() => setBaseColor('candy')}>{baseColor}</button>;
}
function loadDocument() {
	document.documentElement.removeAttribute('data-theme');
	runInNewContext(BASE_COLOR_INIT_SCRIPT, { document, localStorage });
}

afterEach(() => {
	jest.restoreAllMocks();
	localStorage.clear();
	document.documentElement.removeAttribute('data-theme');
});

describe('theme persistence on a fresh document', () => {
	it.each(['neutral', 'tangerine', 'candy', 'soft-pop'])(
		'restores %s before React or Settings mounts',
		(theme) => {
			localStorage.setItem(BASE_COLOR_STORAGE_KEY, theme);
			loadDocument();
			expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
		},
	);
	it('preserves the selected theme through provider remount and a fresh document', () => {
		localStorage.setItem(BASE_COLOR_STORAGE_KEY, 'tangerine');
		loadDocument();
		const first = render(
			<BaseColorProvider>
				<PageWithoutSettings />
			</BaseColorProvider>,
		);
		expect(screen.getByRole('button').textContent).toBe('tangerine');
		expect(document.documentElement.dataset.theme).toBe('tangerine');
		fireEvent.click(screen.getByRole('button'));
		expect(localStorage.getItem(BASE_COLOR_STORAGE_KEY)).toBe('candy');
		first.unmount();
		loadDocument();
		expect(document.documentElement.dataset.theme).toBe('candy');
		render(
			<BaseColorProvider>
				<PageWithoutSettings />
			</BaseColorProvider>,
		);
		expect(screen.getByRole('button').textContent).toBe('candy');
		expect(document.documentElement.dataset.theme).toBe('candy');
	});
	it('falls back for an obsolete saved theme', () => {
		localStorage.setItem(BASE_COLOR_STORAGE_KEY, 'removed-theme');
		loadDocument();
		expect(document.documentElement.dataset.theme).toBe('neutral');
	});
	it('loads safely and permits session theme changes when storage is blocked', () => {
		jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('Blocked');
		});
		jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('Blocked');
		});
		expect(loadDocument).not.toThrow();
		render(
			<BaseColorProvider>
				<PageWithoutSettings />
			</BaseColorProvider>,
		);
		fireEvent.click(screen.getByRole('button'));
		expect(document.documentElement.dataset.theme).toBe('candy');
	});
});
