/**
 * Playwright check: in the Properties drawer, no row's label box ever intersects its value box, and
 * nothing sticks out of the drawer, at any drawer width or value length.
 *
 * Use it from Playwright (MCP `browser_run_code_unsafe`, or any Playwright script) on an editor page with the
 * drawer open, after typing long values into the fields:
 *
 *   import { checkPropRows } from './scripts/qa-prop-row-layout.mjs';
 *   const { rows, bad } = await checkPropRows(page);   // bad must be []
 *
 * Run it at several viewport widths (1280, 1100, 800, 390, 320: the drawer is 340px, then min(360px, 92vw)).
 * Rows are marked by `PropRow` (components/admin/kit/PropertiesDrawer.tsx): [data-prop-row], [data-prop-label], [data-prop-value].
 */
export function checkPropRows(page) {
    return page.evaluate(() => {
        const bad = [];
        let rows = 0;
        document.querySelectorAll('[data-prop-row]').forEach((row) => {
            rows++;
            const label = row.querySelector('[data-prop-label]');
            const l = label.getBoundingClientRect();
            const v = row.querySelector('[data-prop-value]').getBoundingClientRect();
            const d = row.closest('aside').getBoundingClientRect();
            const overlapX = Math.min(l.right, v.right) - Math.max(l.left, v.left);
            const overlapY = Math.min(l.bottom, v.bottom) - Math.max(l.top, v.top);
            if ((overlapX > 0.5 && overlapY > 0.5) || v.right > d.right + 0.5 || l.left < d.left - 0.5) {
                bad.push({ label: label.textContent.trim(), label_box: [l.left, l.top, l.right, l.bottom].map(Math.round), value_box: [v.left, v.top, v.right, v.bottom].map(Math.round) });
            }
        });
        return { rows, bad };
    });
}
