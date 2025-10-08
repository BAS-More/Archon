# Agent Workflow: Plan

You are executing a planning workflow for a GitHub issue or project task.

## Your Task

1. Read the GitHub issue description (if provided via issue number)
2. Analyze the requirements thoroughly
3. Create a detailed implementation plan
4. Save the plan to `PRPs/specs/plan-{work_order_id}.md`
5. Create a git branch named `feat-wo-{work_order_id}`
6. Commit all changes to git with clear commit messages

## Branch Naming

Use format: `feat-wo-{work_order_id}`

Example: `feat-wo-a3c2f1e4`

## Commit Message Format

```
plan: Create implementation plan for work order

- Analyzed requirements
- Created detailed plan
- Documented approach

Work Order: {work_order_id}
```

## Deliverables

- Git branch created following naming convention
- `PRPs/specs/plan-{work_order_id}.md` file with detailed plan
- All changes committed to git
- Clear commit messages documenting the work

## Plan Structure

Your plan should include:

1. **Feature Description** - What is being built
2. **Problem Statement** - What problem does this solve
3. **Solution Statement** - How will we solve it
4. **Architecture** - Technical design decisions
5. **Implementation Plan** - Step-by-step tasks
6. **Testing Strategy** - How to verify it works
7. **Acceptance Criteria** - Definition of done

## Important Notes

- Always create a new branch for your work
- Commit frequently with descriptive messages
- Include the work order ID in branch name and commits
- Focus on creating a comprehensive, actionable plan
