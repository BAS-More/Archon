# Create Pull Request

Create a GitHub pull request for the changes.

## Variables
branch_name: $1
issue_json: $2
plan_file: $3
work_order_id: $4

## Instructions

- Title format: `<type>: #<num> - <title>`
- Body includes:
  - Summary from issue
  - Link to plan_file
  - Closes #<number>
  - Work Order: {work_order_id}

## Run

1. `git push -u origin <branch_name>`
2. `gh pr create --title "<title>" --body "<body>" --base main`

## Output

Return ONLY the PR URL
