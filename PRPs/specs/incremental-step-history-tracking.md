# Feature: Incremental Step History Tracking for Real-Time Workflow Observability

## Feature Description

Enable real-time progress visibility for Agent Work Orders by saving step history incrementally after each workflow step completes, rather than waiting until the end. This critical observability fix allows users to monitor workflow execution in real-time via the `/agent-work-orders/{id}/steps` API endpoint, providing immediate feedback on which steps have completed, which are in progress, and which have failed.

Currently, step history is only saved at two points: when the entire workflow completes successfully (line 260 in orchestrator) or when the workflow fails with an exception (line 269). This means users polling the steps endpoint see zero progress information until the workflow reaches one of these terminal states, creating a black-box execution experience that can last several minutes.

## User Story

As a developer using the Agent Work Orders system
I want to see real-time progress as each workflow step completes
So that I can monitor execution, debug failures quickly, and understand what the system is doing without waiting for the entire workflow to finish

## Problem Statement

The current implementation has a critical observability gap that prevents real-time progress tracking:

**Root Cause:**
- Step history is initialized at workflow start: `step_history = StepHistory(agent_work_order_id=agent_work_order_id)` (line 82)
- After each step executes, results are appended: `step_history.steps.append(result)` (lines 130, 150, 166, 186, 205, 224, 241)
- **BUT** step history is only saved to state at:
  - Line 260: `await self.state_repository.save_step_history(...)` - After ALL 7 steps complete successfully
  - Line 269: `await self.state_repository.save_step_history(...)` - In exception handler when workflow fails

**Impact:**
1. **Zero Real-Time Visibility**: Users polling `/agent-work-orders/{id}/steps` see an empty array until workflow completes or fails
2. **Poor Debugging Experience**: Cannot see which step failed until the entire workflow terminates
3. **Uncertain Progress**: Long-running workflows (3-5 minutes) appear frozen with no progress indication
4. **Wasted API Calls**: Clients poll repeatedly but get no new information until terminal state
5. **Bad User Experience**: Cannot show meaningful progress bars, step indicators, or real-time status updates in UI

**Example Scenario:**
```
User creates work order → Polls /steps endpoint every 3 seconds
  0s: [] (empty)
  3s: [] (empty)
  6s: [] (empty)
  ... workflow running ...
  120s: [] (empty)
  123s: [] (empty)
  ... workflow running ...
  180s: [all 7 steps] (suddenly all appear at once)
```

This creates a frustrating experience where users have no insight into what's happening for minutes at a time.

## Solution Statement

Implement incremental step history persistence by adding a single `await self.state_repository.save_step_history()` call immediately after each step result is appended to the history. This simple change enables real-time progress tracking with minimal code modification and zero performance impact.

**Implementation:**
- After each `step_history.steps.append(result)` call, immediately save: `await self.state_repository.save_step_history(agent_work_order_id, step_history)`
- Apply this pattern consistently across all 7 workflow steps
- Preserve existing end-of-workflow and error-handler saves for robustness
- No changes needed to API, models, or state repository (already supports incremental saves)

**Result:**
```
User creates work order → Polls /steps endpoint every 3 seconds
  0s: [] (empty - workflow starting)
  3s: [{classify step}] (classification complete!)
  10s: [{classify}, {plan}] (planning complete!)
  20s: [{classify}, {plan}, {find_plan}] (plan file found!)
  ... progress visible at each step ...
  180s: [all 7 steps] (complete with full history)
```

This provides immediate feedback, enables meaningful progress UIs, and dramatically improves the developer experience.

## Relevant Files

Use these files to implement the feature:

**Core Implementation:**
- `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py` (lines 122-269)
  - Main orchestration logic where step history is managed
  - Currently appends to step_history but doesn't save incrementally
  - Need to add `save_step_history()` calls after each step completion (7 locations)
  - Lines to modify: 130, 150, 166, 186, 205, 224, 241 (add save call after each append)

**State Management (No Changes Needed):**
- `python/src/agent_work_orders/state_manager/work_order_repository.py` (lines 147-163)
  - Already implements `save_step_history()` method with proper locking
  - Thread-safe with asyncio.Lock for concurrent access
  - Logs each save operation for observability
  - Works perfectly for incremental saves - no modifications required

**API Layer (No Changes Needed):**
- `python/src/agent_work_orders/api/routes.py` (lines 220-240)
  - Already implements `GET /agent-work-orders/{id}/steps` endpoint
  - Returns step history from state repository
  - Will automatically return incremental results once orchestrator saves them

**Models (No Changes Needed):**
- `python/src/agent_work_orders/models.py` (lines 213-246)
  - `StepHistory` model is immutable-friendly (each save creates full snapshot)
  - `StepExecutionResult` captures all step details
  - Models already support incremental history updates

### New Files

No new files needed - this is a simple enhancement to existing workflow orchestrator.

## Implementation Plan

### Phase 1: Foundation - Add Incremental Saves After Each Step

Add `save_step_history()` calls immediately after each step result is appended to enable real-time progress tracking. This is the core fix.

### Phase 2: Testing - Verify Real-Time Updates

Create comprehensive tests to verify step history is saved incrementally and accessible via API throughout workflow execution.

### Phase 3: Validation - End-to-End Testing

Validate with real workflow execution that step history appears incrementally when polling the steps endpoint.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### Read Current Implementation

- Open `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- Review the workflow execution flow from lines 122-269
- Identify all 7 locations where `step_history.steps.append()` is called
- Understand the pattern: append result → log completion → (currently missing: save history)
- Note that `save_step_history()` already exists in state_repository and is thread-safe

### Add Incremental Save After Classify Step

- Locate line 130: `step_history.steps.append(classify_result)`
- Immediately after line 130, add:
  ```python
  await self.state_repository.save_step_history(agent_work_order_id, step_history)
  ```
- This enables visibility of classification result in real-time
- Save the file

### Add Incremental Save After Plan Step

- Locate line 150: `step_history.steps.append(plan_result)`
- Immediately after line 150, add:
  ```python
  await self.state_repository.save_step_history(agent_work_order_id, step_history)
  ```
- This enables visibility of planning result in real-time
- Save the file

### Add Incremental Save After Find Plan Step

- Locate line 166: `step_history.steps.append(plan_finder_result)`
- Immediately after line 166, add:
  ```python
  await self.state_repository.save_step_history(agent_work_order_id, step_history)
  ```
- This enables visibility of plan file discovery in real-time
- Save the file

### Add Incremental Save After Branch Generation Step

- Locate line 186: `step_history.steps.append(branch_result)`
- Immediately after line 186, add:
  ```python
  await self.state_repository.save_step_history(agent_work_order_id, step_history)
  ```
- This enables visibility of branch creation in real-time
- Save the file

### Add Incremental Save After Implementation Step

- Locate line 205: `step_history.steps.append(implement_result)`
- Immediately after line 205, add:
  ```python
  await self.state_repository.save_step_history(agent_work_order_id, step_history)
  ```
- This enables visibility of implementation progress in real-time
- This is especially important as implementation can take 1-2 minutes
- Save the file

### Add Incremental Save After Commit Step

- Locate line 224: `step_history.steps.append(commit_result)`
- Immediately after line 224, add:
  ```python
  await self.state_repository.save_step_history(agent_work_order_id, step_history)
  ```
- This enables visibility of commit creation in real-time
- Save the file

### Add Incremental Save After PR Creation Step

- Locate line 241: `step_history.steps.append(pr_result)`
- Immediately after line 241, add:
  ```python
  await self.state_repository.save_step_history(agent_work_order_id, step_history)
  ```
- This enables visibility of PR creation result in real-time
- Save the file
- Verify all 7 locations now have incremental saves

### Add Comprehensive Unit Test for Incremental Saves

- Open `python/tests/agent_work_orders/test_workflow_engine.py`
- Add new test function at the end of file:
  ```python
  @pytest.mark.asyncio
  async def test_orchestrator_saves_step_history_incrementally():
      """Test that step history is saved after each step, not just at the end"""
      from src.agent_work_orders.models import (
          CommandExecutionResult,
          StepExecutionResult,
          WorkflowStep,
      )
      from src.agent_work_orders.workflow_engine.agent_names import CLASSIFIER

      # Create mocks
      mock_executor = MagicMock()
      mock_sandbox_factory = MagicMock()
      mock_github_client = MagicMock()
      mock_phase_tracker = MagicMock()
      mock_command_loader = MagicMock()
      mock_state_repository = MagicMock()

      # Track save_step_history calls
      save_calls = []
      async def track_save(wo_id, history):
          save_calls.append(len(history.steps))

      mock_state_repository.save_step_history = AsyncMock(side_effect=track_save)
      mock_state_repository.update_status = AsyncMock()
      mock_state_repository.update_git_branch = AsyncMock()

      # Mock sandbox
      mock_sandbox = MagicMock()
      mock_sandbox.working_dir = "/tmp/test"
      mock_sandbox.setup = AsyncMock()
      mock_sandbox.cleanup = AsyncMock()
      mock_sandbox_factory.create_sandbox = MagicMock(return_value=mock_sandbox)

      # Mock GitHub client
      mock_github_client.get_issue = AsyncMock(return_value={
          "title": "Test Issue",
          "body": "Test body"
      })

      # Create orchestrator
      orchestrator = WorkflowOrchestrator(
          agent_executor=mock_executor,
          sandbox_factory=mock_sandbox_factory,
          github_client=mock_github_client,
          phase_tracker=mock_phase_tracker,
          command_loader=mock_command_loader,
          state_repository=mock_state_repository,
      )

      # Mock workflow operations to return success for all steps
      with patch("src.agent_work_orders.workflow_engine.workflow_operations.classify_issue") as mock_classify:
          with patch("src.agent_work_orders.workflow_engine.workflow_operations.build_plan") as mock_plan:
              with patch("src.agent_work_orders.workflow_engine.workflow_operations.find_plan_file") as mock_find:
                  with patch("src.agent_work_orders.workflow_engine.workflow_operations.generate_branch") as mock_branch:
                      with patch("src.agent_work_orders.workflow_engine.workflow_operations.implement_plan") as mock_implement:
                          with patch("src.agent_work_orders.workflow_engine.workflow_operations.create_commit") as mock_commit:
                              with patch("src.agent_work_orders.workflow_engine.workflow_operations.create_pull_request") as mock_pr:

                                  # Mock successful results for each step
                                  mock_classify.return_value = StepExecutionResult(
                                      step=WorkflowStep.CLASSIFY,
                                      agent_name=CLASSIFIER,
                                      success=True,
                                      output="/feature",
                                      duration_seconds=1.0,
                                  )

                                  mock_plan.return_value = StepExecutionResult(
                                      step=WorkflowStep.PLAN,
                                      agent_name="planner",
                                      success=True,
                                      output="Plan created",
                                      duration_seconds=2.0,
                                  )

                                  mock_find.return_value = StepExecutionResult(
                                      step=WorkflowStep.FIND_PLAN,
                                      agent_name="plan_finder",
                                      success=True,
                                      output="specs/plan.md",
                                      duration_seconds=0.5,
                                  )

                                  mock_branch.return_value = StepExecutionResult(
                                      step=WorkflowStep.GENERATE_BRANCH,
                                      agent_name="branch_generator",
                                      success=True,
                                      output="feat-issue-1-wo-test",
                                      duration_seconds=1.0,
                                  )

                                  mock_implement.return_value = StepExecutionResult(
                                      step=WorkflowStep.IMPLEMENT,
                                      agent_name="implementor",
                                      success=True,
                                      output="Implementation complete",
                                      duration_seconds=5.0,
                                  )

                                  mock_commit.return_value = StepExecutionResult(
                                      step=WorkflowStep.COMMIT,
                                      agent_name="committer",
                                      success=True,
                                      output="Commit created",
                                      duration_seconds=1.0,
                                  )

                                  mock_pr.return_value = StepExecutionResult(
                                      step=WorkflowStep.CREATE_PR,
                                      agent_name="pr_creator",
                                      success=True,
                                      output="https://github.com/owner/repo/pull/1",
                                      duration_seconds=1.0,
                                  )

                                  # Execute workflow
                                  await orchestrator.execute_workflow(
                                      agent_work_order_id="wo-test",
                                      workflow_type=AgentWorkflowType.PLAN,
                                      repository_url="https://github.com/owner/repo",
                                      sandbox_type=SandboxType.GIT_BRANCH,
                                      user_request="Test feature request",
                                  )

      # Verify save_step_history was called after EACH step (7 times) + final save (8 total)
      # OR at minimum, verify it was called MORE than just once at the end
      assert len(save_calls) >= 7, f"Expected at least 7 incremental saves, got {len(save_calls)}"

      # Verify the progression: 1 step, 2 steps, 3 steps, etc.
      assert save_calls[0] == 1, "First save should have 1 step"
      assert save_calls[1] == 2, "Second save should have 2 steps"
      assert save_calls[2] == 3, "Third save should have 3 steps"
      assert save_calls[3] == 4, "Fourth save should have 4 steps"
      assert save_calls[4] == 5, "Fifth save should have 5 steps"
      assert save_calls[5] == 6, "Sixth save should have 6 steps"
      assert save_calls[6] == 7, "Seventh save should have 7 steps"
  ```
- Save the file

### Add Integration Test for Real-Time Step Visibility

- Still in `python/tests/agent_work_orders/test_workflow_engine.py`
- Add another test function:
  ```python
  @pytest.mark.asyncio
  async def test_step_history_visible_during_execution():
      """Test that step history can be retrieved during workflow execution"""
      from src.agent_work_orders.models import StepHistory

      # Create real state repository (in-memory)
      from src.agent_work_orders.state_manager.work_order_repository import WorkOrderRepository
      state_repo = WorkOrderRepository()

      # Create empty step history
      step_history = StepHistory(agent_work_order_id="wo-test")

      # Simulate incremental saves during workflow
      from src.agent_work_orders.models import StepExecutionResult, WorkflowStep

      # Step 1: Classify
      step_history.steps.append(StepExecutionResult(
          step=WorkflowStep.CLASSIFY,
          agent_name="classifier",
          success=True,
          output="/feature",
          duration_seconds=1.0,
      ))
      await state_repo.save_step_history("wo-test", step_history)

      # Retrieve and verify
      retrieved = await state_repo.get_step_history("wo-test")
      assert retrieved is not None
      assert len(retrieved.steps) == 1
      assert retrieved.steps[0].step == WorkflowStep.CLASSIFY

      # Step 2: Plan
      step_history.steps.append(StepExecutionResult(
          step=WorkflowStep.PLAN,
          agent_name="planner",
          success=True,
          output="Plan created",
          duration_seconds=2.0,
      ))
      await state_repo.save_step_history("wo-test", step_history)

      # Retrieve and verify progression
      retrieved = await state_repo.get_step_history("wo-test")
      assert len(retrieved.steps) == 2
      assert retrieved.steps[1].step == WorkflowStep.PLAN

      # Verify both steps are present
      assert retrieved.steps[0].step == WorkflowStep.CLASSIFY
      assert retrieved.steps[1].step == WorkflowStep.PLAN
  ```
- Save the file

### Run Unit Tests for Workflow Engine

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py::test_orchestrator_saves_step_history_incrementally -v`
- Verify the test passes and confirms incremental saves occur
- Execute: `cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py::test_step_history_visible_during_execution -v`
- Verify the test passes
- Fix any failures before proceeding

### Run All Workflow Engine Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py -v`
- Ensure all existing tests still pass (zero regressions)
- Verify new tests are included in the run
- Fix any failures

### Run Complete Agent Work Orders Test Suite

- Execute: `cd python && uv run pytest tests/agent_work_orders/ -v`
- Ensure all tests across all modules pass
- This validates no regressions were introduced
- Pay special attention to state manager and API tests
- Fix any failures

### Run Type Checking

- Execute: `cd python && uv run mypy src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- Verify no type errors in the orchestrator
- Execute: `cd python && uv run mypy src/agent_work_orders/`
- Verify no type errors in the entire module
- Fix any type issues

### Run Linting

- Execute: `cd python && uv run ruff check src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- Verify no linting issues in orchestrator
- Execute: `cd python && uv run ruff check src/agent_work_orders/`
- Verify no linting issues in entire module
- Fix any issues found

### Perform Manual End-to-End Validation

- Start the Agent Work Orders server:
  ```bash
  cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888 &
  ```
- Wait for startup: `sleep 5`
- Verify health: `curl http://localhost:8888/health | jq`
- Create a test work order:
  ```bash
  WORK_ORDER_ID=$(curl -s -X POST http://localhost:8888/agent-work-orders \
    -H "Content-Type: application/json" \
    -d '{
      "repository_url": "https://github.com/Wirasm/dylan.git",
      "sandbox_type": "git_branch",
      "workflow_type": "agent_workflow_plan",
      "user_request": "Add a test feature for real-time step tracking validation"
    }' | jq -r '.agent_work_order_id')
  echo "Created work order: $WORK_ORDER_ID"
  ```
- Immediately start polling for steps (in a loop or manually):
  ```bash
  # Poll every 3 seconds to observe real-time progress
  for i in {1..60}; do
    echo "=== Poll $i ($(date +%H:%M:%S)) ==="
    curl -s http://localhost:8888/agent-work-orders/$WORK_ORDER_ID/steps | jq '.steps | length'
    curl -s http://localhost:8888/agent-work-orders/$WORK_ORDER_ID/steps | jq '.steps[-1] | {step: .step, agent: .agent_name, success: .success}'
    sleep 3
  done
  ```
- Observe that step count increases incrementally: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7
- Verify each step appears immediately after completion (not all at once at the end)
- Verify you can see progress in real-time
- Check final status: `curl http://localhost:8888/agent-work-orders/$WORK_ORDER_ID | jq '{status: .status, steps_completed: (.git_commit_count // 0)}'`
- Stop the server: `pkill -f "uvicorn.*8888"`

### Document the Improvement

- Open `PRPs/specs/agent-work-orders-mvp-v2.md` (or relevant spec file)
- Add a note in the Observability or Implementation Notes section:
  ```markdown
  ### Real-Time Progress Tracking

  Step history is saved incrementally after each workflow step completes, enabling
  real-time progress visibility via the `/agent-work-orders/{id}/steps` endpoint.
  This allows users to monitor execution as it happens rather than waiting for the
  entire workflow to complete.

  Implementation: `save_step_history()` is called after each `steps.append()` in
  the workflow orchestrator, providing immediate feedback to polling clients.
  ```
- Save the file

### Run Final Validation Commands

- Execute all validation commands listed in the Validation Commands section below
- Ensure every command executes successfully
- Verify zero regressions across the entire codebase
- Confirm real-time progress tracking works end-to-end

## Testing Strategy

### Unit Tests

**Workflow Orchestrator Tests:**
- Test that `save_step_history()` is called after each workflow step
- Test that step history is saved 7+ times during successful execution (once per step + final save)
- Test that step count increases incrementally (1, 2, 3, 4, 5, 6, 7)
- Test that step history is saved even when workflow fails mid-execution
- Test that each save contains all steps completed up to that point

**State Repository Tests:**
- Test that `save_step_history()` handles concurrent calls safely (already implemented with asyncio.Lock)
- Test that retrieving step history returns the most recently saved version
- Test that step history can be saved and retrieved multiple times for same work order
- Test that step history overwrites previous version (not appends)

### Integration Tests

**End-to-End Workflow Tests:**
- Test that step history can be retrieved via API during workflow execution
- Test that polling `/agent-work-orders/{id}/steps` shows progressive updates
- Test that step history contains correct number of steps at each save point
- Test that step history is accessible immediately after each step completes
- Test that failed steps are visible in step history before workflow terminates

**API Integration Tests:**
- Test GET `/agent-work-orders/{id}/steps` returns empty array before first step
- Test GET `/agent-work-orders/{id}/steps` returns 1 step after classification
- Test GET `/agent-work-orders/{id}/steps` returns N steps after N steps complete
- Test GET `/agent-work-orders/{id}/steps` returns complete history after workflow finishes

### Edge Cases

**Concurrent Access:**
- Multiple clients polling `/agent-work-orders/{id}/steps` simultaneously
- Step history being saved while another request reads it (handled by asyncio.Lock)
- Workflow fails while client is retrieving step history

**Performance:**
- Large step history (7 steps * 100+ lines each) saved multiple times
- Multiple work orders executing simultaneously with incremental saves
- High polling frequency (1 second intervals) during workflow execution

**Failure Scenarios:**
- Step history save fails (network/disk error) - workflow should continue
- Step history is saved but retrieval fails - should return appropriate error
- Workflow interrupted mid-execution - partial step history should be preserved

## Acceptance Criteria

**Core Functionality:**
- ✅ Step history is saved after each workflow step completes
- ✅ Step history is saved 7 times during successful workflow execution (once per step)
- ✅ Each incremental save contains all steps completed up to that point
- ✅ Step history is accessible via API immediately after each step
- ✅ Real-time progress visible when polling `/agent-work-orders/{id}/steps`

**Backward Compatibility:**
- ✅ All existing tests pass without modification
- ✅ API behavior unchanged (same endpoints, same response format)
- ✅ No breaking changes to models or state repository
- ✅ Performance impact negligible (save operations are fast)

**Testing:**
- ✅ New unit test verifies incremental saves occur
- ✅ New integration test verifies step history visibility during execution
- ✅ All existing workflow engine tests pass
- ✅ All agent work orders tests pass
- ✅ Manual end-to-end test confirms real-time progress tracking

**Code Quality:**
- ✅ Type checking passes (mypy)
- ✅ Linting passes (ruff)
- ✅ Code follows existing patterns and conventions
- ✅ Structured logging used for save operations

**Documentation:**
- ✅ Implementation documented in spec file
- ✅ Acceptance criteria met and verified
- ✅ Validation commands executed successfully

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

```bash
# Unit Tests - Verify incremental saves
cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py::test_orchestrator_saves_step_history_incrementally -v
cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py::test_step_history_visible_during_execution -v

# Workflow Engine Tests - Ensure no regressions
cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py -v

# State Manager Tests - Verify save_step_history works correctly
cd python && uv run pytest tests/agent_work_orders/test_state_manager.py -v

# API Tests - Ensure steps endpoint still works
cd python && uv run pytest tests/agent_work_orders/test_api.py -v

# Complete Agent Work Orders Test Suite
cd python && uv run pytest tests/agent_work_orders/ -v --tb=short

# Type Checking
cd python && uv run mypy src/agent_work_orders/workflow_engine/workflow_orchestrator.py
cd python && uv run mypy src/agent_work_orders/

# Linting
cd python && uv run ruff check src/agent_work_orders/workflow_engine/workflow_orchestrator.py
cd python && uv run ruff check src/agent_work_orders/

# Full Backend Test Suite (zero regressions)
cd python && uv run pytest

# Manual End-to-End Validation
cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888 &
sleep 5
curl http://localhost:8888/health | jq

# Create work order
WORK_ORDER_ID=$(curl -s -X POST http://localhost:8888/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{"repository_url":"https://github.com/Wirasm/dylan.git","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","user_request":"Test real-time progress"}' \
  | jq -r '.agent_work_order_id')

echo "Work Order: $WORK_ORDER_ID"

# Poll for real-time progress (observe step count increase: 0->1->2->3->4->5->6->7)
for i in {1..30}; do
  STEP_COUNT=$(curl -s http://localhost:8888/agent-work-orders/$WORK_ORDER_ID/steps | jq '.steps | length')
  LAST_STEP=$(curl -s http://localhost:8888/agent-work-orders/$WORK_ORDER_ID/steps | jq -r '.steps[-1].step // "none"')
  echo "Poll $i: $STEP_COUNT steps completed, last: $LAST_STEP"
  sleep 3
done

# Verify final state
curl http://localhost:8888/agent-work-orders/$WORK_ORDER_ID | jq '{status: .status}'
curl http://localhost:8888/agent-work-orders/$WORK_ORDER_ID/steps | jq '.steps | length'

# Cleanup
pkill -f "uvicorn.*8888"
```

## Notes

### Performance Considerations

**Save Operation Performance:**
- `save_step_history()` is a fast in-memory operation (Phase 1 MVP)
- Uses asyncio.Lock to prevent race conditions
- No network I/O or disk writes in current implementation
- Future Supabase migration (Phase 2) will add network latency but async execution prevents blocking

**Impact Analysis:**
- Adding 7 incremental saves adds ~7ms total overhead (1ms per save in-memory)
- This is negligible compared to agent execution time (30-60 seconds per step)
- Total workflow time increase: <0.01% (unmeasurable)
- Trade-off: Tiny performance cost for massive observability improvement

### Why This Fix is Critical

**User Experience Impact:**
- **Before**: Black-box execution with 3-5 minute wait, zero feedback
- **After**: Real-time progress updates every 30-60 seconds as steps complete

**Debugging Benefits:**
- Immediately see which step failed without waiting for entire workflow
- Monitor long-running implementation steps for progress
- Identify bottlenecks in workflow execution

**API Efficiency:**
- Clients still poll every 3 seconds, but now get meaningful updates
- Reduces frustrated users refreshing pages or restarting work orders
- Enables progress bars, step indicators, and real-time status UIs

### Implementation Simplicity

This is one of the simplest high-value features to implement:
- **7 lines of code** (one `await save_step_history()` call per step)
- **Zero API changes** (existing endpoint already works)
- **Zero model changes** (StepHistory already supports this pattern)
- **Zero state repository changes** (save_step_history() already thread-safe)
- **High impact** (transforms user experience from frustrating to delightful)

### Future Enhancements

**Phase 2 - Supabase Persistence:**
- When migrating to Supabase, the same incremental save pattern works
- May want to batch saves (every 2-3 steps) to reduce DB writes
- Consider write-through cache for high-frequency polling

**Phase 3 - WebSocket Support:**
- Instead of polling, push step updates via WebSocket
- Even better real-time experience with lower latency
- Incremental saves still required as source of truth

**Advanced Observability:**
- Add step timing metrics (time between saves = step duration)
- Track which steps consistently take longest
- Alert on unusually slow step execution
- Historical analysis of workflow performance

### Testing Philosophy

**Focus on Real-Time Visibility:**
- Primary test: verify saves occur after each step (not just at end)
- Secondary test: verify step count progression (1, 2, 3, 4, 5, 6, 7)
- Integration test: confirm API returns incremental results during execution
- Manual test: observe real progress while workflow runs

**Regression Prevention:**
- All existing tests must pass unchanged
- No API contract changes
- No model changes
- Performance impact negligible and measured

### Related Documentation

- Agent Work Orders MVP v2 Spec: `PRPs/specs/agent-work-orders-mvp-v2.md`
- Atomic Workflow Execution: `PRPs/specs/atomic-workflow-execution-refactor.md`
- PRD: `PRPs/PRD.md`
