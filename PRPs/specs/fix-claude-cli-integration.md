# Feature: Fix Claude CLI Integration for Agent Work Orders

## Feature Description

Fix the Claude CLI integration in the Agent Work Orders system to properly execute agent workflows using the Claude Code CLI. The current implementation is missing the required `--verbose` flag and lacks other important CLI configuration options for reliable, automated agent execution.

The system currently fails with error: `"Error: When using --print, --output-format=stream-json requires --verbose"` because the CLI command builder is incomplete. This feature will add all necessary CLI flags, improve error handling, and ensure robust integration with Claude Code CLI for automated agent workflows.

## User Story

As a developer using the Agent Work Orders system
I want the system to properly execute Claude CLI commands with all required flags
So that agent workflows complete successfully and I can automate development tasks reliably

## Problem Statement

The current CLI integration has several issues:

1. **Missing `--verbose` flag**: When using `--print` with `--output-format=stream-json`, the `--verbose` flag is required by Claude Code CLI but not included in the command
2. **No turn limits**: Workflows can run indefinitely without a safety mechanism to limit agentic turns
3. **No permission handling**: Interactive permission prompts block automated workflows
4. **Incomplete configuration**: Missing flags for model selection, working directories, and other important options
5. **Test misalignment**: Tests were written expecting `-f` flag pattern but implementation uses stdin, causing confusion
6. **Limited error context**: Error messages don't provide enough information for debugging CLI failures

These issues prevent agent work orders from executing successfully and make the system unusable in its current state.

## Solution Statement

Implement a complete CLI integration by:

1. **Add missing `--verbose` flag** to enable stream-json output format
2. **Add safety limits** with `--max-turns` to prevent runaway executions
3. **Enable automation** with `--dangerously-skip-permissions` for non-interactive operation
4. **Add configuration options** for working directories and model selection
5. **Update tests** to match the stdin-based implementation pattern
6. **Improve error handling** with better error messages and validation
7. **Add configuration** for customizable CLI flags via environment variables

The solution maintains the existing architecture while fixing the CLI command builder and adding proper configuration management.

## Relevant Files

**Core Implementation Files:**
- `python/src/agent_work_orders/agent_executor/agent_cli_executor.py` (lines 24-58) - CLI command builder that needs fixing
  - Currently missing `--verbose` flag
  - Needs additional flags for safety and automation
  - Error handling could be improved

**Configuration:**
- `python/src/agent_work_orders/config.py` (lines 17-30) - Configuration management
  - Needs new configuration options for CLI flags
  - Should support environment variable overrides

**Tests:**
- `python/tests/agent_work_orders/test_agent_executor.py` (lines 10-44) - Unit tests for CLI executor
  - Tests expect `-f` flag pattern but implementation uses stdin
  - Need to update tests to match current implementation
  - Add tests for new CLI flags

**Workflow Integration:**
- `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py` (lines 98-104) - Calls CLI executor
  - Verify integration works with updated CLI command
  - Ensure proper error propagation

**Documentation:**
- `PRPs/ai_docs/cc_cli_ref.md` - Claude CLI reference documentation
  - Contains complete flag reference
  - Guides implementation

### New Files

None - this is a fix to existing implementation.

## Implementation Plan

### Phase 1: Foundation - Fix Core CLI Command Builder

Add the missing `--verbose` flag and implement basic safety flags to make the CLI integration functional. This unblocks agent workflow execution.

**Changes:**
- Add `--verbose` flag to command builder (required for stream-json)
- Add `--max-turns` flag with default limit (safety)
- Add `--dangerously-skip-permissions` flag (automation)
- Update configuration with new options

### Phase 2: Enhanced Configuration

Add comprehensive configuration management for CLI flags, allowing operators to customize behavior via environment variables or config files.

**Changes:**
- Add configuration options for all CLI flags
- Support environment variable overrides
- Add validation for configuration values
- Document configuration options

### Phase 3: Testing and Validation

Update tests to match the current stdin-based implementation and add comprehensive test coverage for new CLI flags.

**Changes:**
- Fix existing tests to match stdin pattern
- Add tests for new CLI flags
- Add integration tests for full workflow execution
- Add error handling tests

## Step by Step Tasks

### Fix CLI Command Builder

- Read the current implementation in `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Update the `build_command` method to include the `--verbose` flag after `--output-format stream-json`
- Add `--max-turns` flag with configurable value (default: 20)
- Add `--dangerously-skip-permissions` flag for automation
- Ensure command parts are joined correctly with proper spacing
- Update the docstring to document all flags being added
- Verify the command string format matches CLI expectations

### Add Configuration Options

- Read `python/src/agent_work_orders/config.py`
- Add `CLAUDE_CLI_MAX_TURNS` config option (default: 20)
- Add `CLAUDE_CLI_SKIP_PERMISSIONS` config option (default: True for automation)
- Add `CLAUDE_CLI_VERBOSE` config option (default: True, required for stream-json)
- Add docstrings explaining each configuration option
- Ensure all config options support environment variable overrides

### Update CLI Executor to Use Config

- Update `agent_cli_executor.py` to read configuration values
- Pass configuration to `build_command` method
- Make flags configurable rather than hardcoded
- Add parameter documentation for new options
- Maintain backward compatibility with existing code

### Improve Error Handling

- Add validation for command file path existence before reading
- Add better error messages when CLI execution fails
- Include the full command in error logs (without sensitive data)
- Add timeout context to error messages
- Log CLI stdout/stderr even on success for debugging

### Update Unit Tests

- Read `python/tests/agent_work_orders/test_agent_executor.py`
- Update `test_build_command` to verify `--verbose` flag is included
- Update `test_build_command` to verify `--max-turns` flag is included
- Update `test_build_command` to verify `--dangerously-skip-permissions` flag is included
- Remove or update tests expecting `-f` flag pattern (no longer used)
- Update test assertions to match stdin-based implementation
- Add test for command with all flags enabled
- Add test for command with custom max-turns value

### Add Integration Tests

- Create new test `test_build_command_with_config` that verifies configuration is used
- Create test `test_execute_with_valid_command_file` that mocks file reading
- Create test `test_execute_with_missing_command_file` that verifies error handling
- Create test `test_cli_flags_in_correct_order` to ensure proper flag ordering
- Verify all tests pass with `cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py -v`

### Test End-to-End Workflow

- Start the agent work orders server with `cd python && uv run uvicorn src.agent_work_orders.main:app --host 0.0.0.0 --port 8888`
- Create a test work order via curl: `curl -X POST http://localhost:8888/agent-work-orders -H "Content-Type: application/json" -d '{"repository_url": "https://github.com/anthropics/claude-code", "sandbox_type": "git_branch", "workflow_type": "agent_workflow_plan", "github_issue_number": "123"}'`
- Monitor server logs to verify the CLI command includes all required flags
- Verify the error message no longer appears: "Error: When using --print, --output-format=stream-json requires --verbose"
- Check that workflow executes successfully or fails with a different (expected) error
- Verify session ID extraction works from CLI output

### Update Documentation

- Update inline code comments in `agent_cli_executor.py` explaining why each flag is needed
- Add comments documenting the Claude CLI requirements
- Reference the CLI documentation file `PRPs/ai_docs/cc_cli_ref.md` in code comments
- Ensure configuration options are documented with examples

### Run Validation Commands

Execute all validation commands listed in the Validation Commands section to ensure zero regressions and complete functionality.

## Testing Strategy

### Unit Tests

**CLI Command Builder Tests:**
- Verify `--verbose` flag is present in built command
- Verify `--max-turns` flag is present with correct value
- Verify `--dangerously-skip-permissions` flag is present
- Verify flags are in correct order (order may matter for CLI parsing)
- Verify command parts are properly space-separated
- Verify prompt text is correctly prepared for stdin

**Configuration Tests:**
- Verify default configuration values are correct
- Verify environment variables override defaults
- Verify configuration validation works for invalid values

**Error Handling Tests:**
- Test with non-existent command file path
- Test with invalid configuration values
- Test with CLI execution failures
- Test with timeout scenarios

### Integration Tests

**Full Workflow Tests:**
- Test creating work order triggers CLI execution
- Test CLI command includes all required flags
- Test session ID extraction from CLI output
- Test error propagation from CLI to API response

**Sandbox Integration:**
- Test CLI executes in correct working directory
- Test prompt text is passed via stdin correctly
- Test output parsing works with actual CLI format

### Edge Cases

**Command Building:**
- Empty args list
- Very long prompt text (test stdin limits)
- Special characters in args
- Non-existent command file path
- Command file with no content

**Configuration:**
- Max turns = 0 (should error or use sensible minimum)
- Max turns = 1000 (should cap at reasonable maximum)
- Invalid boolean values for skip_permissions
- Missing environment variables (should use defaults)

**CLI Execution:**
- CLI command times out
- CLI command exits with non-zero code
- CLI output contains no session ID
- CLI output is malformed JSON
- Claude CLI not installed or not in PATH

## Acceptance Criteria

**CLI Integration:**
- ✅ Agent work orders execute without "requires --verbose" error
- ✅ CLI command includes `--verbose` flag
- ✅ CLI command includes `--max-turns` flag with configurable value
- ✅ CLI command includes `--dangerously-skip-permissions` flag
- ✅ Configuration options support environment variable overrides
- ✅ Error messages include helpful context for debugging

**Testing:**
- ✅ All existing unit tests pass
- ✅ New tests verify CLI flags are included
- ✅ Integration test verifies end-to-end workflow
- ✅ Test coverage for error handling scenarios

**Functionality:**
- ✅ Work orders can be created via API
- ✅ Background workflow execution starts
- ✅ CLI command executes with proper flags
- ✅ Session ID is extracted from CLI output
- ✅ Errors are properly logged and returned to API

**Documentation:**
- ✅ Code comments explain CLI requirements
- ✅ Configuration options are documented
- ✅ Error messages are clear and actionable

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

```bash
# Run all agent work orders tests
cd python && uv run pytest tests/agent_work_orders/ -v

# Run specific CLI executor tests
cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py -v

# Run type checking
cd python && uv run mypy src/agent_work_orders/agent_executor/

# Run linting
cd python && uv run ruff check src/agent_work_orders/agent_executor/
cd python && uv run ruff check src/agent_work_orders/config.py

# Start server and test end-to-end
cd python && uv run uvicorn src.agent_work_orders.main:app --host 0.0.0.0 --port 8888 &
sleep 3

# Test health endpoint
curl -s http://localhost:8888/health | jq .

# Create test work order
curl -s -X POST http://localhost:8888/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{
    "repository_url": "https://github.com/anthropics/claude-code",
    "sandbox_type": "git_branch",
    "workflow_type": "agent_workflow_plan",
    "github_issue_number": "123"
  }' | jq .

# Wait for background execution to start
sleep 5

# Check work order status
curl -s http://localhost:8888/agent-work-orders | jq '.[] | {id: .agent_work_order_id, status: .status, error: .error_message}'

# Verify logs show proper CLI command with all flags (check server stdout)
# Should see: claude --print --output-format stream-json --verbose --max-turns 20 --dangerously-skip-permissions

# Stop server
pkill -f "uvicorn src.agent_work_orders.main:app"
```

## Notes

### CLI Flag Requirements

Based on `PRPs/ai_docs/cc_cli_ref.md`:
- `--verbose` is **required** when using `--print` with `--output-format=stream-json`
- `--max-turns` should be set to prevent runaway executions (recommended: 10-50)
- `--dangerously-skip-permissions` is needed for non-interactive automation
- Flag order may matter - follow the order shown in documentation examples

### Configuration Philosophy

- Default values should enable successful automation
- Environment variables allow per-deployment customization
- Configuration should fail fast with clear errors
- Document all configuration with examples

### Future Enhancements (Out of Scope for This Feature)

- Add support for `--add-dir` flag for multi-directory workspaces
- Add support for `--agents` flag for custom subagents
- Add support for `--model` flag for model selection
- Add retry logic with exponential backoff for transient failures
- Add metrics/telemetry for CLI execution success rates
- Add support for resuming failed workflows with `--resume` flag

### Testing Notes

- Tests must not require actual Claude CLI installation
- Mock subprocess execution for unit tests
- Integration tests can assume Claude CLI is available
- Consider adding e2e tests that use a mock CLI script
- Validate session ID extraction with real CLI output examples

### Debugging Tips

When CLI execution fails:
1. Check server logs for full command string
2. Verify command file exists at expected path
3. Test CLI command manually in terminal
4. Check Claude CLI version (may have breaking changes)
5. Verify working directory has correct permissions
6. Check for prompt text issues (encoding, length)

### Related Documentation

- Claude Code CLI Reference: `PRPs/ai_docs/cc_cli_ref.md`
- Agent Work Orders PRD: `PRPs/specs/agent-work-orders-mvp-v2.md`
- SDK Documentation: https://docs.claude.com/claude-code/sdk
