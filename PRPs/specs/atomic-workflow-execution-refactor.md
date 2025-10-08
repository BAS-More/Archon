# Feature: Atomic Workflow Execution Refactor

## Feature Description

Refactor the Agent Work Orders system to adopt ADW's proven multi-step atomic execution pattern while maintaining the HTTP API architecture. This involves breaking monolithic workflows into discrete, resumable agent operations following discovery → plan → implement → validate phases, with commands relocated to `python/src/agent_work_orders/commands/` for better isolation and organization.

## User Story

As a developer using the Agent Work Orders system via HTTP API
I want workflows to execute as multiple discrete, resumable agent operations
So that I can observe progress at each step, handle errors gracefully, resume from failures, and maintain a clear audit trail of which agent did what

## Problem Statement

The current Agent Work Orders implementation executes workflows as single monolithic agent calls, which creates several critical issues:

1. **Single Point of Failure**: If any step fails (planning, branching, committing, PR), the entire workflow fails and must restart from scratch
2. **Poor Observability**: Cannot track which specific step failed or see progress within the workflow
3. **No Resumption**: Cannot restart from a failed step; must re-run the entire workflow
4. **Unclear Responsibility**: All operations logged under one generic "agent" name, making debugging difficult
5. **Command Organization**: Commands live in project root `.claude/commands/agent-work-orders/` instead of being isolated with the module
6. **Deviation from Proven Pattern**: ADW demonstrates that atomic operations provide better reliability, observability, and composability

Current flow (problematic):
```
HTTP Request → execute_workflow() → ONE agent call → Done or Failed
```

Desired flow (reliable):
```
HTTP Request → execute_workflow() →
  classifier agent →
  planner agent →
  plan_finder agent →
  implementor agent →
  branch_generator agent →
  committer agent →
  pr_creator agent →
  Done (with detailed step history)
```

## Solution Statement

Refactor the workflow orchestrator to execute workflows as sequences of atomic agent operations, following the discovery → plan → implement → validate pattern. Each atomic operation:

- Has its own command file in `python/src/agent_work_orders/commands/`
- Has a clear agent name (e.g., "classifier", "planner", "implementor")
- Can succeed or fail independently
- Saves its output for debugging
- Updates workflow state after completion
- Enables resume-from-failure capability

The solution maintains the HTTP API interface while internally restructuring execution to match ADW's proven composable pattern.

## Relevant Files

### Existing Files (To Modify)

**Core Workflow Engine**:
- `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py` - Main refactor target; convert single execute_workflow() to multi-step execution
  - Currently: Single monolithic agent call
  - After: Sequence of atomic operations with state tracking between steps

- `python/src/agent_work_orders/workflow_engine/workflow_phase_tracker.py` - Enhance to track individual workflow steps
  - Add: Step-level tracking (which steps completed, which failed, which pending)

**State Management**:
- `python/src/agent_work_orders/state_manager/work_order_repository.py` - Add step tracking
  - Add methods: `update_current_step()`, `get_step_history()`, `mark_step_completed()`, `mark_step_failed()`

- `python/src/agent_work_orders/models.py` - Add step-related models
  - Add: `WorkflowStep` enum, `StepExecution` model, `StepHistory` model
  - Extend: `AgentWorkOrderState` to include `current_step`, `steps_completed`, `step_errors`

**Agent Execution**:
- `python/src/agent_work_orders/agent_executor/agent_cli_executor.py` - Add agent name parameter
  - Add: `agent_name` parameter to track which agent is executing
  - Modify: Logging to include agent name in all events

**Command Loading**:
- `python/src/agent_work_orders/command_loader/claude_command_loader.py` - Update default directory
  - Change: COMMANDS_DIRECTORY from `.claude/commands/agent-work-orders/` to `python/src/agent_work_orders/commands/`

- `python/src/agent_work_orders/config.py` - Update commands directory path
  - Change: Default commands directory configuration

**API Layer**:
- `python/src/agent_work_orders/api/routes.py` - Add step status endpoint
  - Add: `GET /agent-work-orders/{id}/steps` - Return step execution history

**GitHub Integration**:
- `python/src/agent_work_orders/github_integration/github_client.py` - May need GitHub issue fetching
  - Add: `get_issue()` method to fetch issue details for classification

### New Files

**Command Files** (`python/src/agent_work_orders/commands/`):

Discovery Phase:
- `classifier.md` - Classify issue type (/bug, /feature, /chore)

Plan Phase:
- `planner_bug.md` - Create bug fix plan
- `planner_feature.md` - Create feature plan
- `planner_chore.md` - Create chore plan
- `plan_finder.md` - Find and validate plan file path

Implement Phase:
- `implementor.md` - Implement the plan

Validate Phase:
- `code_reviewer.md` - Review code changes
- `tester.md` - Run tests and validate

Git Operations:
- `branch_generator.md` - Generate and create git branch
- `committer.md` - Create git commit with proper message

PR Operations:
- `pr_creator.md` - Create GitHub pull request

**Workflow Operations Module**:
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py` - Atomic operation functions
  - Functions: `classify_issue()`, `build_plan()`, `find_plan_file()`, `implement_plan()`, `generate_branch()`, `create_commit()`, `create_pull_request()`, `review_code()`, `run_tests()`
  - Each function: Calls one agent with specific command, returns typed result, logs with agent name

**Models for Steps**:
- Already in `python/src/agent_work_orders/models.py` but need additions:
  - `WorkflowStep` enum (CLASSIFY, PLAN, FIND_PLAN, IMPLEMENT, BRANCH, COMMIT, REVIEW, TEST, PR)
  - `StepExecutionResult` model (step, success, output, error, duration, agent_name)
  - `StepHistory` model (list of StepExecutionResult)

**Agent Name Constants**:
- `python/src/agent_work_orders/workflow_engine/agent_names.py` - Central agent naming
  - Constants: CLASSIFIER, PLANNER, PLAN_FINDER, IMPLEMENTOR, BRANCH_GENERATOR, COMMITTER, CODE_REVIEWER, TESTER, PR_CREATOR

## Implementation Plan

### Phase 1: Foundation - Models, Commands Directory, Agent Names

Set up the structural foundation for atomic execution without breaking existing functionality.

**Deliverables**:
- New directory structure for commands
- Enhanced state models to track steps
- Agent name constants
- Updated configuration

### Phase 2: Core Implementation - Command Files and Workflow Operations

Create atomic command files and workflow operation functions that execute individual steps.

**Deliverables**:
- All command files in `commands/` directory
- `workflow_operations.py` with atomic operation functions
- Each operation properly isolated and tested

### Phase 3: Integration - Refactor Orchestrator

Refactor the workflow orchestrator to use atomic operations instead of monolithic execution.

**Deliverables**:
- Refactored `workflow_orchestrator.py`
- Step-by-step execution with state tracking
- Error handling and retry logic
- Resume capability

### Phase 4: Validation and API Enhancements

Add API endpoints for step tracking and validate the entire system end-to-end.

**Deliverables**:
- New API endpoint for step history
- Enhanced error messages
- Complete test coverage
- Documentation updates

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### Create Directory Structure

- Create `python/src/agent_work_orders/commands/` directory
- Create subdirectories if needed for organization (discovery/, plan/, implement/, validate/, git/, pr/)
- Add `__init__.py` to maintain Python package structure if needed
- Verify directory exists and is writable

### Update Models for Step Tracking

- Open `python/src/agent_work_orders/models.py`
- Add `WorkflowStep` enum:
  ```python
  class WorkflowStep(str, Enum):
      """Individual workflow execution steps"""
      CLASSIFY = "classify"  # Classify issue type
      PLAN = "plan"  # Create implementation plan
      FIND_PLAN = "find_plan"  # Locate plan file
      IMPLEMENT = "implement"  # Implement the plan
      GENERATE_BRANCH = "generate_branch"  # Create git branch
      COMMIT = "commit"  # Commit changes
      REVIEW = "review"  # Code review (optional)
      TEST = "test"  # Run tests (optional)
      CREATE_PR = "create_pr"  # Create pull request
  ```
- Add `StepExecutionResult` model:
  ```python
  class StepExecutionResult(BaseModel):
      """Result of executing a single workflow step"""
      step: WorkflowStep
      agent_name: str
      success: bool
      output: str | None = None
      error_message: str | None = None
      duration_seconds: float
      session_id: str | None = None
      timestamp: datetime = Field(default_factory=datetime.now)
  ```
- Add `StepHistory` model:
  ```python
  class StepHistory(BaseModel):
      """History of all step executions for a work order"""
      agent_work_order_id: str
      steps: list[StepExecutionResult] = []

      def get_current_step(self) -> WorkflowStep | None:
          """Get the current/next step to execute"""
          if not self.steps:
              return WorkflowStep.CLASSIFY
          last_step = self.steps[-1]
          if not last_step.success:
              return last_step.step  # Retry failed step
          # Return next step in sequence
          # ... logic based on workflow type
  ```
- Extend `AgentWorkOrderState`:
  ```python
  class AgentWorkOrderState(BaseModel):
      # ... existing fields ...
      current_step: WorkflowStep | None = None
      steps_completed: list[WorkflowStep] = []
      step_errors: dict[str, str] = {}  # step_name: error_message
  ```
- Write unit tests for new models in `python/tests/agent_work_orders/test_models.py`

### Create Agent Name Constants

- Create file `python/src/agent_work_orders/workflow_engine/agent_names.py`
- Define agent name constants following discovery → plan → implement → validate:
  ```python
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
  ```
- Document each agent's responsibility
- Write tests to ensure constants are used consistently

### Update Configuration

- Open `python/src/agent_work_orders/config.py`
- Update default COMMANDS_DIRECTORY:
  ```python
  # Old: get_project_root() / ".claude" / "commands" / "agent-work-orders"
  # New: Use relative path from module
  _module_root = Path(__file__).parent  # agent_work_orders/
  _default_commands_dir = str(_module_root / "commands")
  COMMANDS_DIRECTORY: str = os.getenv("AGENT_WORK_ORDER_COMMANDS_DIR", _default_commands_dir)
  ```
- Update docstring to reflect new default location
- Test configuration loading

### Create Classifier Command

- Create `python/src/agent_work_orders/commands/classifier.md`
- Adapt from `.claude/commands/agent-work-orders/classify_issue.md`
- Content:
  ```markdown
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
  ```
- Test command file loads correctly

### Create Planner Commands

- Create `python/src/agent_work_orders/commands/planner_feature.md`
  - Adapt from `.claude/commands/agent-work-orders/feature.md`
  - Update file paths to use `specs/` directory (not `PRPs/specs/`)
  - Keep the plan format structure
  - Add explicit variables section:
    ```markdown
    ## Variables
    issue_number: $1
    work_order_id: $2
    issue_json: $3
    ```

- Create `python/src/agent_work_orders/commands/planner_bug.md`
  - Adapt from `.claude/commands/agent-work-orders/bug.md`
  - Use variables format
  - Update naming: `issue-{issue_number}-wo-{work_order_id}-planner-{name}.md`

- Create `python/src/agent_work_orders/commands/planner_chore.md`
  - Adapt from `.claude/commands/agent-work-orders/chore.md`
  - Use variables format
  - Update naming conventions

- Test all planner commands can be loaded

### Create Plan Finder Command

- Create `python/src/agent_work_orders/commands/plan_finder.md`
- Adapt from `.claude/commands/agent-work-orders/find_plan_file.md`
- Content:
  ```markdown
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
  ```
- Test command loads

### Create Implementor Command

- Create `python/src/agent_work_orders/commands/implementor.md`
- Adapt from `.claude/commands/agent-work-orders/implement.md`
- Content:
  ```markdown
  # Implementation

  Implement the plan from the specified plan file.

  ## Variables
  plan_file: $1

  ## Instructions

  - Read the plan file carefully
  - Execute every step in order
  - Follow existing code patterns and conventions
  - Create/modify files as specified in the plan
  - Run validation commands from the plan
  - Do NOT create git commits or branches (separate steps)

  ## Output

  - Summarize work completed
  - List files changed
  - Report test results if any
  ```
- Test command loads

### Create Branch Generator Command

- Create `python/src/agent_work_orders/commands/branch_generator.md`
- Adapt from `.claude/commands/agent-work-orders/generate_branch_name.md`
- Content:
  ```markdown
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
  ```
- Test command loads

### Create Committer Command

- Create `python/src/agent_work_orders/commands/committer.md`
- Adapt from `.claude/commands/agent-work-orders/commit.md`
- Content:
  ```markdown
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
  ```
- Test command loads

### Create PR Creator Command

- Create `python/src/agent_work_orders/commands/pr_creator.md`
- Adapt from `.claude/commands/agent-work-orders/pull_request.md`
- Content:
  ```markdown
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
  - Don't mention Claude Code (user gets credit)

  ## Run

  1. `git push -u origin <branch_name>`
  2. `gh pr create --title "<title>" --body "<body>" --base main`

  ## Output

  Return ONLY the PR URL
  ```
- Test command loads

### Create Optional Validation Commands

- Create `python/src/agent_work_orders/commands/code_reviewer.md` (optional phase)
  - Review code changes for quality
  - Check for common issues
  - Suggest improvements

- Create `python/src/agent_work_orders/commands/tester.md` (optional phase)
  - Run test suite
  - Parse test results
  - Report pass/fail status

- These are placeholders for future enhancement

### Create Workflow Operations Module

- Create `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Import dependencies:
  ```python
  """Workflow Operations

  Atomic operations for workflow execution.
  Each function executes one discrete agent operation.
  """

  from ..agent_executor.agent_cli_executor import AgentCLIExecutor
  from ..command_loader.claude_command_loader import ClaudeCommandLoader
  from ..github_integration.github_client import GitHubClient
  from ..models import (
      StepExecutionResult,
      WorkflowStep,
      GitHubIssue,
  )
  from ..utils.structured_logger import get_logger
  from .agent_names import *
  import time

  logger = get_logger(__name__)
  ```
- Implement `classify_issue()`:
  ```python
  async def classify_issue(
      executor: AgentCLIExecutor,
      command_loader: ClaudeCommandLoader,
      issue_json: str,
      work_order_id: str,
      working_dir: str,
  ) -> StepExecutionResult:
      """Classify issue type using classifier agent

      Returns: StepExecutionResult with issue_class in output (/bug, /feature, /chore)
      """
      start_time = time.time()

      try:
          # Load classifier command
          command_file = command_loader.load_command("classifier")

          # Build command with issue JSON as argument
          cli_command, prompt_text = executor.build_command(
              command_file,
              args=[issue_json]
          )

          # Execute classifier agent
          result = await executor.execute_async(
              cli_command,
              working_dir,
              prompt_text=prompt_text,
              work_order_id=work_order_id
          )

          duration = time.time() - start_time

          if result.success and result.stdout:
              # Extract classification from output
              issue_class = result.stdout.strip()

              return StepExecutionResult(
                  step=WorkflowStep.CLASSIFY,
                  agent_name=CLASSIFIER,
                  success=True,
                  output=issue_class,
                  duration_seconds=duration,
                  session_id=result.session_id
              )
          else:
              return StepExecutionResult(
                  step=WorkflowStep.CLASSIFY,
                  agent_name=CLASSIFIER,
                  success=False,
                  error_message=result.error_message or "Classification failed",
                  duration_seconds=duration
              )

      except Exception as e:
          duration = time.time() - start_time
          logger.error("classify_issue_error", error=str(e), exc_info=True)
          return StepExecutionResult(
              step=WorkflowStep.CLASSIFY,
              agent_name=CLASSIFIER,
              success=False,
              error_message=str(e),
              duration_seconds=duration
          )
  ```
- Implement similar functions for other steps:
  - `build_plan()` - Calls appropriate planner command based on classification
  - `find_plan_file()` - Locates plan file created by planner
  - `implement_plan()` - Executes implementation
  - `generate_branch()` - Creates git branch
  - `create_commit()` - Commits changes
  - `create_pull_request()` - Creates PR
- Each function follows the same pattern:
  - Takes necessary dependencies as parameters
  - Loads appropriate command file
  - Executes agent with proper args
  - Returns StepExecutionResult
  - Handles errors gracefully
- Write comprehensive tests for each operation

### Refactor Workflow Orchestrator

- Open `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- Import workflow_operations:
  ```python
  from . import workflow_operations
  from .agent_names import *
  ```
- Add step history tracking to execute_workflow():
  ```python
  async def execute_workflow(
      self,
      agent_work_order_id: str,
      workflow_type: AgentWorkflowType,
      repository_url: str,
      sandbox_type: SandboxType,
      github_issue_number: str | None = None,
      github_issue_json: str | None = None,  # NEW: Pass issue JSON
  ) -> None:
      """Execute workflow as sequence of atomic operations"""

      # Initialize step history
      step_history = StepHistory(agent_work_order_id=agent_work_order_id)

      # ... existing setup ...

      try:
          # Step 1: Classify issue
          classify_result = await workflow_operations.classify_issue(
              self.agent_executor,
              self.command_loader,
              github_issue_json or "{}",
              agent_work_order_id,
              sandbox.working_dir
          )
          step_history.steps.append(classify_result)

          if not classify_result.success:
              raise WorkflowExecutionError(f"Classification failed: {classify_result.error_message}")

          issue_class = classify_result.output  # e.g., "/feature"
          bound_logger.info("step_completed", step="classify", issue_class=issue_class)

          # Step 2: Build plan
          plan_result = await workflow_operations.build_plan(
              self.agent_executor,
              self.command_loader,
              issue_class,
              github_issue_number,
              agent_work_order_id,
              github_issue_json or "{}",
              sandbox.working_dir
          )
          step_history.steps.append(plan_result)

          if not plan_result.success:
              raise WorkflowExecutionError(f"Planning failed: {plan_result.error_message}")

          bound_logger.info("step_completed", step="plan")

          # Step 3: Find plan file
          plan_finder_result = await workflow_operations.find_plan_file(
              self.agent_executor,
              self.command_loader,
              github_issue_number or "",
              agent_work_order_id,
              plan_result.output or "",
              sandbox.working_dir
          )
          step_history.steps.append(plan_finder_result)

          if not plan_finder_result.success:
              raise WorkflowExecutionError(f"Plan file not found: {plan_finder_result.error_message}")

          plan_file = plan_finder_result.output
          bound_logger.info("step_completed", step="find_plan", plan_file=plan_file)

          # Step 4: Generate branch
          branch_result = await workflow_operations.generate_branch(
              self.agent_executor,
              self.command_loader,
              issue_class,
              github_issue_number or "",
              agent_work_order_id,
              github_issue_json or "{}",
              sandbox.working_dir
          )
          step_history.steps.append(branch_result)

          if not branch_result.success:
              raise WorkflowExecutionError(f"Branch creation failed: {branch_result.error_message}")

          git_branch_name = branch_result.output
          await self.state_repository.update_git_branch(agent_work_order_id, git_branch_name)
          bound_logger.info("step_completed", step="branch", branch_name=git_branch_name)

          # Step 5: Implement plan
          implement_result = await workflow_operations.implement_plan(
              self.agent_executor,
              self.command_loader,
              plan_file or "",
              agent_work_order_id,
              sandbox.working_dir
          )
          step_history.steps.append(implement_result)

          if not implement_result.success:
              raise WorkflowExecutionError(f"Implementation failed: {implement_result.error_message}")

          bound_logger.info("step_completed", step="implement")

          # Step 6: Commit changes
          commit_result = await workflow_operations.create_commit(
              self.agent_executor,
              self.command_loader,
              IMPLEMENTOR,  # agent that made the changes
              issue_class,
              github_issue_json or "{}",
              agent_work_order_id,
              sandbox.working_dir
          )
          step_history.steps.append(commit_result)

          if not commit_result.success:
              raise WorkflowExecutionError(f"Commit failed: {commit_result.error_message}")

          bound_logger.info("step_completed", step="commit")

          # Step 7: Create PR
          pr_result = await workflow_operations.create_pull_request(
              self.agent_executor,
              self.command_loader,
              git_branch_name or "",
              github_issue_json or "{}",
              plan_file or "",
              agent_work_order_id,
              sandbox.working_dir
          )
          step_history.steps.append(pr_result)

          if pr_result.success:
              pr_url = pr_result.output
              await self.state_repository.update_status(
                  agent_work_order_id,
                  AgentWorkOrderStatus.COMPLETED,
                  github_pull_request_url=pr_url
              )
              bound_logger.info("step_completed", step="create_pr", pr_url=pr_url)
          else:
              # PR creation failed but workflow succeeded
              await self.state_repository.update_status(
                  agent_work_order_id,
                  AgentWorkOrderStatus.COMPLETED,
                  error_message=f"PR creation failed: {pr_result.error_message}"
              )

          # Save step history to state
          await self.state_repository.save_step_history(agent_work_order_id, step_history)

          bound_logger.info("agent_work_order_completed", total_steps=len(step_history.steps))

      except Exception as e:
          # Save partial step history even on failure
          await self.state_repository.save_step_history(agent_work_order_id, step_history)
          # ... rest of error handling ...
  ```
- Remove old monolithic execution code
- Update error handling to include step context
- Add resume capability (future enhancement marker)

### Update State Repository

- Open `python/src/agent_work_orders/state_manager/work_order_repository.py`
- Add step history storage:
  ```python
  def __init__(self):
      self._work_orders: dict[str, AgentWorkOrderState] = {}
      self._metadata: dict[str, dict] = {}
      self._step_histories: dict[str, StepHistory] = {}  # NEW
      self._lock = asyncio.Lock()

  async def save_step_history(
      self,
      agent_work_order_id: str,
      step_history: StepHistory
  ) -> None:
      """Save step execution history"""
      async with self._lock:
          self._step_histories[agent_work_order_id] = step_history

  async def get_step_history(
      self,
      agent_work_order_id: str
  ) -> StepHistory | None:
      """Get step execution history"""
      async with self._lock:
          return self._step_histories.get(agent_work_order_id)
  ```
- Add TODO comments for Supabase implementation
- Write tests for new methods

### Add Step History API Endpoint

- Open `python/src/agent_work_orders/api/routes.py`
- Add new endpoint:
  ```python
  @router.get("/agent-work-orders/{agent_work_order_id}/steps")
  async def get_agent_work_order_steps(
      agent_work_order_id: str
  ) -> StepHistory:
      """Get step execution history for a work order

      Returns detailed history of each step executed,
      including success/failure, duration, and errors.
      """
      step_history = await state_repository.get_step_history(agent_work_order_id)

      if not step_history:
          raise HTTPException(
              status_code=404,
              detail=f"Step history not found for work order {agent_work_order_id}"
          )

      return step_history
  ```
- Update API tests to cover new endpoint
- Add docstring with example response

### Update Agent Executor for Agent Names

- Open `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Add agent_name parameter to methods:
  ```python
  async def execute_async(
      self,
      command: str,
      working_directory: str,
      timeout_seconds: int | None = None,
      prompt_text: str | None = None,
      work_order_id: str | None = None,
      agent_name: str | None = None,  # NEW
  ) -> CommandExecutionResult:
  ```
- Update logging to include agent_name:
  ```python
  self._logger.info(
      "agent_command_started",
      command=command,
      agent_name=agent_name,  # NEW
      work_order_id=work_order_id,
  )
  ```
- Update _save_prompt() to organize by agent name:
  ```python
  # Old: /tmp/agent-work-orders/{work_order_id}/prompts/prompt_{timestamp}.txt
  # New: /tmp/agent-work-orders/{work_order_id}/{agent_name}/prompts/prompt_{timestamp}.txt
  prompt_dir = Path(config.TEMP_DIR_BASE) / work_order_id / (agent_name or "default") / "prompts"
  ```
- Update _save_output_artifacts() similarly
- Write tests for agent name parameter

### Create Comprehensive Tests

- Create `python/tests/agent_work_orders/test_workflow_operations.py`
  - Test each operation function independently
  - Mock agent executor responses
  - Verify StepExecutionResult correctness
  - Test error handling

- Update `python/tests/agent_work_orders/test_workflow_engine.py`
  - Test multi-step execution flow
  - Test step history tracking
  - Test error recovery
  - Test partial execution (some steps succeed, some fail)

- Update `python/tests/agent_work_orders/test_api.py`
  - Test new /steps endpoint
  - Verify step history returned correctly

- Update `python/tests/agent_work_orders/test_models.py`
  - Test new step-related models
  - Test StepHistory methods

- Run all tests: `cd python && uv run pytest tests/agent_work_orders/ -v`
- Ensure >80% coverage

### Add Migration Guide Documentation

- Create `python/src/agent_work_orders/MIGRATION.md`
- Document the changes:
  - Command files moved location
  - Workflow execution now multi-step
  - New API endpoint for step tracking
  - How to interpret step history
  - Backward compatibility notes (none - breaking change)
- Include examples of old vs new behavior
- Add troubleshooting section

### Update PRD and Specs

- Update `PRPs/PRD.md` or `PRPs/specs/agent-work-orders-mvp-v2.md`
  - Reflect multi-step execution in architecture diagrams
  - Update workflow flow diagrams
  - Add step tracking to data models section
  - Update API specification with /steps endpoint

- Add references to ADW inspiration
- Document agent naming conventions

### Run Validation Commands

Execute every command from the Validation Commands section below to ensure zero regressions.

## Testing Strategy

### Unit Tests

**Models** (`test_models.py`):
- Test `WorkflowStep` enum values
- Test `StepExecutionResult` validation
- Test `StepHistory` methods (get_current_step, add_step, etc.)
- Test model serialization/deserialization

**Workflow Operations** (`test_workflow_operations.py`):
- Mock AgentCLIExecutor for each operation
- Test classify_issue() returns correct StepExecutionResult
- Test build_plan() handles all issue classes (/bug, /feature, /chore)
- Test find_plan_file() parses output correctly
- Test implement_plan() executes successfully
- Test generate_branch() creates proper branch name
- Test create_commit() formats message correctly
- Test create_pull_request() handles success and failure
- Test error handling in all operations

**Command Loader** (`test_command_loader.py`):
- Test loading commands from new directory
- Test all command files exist and are valid
- Test error handling for missing commands

**State Repository** (`test_state_manager.py`):
- Test save_step_history()
- Test get_step_history()
- Test step history persistence

### Integration Tests

**Workflow Orchestrator** (`test_workflow_engine.py`):
- Test complete workflow execution end-to-end
- Test workflow stops on first failure
- Test step history is saved correctly
- Test each step receives correct arguments
- Test state updates between steps
- Test PR creation success and failure scenarios

**API** (`test_api.py`):
- Test POST /agent-work-orders creates work order and starts multi-step execution
- Test GET /agent-work-orders/{id}/steps returns step history
- Test step history updates as workflow progresses (mock time delays)
- Test error responses when step history not found

**Full Workflow** (manual or E2E):
- Create work order via API
- Poll status endpoint to see steps progressing
- Verify each step completes in order
- Check step history shows all executions
- Verify PR created successfully
- Inspect logs for agent names

### Edge Cases

**Classification**:
- Issue with unclear type (should default appropriately)
- Issue JSON missing fields
- Classifier returns invalid response

**Planning**:
- Plan creation fails
- Plan file path not found
- Plan file in unexpected location

**Implementation**:
- Implementation fails mid-way
- Test failures during implementation
- File conflicts or permission errors

**Git Operations**:
- Branch already exists
- Commit fails (nothing to commit)
- Merge conflicts with main

**PR Creation**:
- PR already exists for branch
- GitHub API failure
- Authentication issues

**State Management**:
- Step history too large (many retries)
- Concurrent requests to same work order
- Resume from failed step (future)

**Error Recovery**:
- Network failures between steps
- Timeout during long-running step
- Partial step completion (agent crashes mid-execution)

## Acceptance Criteria

**Architecture**:
- ✅ Workflows execute as sequences of discrete agent operations
- ✅ Each operation has clear agent name (classifier, planner, implementor, etc.)
- ✅ Command files located in `python/src/agent_work_orders/commands/`
- ✅ Agent names follow discovery → plan → implement → validate phases
- ✅ State tracks current step and step history

**Functionality**:
- ✅ Classify issue type (/bug, /feature, /chore)
- ✅ Create appropriate plan based on classification
- ✅ Find plan file after creation
- ✅ Generate git branch with proper naming
- ✅ Implement the plan
- ✅ Commit changes with formatted message
- ✅ Create GitHub PR with proper title/body
- ✅ Track each step's success/failure in history
- ✅ Save step history accessible via API

**Observability**:
- ✅ Each step logged with agent name
- ✅ Step history shows which agent did what
- ✅ Prompts and outputs organized by agent name
- ✅ Clear error messages indicate which step failed
- ✅ Duration tracked for each step

**Reliability**:
- ✅ Workflow stops on first failure
- ✅ Partial progress saved (step history persisted)
- ✅ Error messages include step context
- ✅ Each step can be tested independently
- ✅ Step failures don't corrupt state

**API**:
- ✅ GET /agent-work-orders/{id}/steps returns step history
- ✅ Step history includes all executed steps
- ✅ Step history shows success/failure for each
- ✅ Step history includes timestamps and durations

**Testing**:
- ✅ >80% test coverage
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Edge cases handled gracefully

**Documentation**:
- ✅ Migration guide created
- ✅ PRD/specs updated
- ✅ Agent naming conventions documented
- ✅ API endpoint documented

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

**Command Structure**:
- `cd python/src/agent_work_orders && ls -la commands/` - Verify commands directory exists
- `cd python/src/agent_work_orders && ls commands/*.md | wc -l` - Count command files (should be 9+)
- `cd python && uv run pytest tests/agent_work_orders/test_models.py -v` - Test new models
- `cd python && uv run pytest tests/agent_work_orders/test_workflow_operations.py -v` - Test operations
- `cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py -v` - Test orchestrator
- `cd python && uv run pytest tests/agent_work_orders/test_api.py -v` - Test API endpoints
- `cd python && uv run pytest tests/agent_work_orders/ -v` - Run all agent work orders tests
- `cd python && uv run pytest` - Run all backend tests (ensure no regressions)
- `cd python && uv run ruff check src/agent_work_orders/` - Lint agent work orders module
- `cd python && uv run mypy src/agent_work_orders/` - Type check agent work orders module
- `cd python && uv run ruff check` - Lint entire codebase (no regressions)
- `cd python && uv run mypy src/` - Type check entire codebase (no regressions)

**Integration Validation**:
- Start server: `cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888`
- Test health: `curl http://localhost:8888/health` - Should return healthy
- Create work order: `curl -X POST http://localhost:8888/agent-work-orders -H "Content-Type: application/json" -d '{"repository_url":"https://github.com/user/repo","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","github_issue_number":"1"}'`
- Get step history: `curl http://localhost:8888/agent-work-orders/{id}/steps` - Should return step history
- Verify logs contain agent names: `grep "classifier" /tmp/agent-work-orders/*/prompts/*` or check stdout

**Manual Validation** (if possible with real repository):
- Create work order for real GitHub issue
- Monitor execution via step history endpoint
- Verify each step executes in order
- Check git branch created with proper name
- Verify commits have proper format
- Confirm PR created with correct title/body
- Inspect /tmp/agent-work-orders/{id}/ for organized outputs by agent name

## Notes

**Naming Conventions**:
- Agent names use discovery → plan → implement → validate phases
- Avoid SDLC terminology (no "sdlc_planner", use "planner")
- Use clear, descriptive names (classifier, implementor, code_reviewer)
- Consistency with command file names and agent_names.py constants

**Command Files**:
- All commands in `python/src/agent_work_orders/commands/`
- Can organize into subdirectories (discovery/, plan/, etc.) if desired
- Each command is atomic and focused on one operation
- Use explicit variable declarations (## Variables section)
- Output should be minimal and parseable (return only what's needed)

**Backward Compatibility**:
- This is a BREAKING change - old workflow execution removed
- Old monolithic commands deprecated
- Migration required for any existing deployments
- Document migration path clearly

**Future Enhancements**:
- Resume from failed step (use step_history.get_current_step())
- Parallel execution of independent steps (e.g., tests while creating PR)
- Step retry logic with exponential backoff
- Workflow composition (plan-only, implement-only, etc.)
- Custom step insertion (user-defined validation steps)
- Supabase persistence of step history
- Step-level timeouts (different timeout per step)

**Performance Considerations**:
- Each step is a separate agent call (more API calls than monolithic)
- Total execution time may increase slightly (overhead between steps)
- Trade-off: Reliability and observability > raw speed
- Can optimize later with caching or parallel execution

**Observability Benefits**:
- Know exactly which step failed
- See duration of each step
- Track which agent did what
- Easier debugging with organized logs
- Clear audit trail for compliance

**Learning from ADW**:
- Atomic operations pattern proven reliable
- Agent naming provides clarity
- Step-by-step execution enables resume
- Composable workflows for flexibility
- Clear separation of concerns

**HTTP API Differences from ADW**:
- ADW: Triggered by GitHub webhooks, runs as scripts
- AWO: Triggered by HTTP POST, runs as async FastAPI service
- ADW: Uses stdin/stdout for state passing
- AWO: Uses in-memory state repository (later Supabase)
- ADW: File-based state in agents/{adw_id}/
- AWO: API-accessible state with /steps endpoint

**Implementation Priority**:
- Phase 1: Foundation (models, constants, commands directory) - CRITICAL
- Phase 2: Commands and operations - CRITICAL
- Phase 3: Orchestrator refactor - CRITICAL
- Phase 4: API and validation - IMPORTANT
- Future: Resume, parallel execution, custom steps - NICE TO HAVE
