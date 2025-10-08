"""Agent Name Constants

Defines standard agent names following the workflow phases:
- Discovery: Understanding the task
- Plan: Creating implementation strategy
- Implement: Executing the plan
- Validate: Ensuring quality
"""

# Discovery Phase
CLASSIFIER = "classifier"  # Classifies issue type

# Plan Phase
PLANNER = "planner"  # Creates plans
PLAN_FINDER = "plan_finder"  # Locates plan files

# Implement Phase
IMPLEMENTOR = "implementor"  # Implements changes

# Validate Phase
CODE_REVIEWER = "code_reviewer"  # Reviews code quality
TESTER = "tester"  # Runs tests

# Git Operations (support all phases)
BRANCH_GENERATOR = "branch_generator"  # Creates branches
COMMITTER = "committer"  # Creates commits

# PR Operations (completion)
PR_CREATOR = "pr_creator"  # Creates pull requests
