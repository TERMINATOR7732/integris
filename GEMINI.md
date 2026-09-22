# Antigravity Permanent Engineering & Quality Rules

## 1. Engineering Discipline
1. Never claim a task is complete without verification.
2. Run the relevant tests after meaningful changes.
3. Run builds before declaring production readiness.
4. Do not fabricate functionality.
5. Do not fabricate API responses.
6. Do not fabricate metrics.
7. Do not fabricate test results.
8. Do not hide failing tests.
9. Do not silently ignore errors.
10. Do not modify unrelated files unnecessarily.
11. Prefer the smallest correct change.
12. Preserve existing working functionality.
13. Inspect the repository before making architectural assumptions.
14. Do not introduce dependencies without justification.
15. Prefer free/open-source solutions.
16. Never expose secrets.
17. Never commit `.env` secrets.
18. Do not create unnecessary databases.
19. Do not introduce external APIs unless explicitly required.
20. Maintain clear separation between frontend, backend, data, and infrastructure.

## 2. Testing Discipline
Before declaring any task or phase complete:
1. Unit tests: execute and verify 100% passing.
2. Integration tests: verify end-to-end component contracts.
3. Build: compile/bundle to ensure zero type errors or syntax issues.
4. Relevant error-path testing: verify edge cases and failure handling.
5. Security sanity check: ensure no leaked credentials, unsafe queries, or permissive defaults.
6. Manual verification where appropriate: test live endpoints or user flows.
Always report actual command outputs and test execution results.

## 3. Git Discipline
Before any commit:
1. Run `git status` to inspect modified and untracked files.
2. Run `git diff` to review exact code changes.
3. Run `git diff --stat` to review changed file footprint.
- Never overwrite unrelated user work.
- Never reset or delete changes without explicit authorization.
- Never commit secrets, credentials, API keys, `.env` files, or generated sensitive artifacts.

## 4. Cost Discipline
- Maintain a strict ₹0 budget for all portfolio and engineering projects unless explicitly authorized otherwise.
- Never activate paid subscriptions, trials requiring payment methods, or paid cloud resources.
- Do not configure paid model providers or external paid APIs.
- Prefer local, free-tier, and open-source tooling.

## 5. Autonomous Loop & Tooling Governance
- GSD: Use for project decomposition, milestone planning, specification architecture, and context boundaries.
- Antigravity: Primary implementation, refactoring, debugging, testing, and system integration environment.
- CodeRabbit: Use for independent automated code reviews, maintainability checks, security auditing, and test coverage validation.
- Ralph Loop: Use strictly for controlled repetitive tasks with explicit completion criteria. Never run unattended without predefined limits.
- MCP: Integrate only when a project genuinely requires an external specialized capability.
