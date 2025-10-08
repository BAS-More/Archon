# Find Plan File

Locate the plan file created in the previous step.

## Variables
issue_number: $1
work_order_id: $2
previous_output: $3

## Instructions

- The previous step created a plan file
- Find the exact file path
- Pattern: `specs/issue-{issue_number}-wo-{work_order_id}-planner-*.md`
- Try these approaches:
  1. Parse previous_output for file path mention
  2. Run: `ls specs/issue-{issue_number}-wo-{work_order_id}-planner-*.md`
  3. Run: `find specs -name "issue-{issue_number}-wo-{work_order_id}-planner-*.md"`

## Output

Return ONLY the file path (e.g., "specs/issue-7-wo-abc123-planner-fix-auth.md")
Return "0" if not found
