# Review Implementation Against Specification

Compare the current implementation against the specification file and identify any issues that need to be addressed before creating a pull request.

## Variables

REVIEW_TIMEOUT: 10 minutes

## Arguments

1. spec_file_path: Path to the specification file (e.g., "PRPs/specs/my-feature.md")
2. work_order_id: The work order ID for context

## Instructions

1. **Read the Specification**
   - Read the specification file at `$ARGUMENT_1`
   - Understand all requirements, acceptance criteria, and deliverables
   - Note any specific constraints or implementation details

2. **Analyze Current Implementation**
   - Review the code changes made in the current branch
   - Check if all files mentioned in the spec have been created/modified
   - Verify implementation matches the spec requirements

3. **Capture Screenshots** (if applicable)
   - If the feature includes UI components:
     - Start the application if needed
     - Take screenshots of key UI flows
     - Save screenshots to `screenshots/wo-$ARGUMENT_2/` directory
   - If no UI: skip this step

4. **Compare Implementation vs Specification**
   - Identify any missing features or incomplete implementations
   - Check for deviations from the spec
   - Verify all acceptance criteria are met
   - Look for potential bugs or issues

5. **Categorize Issues by Severity**
   - **blocker**: Must be fixed before PR (breaks functionality, missing critical features)
   - **tech_debt**: Should be fixed but can be addressed later
   - **skippable**: Nice-to-have, documentation improvements, minor polish

6. **Generate Review Report**
   - Return ONLY the JSON object as specified below
   - Do not include any additional text, explanations, or markdown formatting
   - List all issues found, even if none are blockers

## Report

Return ONLY a valid JSON object with the following structure:

```json
{
  "review_passed": boolean,
  "review_issues": [
    {
      "issue_title": "string",
      "issue_description": "string",
      "issue_severity": "blocker|tech_debt|skippable",
      "affected_files": ["string"],
      "screenshots": ["string"]
    }
  ],
  "screenshots": ["string"]
}
```

### Field Descriptions

- `review_passed`: true if no blocker issues found, false otherwise
- `review_issues`: Array of all issues found (blockers, tech_debt, skippable)
- `issue_severity`: Must be one of: "blocker", "tech_debt", "skippable"
- `affected_files`: List of file paths that need changes to fix this issue
- `screenshots`: List of screenshot file paths for this specific issue (if applicable)
- `screenshots` (root level): List of all screenshot paths taken during review

### Example Output

```json
{
  "review_passed": false,
  "review_issues": [
    {
      "issue_title": "Missing error handling in API endpoint",
      "issue_description": "The /api/work-orders endpoint doesn't handle invalid repository URLs. The spec requires validation with clear error messages.",
      "issue_severity": "blocker",
      "affected_files": ["python/src/agent_work_orders/api/routes.py"],
      "screenshots": []
    },
    {
      "issue_title": "Incomplete test coverage",
      "issue_description": "Only 60% test coverage achieved, spec requires >80%",
      "issue_severity": "tech_debt",
      "affected_files": ["python/tests/agent_work_orders/"],
      "screenshots": []
    }
  ],
  "screenshots": []
}
```
