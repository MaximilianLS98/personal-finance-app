'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BASE_COLOR_STORAGE_KEY, validBaseColor } from '@/lib/base-color';

const BaseColorContext = createContext({
	baseColor: 'neutral',
	setBaseColor: (_color: string) => {},
});

export function useBaseColor() {
	return useContext(BaseColorContext);
}

export function BaseColorProvider({ children }: { children: ReactNode }) {
	// The server and initial React render agree; the head script applies the saved
	// CSS tokens immediately, and this effect hydrates the settings controls.
	const [baseColor, setBaseColor] = useState('neutral');
	const [loaded, setLoaded] = useState(false);
	useEffect(() => {
		try {
			setBaseColor(validBaseColor(localStorage.getItem(BASE_COLOR_STORAGE_KEY)));
		} catch {
			/* Keep the default when storage is unavailable. */
		}
		setLoaded(true);
	}, []);
	useEffect(() => {
		if (!loaded) return;
		document.documentElement.setAttribute('data-theme', baseColor);
		try {
			localStorage.setItem(BASE_COLOR_STORAGE_KEY, baseColor);
		} catch {
			/* Theme changes still work for the current session. */
		}
	}, [baseColor, loaded]);
	return (
		<BaseColorContext.Provider
			value={{ baseColor, setBaseColor: (color) => setBaseColor(validBaseColor(color)) }}
		>
			{children}
		</BaseColorContext.Provider>
	);
}
