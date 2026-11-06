/** Server-render check of the list row's HTML structure:  npx tsx components/admin/kit/kit-dom.selftest.tsx */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Cell, ColumnHeader, DataList, DataRow, RowTitle } from './DataList';
import { RowAction } from './RowAction';

const html = renderToStaticMarkup(
    <DataList cols="minmax(0,1fr) 32px" label="Things">
        <ColumnHeader labels={['Name', '']} />
        <DataRow href="/admin/things/edit?id=a" label="Thing A">
            <RowTitle title="Thing A" />
            <Cell end><RowAction path="/things/a/" state={{ live: true }} /></Cell>
        </DataRow>
        <DataRow onOpen={() => {}} label="Thing B"><RowTitle title="Thing B" /></DataRow>
    </DataList>,
);

// No interactive element nested in another: a <button> must never sit inside an <a>.
assert.equal(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/.test(html), false, 'no <button> inside an <a>');
assert.equal(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<(a|button)\b/.test(html), false, 'nothing interactive inside a <button>');
// The listitem is a plain div, not focusable itself; the link is the tab stop.
const item = html.match(/<div role="listitem"[^>]*>/g) || [];
assert.equal(item.length, 2);
for (const tag of item) assert.equal(/tabindex/i.test(tag), false, 'listitem has no tabindex');
assert.equal((html.match(/<a [^>]*data-row-link[^>]*>/g) || []).length, 1, 'href rows get one overlay link');
assert.ok(/<a [^>]*href="\/admin\/things\/edit\?id=a"[^>]*aria-label="Thing A"/.test(html) || /aria-label="Thing A"[^>]*href=/.test(html), 'the link is named by the record');
assert.equal((html.match(/<button [^>]*data-row-link[^>]*>/g) || []).length, 1, 'onOpen rows get an overlay button');
// The copy button is a sibling of the link inside the same row, and sits above it.
assert.ok(/data-tip="Copy link"[^>]*class="[^"]*z-\[2\]/.test(html) || /class="[^"]*z-\[2\][^"]*"[^>]*data-tip="Copy link"/.test(html), 'copy button stacks above the overlay');
const row = html.split('<div role="listitem"')[1] ?? '';
assert.ok(row.includes('data-tip="Copy link"') && row.includes('data-row-link'), 'both live in the same row');

console.log('kit dom selftest ok');
