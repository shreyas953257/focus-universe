# Contributing to Focus Universe

Thank you for contributing. Focus Universe is intentionally local-first, so changes should preserve browser-only storage, deterministic progression, and the existing test coverage.

## Local Setup

```bash
git clone <your-repository-url>
cd focus-universe
pnpm install
pnpm dev
```

Use Node.js 22+ and pnpm 10+ where possible. The application should start at the local URL printed by Vite.

## Quality Checks

Run these commands before opening a pull request:

```bash
pnpm test
pnpm check
pnpm build
pnpm test:coverage
```

## Contribution Workflow

Create a focused branch, make the smallest practical change, and update or add deterministic tests for modified domain behavior. Avoid adding backend services, authentication, external APIs, or cloud storage unless a future project decision explicitly changes the local-first architecture.

## Pull Requests

Pull requests should explain the user-facing purpose, identify any changed progression or persistence behavior, and confirm that tests, type checks, and the production build pass. Keep the visual language consistent with the existing Observatory Nightfall interface and avoid unrelated refactors.

Built with care by Shreyas.
