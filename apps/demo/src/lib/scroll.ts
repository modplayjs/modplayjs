// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.

/** Scroll `el` into view INSIDE `container` only — never the page.
 * scrollIntoView() scrolls every scrollable ancestor, which yanked the whole
 * page to the pattern card each row and made Stop unreachable. */
export function keepInView(
  container: HTMLElement,
  el: HTMLElement,
  horizontal = false,
): void {
  const c = container.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  if (e.top < c.top) {
    container.scrollTop -= c.top - e.top;
  } else if (e.bottom > c.bottom) {
    container.scrollTop += e.bottom - c.bottom;
  }
  if (horizontal) {
    if (e.left < c.left) {
      container.scrollLeft -= c.left - e.left;
    } else if (e.right > c.right) {
      container.scrollLeft += e.right - c.right;
    }
  }
}
