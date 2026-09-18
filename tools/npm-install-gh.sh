#!/bin/sh
# Install @modplayjs/* packages from GitHub Packages.
# Run once: adds the npm.pkg.github.com auth line to ~/.npmrc.
# Requires a GitHub token with read:packages scope.
#
# Usage:
#   ./tools/npm-install-gh.sh          # adds the .npmrc line
#   npm install @modplayjs/core        # then install normally
if ! grep -q 'npm.pkg.github.com' ~/.npmrc 2>/dev/null; then
  echo "//npm.pkg.github.com/:_authToken=$GH_TOKEN" >> ~/.npmrc
  echo "Added npm.pkg.github.com auth to ~/.npmrc"
fi
