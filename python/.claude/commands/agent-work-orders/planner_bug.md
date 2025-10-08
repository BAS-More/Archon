# Bug Planning

Create a new plan to resolve the Bug using the exact specified markdown Plan Format.

## Variables
issue_number: $1
work_order_id: $2
issue_json: $3

## Instructions

- IMPORTANT: You're writing a plan to resolve a bug that will add value to the application.
- IMPORTANT: The Bug describes the bug that will be resolved but we're not resolving it, we're creating the plan.
- You're writing a plan to resolve a bug, it should be thorough and precise so we fix the root cause and prevent regressions.
- Create the plan in the `specs/` directory with filename: `issue-{issue_number}-wo-{work_order_id}-planner-{descriptive-name}.md`
  - Replace `{descriptive-name}` with a short name based on the bug (e.g., "fix-login-error", "resolve-timeout")
- Use the plan format below to create the plan.
- Research the codebase to understand the bug, reproduce it, and put together a plan to fix it.
- IMPORTANT: Replace every <placeholder> in the Plan Format with the requested value.
- Use your reasoning model: THINK HARD about the bug, its root cause, and the steps to fix it properly.
- IMPORTANT: Be surgical with your bug fix, solve the bug at hand and don't fall off track.
- IMPORTANT: We want the minimal number of changes that will fix and address the bug.
- If you need a new library, use `uv add` and report it in the Notes section.
- Start your research by reading the README.md file.

## Plan Format

```md
# Bug: <bug name>

## Bug Description
<describe the bug in detail, including symptoms and expected vs actual behavior>

## Problem Statement
<clearly define the specific problem that needs to be solved>

## Solution Statement
<describe the proposed solution approach to fix the bug>

## Steps to Reproduce
<list exact steps to reproduce the bug>

## Root Cause Analysis
<analyze and explain the root cause of the bug>

## Relevant Files
Use these files to fix the bug:

<find and list the files relevant to the bug with bullet points describing why. If new files need to be created, list them in an h3 'New Files' section.>

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

<list step by step tasks as h3 headers plus bullet points. Order matters, start with foundational shared changes then move on to specific changes. Include tests that will validate the bug is fixed. Your last step should be running the Validation Commands.>

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

<list commands you'll use to validate with 100% confidence the bug is fixed. Every command must execute without errors. Include commands to reproduce the bug before and after the fix.>

## Notes
<optionally list any additional notes or context relevant to the bug>
```

## Bug

Extract the bug details from the `issue_json` variable (parse the JSON and use the title and body fields).

## Report
- Summarize the work you've just done in a concise bullet point list.
- Include the full path to the plan file you created (e.g., `specs/issue-123-wo-abc123-planner-fix-login-error.md`)
