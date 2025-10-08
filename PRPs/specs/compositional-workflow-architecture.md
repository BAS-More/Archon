# Feature: Compositional Workflow Architecture with Worktree Isolation, Test Resolution, and Review Resolution

## Feature Description

Transform the agent-work-orders system from a centralized orchestrator pattern to a compositional script-based architecture that enables parallel execution through git worktrees, automatic test failure resolution with retry logic, and comprehensive review phase with blocker issue patching. This architecture change enables running 15+ work orders simultaneously in isolated worktrees with deterministic port allocation, while maintaining complete SDLC coverage from planning through testing and review.

The system will support:

- **Worktree-based isolation**: Each work order runs in its own git worktree under `trees/<work_order_id>/` instead of temporary clones
- **Port allocation**: Deterministic backend (9100-9114) and frontend (9200-9214) port assignment based on work order ID
- **Test phase with resolution**: Automatic retry loop (max 4 attempts) that resolves failed tests using AI-powered fixes
- **Review phase with resolution**: Captures screenshots, compares implementation vs spec, categorizes issues (blocker/tech_debt/skippable), and automatically patches blocker issues (max 3 attempts)
- **File-based state**: Simple JSON state management (`adw_state.json`) instead of in-memory repository
- **Compositional scripts**: Independent workflow scripts (plan, build, test, review, doc, ship) that can be run separately or together

## User Story

As a developer managing multiple concurrent features
I want to run multiple agent work orders in parallel with isolated environments
So that I can scale development velocity without conflicts or resource contention, while ensuring all code passes tests and review before deployment

## Problem Statement

The current agent-work-orders architecture has several critical limitations:

1. **No Parallelization**: GitBranchSandbox creates temporary clones that get cleaned up, preventing safe parallel execution of multiple work orders
2. **No Test Coverage**: Missing test workflow step - implementations are committed and PR'd without validation
3. **No Automated Test Resolution**: When tests fail, there's no retry/fix mechanism to automatically resolve failures
4. **No Review Phase**: No automated review of implementation against specifications with screenshot capture and blocker detection
5. **Centralized Orchestration**: Monolithic orchestrator makes it difficult to run individual phases (e.g., just test, just review) independently
6. **In-Memory State**: State management in WorkOrderRepository is not persistent across service restarts
7. **No Port Management**: No system for allocating unique ports for parallel instances

These limitations prevent scaling development workflows and ensuring code quality before PRs are created.

## Solution Statement

Implement a compositional workflow architecture inspired by the ADW (AI Developer Workflow) pattern with the following components: SEE EXAMPLES HERE: PRPs/examples/\* READ THESE

1. **GitWorktreeSandbox**: Replace GitBranchSandbox with worktree-based isolation that shares the same repo but has independent working directories
2. **Port Allocation System**: Deterministic port assignment (backend: 9100-9114, frontend: 9200-9214) based on work order ID hash
3. **File-Based State Management**: JSON state files for persistence and debugging
4. **Test Workflow Module**: New `test_workflow.py` with automatic resolution and retry logic (4 attempts)
5. **Review Workflow Module**: New `review_workflow.py` with screenshot capture, spec comparison, and blocker patching (3 attempts)
6. **Compositional Scripts**: Independent workflow operations that can be composed or run individually
7. **Enhanced WorkflowStep Enum**: Add TEST, RESOLVE_TEST, REVIEW, RESOLVE_REVIEW steps
8. **Resolution Commands**: New Claude commands `/resolve_failed_test` and `/resolve_failed_review` for AI-powered fixes

## Relevant Files

### Core Workflow Files

- `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py` - Main orchestrator that needs refactoring for compositional approach
  - Currently: Monolithic execute_workflow with sequential steps
  - Needs: Modular workflow composition with test/review phases

- `python/src/agent_work_orders/workflow_engine/workflow_operations.py` - Atomic workflow operations
  - Currently: classify_issue, build_plan, implement_plan, create_commit, create_pull_request
  - Needs: Add test_workflow, review_workflow, resolve_test, resolve_review operations

- `python/src/agent_work_orders/models.py` - Data models including WorkflowStep enum
  - Currently: WorkflowStep has CLASSIFY, PLAN, IMPLEMENT, COMMIT, REVIEW, TEST, CREATE_PR
  - Needs: Add RESOLVE_TEST, RESOLVE_REVIEW steps

### Sandbox Management Files

- `python/src/agent_work_orders/sandbox_manager/git_branch_sandbox.py` - Current temp clone implementation
  - Problem: Creates temp dirs, no parallelization support
  - Will be replaced by: GitWorktreeSandbox

- `python/src/agent_work_orders/sandbox_manager/sandbox_factory.py` - Factory for creating sandboxes
  - Needs: Add GitWorktreeSandbox creation logic

- `python/src/agent_work_orders/sandbox_manager/sandbox_protocol.py` - Sandbox interface
  - May need: Port allocation methods

### State Management Files

- `python/src/agent_work_orders/state_manager/work_order_repository.py` - Current in-memory state
  - Currently: In-memory dictionary with async methods
  - Needs: File-based JSON persistence option

- `python/src/agent_work_orders/config.py` - Configuration
  - Needs: Port range configuration, worktree base directory

### Command Files

- `python/.claude/commands/agent-work-orders/test.md` - Currently just a hello world test
  - Needs: Comprehensive test suite runner that returns JSON with failed tests

- `python/.claude/commands/agent-work-orders/implementor.md` - Implementation command
  - May need: Context about test requirements

### New Files

#### Worktree Management

- `python/src/agent_work_orders/sandbox_manager/git_worktree_sandbox.py` - New worktree-based sandbox
- `python/src/agent_work_orders/utils/worktree_operations.py` - Worktree CRUD operations
- `python/src/agent_work_orders/utils/port_allocation.py` - Port management utilities

#### Test Workflow

- `python/src/agent_work_orders/workflow_engine/test_workflow.py` - Test execution with resolution
- `python/.claude/commands/agent-work-orders/test_runner.md` - Run test suite, return JSON
- `python/.claude/commands/agent-work-orders/resolve_failed_test.md` - Fix failed test given JSON

#### Review Workflow

- `python/src/agent_work_orders/workflow_engine/review_workflow.py` - Review with screenshot capture
- `python/.claude/commands/agent-work-orders/review_runner.md` - Run review against spec
- `python/.claude/commands/agent-work-orders/resolve_failed_review.md` - Patch blocker issues
- `python/.claude/commands/agent-work-orders/create_patch_plan.md` - Generate patch plan for issue

#### State Management

- `python/src/agent_work_orders/state_manager/file_state_repository.py` - JSON file-based state
- `python/src/agent_work_orders/models/workflow_state.py` - State data models

#### Documentation

- `docs/compositional-workflows.md` - Architecture documentation
- `docs/worktree-management.md` - Worktree operations guide
- `docs/test-resolution.md` - Test workflow documentation
- `docs/review-resolution.md` - Review workflow documentation

## Implementation Plan

### Phase 1: Foundation - Worktree Isolation and Port Allocation

Establish the core infrastructure for parallel execution through git worktrees and deterministic port allocation. This phase creates the foundation for all subsequent phases.

**Key Deliverables**:

- GitWorktreeSandbox implementation
- Port allocation system
- Worktree management utilities
- `.ports.env` file generation
- Updated sandbox factory

### Phase 2: File-Based State Management

Replace in-memory state repository with file-based JSON persistence for durability and debuggability across service restarts.

**Key Deliverables**:

- FileStateRepository implementation
- WorkflowState models
- State migration utilities
- JSON serialization/deserialization
- Backward compatibility layer

### Phase 3: Test Workflow with Resolution

Implement comprehensive test execution with automatic failure resolution and retry logic.

**Key Deliverables**:

- test_workflow.py module
- test_runner.md command (returns JSON array of test results)
- resolve_failed_test.md command (takes test JSON, fixes issue)
- Retry loop (max 4 attempts)
- Test result parsing and formatting
- Integration with orchestrator

### Phase 4: Review Workflow with Resolution

Add review phase with screenshot capture, spec comparison, and automatic blocker patching.

**Key Deliverables**:

- review_workflow.py module
- review_runner.md command (compares implementation vs spec)
- resolve_failed_review.md command (patches blocker issues)
- Screenshot capture integration
- Issue severity categorization (blocker/tech_debt/skippable)
- Retry loop (max 3 attempts)
- R2 upload integration (optional)

### Phase 5: Compositional Refactoring

Refactor the centralized orchestrator into composable workflow scripts that can be run independently.

**Key Deliverables**:

- Modular workflow composition
- Independent script execution
- Workflow step dependencies
- Enhanced error handling
- Workflow resumption support

## Step by Step Tasks

### Step 1: Create Worktree Sandbox Implementation

Create the core GitWorktreeSandbox class that manages git worktrees for isolated execution.

- Create `python/src/agent_work_orders/sandbox_manager/git_worktree_sandbox.py`
- Implement `GitWorktreeSandbox` class with:
  - `__init__(repository_url, sandbox_identifier)` - Initialize with worktree path calculation
  - `setup()` - Create worktree under `trees/<sandbox_identifier>/` from origin/main
  - `cleanup()` - Remove worktree using `git worktree remove`
  - `execute_command(command, timeout)` - Execute commands in worktree context
  - `get_git_branch_name()` - Query current branch in worktree
- Handle existing worktree detection and validation
- Add logging for all worktree operations
- Write unit tests for GitWorktreeSandbox in `python/tests/agent_work_orders/sandbox_manager/test_git_worktree_sandbox.py`

### Step 2: Implement Port Allocation System

Create deterministic port allocation based on work order ID to enable parallel instances.

- Create `python/src/agent_work_orders/utils/port_allocation.py`
- Implement functions:
  - `get_ports_for_work_order(work_order_id) -> Tuple[int, int]` - Calculate ports from ID hash (backend: 9100-9114, frontend: 9200-9214)
  - `is_port_available(port: int) -> bool` - Check if port is bindable
  - `find_next_available_ports(work_order_id, max_attempts=15) -> Tuple[int, int]` - Find available ports with offset
  - `create_ports_env_file(worktree_path, backend_port, frontend_port)` - Generate `.ports.env` file
- Add port range configuration to `python/src/agent_work_orders/config.py`
- Write unit tests for port allocation in `python/tests/agent_work_orders/utils/test_port_allocation.py`

### Step 3: Create Worktree Management Utilities

Build helper utilities for worktree CRUD operations.

- Create `python/src/agent_work_orders/utils/worktree_operations.py`
- Implement functions:
  - `create_worktree(work_order_id, branch_name, logger) -> Tuple[str, Optional[str]]` - Create worktree and return path or error
  - `validate_worktree(work_order_id, state) -> Tuple[bool, Optional[str]]` - Three-way validation (state, filesystem, git)
  - `get_worktree_path(work_order_id) -> str` - Calculate absolute worktree path
  - `remove_worktree(work_order_id, logger) -> Tuple[bool, Optional[str]]` - Clean up worktree
  - `setup_worktree_environment(worktree_path, backend_port, frontend_port, logger)` - Create .ports.env
- Handle git fetch operations before worktree creation
- Add comprehensive error handling and logging
- Write unit tests for worktree operations in `python/tests/agent_work_orders/utils/test_worktree_operations.py`

### Step 4: Update Sandbox Factory

Modify the sandbox factory to support creating GitWorktreeSandbox instances.

- Update `python/src/agent_work_orders/sandbox_manager/sandbox_factory.py`
- Add GIT_WORKTREE case to `create_sandbox()` method
- Integrate port allocation during sandbox creation
- Pass port configuration to GitWorktreeSandbox
- Update SandboxType enum in models.py to promote GIT_WORKTREE from placeholder
- Write integration tests for sandbox factory with worktrees

### Step 5: Implement File-Based State Repository

Create file-based state management for persistence and debugging.

- Create `python/src/agent_work_orders/state_manager/file_state_repository.py`
- Implement `FileStateRepository` class:
  - `__init__(state_directory: str)` - Initialize with state directory path
  - `save_state(work_order_id, state_data)` - Write JSON to `<state_dir>/<work_order_id>.json`
  - `load_state(work_order_id) -> Optional[dict]` - Read JSON from file
  - `list_states() -> List[str]` - List all work order IDs with state files
  - `delete_state(work_order_id)` - Remove state file
  - `update_status(work_order_id, status, **kwargs)` - Update specific fields
  - `save_step_history(work_order_id, step_history)` - Persist step history
- Add state directory configuration to config.py
- Create state models in `python/src/agent_work_orders/models/workflow_state.py`
- Write unit tests for file state repository

### Step 6: Update WorkflowStep Enum

Add new workflow steps for test and review resolution.

- Update `python/src/agent_work_orders/models.py`
- Add to WorkflowStep enum:
  - `RESOLVE_TEST = "resolve_test"` - Test failure resolution step
  - `RESOLVE_REVIEW = "resolve_review"` - Review issue resolution step
- Update `StepHistory.get_current_step()` to include new steps in sequence:
  - Updated sequence: CLASSIFY → PLAN → FIND_PLAN → GENERATE_BRANCH → IMPLEMENT → COMMIT → TEST → RESOLVE_TEST (if needed) → REVIEW → RESOLVE_REVIEW (if needed) → CREATE_PR
- Write unit tests for updated step sequence logic

### Step 7: Create Test Runner Command

Build Claude command to execute test suite and return structured JSON results.

- Update `python/.claude/commands/agent-work-orders/test_runner.md`
- Command should:
  - Execute backend tests: `cd python && uv run pytest tests/ -v --tb=short`
  - Execute frontend tests: `cd archon-ui-main && npm test`
  - Parse test results from output
  - Return JSON array with structure:
    ```json
    [
      {
        "test_name": "string",
        "test_file": "string",
        "passed": boolean,
        "error": "optional string",
        "execution_command": "string"
      }
    ]
    ```
  - Include test purpose and reproduction command
  - Sort failed tests first
  - Handle timeout and command errors gracefully
- Test the command manually with sample repositories

### Step 8: Create Resolve Failed Test Command

Build Claude command to analyze and fix failed tests given test JSON.

- Create `python/.claude/commands/agent-work-orders/resolve_failed_test.md`
- Command takes single argument: test result JSON object
- Command should:
  - Parse test failure information
  - Analyze root cause of failure
  - Read relevant test file and code under test
  - Implement fix (code change or test update)
  - Re-run the specific failed test to verify fix
  - Report success/failure
- Include examples of common test failure patterns
- Add constraints (don't skip tests, maintain test coverage)
- Test the command with sample failed test JSONs

### Step 9: Implement Test Workflow Module

Create the test workflow module with automatic resolution and retry logic.

- Create `python/src/agent_work_orders/workflow_engine/test_workflow.py`
- Implement functions:
  - `run_tests(executor, command_loader, work_order_id, working_dir) -> StepExecutionResult` - Execute test suite
  - `parse_test_results(output, logger) -> Tuple[List[TestResult], int, int]` - Parse JSON output
  - `resolve_failed_test(executor, command_loader, test_json, work_order_id, working_dir) -> StepExecutionResult` - Fix single test
  - `run_tests_with_resolution(executor, command_loader, work_order_id, working_dir, max_attempts=4) -> Tuple[List[TestResult], int, int]` - Main retry loop
- Implement retry logic:
  - Run tests, check for failures
  - If failures exist and attempts < max_attempts: resolve each failed test
  - Re-run tests after resolution
  - Stop if all tests pass or max attempts reached
- Add TestResult model to models.py
- Write comprehensive unit tests for test workflow

### Step 10: Add Test Workflow Operation

Create atomic operation for test execution in workflow_operations.py.

- Update `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Add function:
  ```python
  async def execute_tests(
      executor: AgentCLIExecutor,
      command_loader: ClaudeCommandLoader,
      work_order_id: str,
      working_dir: str,
  ) -> StepExecutionResult
  ```
- Function should:
  - Call `run_tests_with_resolution()` from test_workflow.py
  - Return StepExecutionResult with test summary
  - Include pass/fail counts in output
  - Log detailed test results
- Add TESTER constant to agent_names.py
- Write unit tests for execute_tests operation

### Step 11: Integrate Test Phase in Orchestrator

Add test phase to workflow orchestrator between COMMIT and CREATE_PR steps.

- Update `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- After commit step (line ~236), add:

  ```python
  # Step 7: Run tests with resolution
  test_result = await workflow_operations.execute_tests(
      self.agent_executor,
      self.command_loader,
      agent_work_order_id,
      sandbox.working_dir,
  )
  step_history.steps.append(test_result)
  await self.state_repository.save_step_history(agent_work_order_id, step_history)

  if not test_result.success:
      raise WorkflowExecutionError(f"Tests failed: {test_result.error_message}")

  bound_logger.info("step_completed", step="test")
  ```

- Update step numbering (PR creation becomes step 8)
- Add test failure handling strategy
- Write integration tests for full workflow with test phase

### Step 12: Create Review Runner Command

Build Claude command to review implementation against spec with screenshot capture.

- Create `python/.claude/commands/agent-work-orders/review_runner.md`
- Command takes arguments: spec_file_path, work_order_id
- Command should:
  - Read specification from spec_file_path
  - Analyze implementation in codebase
  - Start application (if UI component)
  - Capture screenshots of key UI flows
  - Compare implementation against spec requirements
  - Categorize issues by severity: "blocker" | "tech_debt" | "skippable"
  - Return JSON with structure:
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
- Include review criteria and severity definitions
- Test command with sample specifications

### Step 13: Create Resolve Failed Review Command

Build Claude command to patch blocker issues from review.

- Create `python/.claude/commands/agent-work-orders/resolve_failed_review.md`
- Command takes single argument: review issue JSON object
- Command should:
  - Parse review issue details
  - Create patch plan addressing the issue
  - Implement the patch (code changes)
  - Verify patch resolves the issue
  - Report success/failure
- Include constraints (only fix blocker issues, maintain functionality)
- Add examples of common review issue patterns
- Test command with sample review issues

### Step 14: Implement Review Workflow Module

Create the review workflow module with automatic blocker patching.

- Create `python/src/agent_work_orders/workflow_engine/review_workflow.py`
- Implement functions:
  - `run_review(executor, command_loader, spec_file, work_order_id, working_dir) -> ReviewResult` - Execute review
  - `parse_review_results(output, logger) -> ReviewResult` - Parse JSON output
  - `resolve_review_issue(executor, command_loader, issue_json, work_order_id, working_dir) -> StepExecutionResult` - Patch single issue
  - `run_review_with_resolution(executor, command_loader, spec_file, work_order_id, working_dir, max_attempts=3) -> ReviewResult` - Main retry loop
- Implement retry logic:
  - Run review, check for blocker issues
  - If blockers exist and attempts < max_attempts: resolve each blocker
  - Re-run review after patching
  - Stop if no blockers or max attempts reached
  - Allow tech_debt and skippable issues to pass
- Add ReviewResult and ReviewIssue models to models.py
- Write comprehensive unit tests for review workflow

### Step 15: Add Review Workflow Operation

Create atomic operation for review execution in workflow_operations.py.

- Update `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Add function:
  ```python
  async def execute_review(
      executor: AgentCLIExecutor,
      command_loader: ClaudeCommandLoader,
      spec_file: str,
      work_order_id: str,
      working_dir: str,
  ) -> StepExecutionResult
  ```
- Function should:
  - Call `run_review_with_resolution()` from review_workflow.py
  - Return StepExecutionResult with review summary
  - Include blocker count in output
  - Log detailed review results
- Add REVIEWER constant to agent_names.py
- Write unit tests for execute_review operation

### Step 16: Integrate Review Phase in Orchestrator

Add review phase to workflow orchestrator between TEST and CREATE_PR steps.

- Update `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- After test step, add:

  ```python
  # Step 8: Run review with resolution
  review_result = await workflow_operations.execute_review(
      self.agent_executor,
      self.command_loader,
      plan_file or "",
      agent_work_order_id,
      sandbox.working_dir,
  )
  step_history.steps.append(review_result)
  await self.state_repository.save_step_history(agent_work_order_id, step_history)

  if not review_result.success:
      raise WorkflowExecutionError(f"Review failed: {review_result.error_message}")

  bound_logger.info("step_completed", step="review")
  ```

- Update step numbering (PR creation becomes step 9)
- Add review failure handling strategy
- Write integration tests for full workflow with review phase

### Step 17: Refactor Orchestrator for Composition

Refactor workflow orchestrator to support modular composition.

- Update `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- Extract workflow phases into separate methods:
  - `_execute_planning_phase()` - classify → plan → find_plan → generate_branch
  - `_execute_implementation_phase()` - implement → commit
  - `_execute_testing_phase()` - test → resolve_test (if needed)
  - `_execute_review_phase()` - review → resolve_review (if needed)
  - `_execute_deployment_phase()` - create_pr
- Update `execute_workflow()` to compose phases:
  ```python
  await self._execute_planning_phase(...)
  await self._execute_implementation_phase(...)
  await self._execute_testing_phase(...)
  await self._execute_review_phase(...)
  await self._execute_deployment_phase(...)
  ```
- Add phase-level error handling and recovery
- Support skipping phases via configuration
- Write unit tests for each phase method

### Step 18: Add Configuration for New Features

Add configuration options for worktrees, ports, and new workflow phases.

- Update `python/src/agent_work_orders/config.py`
- Add configuration:

  ```python
  # Worktree configuration
  WORKTREE_BASE_DIR: str = os.getenv("WORKTREE_BASE_DIR", "trees")

  # Port allocation
  BACKEND_PORT_RANGE_START: int = int(os.getenv("BACKEND_PORT_START", "9100"))
  BACKEND_PORT_RANGE_END: int = int(os.getenv("BACKEND_PORT_END", "9114"))
  FRONTEND_PORT_RANGE_START: int = int(os.getenv("FRONTEND_PORT_START", "9200"))
  FRONTEND_PORT_RANGE_END: int = int(os.getenv("FRONTEND_PORT_END", "9214"))

  # Test workflow
  MAX_TEST_RETRY_ATTEMPTS: int = int(os.getenv("MAX_TEST_RETRY_ATTEMPTS", "4"))
  ENABLE_TEST_PHASE: bool = os.getenv("ENABLE_TEST_PHASE", "true").lower() == "true"

  # Review workflow
  MAX_REVIEW_RETRY_ATTEMPTS: int = int(os.getenv("MAX_REVIEW_RETRY_ATTEMPTS", "3"))
  ENABLE_REVIEW_PHASE: bool = os.getenv("ENABLE_REVIEW_PHASE", "true").lower() == "true"
  ENABLE_SCREENSHOT_CAPTURE: bool = os.getenv("ENABLE_SCREENSHOT_CAPTURE", "true").lower() == "true"

  # State management
  STATE_STORAGE_TYPE: str = os.getenv("STATE_STORAGE_TYPE", "memory")  # "memory" or "file"
  FILE_STATE_DIRECTORY: str = os.getenv("FILE_STATE_DIRECTORY", "agent-work-orders-state")
  ```

- Update `.env.example` with new configuration options
- Document configuration in README

### Step 19: Create Documentation

Document the new compositional architecture and workflows.

- Create `docs/compositional-workflows.md`:
  - Architecture overview
  - Compositional design principles
  - Phase composition examples
  - Error handling and recovery
  - Configuration guide

- Create `docs/worktree-management.md`:
  - Worktree vs temporary clone comparison
  - Parallelization capabilities
  - Port allocation system
  - Cleanup and maintenance

- Create `docs/test-resolution.md`:
  - Test workflow overview
  - Retry logic explanation
  - Test resolution examples
  - Troubleshooting failed tests

- Create `docs/review-resolution.md`:
  - Review workflow overview
  - Screenshot capture setup
  - Issue severity definitions
  - Blocker patching process
  - R2 upload configuration

### Step 20: Run Validation Commands

Execute all validation commands to ensure the feature works correctly with zero regressions.

- Run backend tests: `cd python && uv run pytest tests/agent_work_orders/ -v`
- Run backend linting: `cd python && uv run ruff check src/agent_work_orders/`
- Run type checking: `cd python && uv run mypy src/agent_work_orders/`
- Test worktree creation manually:
  ```bash
  cd python
  python -c "
  from src.agent_work_orders.utils.worktree_operations import create_worktree
  from src.agent_work_orders.utils.structured_logger import get_logger
  logger = get_logger('test')
  path, err = create_worktree('test-wo-123', 'test-branch', logger)
  print(f'Path: {path}, Error: {err}')
  "
  ```
- Test port allocation:
  ```bash
  cd python
  python -c "
  from src.agent_work_orders.utils.port_allocation import get_ports_for_work_order
  backend, frontend = get_ports_for_work_order('test-wo-123')
  print(f'Backend: {backend}, Frontend: {frontend}')
  "
  ```
- Create test work order with new workflow:
  ```bash
  curl -X POST http://localhost:8181/agent-work-orders \
    -H "Content-Type: application/json" \
    -d '{
      "repository_url": "https://github.com/your-test-repo",
      "sandbox_type": "git_worktree",
      "workflow_type": "agent_workflow_plan",
      "user_request": "Add a new feature with tests"
    }'
  ```
- Verify worktree created under `trees/<work_order_id>/`
- Verify `.ports.env` created in worktree
- Monitor workflow execution through all phases
- Verify test phase runs and resolves failures
- Verify review phase runs and patches blockers
- Verify PR created successfully
- Clean up test worktrees: `git worktree prune`

## Testing Strategy

### Unit Tests

**Worktree Management**:

- Test worktree creation with valid repository
- Test worktree creation with invalid branch
- Test worktree validation (three-way check)
- Test worktree cleanup
- Test handling of existing worktrees

**Port Allocation**:

- Test deterministic port assignment from work order ID
- Test port availability checking
- Test finding next available ports with collision
- Test port range boundaries (9100-9114, 9200-9214)
- Test `.ports.env` file generation

**Test Workflow**:

- Test parsing valid test result JSON
- Test parsing malformed test result JSON
- Test retry loop with all tests passing
- Test retry loop with some tests failing then passing
- Test retry loop reaching max attempts
- Test individual test resolution

**Review Workflow**:

- Test parsing valid review result JSON
- Test parsing malformed review result JSON
- Test retry loop with no blocker issues
- Test retry loop with blockers then resolved
- Test retry loop reaching max attempts
- Test issue severity filtering

**State Management**:

- Test saving state to JSON file
- Test loading state from JSON file
- Test updating specific state fields
- Test handling missing state files
- Test concurrent state access

### Integration Tests

**End-to-End Workflow**:

- Test complete workflow with worktree sandbox: classify → plan → implement → commit → test → review → PR
- Test test phase with intentional test failure and resolution
- Test review phase with intentional blocker issue and patching
- Test parallel execution of multiple work orders with different ports
- Test workflow resumption after failure
- Test cleanup of worktrees after completion

**Sandbox Integration**:

- Test command execution in worktree context
- Test git operations in worktree
- Test branch creation in worktree
- Test worktree isolation (parallel instances don't interfere)

**State Persistence**:

- Test state survives service restart (file-based)
- Test state migration from memory to file
- Test state corruption recovery

### Edge Cases

**Worktree Edge Cases**:

- Worktree already exists (should reuse or fail gracefully)
- Git repository unreachable (should fail setup)
- Insufficient disk space for worktree (should fail with clear error)
- Worktree removal fails (should log error and continue)
- Maximum worktrees reached (15 concurrent) - should queue or fail

**Port Allocation Edge Cases**:

- All ports in range occupied (should fail with error)
- Port becomes occupied between allocation and use (should retry)
- Invalid port range in configuration (should fail validation)

**Test Workflow Edge Cases**:

- Test command times out (should mark as failed)
- Test command returns invalid JSON (should fail gracefully)
- All tests fail and none can be resolved (should fail after max attempts)
- Test resolution introduces new failures (should continue with retry loop)

**Review Workflow Edge Cases**:

- Review command crashes (should fail gracefully)
- Screenshot capture fails (should continue review without screenshots)
- Review finds only skippable issues (should pass)
- Blocker patch introduces new blocker (should continue with retry loop)
- Spec file not found (should fail with clear error)

**State Management Edge Cases**:

- State file corrupted (should fail with recovery suggestion)
- State directory not writable (should fail with permission error)
- Concurrent access to same state file (should handle with locking or fail safely)

## Acceptance Criteria

- [ ] GitWorktreeSandbox successfully creates and manages worktrees under `trees/<work_order_id>/`
- [ ] Port allocation deterministically assigns unique ports (backend: 9100-9114, frontend: 9200-9214) based on work order ID
- [ ] Multiple work orders (at least 3) can run in parallel without port or filesystem conflicts
- [ ] `.ports.env` file is created in each worktree with correct port configuration
- [ ] Test workflow successfully runs test suite and returns structured JSON results
- [ ] Test workflow automatically resolves failed tests up to 4 attempts
- [ ] Test workflow stops retrying when all tests pass
- [ ] Review workflow successfully reviews implementation against spec
- [ ] Review workflow captures screenshots (when enabled)
- [ ] Review workflow categorizes issues by severity (blocker/tech_debt/skippable)
- [ ] Review workflow automatically patches blocker issues up to 3 attempts
- [ ] Review workflow allows tech_debt and skippable issues to pass
- [ ] WorkflowStep enum includes TEST, RESOLVE_TEST, REVIEW, RESOLVE_REVIEW steps
- [ ] Workflow orchestrator executes all phases: planning → implementation → testing → review → deployment
- [ ] File-based state repository persists state to JSON files
- [ ] State survives service restarts when using file-based storage
- [ ] Configuration supports enabling/disabling test and review phases
- [ ] All existing tests pass with zero regressions
- [ ] New unit tests achieve >80% code coverage for new modules
- [ ] Integration tests verify end-to-end workflow with parallel execution
- [ ] Documentation covers compositional architecture, worktrees, test resolution, and review resolution
- [ ] Cleanup of worktrees works correctly (git worktree remove + prune)
- [ ] Error messages are clear and actionable for all failure scenarios

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

### Backend Tests

- `cd python && uv run pytest tests/agent_work_orders/ -v --tb=short` - Run all agent work orders tests
- `cd python && uv run pytest tests/agent_work_orders/sandbox_manager/ -v` - Test sandbox management
- `cd python && uv run pytest tests/agent_work_orders/workflow_engine/ -v` - Test workflow engine
- `cd python && uv run pytest tests/agent_work_orders/utils/ -v` - Test utilities

### Code Quality

- `cd python && uv run ruff check src/agent_work_orders/` - Check code quality
- `cd python && uv run mypy src/agent_work_orders/` - Type checking

### Manual Worktree Testing

```bash
# Test worktree creation
cd python
python -c "
from src.agent_work_orders.utils.worktree_operations import create_worktree, validate_worktree, remove_worktree
from src.agent_work_orders.utils.structured_logger import get_logger
logger = get_logger('test')

# Create worktree
path, err = create_worktree('test-wo-123', 'test-branch', logger)
print(f'Created worktree at: {path}')
assert err is None, f'Error: {err}'

# Validate worktree
from src.agent_work_orders.state_manager.file_state_repository import FileStateRepository
state_repo = FileStateRepository('test-state')
state_data = {'worktree_path': path}
valid, err = validate_worktree('test-wo-123', state_data)
assert valid, f'Validation failed: {err}'

# Remove worktree
success, err = remove_worktree('test-wo-123', logger)
assert success, f'Removal failed: {err}'
print('Worktree lifecycle test passed!')
"
```

### Manual Port Allocation Testing

```bash
cd python
python -c "
from src.agent_work_orders.utils.port_allocation import get_ports_for_work_order, find_next_available_ports, is_port_available
backend, frontend = get_ports_for_work_order('test-wo-123')
print(f'Ports for test-wo-123: Backend={backend}, Frontend={frontend}')
assert 9100 <= backend <= 9114, f'Backend port out of range: {backend}'
assert 9200 <= frontend <= 9214, f'Frontend port out of range: {frontend}'

# Test availability check
available = is_port_available(backend)
print(f'Backend port {backend} available: {available}')

# Test finding next available
next_backend, next_frontend = find_next_available_ports('test-wo-456')
print(f'Next available ports: Backend={next_backend}, Frontend={next_frontend}')
print('Port allocation test passed!')
"
```

### Integration Testing

```bash
# Start agent work orders service
docker compose up -d archon-server

# Create work order with worktree sandbox
curl -X POST http://localhost:8181/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{
    "repository_url": "https://github.com/coleam00/archon",
    "sandbox_type": "git_worktree",
    "workflow_type": "agent_workflow_plan",
    "user_request": "Fix issue #123"
  }'

# Verify worktree created
ls -la trees/

# Monitor workflow progress
watch -n 2 'curl -s http://localhost:8181/agent-work-orders | jq'

# Verify .ports.env in worktree
cat trees/<work_order_id>/.ports.env

# After completion, verify cleanup
git worktree list
```

### Parallel Execution Testing

```bash
# Create 3 work orders simultaneously
for i in 1 2 3; do
  curl -X POST http://localhost:8181/agent-work-orders \
    -H "Content-Type: application/json" \
    -d "{
      \"repository_url\": \"https://github.com/coleam00/archon\",
      \"sandbox_type\": \"git_worktree\",
      \"workflow_type\": \"agent_workflow_plan\",
      \"user_request\": \"Parallel test $i\"
    }" &
done
wait

# Verify all worktrees exist
ls -la trees/

# Verify different ports allocated
for dir in trees/*/; do
  echo "Worktree: $dir"
  cat "$dir/.ports.env"
  echo "---"
done
```

## Notes

### Architecture Decision: Compositional vs Centralized

This feature implements Option B (compositional refactoring) because:

1. **Scalability**: Compositional design enables running individual phases (e.g., just test or just review) without full workflow
2. **Debugging**: Independent scripts are easier to test and debug in isolation
3. **Flexibility**: Users can compose custom workflows (e.g., skip review for simple PRs)
4. **Maintainability**: Smaller, focused modules are easier to maintain than monolithic orchestrator
5. **Parallelization**: Worktree-based approach inherently supports compositional execution

### Performance Considerations

- **Worktree Creation**: Worktrees are faster than clones (~2-3x) because they share the same .git directory
- **Port Allocation**: Hash-based allocation is deterministic but may have collisions; fallback to linear search adds minimal overhead
- **Retry Loops**: Test (4 attempts) and review (3 attempts) retry limits prevent infinite loops while allowing reasonable resolution attempts
- **State I/O**: File-based state adds disk I/O but enables persistence; consider eventual move to database for high-volume deployments

### Future Enhancements

1. **Database State**: Replace file-based state with PostgreSQL/Supabase for better concurrent access and querying
2. **WebSocket Updates**: Stream test/review progress to UI in real-time
3. **Screenshot Upload**: Integrate R2/S3 for screenshot storage and PR comments with images
4. **Workflow Resumption**: Support resuming failed workflows from last successful step
5. **Custom Workflows**: Allow users to define custom workflow compositions via config
6. **Metrics**: Add OpenTelemetry instrumentation for workflow performance monitoring
7. **E2E Testing**: Add Playwright/Cypress integration for UI-focused review
8. **Distributed Execution**: Support running work orders across multiple machines

### Migration Path

For existing deployments:

1. **Backward Compatibility**: Keep GitBranchSandbox working alongside GitWorktreeSandbox
2. **Gradual Migration**: Default to GIT_BRANCH, opt-in to GIT_WORKTREE via configuration
3. **State Migration**: Provide utility to migrate in-memory state to file-based state
4. **Cleanup**: Add command to clean up old temporary clones: `rm -rf /tmp/agent-work-orders/*`

### Dependencies

New dependencies to add via `uv add`:

- (None required - uses existing git, pytest, claude CLI)

### Related Issues/PRs

- #XXX - Original agent-work-orders MVP implementation
- #XXX - Worktree isolation discussion
- #XXX - Test phase feature request
- #XXX - Review automation proposal
