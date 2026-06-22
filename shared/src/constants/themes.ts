/** UI theme names and brand colors (blueprint §6). */

export const THEMES = [
  'iris',
  'emerald',
  'ocean',
  'sunset',
  'rose',
  'midnight',
] as const;

export type ThemeName = (typeof THEMES)[number];

export const THEME_COLORS: Record<ThemeName, string> = {
  iris: '#7C5CFC',
  emerald: '#10B981',
  ocean: '#0EA5E9',
  sunset: '#F97316',
  rose: '#F43F5E',
  midnight: '#6366F1',
};

export const API_ERRORS = {
  NOT_FRIENDS: 'NOT_FRIENDS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
