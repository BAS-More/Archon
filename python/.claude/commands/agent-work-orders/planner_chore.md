# Chore Planning

Create a new plan to resolve the Chore using the exact specified markdown Plan Format.

## Variables
issue_number: $1
work_order_id: $2
issue_json: $3

## Instructions

- IMPORTANT: You're writing a plan to resolve a chore that will add value to the application.
- IMPORTANT: The Chore describes the chore that will be resolved but we're not resolving it, we're creating the plan.
- You're writing a plan to resolve a chore, it should be simple but thorough and precise so we don't miss anything.
- Create the plan in the `specs/` directory with filename: `issue-{issue_number}-wo-{work_order_id}-planner-{descriptive-name}.md`
  - Replace `{descriptive-name}` with a short name based on the chore (e.g., "update-readme", "fix-tests")
- Use the plan format below to create the plan.
- Research the codebase and put together a plan to accomplish the chore.
- IMPORTANT: Replace every <placeholder> in the Plan Format with the requested value.
- Use your reasoning model: THINK HARD about the plan and the steps to accomplish the chore.
- Start your research by reading the README.md file.

## Plan Format

```md
# Chore: <chore name>

## Chore Description
<describe the chore in detail>

## Relevant Files
Use these files to resolve the chore:

<find and list the files relevant to the chore with bullet points describing why. If new files need to be created, list them in an h3 'New Files' section.>

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

<list step by step tasks as h3 headers plus bullet points. Order matters, start with foundational shared changes then move on to specific changes. Your last step should be running the Validation Commands.>

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

<list commands you'll use to validate with 100% confidence the chore is complete. Every command must execute without errors.>

## Notes
<optionally list any additional notes or context relevant to the chore>
```

## Chore

Extract the chore details from the `issue_json` variable (parse the JSON and use the title and body fields).

## Report
- Summarize the work you've just done in a concise bullet point list.
- Include the full path to the plan file you created (e.g., `specs/issue-7-wo-abc123-planner-update-readme.md`)
