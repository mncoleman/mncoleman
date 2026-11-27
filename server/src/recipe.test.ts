import { describe, expect, test } from 'bun:test';
import { blankBoxes, fillTemplate, renderChart, renderRecipe, validateRecipe } from './recipe';
import { MUFFIN, PASTA } from './recipe-fixtures';

describe('validateRecipe', () => {
    test('accepts both fixtures unchanged', () => {
        for (const r of [PASTA, MUFFIN]) {
            const c = validateRecipe(r);
            expect(c.ok).toBe(true);
            if (c.ok) expect(c.recipe).toEqual(r);
        }
    });
    test('names every problem by path', () => {
        const c = validateRecipe({ title: '', ingredients: [{ name: 'x' }], steps: [{ label: 'a', col: 1, from: 0, to: 1 }, { label: 'b', col: 0, from: 1, to: 1 }] });
        expect(c.ok).toBe(false);
        if (!c.ok) expect(c.errors.map((e) => e.path).sort()).toEqual(['steps[0].from', 'steps[1].col', 'title']);
    });
    test('refuses overlapping steps', () => {
        const c = validateRecipe({ ...MUFFIN, steps: [...MUFFIN.steps, { label: 'dup', col: 3, from: 4, to: 4 }] });
        expect(c.ok).toBe(false);
        if (!c.ok) expect(c.errors[0].reason).toContain('overlaps');
    });
    test('refuses a non-http source url', () => {
        const c = validateRecipe({ ...MUFFIN, source: { text: 'x', url: 'javascript:alert(1)' } });
        expect(c.ok).toBe(false);
    });
    test('warns about an ingredient no step covers', () => {
        const c = validateRecipe({ ...MUFFIN, steps: MUFFIN.steps.filter((s) => s.label !== 'add').map((s) => ({ ...s, from: 1, to: 1 })) });
        expect(c.ok).toBe(true);
        expect(c.warnings.some((w) => w.path === 'ingredients[1]')).toBe(true);
    });
});

describe('chart layout', () => {
    test('pasta: Parmesan and lemon leave one 5-column blank box', () => {
        expect(blankBoxes(16, 7, PASTA.steps)).toEqual([{ row: 15, col: 1, rows: 2, cols: 5 }]);
    });
    test('muffin: a blank above "add" and a blank beside it', () => {
        expect(blankBoxes(7, 5, MUFFIN.steps)).toEqual([
            { row: 1, col: 2, rows: 1, cols: 1 },
            { row: 2, col: 1, rows: 6, cols: 1 },
        ]);
    });
    test('escapes recipe text', () => {
        const html = renderChart({ ...MUFFIN, ingredients: [{ name: '<img src=x onerror=alert(1)>' }, ...MUFFIN.ingredients.slice(1)] });
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });
});

describe('template', () => {
    test('a value cannot introduce a placeholder', () => {
        expect(fillTemplate('{{title}} {{chart}}', { title: '{{chart}}', chart: 'C' })).toBe('{{chart}} C');
    });
    test('empty sections drop out', () => {
        expect(fillTemplate('a{{#notes}}<n>{{notes}}</n>{{/notes}}b', { notes: '' })).toBe('ab');
    });
    test('renders a whole page', () => {
        const page = renderRecipe('<title>{{title}}</title>{{head}}{{toolbar}}{{chart}}', PASTA, { url: 'https://example.com/a/x', description: 'Weeknight pasta' });
        expect(page).toContain('One-Pot Creamy Tomato Pesto Pasta');
        expect(page).toContain('<meta name="description" content="Weeknight pasta">');
        expect(page).toContain('data-url="https://example.com/a/x"');
    });
});
