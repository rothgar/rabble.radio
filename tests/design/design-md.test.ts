import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * DESIGN.md is the design brief agents read; src/app/globals.css is what the
 * site ships. This keeps the two in step: every colour, radius and spacing
 * token in the DESIGN.md front matter must equal the CSS variable it stands
 * for, in the light default and in the dark appearance.
 */

const root = join(__dirname, '..', '..');
const design = readFileSync(join(root, 'DESIGN.md'), 'utf8');
const css = readFileSync(join(root, 'src', 'app', 'globals.css'), 'utf8');

type Tree = { [key: string]: string | Tree };

/** Minimal YAML reader for the front matter: nested maps of scalars, comments, quoted keys and values. */
function frontMatter(md: string): Tree {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('DESIGN.md has no front matter');
  const rootTree: Tree = {};
  const stack: Array<{ indent: number; node: Tree }> = [{ indent: -1, node: rootTree }];
  for (const raw of m[1].split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    const kv = line.match(/^("?)([^":]+)\1:\s*(.*)$/);
    if (!kv) throw new Error(`cannot parse front matter line: ${raw}`);
    const key = kv[2];
    let value = kv[3];
    while (stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (value === '') {
      const child: Tree = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      const q = value.match(/^(["'])(.*)\1$/);
      if (q) value = q[2];
      parent[key] = value;
    }
  }
  return rootTree;
}

/** The custom properties declared in one CSS block, unresolved. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const end = css.indexOf('\n}', start);
  const vars = new Map<string, string>();
  for (const m of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) vars.set(m[1], m[2].trim());
  return vars;
}

const light = block(':root');
const dark = block(':root[data-theme="dark"]');

function resolve(name: string, scope: Map<string, string>): string {
  const v = scope.get(name) ?? light.get(name);
  if (v === undefined) throw new Error(`${name} is not defined in globals.css`);
  return v.replace(/var\((--[a-z0-9-]+)\)/g, (_, ref: string) => resolve(ref, scope));
}

const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

const tokens = frontMatter(design);
const colors = tokens.colors as Tree;
const darkColors = colors.dark as Tree;

/** DESIGN.md colour role → the CSS variable that implements it on the web. */
const colorVars: Record<string, string> = {
  primary: '--color-accent',
  'primary-hover': '--color-accent-hover',
  'primary-muted': '--color-accent-muted',
  secondary: '--color-accent-2',
  'on-secondary': '--color-text',
  'secondary-hover': '--color-accent-2-hover',
  'secondary-muted': '--color-accent-2-muted',
  highlight: '--color-highlight',
  'on-highlight': '--color-highlight-text',
  'highlight-muted': '--color-highlight-muted',
  background: '--color-bg',
  'background-translucent': '--color-bg-translucent',
  surface: '--color-surface',
  'surface-raised': '--color-surface-raised',
  'surface-translucent': '--color-surface-translucent',
  'on-surface': '--color-text',
  'on-surface-secondary': '--color-text-secondary',
  'on-surface-tertiary': '--color-text-tertiary',
  ink: '--color-ink',
  'on-ink': '--color-text-on-ink',
  'ink-muted': '--color-ink-muted',
  outline: '--color-border',
  divider: '--color-divider',
  scrim: '--color-scrim',
  live: '--color-live',
  'live-muted': '--color-live-muted',
  success: '--color-success',
  'success-muted': '--color-success-muted',
  'success-text': '--color-success-text',
  warning: '--color-warning',
  'warning-muted': '--color-warning-muted',
  'warning-text': '--color-warning-text',
  error: '--color-error',
  'error-muted': '--color-error-muted',
  'error-text': '--color-error-text',
};

describe('DESIGN.md mirrors globals.css', () => {
  it('names every colour role this test knows about', () => {
    const unknown = Object.keys(colors).filter((k) => k !== 'dark' && k !== 'on-primary' && !(k in colorVars));
    expect(unknown, 'add the new role to colorVars in this test').toEqual([]);
    expect(Object.keys(colorVars).filter((k) => !(k in colors))).toEqual([]);
  });

  it.each(Object.entries(colorVars))('light %s = %s', (role, cssVar) => {
    expect(norm(colors[role] as string)).toBe(norm(resolve(cssVar, light)));
  });

  it.each(Object.entries(colorVars))('dark %s = %s', (role, cssVar) => {
    const declared = (darkColors[role] ?? colors[role]) as string;
    expect(norm(declared)).toBe(norm(resolve(cssVar, dark)));
  });

  it('declares no dark role that has no light counterpart', () => {
    expect(Object.keys(darkColors).filter((k) => !(k in colors))).toEqual([]);
  });

  it('matches the radius scale', () => {
    const rounded = tokens.rounded as Tree;
    for (const level of ['xs', 'sm', 'md', 'lg', 'xl', 'full']) {
      expect(rounded[level], `rounded.${level}`).toBe(resolve(`--radius-${level}`, light));
    }
  });

  it('matches the spacing scale, gutters and touch target', () => {
    const spacing = tokens.spacing as Tree;
    for (const step of ['1', '2', '3', '4', '5', '6', '8', '10', '12', '16']) {
      expect(spacing[step], `spacing.${step}`).toBe(resolve(`--space-${step}`, light));
    }
    expect(spacing.gutter).toBe(resolve('--gutter', light));
    expect(spacing['gutter-tablet']).toBe(resolve('--gutter-tablet', light));
    expect(spacing['gutter-desktop']).toBe(resolve('--gutter-desk', light));
    expect(spacing.touch).toBe(resolve('--touch-min', light));
  });

  it('matches the type scale', () => {
    const typography = tokens.typography as Tree;
    const sizes: Record<string, string> = {
      caption: '--text-xs', label: '--text-sm', body: '--text-base', title: '--text-md',
      heading: '--text-lg', display: '--text-xl', 'display-lg': '--text-2xl', 'display-xl': '--text-3xl',
    };
    for (const [level, cssVar] of Object.entries(sizes)) {
      expect((typography[level] as Tree).fontSize, `typography.${level}`).toBe(resolve(cssVar, light));
    }
  });
});
