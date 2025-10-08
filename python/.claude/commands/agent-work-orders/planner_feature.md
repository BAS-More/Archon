# Feature Planning

Create a new plan in specs/*.md to implement the Feature using the exact specified markdown Plan Format.

## Variables
issue_number: $1
work_order_id: $2
issue_json: $3

## Instructions

- IMPORTANT: You're writing a plan to implement a net new feature that will add value to the application.
- IMPORTANT: The Feature describes the feature that will be implemented but remember we're not implementing it, we're creating the plan.
- Create the plan in the `specs/` directory with filename: `issue-{issue_number}-wo-{work_order_id}-planner-{descriptive-name}.md`
  - Replace `{descriptive-name}` with a short name based on the feature (e.g., "add-auth", "api-endpoints")
- Use the Plan Format below to create the plan.
- Research the codebase to understand existing patterns, architecture, and conventions before planning.
- IMPORTANT: Replace every <placeholder> in the Plan Format with the requested value.
- Use your reasoning model: THINK HARD about the feature requirements, design, and implementation approach.
- Follow existing patterns and conventions in the codebase.
- Design for extensibility and maintainability.
- If you need a new library, use `uv add` and report it in the Notes section.
- Start your research by reading the README.md file.
- ultrathink about the research before you create the plan.

## Plan Format

```md
# Feature: <feature name>

## Feature Description

<describe the feature in detail, including its purpose and value to users>

## User Story

As a <type of user>
I want to <action/goal>
So that <benefit/value>

## Problem Statement

<clearly define the specific problem or opportunity this feature addresses>

## Solution Statement

<describe the proposed solution approach and how it solves the problem>

## Relevant Files

Use these files to implement the feature:

<find and list the files relevant to the feature with bullet points describing why. If new files need to be created, list them in an h3 'New Files' section.>

## Implementation Plan

### Phase 1: Foundation

<describe the foundational work needed before implementing the main feature>

### Phase 2: Core Implementation

<describe the main implementation work for the feature>

### Phase 3: Integration

<describe how the feature will integrate with existing functionality>

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

<list step by step tasks as h3 headers plus bullet points. Order matters, start with foundational shared changes required then move on to specific implementation. Include creating tests throughout. Your last step should be running the Validation Commands.>

## Testing Strategy

### Unit Tests

<describe unit tests needed for the feature>

### Integration Tests

<describe integration tests needed for the feature>

### Edge Cases

<list edge cases that need to be tested>

## Acceptance Criteria

<list specific, measurable criteria that must be met for the feature to be considered complete>

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

<list commands you'll use to validate with 100% confidence the feature is implemented correctly. Every command must execute without errors.>

## Notes

<optionally list any additional notes, future considerations, or context relevant to the feature>
```

## Feature

Extract the feature details from the `issue_json` variable (parse the JSON and use the title and body fields).

## Report

- Summarize the work you've just done in a concise bullet point list.
- Include the full path to the plan file you created (e.g., `specs/issue-123-wo-abc123-planner-add-auth.md`)
