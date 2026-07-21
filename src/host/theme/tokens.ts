/**
 * Official MiMo Code dark palette — scripts/ref/mimo-cli/mimocode.json
 * Never invent colors; only map these tokens into CSS variables.
 */
export const DARK = {
  step1: '#0a0a0a',
  step2: '#141414',
  step3: '#1e1e1e',
  step4: '#282828',
  step5: '#323232',
  step6: '#3c3c3c',
  step7: '#484848',
  step8: '#606060',
  step9: '#FF6A00',
  step10: '#FF8A3C',
  step11: '#808080',
  step12: '#eeeeee',
  secondary: '#FF8A3C',
  accent: '#818CF8',
  red: '#FB7185',
  orange: '#FBBF24',
  yellow: '#e5c07b',
  diffAdded: '#4fd6be',
  diffRemoved: '#c53b53',
  diffContext: '#828bb8',
  diffHighlightAdded: '#b8db87',
  diffHighlightRemoved: '#e26a75',
  diffAddedBg: '#20303b',
  diffRemovedBg: '#37222c',
  logoOrange: '#FF6A00',
  logoGray: '#a0a0a0',
} as const;

export function cssVariablesDark(): string {
  const t = DARK;
  return `:root {
  --mimo-bg: ${t.step1};
  --mimo-bg-panel: ${t.step2};
  --mimo-bg-element: ${t.step3};
  --mimo-fg: ${t.step12};
  --mimo-muted: ${t.step11};
  --mimo-border: ${t.step7};
  --mimo-border-subtle: ${t.step6};
  --mimo-primary: ${t.step9};
  --mimo-secondary: ${t.secondary};
  --mimo-accent: ${t.accent};
  --mimo-orange: ${t.orange};
  --mimo-yellow: ${t.yellow};
  --mimo-red: ${t.red};
  --mimo-diff-add: ${t.diffAdded};
  --mimo-diff-del: ${t.diffRemoved};
  --mimo-diff-add-bg: ${t.diffAddedBg};
  --mimo-diff-del-bg: ${t.diffRemovedBg};
  --mimo-logo-orange: ${t.logoOrange};
  --mimo-logo-gray: ${t.logoGray};
}`;
}
