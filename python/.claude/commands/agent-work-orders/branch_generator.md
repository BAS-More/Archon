# Generate Git Branch

Create a git branch following the standard naming convention.

## Variables
issue_class: $1
issue_number: $2
work_order_id: $3
issue_json: $4

## Instructions

- Generate branch name: `<class>-issue-<num>-wo-<id>-<desc>`
- <class>: bug, feat, or chore (remove slash from issue_class)
- <desc>: 3-6 words, lowercase, hyphens
- Extract issue details from issue_json

## Run

1. `git checkout main`
2. `git pull`
3. `git checkout -b <branch_name>`

## Output

Return ONLY the branch name created
