# Resolve Failed Review Issue

Fix a specific blocker issue identified during the review phase.

## Arguments

1. review_issue_json: JSON string containing the review issue to fix

## Instructions

1. **Parse Review Issue**
   - Extract issue_title, issue_description, issue_severity, and affected_files from the JSON
   - Ensure this is a "blocker" severity issue (tech_debt and skippable are not resolved here)

2. **Understand the Issue**
   - Read the issue description carefully
   - Review the affected files listed
   - If a spec file was referenced in the original review, re-read relevant sections

3. **Create Fix Plan**
   - Determine what changes are needed to resolve the issue
   - Identify all files that need to be modified
   - Plan minimal, targeted changes

4. **Implement the Fix**
   - Make only the changes necessary to resolve this specific issue
   - Ensure code quality and consistency
   - Follow project conventions and patterns
   - Do not make unrelated changes

5. **Verify the Fix**
   - Re-run relevant tests if applicable
   - Check that the issue is actually resolved
   - Ensure no new issues were introduced

## Review Issue Input

$ARGUMENT_1

## Report

Provide a concise summary of:
- Root cause of the blocker issue
- Specific changes made to resolve it
- Files modified
- Confirmation that the issue is resolved
