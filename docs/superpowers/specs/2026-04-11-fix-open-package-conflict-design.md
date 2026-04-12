# Spec: Fix ESM/CommonJS conflict for `open` package

**Date:** 2026-04-11
**Status:** Approved (Direct Instruction)

## 1. Overview
The project uses `bin/cli.js` as a CommonJS entry point. It attempts to load the `open` package using `require('open')`. However, the current dependency in `package.json` is `open: ^10.0.3`, which is ESM-only and incompatible with `require()`.

## 2. Goals
- Resolve the ESM/CommonJS conflict by downgrading the `open` package to a version that supports CommonJS.
- Maintain the existing CommonJS structure of `bin/cli.js`.

## 3. Proposed Changes

### 3.1. `package.json`
- **Change:** Update `"open": "^10.0.3"` to `"open": "^8.4.2"`.
- **Reason:** Version 8.x is the last major version of `open` that supports CommonJS `require()`.

### 3.2. `bin/cli.js`
- **Change:** None (Verified that it already uses `require('open')`).

## 4. Verification Plan
- **File Integrity:** Check `package.json` to ensure the version is exactly `^8.4.2` and no other dependencies were accidentally modified.
- **Script Consistency:** Confirm `bin/cli.js` still uses `require('open')`.
