/** Keys map to the data-theme token sets in globals.css. */
export const BASE_COLOR_THEMES = [
	{ key: 'neutral', label: 'Neutral' },
	{ key: 'tangerine', label: 'Tangerine' },
	{ key: 'candy', label: 'Candy' },
	{ key: 'soft-pop', label: 'Soft Pop' },
] as const;
export const BASE_COLOR_STORAGE_KEY = 'pf-base-color';
export function validBaseColor(value: string | null): string {
	return BASE_COLOR_THEMES.some((theme) => theme.key === value) ? value! : 'neutral';
}

// Runs in the document head before content paints, independently of React and route.
// Only these application-owned constants are embedded in the script.
export const BASE_COLOR_INIT_SCRIPT = `(()=>{let color='neutral';try{const saved=localStorage.getItem(${JSON.stringify(BASE_COLOR_STORAGE_KEY)});if(${JSON.stringify(BASE_COLOR_THEMES.map((theme) => theme.key))}.includes(saved))color=saved;}catch{}document.documentElement.setAttribute('data-theme',color);})();`;
