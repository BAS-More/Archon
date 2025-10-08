# Issue Classification

Classify the GitHub issue into the appropriate category.

## Instructions

- Read the issue title and body carefully
- Determine if this is a bug, feature, or chore
- Respond ONLY with one of: /bug, /feature, /chore
- If unclear, default to /feature

## Classification Rules

**Bug**: Fixing broken functionality
- Issue describes something not working as expected
- Error messages, crashes, incorrect behavior
- Keywords: "error", "broken", "not working", "fails"

**Feature**: New functionality or enhancement
- Issue requests new capability
- Adds value to users
- Keywords: "add", "implement", "support", "enable"

**Chore**: Maintenance, refactoring, documentation
- No user-facing changes
- Code cleanup, dependency updates, docs
- Keywords: "refactor", "update", "clean", "docs"

## Input

GitHub Issue JSON:
$ARGUMENTS

## Output

Return ONLY one of: /bug, /feature, /chore
