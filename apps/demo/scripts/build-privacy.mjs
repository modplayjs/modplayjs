// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
//
// Renders the repository's PRIVACY.md into public/privacy.html, which vite
// copies to the deployed site so the Play listing has a stable URL:
//
//   https://modplayjs.github.io/modplayjs/privacy.html
//
// One source of truth: the markdown file is edited, this script regenerates
// the page. Anything outside the small markdown subset it understands is a
// hard error rather than silently missing text — a privacy policy that loses
// a paragraph is worse than a failed build.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const source = resolve(root, 'apps/android/PRIVACY.md');
const target = resolve(here, '../public/privacy.html');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escapes, then applies the inline marks the policy actually uses. */
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, (_, url) => anchor(url, url));
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => anchor(url, label));
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return out;
}

function anchor(url, label) {
  return `<a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(label)}</a>`;
}

const unsupported = [
  [/^\s*\|/, 'tables'],
  [/^\s*>/, 'blockquotes'],
  [/^\s*\d+\.\s/, 'ordered lists'],
  [/^\s{2,}[-*]\s/, 'nested lists'],
  [/^\s*```/, 'fenced code'],
];

const blocks = [];
let paragraph = [];
let list = [];

function flushParagraph() {
  if (paragraph.length) {
    blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  }
}

function flushList() {
  if (list.length) {
    blocks.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    list = [];
  }
}

const lines = readFileSync(source, 'utf8').split(/\r?\n/);
for (const [i, line] of lines.entries()) {
  for (const [pattern, name] of unsupported) {
    if (pattern.test(line)) {
      throw new Error(`${source}:${i + 1}: ${name} are not supported by build-privacy.mjs`);
    }
  }
  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) {
    flushParagraph();
    flushList();
    const level = heading[1].length;
    blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    continue;
  }
  if (/^\s*[-*]\s+/.test(line)) {
    flushParagraph();
    list.push(line.replace(/^\s*[-*]\s+/, ''));
    continue;
  }
  if (!line.trim()) {
    flushParagraph();
    flushList();
    continue;
  }
  // A wrapped list item: the source keeps the continuation indented under its
  // bullet. Append it instead of starting a paragraph, or the sentence is cut
  // in half and the rest floats outside the list.
  if (/^\s+\S/.test(line) && list.length) {
    list[list.length - 1] += ' ' + line.trim();
    continue;
  }
  flushList();
  paragraph.push(line.trim());
}
flushParagraph();
flushList();

const markdown = readFileSync(source, 'utf8');
const title = /^#\s+(.*)$/m.exec(markdown)?.[1] ?? 'Privacy policy';
const body = blocks.join('\n');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="index">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #0b0b12;
    color: #e7e7ef;
    font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 2.5rem 1.25rem 4rem;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 1.75rem; line-height: 1.25; margin: 0 0 .35rem; letter-spacing: -.02em; }
  h2 {
    font-size: 1.05rem;
    margin: 2rem 0 .6rem;
    color: #b9a2ff;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-weight: 600;
  }
  p, li { color: #cfcfdb; }
  a { color: #8ea2ff; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .9em;
    background: #191926;
    border: 1px solid #262636;
    border-radius: 4px;
    padding: .05em .35em;
  }
  ul { padding-left: 1.15rem; }
  li { margin: .3rem 0; }
  strong { color: #f2f2f8; }
  footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid #262636;
    font-size: .85rem;
    color: #8b8b9c;
  }
  footer a { color: #8ea2ff; }
</style>
</head>
<body>
<main>
${body}
<footer>
  modplayjs — <a href="./">demo and player</a> ·
  <a href="https://github.com/modplayjs/modplayjs/blob/main/apps/android/PRIVACY.md">source of this page</a>
</footer>
</main>
</body>
</html>
`;

writeFileSync(target, page);
console.log(`privacy: ${source} -> ${target}`);
