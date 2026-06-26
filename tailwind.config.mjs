import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				"on-surface": "var(--on-surface)",
				"surface-container-lowest": "var(--surface-container-lowest)",
				"tertiary-container": "var(--tertiary-container)",
				"on-primary-fixed-variant": "var(--on-primary-fixed-variant)",
				"surface-bright": "var(--surface-bright)",
				"secondary-container": "var(--secondary-container)",
				"tertiary-fixed": "var(--tertiary-fixed)",
				"on-primary": "var(--on-primary)",
				"on-error-container": "var(--on-error-container)",
				"surface-dim": "var(--surface-dim)",
				"primary-container": "var(--primary-container)",
				"surface-variant": "var(--surface-variant)",
				"primary": "var(--primary)",
				"primary-fixed-dim": "var(--primary-fixed-dim)",
				"inverse-surface": "var(--inverse-surface)",
				"inverse-primary": "var(--inverse-primary)",
				"on-tertiary": "var(--on-tertiary)",
				"tertiary": "var(--tertiary)",
				"secondary-fixed": "var(--secondary-fixed)",
				"secondary-fixed-dim": "var(--secondary-fixed-dim)",
				"surface-container-high": "var(--surface-container-high)",
				"surface-container-highest": "var(--surface-container-highest)",
				"error-container": "var(--error-container)",
				"on-tertiary-fixed": "var(--on-tertiary-fixed)",
				"tertiary-fixed-dim": "var(--tertiary-fixed-dim)",
				"on-secondary": "var(--on-secondary)",
				"surface-container-low": "var(--surface-container-low)",
				"on-tertiary-container": "var(--on-tertiary-container)",
				"on-primary-fixed": "var(--on-primary-fixed)",
				"inverse-on-surface": "var(--inverse-on-surface)",
				"surface": "var(--surface)",
				"on-tertiary-fixed-variant": "var(--on-tertiary-fixed-variant)",
				"surface-container": "var(--surface-container)",
				"on-surface-variant": "var(--on-surface-variant)",
				"on-error": "var(--on-error)",
				"secondary": "var(--secondary)",
				"error": "var(--error)",
				"primary-fixed": "var(--primary-fixed)",
				"surface-tint": "var(--surface-tint)",
				"outline": "var(--outline)",
				"on-secondary-fixed-variant": "var(--on-secondary-fixed-variant)",
				"on-secondary-container": "var(--on-secondary-container)",
				"background": "var(--background)",
				"outline-variant": "var(--outline-variant)",
				"on-background": "var(--on-background)",
				"on-primary-container": "var(--on-primary-container)",
				"on-secondary-fixed": "var(--on-secondary-fixed)",
				"border-color": "var(--border-color)"
			},
			borderRadius: {
				"DEFAULT": "1rem",
				"lg": "2rem",
				"xl": "3rem",
				"full": "9999px"
			},
			fontFamily: {
				"headline": ["Manrope", "sans-serif"],
				"body": ["Plus Jakarta Sans", "sans-serif"],
				"label": ["Plus Jakarta Sans", "sans-serif"]
			}
		},
	},
	plugins: [
		forms,
		containerQueries,
	],
}

