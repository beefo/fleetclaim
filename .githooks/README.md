# Git Hooks

This directory contains git hooks for the FleetClaim project.

## Setup

Configure git to use these hooks:

```bash
git config core.hooksPath .githooks
```

## Hooks

### pre-commit

Runs before each commit to ensure code quality:

1. **Runs .NET tests** - All unit and integration tests must pass
2. **Runs Add-In tests** - React/TypeScript tests must pass

If any tests fail, the commit is aborted.

### Skipping hooks (not recommended)

In rare cases where you need to bypass the hook:

```bash
git commit --no-verify -m "your message"
```

Use sparingly - CI will still catch failures.
