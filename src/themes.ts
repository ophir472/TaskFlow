export interface ThemeVars {
  // Surfaces
  '--t-bg': string;
  '--t-surf': string;
  '--t-surf2': string;
  '--t-surf3': string;
  '--t-brd': string;
  '--t-brd2': string;
  // Text
  '--t-txt': string;
  '--t-txt2': string;
  '--t-muted': string;
  // Accent (primary CTA / active nav)
  '--t-acc': string;
  '--t-acc-bg': string;
  '--t-acc-dk': string;
  '--t-acc-fo': string;
  // Semantic: success
  '--t-success': string;
  '--t-success-bg': string;
  // Semantic: amber (hold / toCheck)
  '--t-amber': string;
  '--t-amber-bg': string;
  '--t-amber-brd': string;
  // Tags
  '--t-urgent': string;
  '--t-urgent-bg': string;
  '--t-important': string;
  '--t-important-bg': string;
  '--t-quick': string;
  '--t-quick-bg': string;
  // Kind labels
  '--t-kind-task': string;
  '--t-kind-task-bg': string;
  '--t-kind-reminder': string;
  '--t-kind-reminder-bg': string;
  '--t-kind-resp': string;
  '--t-kind-resp-bg': string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  vars: ThemeVars;
}

export const THEMES: Theme[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Warm off-white with muted indigo',
    vars: {
      '--t-bg': '#f6f5f2',
      '--t-surf': '#ffffff',
      '--t-surf2': '#fbfaf8',
      '--t-surf3': '#f3f1ec',
      '--t-brd': '#e9e6de',
      '--t-brd2': '#f0ede6',
      '--t-txt': '#211f1c',
      '--t-txt2': '#48453e',
      '--t-muted': '#8b877e',
      '--t-acc': 'oklch(0.5 0.15 264)',
      '--t-acc-bg': 'oklch(0.94 0.02 264)',
      '--t-acc-dk': 'oklch(0.4 0.14 264)',
      '--t-acc-fo': 'oklch(0.85 0.05 264)',
      '--t-success': 'oklch(0.5 0.14 150)',
      '--t-success-bg': 'oklch(0.94 0.04 150)',
      '--t-amber': 'oklch(0.45 0.13 85)',
      '--t-amber-bg': 'oklch(0.93 0.05 85)',
      '--t-amber-brd': 'oklch(0.88 0.06 85)',
      '--t-urgent': 'oklch(0.45 0.18 20)',
      '--t-urgent-bg': 'oklch(0.96 0.04 20)',
      '--t-important': 'oklch(0.4 0.14 264)',
      '--t-important-bg': 'oklch(0.94 0.03 264)',
      '--t-quick': 'oklch(0.42 0.14 145)',
      '--t-quick-bg': 'oklch(0.94 0.04 145)',
      '--t-kind-task': 'oklch(0.4 0.14 240)',
      '--t-kind-task-bg': 'oklch(0.94 0.03 240)',
      '--t-kind-reminder': 'oklch(0.45 0.13 75)',
      '--t-kind-reminder-bg': 'oklch(0.96 0.04 75)',
      '--t-kind-resp': 'oklch(0.42 0.12 185)',
      '--t-kind-resp-bg': 'oklch(0.94 0.03 185)',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Deep charcoal with vivid violet',
    vars: {
      '--t-bg': '#0f0f14',
      '--t-surf': '#1c1c26',
      '--t-surf2': '#26263a',
      '--t-surf3': '#30303e',
      '--t-brd': '#38384e',
      '--t-brd2': '#2c2c40',
      '--t-txt': '#e8e6f4',
      '--t-txt2': '#b0aed0',
      '--t-muted': '#7878a0',
      '--t-acc': 'oklch(0.7 0.18 272)',
      '--t-acc-bg': 'oklch(0.24 0.08 272)',
      '--t-acc-dk': 'oklch(0.82 0.14 272)',
      '--t-acc-fo': 'oklch(0.4 0.12 272)',
      '--t-success': 'oklch(0.68 0.18 150)',
      '--t-success-bg': 'oklch(0.2 0.07 150)',
      '--t-amber': 'oklch(0.72 0.16 80)',
      '--t-amber-bg': 'oklch(0.22 0.07 80)',
      '--t-amber-brd': 'oklch(0.3 0.08 80)',
      '--t-urgent': 'oklch(0.7 0.22 20)',
      '--t-urgent-bg': 'oklch(0.2 0.08 20)',
      '--t-important': 'oklch(0.7 0.18 272)',
      '--t-important-bg': 'oklch(0.22 0.08 272)',
      '--t-quick': 'oklch(0.65 0.18 148)',
      '--t-quick-bg': 'oklch(0.2 0.07 148)',
      '--t-kind-task': 'oklch(0.68 0.18 240)',
      '--t-kind-task-bg': 'oklch(0.22 0.08 240)',
      '--t-kind-reminder': 'oklch(0.7 0.16 75)',
      '--t-kind-reminder-bg': 'oklch(0.22 0.07 75)',
      '--t-kind-resp': 'oklch(0.65 0.15 185)',
      '--t-kind-resp-bg': 'oklch(0.2 0.07 185)',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool blue-gray with rich blue',
    vars: {
      '--t-bg': '#eef2f8',
      '--t-surf': '#ffffff',
      '--t-surf2': '#f4f7fc',
      '--t-surf3': '#e8eef6',
      '--t-brd': '#cdd8e8',
      '--t-brd2': '#dae3f0',
      '--t-txt': '#1a2640',
      '--t-txt2': '#3a4a6a',
      '--t-muted': '#6878a0',
      '--t-acc': 'oklch(0.48 0.18 235)',
      '--t-acc-bg': 'oklch(0.93 0.04 235)',
      '--t-acc-dk': 'oklch(0.38 0.18 235)',
      '--t-acc-fo': 'oklch(0.85 0.07 235)',
      '--t-success': 'oklch(0.48 0.15 155)',
      '--t-success-bg': 'oklch(0.93 0.05 155)',
      '--t-amber': 'oklch(0.48 0.14 75)',
      '--t-amber-bg': 'oklch(0.93 0.05 75)',
      '--t-amber-brd': 'oklch(0.86 0.07 75)',
      '--t-urgent': 'oklch(0.48 0.18 15)',
      '--t-urgent-bg': 'oklch(0.95 0.04 15)',
      '--t-important': 'oklch(0.42 0.18 235)',
      '--t-important-bg': 'oklch(0.93 0.04 235)',
      '--t-quick': 'oklch(0.46 0.15 155)',
      '--t-quick-bg': 'oklch(0.93 0.05 155)',
      '--t-kind-task': 'oklch(0.42 0.18 235)',
      '--t-kind-task-bg': 'oklch(0.93 0.04 235)',
      '--t-kind-reminder': 'oklch(0.48 0.14 75)',
      '--t-kind-reminder-bg': 'oklch(0.93 0.05 75)',
      '--t-kind-resp': 'oklch(0.44 0.14 190)',
      '--t-kind-resp-bg': 'oklch(0.93 0.04 190)',
    },
  },
  {
    id: 'warmth',
    name: 'Warmth',
    description: 'Earthy tones with amber accent',
    vars: {
      '--t-bg': '#f5f0e8',
      '--t-surf': '#fffcf8',
      '--t-surf2': '#faf6ef',
      '--t-surf3': '#f0e8d8',
      '--t-brd': '#dfd4c0',
      '--t-brd2': '#ece4d4',
      '--t-txt': '#2a1e10',
      '--t-txt2': '#52402a',
      '--t-muted': '#8a7254',
      '--t-acc': 'oklch(0.52 0.18 45)',
      '--t-acc-bg': 'oklch(0.95 0.04 45)',
      '--t-acc-dk': 'oklch(0.42 0.18 45)',
      '--t-acc-fo': 'oklch(0.88 0.06 45)',
      '--t-success': 'oklch(0.5 0.14 148)',
      '--t-success-bg': 'oklch(0.94 0.04 148)',
      '--t-amber': 'oklch(0.5 0.16 55)',
      '--t-amber-bg': 'oklch(0.95 0.05 55)',
      '--t-amber-brd': 'oklch(0.88 0.07 55)',
      '--t-urgent': 'oklch(0.48 0.2 18)',
      '--t-urgent-bg': 'oklch(0.95 0.05 18)',
      '--t-important': 'oklch(0.46 0.18 45)',
      '--t-important-bg': 'oklch(0.95 0.04 45)',
      '--t-quick': 'oklch(0.48 0.15 148)',
      '--t-quick-bg': 'oklch(0.94 0.04 148)',
      '--t-kind-task': 'oklch(0.45 0.18 230)',
      '--t-kind-task-bg': 'oklch(0.94 0.03 230)',
      '--t-kind-reminder': 'oklch(0.5 0.16 55)',
      '--t-kind-reminder-bg': 'oklch(0.95 0.05 55)',
      '--t-kind-resp': 'oklch(0.47 0.14 175)',
      '--t-kind-resp-bg': 'oklch(0.93 0.04 175)',
    },
  },
];

export const DEFAULT_THEME_ID = 'default';

export function getThemeVars(themeId: string): ThemeVars {
  return (THEMES.find(t => t.id === themeId) ?? THEMES[0]).vars;
}
