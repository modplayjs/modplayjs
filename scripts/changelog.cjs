// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Custom changesets changelog generator, derived from
// @changesets/changelog-github. Difference: the "Thanks @user!" credit
// is only rendered for contributors OUTSIDE the maintainer list —
// maintainer-authored changesets get a plain line (the commit/PR links
// are kept). External authors may also be forced via `author: @name`
// lines in the changeset summary (parsed by changelog-github itself).
'use strict';

const changelogGithub = require('@changesets/changelog-github');
const inner = changelogGithub.default ?? changelogGithub;

// Maintainer identities: Bitti09 directly, plus `web-flow` — the generic
// GitHub App account the changeset bot's commits historically resolved
// to. Anything credited as web-flow is a maintainer push, not a real
// external contributor.
const MAINTAINERS = new Set(['Bitti09', 'web-flow']);

/** "- `abc1234` Thanks [@user](…)! - summary" → "- `abc1234` - summary" */
function stripThanks(line) {
  return line.replace(/ Thanks \[@[^\]]+\]\([^)]*\)!?/, '')
    .replace(/ Thanks \[@[^\]]+\]\([^)]*\), /, ' Thanks ');
}

module.exports = {
  getDependencyReleaseLine: inner.getDependencyReleaseLine,
  async getReleaseLine(changeset, type, options) {
    const line = await inner.getReleaseLine(changeset, type, options);
    // Drop the credit when every mentioned author is a maintainer; keep
    // it (all mentioned authors) when any external contributor is named.
    const names = [...line.matchAll(/\[@([^\]]+)\]/g)].map((m) => m[1]);
    if (names.length === 0) return line;
    const allMaintainers = names.every((n) => MAINTAINERS.has(n));
    return allMaintainers ? stripThanks(line) : line;
  },
};
