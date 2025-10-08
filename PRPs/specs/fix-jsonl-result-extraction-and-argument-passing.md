# Feature: Fix JSONL Result Extraction and Argument Passing

## Feature Description

Fix critical integration issues between Agent Work Orders system and Claude CLI that prevent workflow execution from completing successfully. The system currently fails to extract the actual result text from Claude CLI's JSONL output stream and doesn't properly pass arguments to command files using the $ARGUMENTS placeholder pattern.

These fixes enable the atomic workflow execution pattern to work end-to-end by ensuring clean data flow between workflow steps.

## User Story

As a developer using the Agent Work Orders system
I want workflows to execute successfully end-to-end
So that I can automate development tasks via GitHub issues without manual intervention

## Problem Statement

The first real-world test of the atomic workflow execution system (work order wo-18d08ae8, repository: https://github.com/Wirasm/dylan.git, issue #1) revealed two critical failures that prevent workflow completion:

**Problem 1: JSONL Result Not Extracted**
- `workflow_operations.py` uses `result.stdout.strip()` to get agent output
- `result.stdout` contains the entire JSONL stream (multiple lines of JSON messages)
- The actual agent result is in the "result" field of the final JSONL message with `type:"result"`
- Consequence: Downstream steps receive JSONL garbage instead of clean output

**Observed Example:**
```python
# What we're currently doing (WRONG):
issue_class = result.stdout.strip()
# Gets: '{"type":"session_started","session_id":"..."}\n{"type":"result","result":"/feature","is_error":false}'

# What we should do (CORRECT):
issue_class = result.result_text.strip()
# Gets: "/feature"
```

**Problem 2: $ARGUMENTS Placeholder Not Replaced**
- Command files use `$ARGUMENTS` placeholder for dynamic content (ADW pattern)
- `AgentCLIExecutor.build_command()` appends args to prompt but doesn't replace placeholder
- Claude CLI receives literal "$ARGUMENTS" text instead of actual issue JSON
- Consequence: Agents cannot access input data needed to perform their task

**Observed Failure:**
```
Step 1 (Classifier): ✅ Executed BUT ❌ Wrong Output
- Agent response: "I need to see the GitHub issue content. The $ARGUMENTS placeholder shows {}"
- Output: Full JSONL stream instead of "/feature", "/bug", or "/chore"
- Session ID: 06f225c7-bcd8-436c-8738-9fa744c8eee6

Step 2 (Planner): ❌ Failed Immediately
- Received JSONL as issue_class: {"type":"result"...}
- Error: "Unknown issue class: {JSONL output...}"
- Workflow halted - cannot proceed without clean classification
```

## Solution Statement

Implement two critical fixes to enable proper Claude CLI integration:

**Fix 1: Extract result_text from JSONL Output**
- Add `result_text` field to `CommandExecutionResult` model
- Extract the "result" field value from JSONL's final result message in `AgentCLIExecutor`
- Update all `workflow_operations.py` functions to use `result.result_text` instead of `result.stdout`
- Preserve `stdout` for debugging (contains full JSONL stream)

**Fix 2: Replace $ARGUMENTS and Positional Placeholders**
- Modify `AgentCLIExecutor.build_command()` to replace `$ARGUMENTS` with actual arguments
- Support both `$ARGUMENTS` (all args) and `$1`, `$2`, `$3` (positional args)
- Pre-process command file content before passing to Claude CLI
- Remove old code that appended "Arguments: ..." to end of prompt

This enables atomic workflows to execute correctly with clean data flow between steps.

## Relevant Files

Use these files to implement the feature:

**Core Models** - Add result extraction field
- `python/src/agent_work_orders/models.py`:180-190 - CommandExecutionResult model needs result_text field to store extracted result

**Agent Executor** - Implement JSONL parsing and argument replacement
- `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`:25-88 - build_command() needs $ARGUMENTS replacement logic (line 61-62 currently just appends args)
- `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`:90-236 - execute_async() needs result_text extraction (around line 170-175)
- `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`:337-363 - _extract_result_message() already extracts result dict, need to get "result" field value

**Workflow Operations** - Use extracted result_text instead of stdout
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:26-79 - classify_issue() line 51 uses `result.stdout.strip()`
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:82-155 - build_plan() line 133 uses `result.stdout`
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:158-213 - find_plan_file() line 185 uses `result.stdout`
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:216-267 - implement_plan() line 245 uses `result.stdout`
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:270-326 - generate_branch() line 299 uses `result.stdout`
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:329-385 - create_commit() line 358 uses `result.stdout`
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:388-444 - create_pull_request() line 417 uses `result.stdout`

**Tests** - Update and add test coverage
- `python/tests/agent_work_orders/test_models.py` - Add tests for CommandExecutionResult with result_text field
- `python/tests/agent_work_orders/test_agent_executor.py` - Add tests for result extraction and argument replacement
- `python/tests/agent_work_orders/test_workflow_operations.py`:1-398 - Update ALL mocks to include result_text field (currently missing)

**Command Files** - Examples using $ARGUMENTS that need to work
- `.claude/commands/agent-work-orders/classify_issue.md`:19-21 - Uses `$ARGUMENTS` placeholder
- `.claude/commands/agent-work-orders/feature.md` - Uses `$ARGUMENTS` placeholder
- `.claude/commands/agent-work-orders/bug.md` - Uses positional `$1`, `$2`, `$3`

### New Files

No new files needed - all changes are modifications to existing files.

## Implementation Plan

### Phase 1: Foundation - Model Enhancement

Add the result_text field to CommandExecutionResult so we can store the extracted result value separately from the raw JSONL stdout. This is a backward-compatible change.

### Phase 2: Core Implementation - Result Extraction

Implement the logic to parse JSONL output and extract the "result" field value into result_text during command execution in AgentCLIExecutor.

### Phase 3: Core Implementation - Argument Replacement

Implement placeholder replacement logic in build_command() to support $ARGUMENTS and $1, $2, $3 patterns in command files.

### Phase 4: Integration - Update Workflow Operations

Update all 7 workflow operation functions to use result_text instead of stdout for cleaner data flow between atomic steps.

### Phase 5: Testing and Validation

Comprehensive test coverage for both fixes and end-to-end validation with actual workflow execution.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### Add result_text Field to CommandExecutionResult Model

- Open `python/src/agent_work_orders/models.py`
- Locate the `CommandExecutionResult` class (line 180)
- Add new optional field after stdout:
  ```python
  result_text: str | None = None
  ```
- Add inline comment above the field: `# Extracted result text from JSONL "result" field (if available)`
- Verify the model definition is complete and properly formatted
- Save the file

### Implement Result Text Extraction in execute_async()

- Open `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Locate the `execute_async()` method
- Find the section around line 170-175 where `_extract_result_message()` is called
- After line 173 `result_message = self._extract_result_message(stdout_text)`, add:
  ```python
  # Extract result text from JSONL result message
  result_text: str | None = None
  if result_message and "result" in result_message:
      result_value = result_message.get("result")
      # Convert result to string (handles both str and other types)
      result_text = str(result_value) if result_value is not None else None
  else:
      result_text = None
  ```
- Update the `CommandExecutionResult` instantiation (around line 191) to include the new field:
  ```python
  result = CommandExecutionResult(
      success=success,
      stdout=stdout_text,
      result_text=result_text,  # NEW: Add this line
      stderr=stderr_text,
      exit_code=process.returncode or 0,
      session_id=session_id,
      error_message=error_message,
      duration_seconds=duration,
  )
  ```
- Add debug logging after extraction (before the result object is created):
  ```python
  if result_text:
      self._logger.debug(
          "result_text_extracted",
          result_text_preview=result_text[:100] if len(result_text) > 100 else result_text,
          work_order_id=work_order_id
      )
  ```
- Save the file

### Implement $ARGUMENTS Placeholder Replacement in build_command()

- Still in `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Locate the `build_command()` method (line 25-88)
- Find the section around line 60-62 that handles arguments
- Replace the current args handling code:
  ```python
  # OLD CODE TO REMOVE:
  # if args:
  #     prompt_text += f"\n\nArguments: {', '.join(args)}"

  # NEW CODE:
  # Replace argument placeholders in prompt text
  if args:
      # Replace $ARGUMENTS with first arg (or all args joined if multiple)
      prompt_text = prompt_text.replace("$ARGUMENTS", args[0] if len(args) == 1 else ", ".join(args))

      # Replace positional placeholders ($1, $2, $3, etc.)
      for i, arg in enumerate(args, start=1):
          prompt_text = prompt_text.replace(f"${i}", arg)
  ```
- Save the file

### Update classify_issue() to Use result_text

- Open `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Locate the `classify_issue()` function (starts at line 26)
- Find line 50-51 that extracts issue_class
- Replace with:
  ```python
  # OLD: if result.success and result.stdout:
  #         issue_class = result.stdout.strip()

  # NEW: Use result_text which contains the extracted result
  if result.success and result.result_text:
      issue_class = result.result_text.strip()
  ```
- Verify the rest of the function logic remains unchanged
- Save the file

### Update build_plan() to Use result_text

- Still in `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Locate the `build_plan()` function (starts at line 82)
- Find line 133 in the success case
- Replace `output=result.stdout or ""` with:
  ```python
  output=result.result_text or result.stdout or ""
  ```
- Note: We use fallback to stdout for backward compatibility during transition
- Save the file

### Update find_plan_file() to Use result_text

- Still in `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Locate the `find_plan_file()` function (starts at line 158)
- Find line 185 that checks stdout
- Replace with:
  ```python
  # OLD: if result.success and result.stdout and result.stdout.strip() != "0":
  #         plan_file_path = result.stdout.strip()

  # NEW: Use result_text
  if result.success and result.result_text and result.result_text.strip() != "0":
      plan_file_path = result.result_text.strip()
  ```
- Save the file

### Update implement_plan() to Use result_text

- Still in `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Locate the `implement_plan()` function (starts at line 216)
- Find line 245 in the success case
- Replace `output=result.stdout or ""` with:
  ```python
  output=result.result_text or result.stdout or ""
  ```
- Save the file

### Update generate_branch() to Use result_text

- Still in `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Locate the `generate_branch()` function (starts at line 270)
- Find line 298-299 that extracts branch_name
- Replace with:
  ```python
  # OLD: if result.success and result.stdout:
  #         branch_name = result.stdout.strip()

  # NEW: Use result_text
  if result.success and result.result_text:
      branch_name = result.result_text.strip()
  ```
- Save the file

### Update create_commit() to Use result_text

- Still in `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Locate the `create_commit()` function (starts at line 329)
- Find line 357-358 that extracts commit_message
- Replace with:
  ```python
  # OLD: if result.success and result.stdout:
  #         commit_message = result.stdout.strip()

  # NEW: Use result_text
  if result.success and result.result_text:
      commit_message = result.result_text.strip()
  ```
- Save the file

### Update create_pull_request() to Use result_text

- Still in `python/src/agent_work_orders/workflow_engine/workflow_operations.py`
- Locate the `create_pull_request()` function (starts at line 388)
- Find line 416-417 that extracts pr_url
- Replace with:
  ```python
  # OLD: if result.success and result.stdout:
  #         pr_url = result.stdout.strip()

  # NEW: Use result_text
  if result.success and result.result_text:
      pr_url = result.result_text.strip()
  ```
- Save the file
- Verify all 7 workflow operations now use result_text

### Add Model Tests for result_text Field

- Open `python/tests/agent_work_orders/test_models.py`
- Add new test function at the end of the file:
  ```python
  def test_command_execution_result_with_result_text():
      """Test CommandExecutionResult includes result_text field"""
      result = CommandExecutionResult(
          success=True,
          stdout='{"type":"result","result":"/feature"}',
          result_text="/feature",
          stderr=None,
          exit_code=0,
          session_id="session-123",
      )
      assert result.result_text == "/feature"
      assert result.stdout == '{"type":"result","result":"/feature"}'
      assert result.success is True

  def test_command_execution_result_without_result_text():
      """Test CommandExecutionResult works without result_text (backward compatibility)"""
      result = CommandExecutionResult(
          success=True,
          stdout="raw output",
          stderr=None,
          exit_code=0,
      )
      assert result.result_text is None
      assert result.stdout == "raw output"
  ```
- Save the file

### Add Agent Executor Tests for Result Extraction

- Open `python/tests/agent_work_orders/test_agent_executor.py`
- Add new test function:
  ```python
  @pytest.mark.asyncio
  async def test_execute_async_extracts_result_text():
      """Test that result text is extracted from JSONL output"""
      executor = AgentCLIExecutor()

      # Mock subprocess that returns JSONL with result
      jsonl_output = '{"type":"session_started","session_id":"test-123"}\n{"type":"result","result":"/feature","is_error":false}'

      with patch("asyncio.create_subprocess_shell") as mock_subprocess:
          mock_process = AsyncMock()
          mock_process.communicate = AsyncMock(return_value=(jsonl_output.encode(), b""))
          mock_process.returncode = 0
          mock_subprocess.return_value = mock_process

          result = await executor.execute_async(
              "claude --print",
              "/tmp/test",
              prompt_text="test prompt",
              work_order_id="wo-test"
          )

          assert result.success is True
          assert result.result_text == "/feature"
          assert result.session_id == "test-123"
          assert '{"type":"result"' in result.stdout
  ```
- Save the file

### Add Agent Executor Tests for Argument Replacement

- Still in `python/tests/agent_work_orders/test_agent_executor.py`
- Add new test functions:
  ```python
  def test_build_command_replaces_arguments_placeholder():
      """Test that $ARGUMENTS placeholder is replaced with actual arguments"""
      executor = AgentCLIExecutor()

      # Create temp command file with $ARGUMENTS
      import tempfile
      with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
          f.write("Classify this issue:\\n\\n$ARGUMENTS")
          temp_file = f.name

      try:
          command, prompt = executor.build_command(
              temp_file,
              args=['{"title": "Add feature", "body": "description"}']
          )

          assert "$ARGUMENTS" not in prompt
          assert '{"title": "Add feature"' in prompt
          assert "Classify this issue:" in prompt
      finally:
          import os
          os.unlink(temp_file)

  def test_build_command_replaces_positional_arguments():
      """Test that $1, $2, $3 are replaced with positional arguments"""
      executor = AgentCLIExecutor()

      import tempfile
      with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
          f.write("Issue: $1\\nWorkOrder: $2\\nData: $3")
          temp_file = f.name

      try:
          command, prompt = executor.build_command(
              temp_file,
              args=["42", "wo-test", '{"title":"Test"}']
          )

          assert "$1" not in prompt
          assert "$2" not in prompt
          assert "$3" not in prompt
          assert "Issue: 42" in prompt
          assert "WorkOrder: wo-test" in prompt
          assert 'Data: {"title":"Test"}' in prompt
      finally:
          import os
          os.unlink(temp_file)
  ```
- Save the file

### Update All Workflow Operations Test Mocks

- Open `python/tests/agent_work_orders/test_workflow_operations.py`
- Find every `CommandExecutionResult` mock and add `result_text` field
- Update test_classify_issue_success (line 27-34):
  ```python
  mock_executor.execute_async = AsyncMock(
      return_value=CommandExecutionResult(
          success=True,
          stdout='{"type":"result","result":"/feature"}',
          result_text="/feature",  # ADD THIS
          stderr=None,
          exit_code=0,
          session_id="session-123",
      )
  )
  ```
- Repeat for all other test functions:
  - test_build_plan_feature_success (line 93-100) - add `result_text="Plan created successfully"`
  - test_build_plan_bug_success (line 128-135) - add `result_text="Bug plan created"`
  - test_find_plan_file_success (line 180-187) - add `result_text="specs/issue-42-wo-test-planner-feature.md"`
  - test_find_plan_file_not_found (line 213-220) - add `result_text="0"`
  - test_implement_plan_success (line 243-250) - add `result_text="Implementation completed"`
  - test_generate_branch_success (line 274-281) - add `result_text="feat-issue-42-wo-test-add-feature"`
  - test_create_commit_success (line 307-314) - add `result_text="implementor: feat: add user authentication"`
  - test_create_pull_request_success (line 339-346) - add `result_text="https://github.com/owner/repo/pull/123"`
- Save the file

### Run Model Unit Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_models.py::test_command_execution_result_with_result_text -v`
- Verify test passes
- Execute: `cd python && uv run pytest tests/agent_work_orders/test_models.py::test_command_execution_result_without_result_text -v`
- Verify test passes

### Run Agent Executor Unit Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py::test_execute_async_extracts_result_text -v`
- Verify result extraction test passes
- Execute: `cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py::test_build_command_replaces_arguments_placeholder -v`
- Verify $ARGUMENTS replacement test passes
- Execute: `cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py::test_build_command_replaces_positional_arguments -v`
- Verify positional argument test passes

### Run Workflow Operations Unit Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_workflow_operations.py -v`
- Verify all 9+ tests pass with updated mocks
- Check for any assertion failures related to result_text

### Run Full Test Suite

- Execute: `cd python && uv run pytest tests/agent_work_orders/ -v`
- Target: 100% of tests pass
- If any tests fail, fix them immediately before proceeding
- Execute: `cd python && uv run pytest tests/agent_work_orders/ --cov=src/agent_work_orders --cov-report=term-missing`
- Verify >80% coverage for modified files

### Run Type Checking

- Execute: `cd python && uv run mypy src/agent_work_orders/models.py`
- Verify no type errors in models
- Execute: `cd python && uv run mypy src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Verify no type errors in executor
- Execute: `cd python && uv run mypy src/agent_work_orders/workflow_engine/workflow_operations.py`
- Verify no type errors in workflow operations

### Run Linting

- Execute: `cd python && uv run ruff check src/agent_work_orders/models.py`
- Execute: `cd python && uv run ruff check src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Execute: `cd python && uv run ruff check src/agent_work_orders/workflow_engine/workflow_operations.py`
- Fix any linting issues if found

### Run End-to-End Integration Test

- Start server: `cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888 &`
- Wait for startup: `sleep 5`
- Test health: `curl http://localhost:8888/health`
- Create work order:
  ```bash
  WORK_ORDER_ID=$(curl -X POST http://localhost:8888/agent-work-orders \
    -H "Content-Type: application/json" \
    -d '{
      "repository_url": "https://github.com/Wirasm/dylan.git",
      "sandbox_type": "git_branch",
      "workflow_type": "agent_workflow_plan",
      "github_issue_number": "1"
    }' | jq -r '.agent_work_order_id')
  echo "Work Order ID: $WORK_ORDER_ID"
  ```
- Monitor: `sleep 30`
- Check status: `curl http://localhost:8888/agent-work-orders/$WORK_ORDER_ID | jq`
- Check steps: `curl http://localhost:8888/agent-work-orders/$WORK_ORDER_ID/steps | jq '.steps[] | {step: .step, agent: .agent_name, success: .success, output: .output[:50]}'`
- Verify:
  - Classifier step shows `output: "/feature"` (NOT JSONL)
  - Planner step succeeded (received clean classification)
  - All subsequent steps executed
  - Final status is "completed" or shows specific error
- Inspect logs: `ls -la /tmp/agent-work-orders/*/`
- Check artifacts: `cat /tmp/agent-work-orders/$WORK_ORDER_ID/outputs/*.jsonl | grep '"result"'`
- Stop server: `pkill -f "uvicorn.*8888"`

### Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `cd python && uv run pytest tests/agent_work_orders/test_models.py -v` - Verify model tests pass
- `cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py -v` - Verify executor tests pass
- `cd python && uv run pytest tests/agent_work_orders/test_workflow_operations.py -v` - Verify workflow operations tests pass
- `cd python && uv run pytest tests/agent_work_orders/ -v` - All agent work orders tests
- `cd python && uv run pytest` - Entire backend test suite (zero regressions)
- `cd python && uv run mypy src/agent_work_orders/` - Type check all modified code
- `cd python && uv run ruff check src/agent_work_orders/` - Lint all modified code
- End-to-end test: Start server and create work order as documented above
- Verify classifier returns clean "/feature" not JSONL
- Verify planner receives correct classification
- Verify workflow completes successfully

## Testing Strategy

### Unit Tests

**CommandExecutionResult Model**
- Test result_text field accepts string values
- Test result_text field accepts None (optional)
- Test model serialization with result_text
- Test backward compatibility (result_text=None works)

**AgentCLIExecutor Result Extraction**
- Test extraction from valid JSONL with result field
- Test extraction when result is string
- Test extraction when result is number (should stringify)
- Test extraction when result is object (should stringify)
- Test no extraction when JSONL has no result message
- Test no extraction when result message missing "result" field
- Test handles malformed JSONL gracefully

**AgentCLIExecutor Argument Replacement**
- Test $ARGUMENTS with single argument
- Test $ARGUMENTS with multiple arguments
- Test $1, $2, $3 positional replacement
- Test mixed placeholders in one file
- Test no replacement when args is None
- Test no replacement when args is empty
- Test command without placeholders

**Workflow Operations**
- Test each operation uses result_text
- Test each operation handles None result_text
- Test fallback to stdout works
- Test clean output flows to next step

### Integration Tests

**Complete Workflow**
- Test full workflow with real JSONL parsing
- Test classifier → planner data flow
- Test each step receives clean input
- Test step history contains result_text values
- Test error handling when result_text is None

**Error Scenarios**
- Test malformed JSONL output
- Test missing result field in JSONL
- Test agent returns error in result
- Test $ARGUMENTS not in command file (should still work)

### Edge Cases

**JSONL Parsing**
- Result message not last in stream
- Multiple result messages
- Result with is_error:true
- Result value is null
- Result value is boolean true/false
- Result value is large object
- Result value contains newlines

**Argument Replacement**
- $ARGUMENTS appears multiple times
- Positional args exceed provided args count
- Args contain special characters
- Args contain literal $ character
- Very long arguments (>10KB)
- Empty string arguments

**Backward Compatibility**
- Old commands without placeholders
- Workflow handles result_text=None gracefully
- stdout still accessible for debugging

## Acceptance Criteria

**Core Functionality:**
- ✅ CommandExecutionResult model has result_text field
- ✅ result_text extracted from JSONL "result" field
- ✅ $ARGUMENTS placeholder replaced with arguments
- ✅ $1, $2, $3 positional placeholders replaced
- ✅ All 7 workflow operations use result_text
- ✅ stdout preserved for debugging (backward compatible)

**Test Results:**
- ✅ All existing tests pass (zero regressions)
- ✅ New model tests pass
- ✅ New executor tests pass
- ✅ Updated workflow operations tests pass
- ✅ >80% test coverage for modified files

**Code Quality:**
- ✅ Type checking passes with no errors
- ✅ Linting passes with no warnings
- ✅ Code follows existing patterns
- ✅ Docstrings updated where needed

**End-to-End:**
- ✅ Classifier returns clean output: "/feature", "/bug", or "/chore"
- ✅ Planner receives correct issue class (not JSONL)
- ✅ All workflow steps execute successfully
- ✅ Step history shows clean result_text values
- ✅ Logs show result extraction working
- ✅ Complete workflow creates PR

## Validation Commands

```bash
# Unit Tests
cd python && uv run pytest tests/agent_work_orders/test_models.py -v
cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py -v
cd python && uv run pytest tests/agent_work_orders/test_workflow_operations.py -v

# Full Suite
cd python && uv run pytest tests/agent_work_orders/ -v --tb=short
cd python && uv run pytest tests/agent_work_orders/ --cov=src/agent_work_orders --cov-report=term-missing
cd python && uv run pytest  # All backend tests

# Quality Checks
cd python && uv run mypy src/agent_work_orders/
cd python && uv run ruff check src/agent_work_orders/

# Integration Test
cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888 &
sleep 5
curl http://localhost:8888/health | jq

# Create test work order
WORK_ORDER=$(curl -X POST http://localhost:8888/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{"repository_url":"https://github.com/Wirasm/dylan.git","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","github_issue_number":"1"}' \
  | jq -r '.agent_work_order_id')

echo "Work Order: $WORK_ORDER"
sleep 20

# Check execution
curl http://localhost:8888/agent-work-orders/$WORK_ORDER | jq
curl http://localhost:8888/agent-work-orders/$WORK_ORDER/steps | jq '.steps[] | {step, agent_name, success, output}'

# Verify logs
ls /tmp/agent-work-orders/*/outputs/
cat /tmp/agent-work-orders/*/outputs/*.jsonl | grep '"result"'

# Cleanup
pkill -f "uvicorn.*8888"
```

## Notes

**Design Decisions:**
- Preserve `stdout` containing raw JSONL for debugging
- `result_text` is the new preferred field for clean output
- Fallback to `stdout` in some workflow operations (defensive)
- Support both `$ARGUMENTS` and `$1, $2, $3` for flexibility
- Backward compatible - optional fields, graceful fallbacks

**Why This Fixes the Issue:**
```
Before Fix:
  Classifier stdout: '{"type":"result","result":"/feature","is_error":false}'
  Planner receives:  '{"type":"result","result":"/feature","is_error":false}' ❌
  Error: "Unknown issue class: {JSONL...}"

After Fix:
  Classifier stdout:      '{"type":"result","result":"/feature","is_error":false}'
  Classifier result_text: "/feature"
  Planner receives:       "/feature" ✅
  Success: Clean classification flows to next step
```

**Claude CLI JSONL Format:**
```json
{"type":"session_started","session_id":"abc-123"}
{"type":"text","text":"I'm analyzing..."}
{"type":"result","result":"/feature","is_error":false}
```

**Future Improvements:**
- Add result_json field for structured data
- Support more placeholder patterns (${ISSUE_NUMBER}, etc.)
- Validate command files have required placeholders
- Add metrics for result_text extraction success rate
- Consider streaming result extraction for long-running agents

**Migration Path:**
1. Add result_text field (backward compatible)
2. Extract in executor (backward compatible)
3. Update workflow operations (backward compatible - fallback)
4. Deploy and validate
5. Future: Remove stdout usage entirely
