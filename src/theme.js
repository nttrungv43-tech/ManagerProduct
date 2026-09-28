// src/theme.js
export const light = {
  bg: '#efe7d6',
  card: '#fbf7ec',
  ink: '#211b12',
  sub: '#746a55',
  accent: '#d98f1e',
  good: '#3f7d4c',
  warn: '#c97a1f',
  bad: '#b23a2e',
  line: '#d8cbaa',
};

export const dark = {
  bg: '#1b1712',
  card: '#241e15',
  ink: '#f3ecda',
  sub: '#a79a82',
  accent: '#e7a93d',
  good: '#5fa86d',
  warn: '#e0973a',
  bad: '#e25c4c',
  line: '#3b3226',
};

export function getTheme(scheme) {
  return scheme === 'dark' ? dark : light;
}