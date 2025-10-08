# Create Git Commit

Create a git commit with proper formatting.

## Variables
agent_name: $1
issue_class: $2
issue_json: $3

## Instructions

- Format: `<agent>: <class>: <message>`
- Message: Present tense, 50 chars max, descriptive
- Examples:
  - `planner: feat: add user authentication`
  - `implementor: bug: fix login validation`

## Run

1. `git diff HEAD` - Review changes
2. `git add -A` - Stage all
3. `git commit -m "<message>"`

## Output

Return ONLY the commit message used
