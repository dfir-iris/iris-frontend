import { fontFamily } from 'tailwindcss/defaultTheme';
import type { Config } from 'tailwindcss';

const config: Config = {
	darkMode: ['class'],
	content: ['./src/**/*.{html,js,svelte,ts}'],
	safelist: ['dark'],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			keyframes: {
				'collapsible-down': {
					from: { height: '0' },
					to: { height: 'var(--bits-collapsible-content-height)' }
				},
				'collapsible-up': {
					from: { height: 'var(--bits-collapsible-content-height)' },
					to: { height: '0' }
				}
			},
			animation: {
				'collapsible-down': 'collapsible-down 200ms ease-out',
				'collapsible-up': 'collapsible-up 200ms ease-out'
			},
			colors: {
				table: {
					primary: {
						DEFAULT: 'hsl(var(--table-primary) / <alpha-value>)',
						hover: 'hsl(var(--table-primary-hover) / <alpha-value>)'
					},
					secondary: {
						DEFAULT: 'hsl(var(--table-secondary) / <alpha-value>)',
						hover: 'hsl(var(--table-secondary-hover) / <alpha-value>)'
					},
					row: {
						even: {
							DEFAULT: 'hsl(var(--table-row-even) / <alpha-value>)',
							hover: 'hsl(var(--table-row-even-hover) / <alpha-value>)'
						},
						odd: {
							DEFAULT: 'hsl(var(--table-row-odd) / <alpha-value>)',
							hover: 'hsl(var(--table-row-odd-hover) / <alpha-value>)'
						}
					}
				},
				border: 'hsl(var(--border) / <alpha-value>)',
				input: 'hsl(var(--input) / <alpha-value>)',
				ring: 'hsl(var(--ring) / <alpha-value>)',
				background: 'hsl(var(--background) / <alpha-value>)',
				foreground: 'hsl(var(--foreground) / <alpha-value>)',
				primary: {
					DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
					foreground: 'hsl(var(--primary-foreground) / <alpha-value>)'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
					foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
					foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
					foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
					foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
					foreground: 'hsl(var(--popover-foreground) / <alpha-value>)'
				},
				card: {
					DEFAULT: 'hsl(var(--card) / <alpha-value>)',
					foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			fontFamily: {
				sans: [...fontFamily.sans]
			},
			fontSize: {
				'2xs': ['0.625rem', { lineHeight: '0.875rem' }]
			},
			backgroundImage: {
				'primary-gradient':
					'linear-gradient(-45deg, hsl(var(--gradient-primary-start)), hsl(var(--gradient-primary-end)))'
			}
		}
	}
};

export default config;
