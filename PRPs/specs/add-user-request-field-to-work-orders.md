# Feature: Add User Request Field to Agent Work Orders

## Feature Description

Add a required `user_request` field to the Agent Work Orders API to enable users to provide custom prompts describing the work they want done. This field will be the primary input to the classification and planning workflow, replacing the current dependency on GitHub issue numbers. The system will intelligently parse the user request to extract GitHub issue references if present, or use the request content directly for classification and planning.

## User Story

As a developer using the Agent Work Orders system
I want to provide a natural language description of the work I need done
So that the AI agents can understand my requirements and create an appropriate implementation plan without requiring a GitHub issue

## Problem Statement

Currently, the `CreateAgentWorkOrderRequest` API only accepts a `github_issue_number` parameter, with no way to provide a custom user request. This causes several critical issues:

1. **Empty Context**: When a work order is created, the `issue_json` passed to the classifier is empty (`{}`), causing agents to lack context
2. **GitHub Dependency**: Users must create a GitHub issue before using the system, adding unnecessary friction
3. **Limited Flexibility**: Users cannot describe ad-hoc tasks or provide additional context beyond what's in a GitHub issue
4. **Broken Classification**: The classifier receives empty input and makes arbitrary classifications without understanding the actual work needed
5. **Failed Planning**: Planners cannot create meaningful plans without understanding what the user wants

**Current Flow (Broken):**
```
API Request → {github_issue_number: "1"}
         ↓
Workflow: github_issue_json = None → defaults to "{}"
         ↓
Classifier receives: "{}" (empty)
         ↓
Planner receives: "/feature" but no context about what feature to build
```

## Solution Statement

Add a required `user_request` field to `CreateAgentWorkOrderRequest` that accepts natural language descriptions of the work to be done. The workflow will:

1. **Accept User Requests**: Users provide a clear description like "Add login authentication with JWT tokens" or "Fix the bug where users can't save their profile" or "Implement GitHub issue #42"
2. **Classify Based on Content**: The classifier receives the full user request and classifies it as feature/bug/chore based on the actual content
3. **Optionally Fetch GitHub Issues**: If the user mentions a GitHub issue (e.g., "implement issue #42"), the system fetches the issue details and merges them with the user request
4. **Provide Full Context**: All workflow steps receive the complete user request and any fetched issue data, enabling meaningful planning and implementation

**Intended Flow (Fixed):**
```
API Request → {user_request: "Add login feature with JWT authentication"}
         ↓
Classifier receives: "Add login feature with JWT authentication"
         ↓
Classifier returns: "/feature" (based on actual content)
         ↓
IF user request mentions "issue #N" or "GitHub issue N":
  → Fetch issue details from GitHub
  → Merge with user request
ELSE:
  → Use user request as-is
         ↓
Planner receives: Full context about what to build
         ↓
Planner creates: Detailed implementation plan based on user request
```

## Relevant Files

Use these files to implement the feature:

**Core Models** - Add user_request field
- `python/src/agent_work_orders/models.py`:100-107 - `CreateAgentWorkOrderRequest` needs `user_request: str` field added

**API Routes** - Pass user request to workflow
- `python/src/agent_work_orders/api/routes.py`:54-124 - `create_agent_work_order()` needs to pass `user_request` to orchestrator

**Workflow Orchestrator** - Accept and process user request
- `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`:48-56 - `execute_workflow()` signature needs `user_request` parameter
- `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`:96-103 - Classification step needs to receive `user_request` instead of empty JSON

**GitHub Client** - Add method to fetch issue details
- `python/src/agent_work_orders/github_integration/github_client.py` - Add `get_issue()` method to fetch issue by number

**Workflow Operations** - Update classification to use user request
- `python/src/agent_work_orders/workflow_engine/workflow_operations.py`:26-79 - `classify_issue()` may need parameter name updates for clarity

**Tests** - Update and add test coverage
- `python/tests/agent_work_orders/test_api.py` - Update all API tests to include `user_request` field
- `python/tests/agent_work_orders/test_models.py` - Add tests for `user_request` field validation
- `python/tests/agent_work_orders/test_github_integration.py` - Add tests for `get_issue()` method
- `python/tests/agent_work_orders/test_workflow_operations.py` - Update mocks to use `user_request` content

### New Files

No new files needed - all changes are modifications to existing files.

## Implementation Plan

### Phase 1: Foundation - Model and API Updates

Add the `user_request` field to the request model and update the API to accept it. This is backward-compatible if we keep `github_issue_number` optional.

### Phase 2: Core Implementation - Workflow Integration

Update the workflow orchestrator to receive and use the user request for classification and planning. Add logic to detect and fetch GitHub issues if mentioned.

### Phase 3: Integration - GitHub Issue Fetching

Add capability to fetch GitHub issue details when referenced in the user request, and merge that context with the user's description.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### Add user_request Field to CreateAgentWorkOrderRequest Model

- Open `python/src/agent_work_orders/models.py`
- Locate the `CreateAgentWorkOrderRequest` class (line 100)
- Add new required field after `workflow_type`:
  ```python
  user_request: str = Field(..., description="User's description of the work to be done")
  ```
- Update the docstring to explain that `user_request` is the primary input
- Make `github_issue_number` truly optional (it already is, but update docs to clarify it's only needed for reference)
- Save the file

### Add get_issue() Method to GitHubClient

- Open `python/src/agent_work_orders/github_integration/github_client.py`
- Add new method after `get_repository_info()`:
  ```python
  async def get_issue(self, repository_url: str, issue_number: str) -> dict:
      """Get GitHub issue details

      Args:
          repository_url: GitHub repository URL
          issue_number: Issue number

      Returns:
          Issue details as JSON dict

      Raises:
          GitHubOperationError: If unable to fetch issue
      """
      self._logger.info("github_issue_fetch_started", repository_url=repository_url, issue_number=issue_number)

      try:
          owner, repo = self._parse_repository_url(repository_url)
          repo_path = f"{owner}/{repo}"

          process = await asyncio.create_subprocess_exec(
              self.gh_cli_path,
              "issue",
              "view",
              issue_number,
              "--repo",
              repo_path,
              "--json",
              "number,title,body,state,url",
              stdout=asyncio.subprocess.PIPE,
              stderr=asyncio.subprocess.PIPE,
          )

          stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)

          if process.returncode != 0:
              error = stderr.decode() if stderr else "Unknown error"
              raise GitHubOperationError(f"Failed to fetch issue: {error}")

          issue_data = json.loads(stdout.decode())
          self._logger.info("github_issue_fetched", issue_number=issue_number)
          return issue_data

      except Exception as e:
          self._logger.error("github_issue_fetch_failed", error=str(e), exc_info=True)
          raise GitHubOperationError(f"Failed to fetch GitHub issue: {e}") from e
  ```
- Save the file

### Update execute_workflow() Signature

- Open `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- Locate the `execute_workflow()` method (line 48)
- Add `user_request` parameter after `sandbox_type`:
  ```python
  async def execute_workflow(
      self,
      agent_work_order_id: str,
      workflow_type: AgentWorkflowType,
      repository_url: str,
      sandbox_type: SandboxType,
      user_request: str,  # NEW: Add this parameter
      github_issue_number: str | None = None,
      github_issue_json: str | None = None,
  ) -> None:
  ```
- Update the docstring to include `user_request` parameter documentation
- Save the file

### Add Logic to Parse GitHub Issue References from User Request

- Still in `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- After line 87 (after updating status to RUNNING), add logic to detect GitHub issues:
  ```python
  # Parse GitHub issue from user request if mentioned
  import re
  issue_match = re.search(r'(?:issue|#)\s*#?(\d+)', user_request, re.IGNORECASE)
  if issue_match and not github_issue_number:
      github_issue_number = issue_match.group(1)
      bound_logger.info("github_issue_detected_in_request", issue_number=github_issue_number)

  # Fetch GitHub issue if number provided
  if github_issue_number and not github_issue_json:
      try:
          issue_data = await self.github_client.get_issue(repository_url, github_issue_number)
          github_issue_json = json.dumps(issue_data)
          bound_logger.info("github_issue_fetched", issue_number=github_issue_number)
      except Exception as e:
          bound_logger.warning("github_issue_fetch_failed", error=str(e))
          # Continue without issue data - use user_request only

  # Prepare classification input: merge user request with issue data if available
  classification_input = user_request
  if github_issue_json:
      issue_data = json.loads(github_issue_json)
      classification_input = f"User Request: {user_request}\n\nGitHub Issue Details:\nTitle: {issue_data.get('title', '')}\nBody: {issue_data.get('body', '')}"
  ```
- Add `import json` at the top of the file if not already present
- Update the classify_issue call (line 97-103) to use `classification_input`:
  ```python
  classify_result = await workflow_operations.classify_issue(
      self.agent_executor,
      self.command_loader,
      classification_input,  # Use classification_input instead of github_issue_json or "{}"
      agent_work_order_id,
      sandbox.working_dir,
  )
  ```
- Save the file

### Update API Route to Pass user_request

- Open `python/src/agent_work_orders/api/routes.py`
- Locate `create_agent_work_order()` function (line 54)
- Update the `orchestrator.execute_workflow()` call (line 101-109) to include `user_request`:
  ```python
  asyncio.create_task(
      orchestrator.execute_workflow(
          agent_work_order_id=agent_work_order_id,
          workflow_type=request.workflow_type,
          repository_url=request.repository_url,
          sandbox_type=request.sandbox_type,
          user_request=request.user_request,  # NEW: Add this line
          github_issue_number=request.github_issue_number,
      )
  )
  ```
- Save the file

### Update Model Tests for user_request Field

- Open `python/tests/agent_work_orders/test_models.py`
- Find or add test for `CreateAgentWorkOrderRequest`:
  ```python
  def test_create_agent_work_order_request_with_user_request():
      """Test CreateAgentWorkOrderRequest with user_request field"""
      request = CreateAgentWorkOrderRequest(
          repository_url="https://github.com/owner/repo",
          sandbox_type=SandboxType.GIT_BRANCH,
          workflow_type=AgentWorkflowType.PLAN,
          user_request="Add user authentication with JWT tokens",
      )

      assert request.user_request == "Add user authentication with JWT tokens"
      assert request.repository_url == "https://github.com/owner/repo"
      assert request.github_issue_number is None

  def test_create_agent_work_order_request_with_github_issue():
      """Test CreateAgentWorkOrderRequest with both user_request and issue number"""
      request = CreateAgentWorkOrderRequest(
          repository_url="https://github.com/owner/repo",
          sandbox_type=SandboxType.GIT_BRANCH,
          workflow_type=AgentWorkflowType.PLAN,
          user_request="Implement the feature described in issue #42",
          github_issue_number="42",
      )

      assert request.user_request == "Implement the feature described in issue #42"
      assert request.github_issue_number == "42"
  ```
- Save the file

### Add GitHub Client Tests for get_issue()

- Open `python/tests/agent_work_orders/test_github_integration.py`
- Add new test function:
  ```python
  @pytest.mark.asyncio
  async def test_get_issue_success():
      """Test successful GitHub issue fetch"""
      client = GitHubClient()

      # Mock subprocess
      mock_process = MagicMock()
      mock_process.returncode = 0
      issue_json = json.dumps({
          "number": 42,
          "title": "Add login feature",
          "body": "Users need to log in with email and password",
          "state": "open",
          "url": "https://github.com/owner/repo/issues/42"
      })
      mock_process.communicate = AsyncMock(return_value=(issue_json.encode(), b""))

      with patch("asyncio.create_subprocess_exec", return_value=mock_process):
          issue_data = await client.get_issue("https://github.com/owner/repo", "42")

      assert issue_data["number"] == 42
      assert issue_data["title"] == "Add login feature"
      assert issue_data["state"] == "open"

  @pytest.mark.asyncio
  async def test_get_issue_failure():
      """Test failed GitHub issue fetch"""
      client = GitHubClient()

      # Mock subprocess
      mock_process = MagicMock()
      mock_process.returncode = 1
      mock_process.communicate = AsyncMock(return_value=(b"", b"Issue not found"))

      with patch("asyncio.create_subprocess_exec", return_value=mock_process):
          with pytest.raises(GitHubOperationError, match="Failed to fetch issue"):
              await client.get_issue("https://github.com/owner/repo", "999")
  ```
- Add necessary imports at the top (json, AsyncMock if not present)
- Save the file

### Update API Tests to Include user_request

- Open `python/tests/agent_work_orders/test_api.py`
- Find all tests that create work orders and add `user_request` field
- Update `test_create_agent_work_order()`:
  ```python
  response = client.post(
      "/agent-work-orders",
      json={
          "repository_url": "https://github.com/owner/repo",
          "sandbox_type": "git_branch",
          "workflow_type": "agent_workflow_plan",
          "user_request": "Add user authentication feature",  # ADD THIS
          "github_issue_number": "42",
      },
  )
  ```
- Update `test_create_agent_work_order_without_issue()`:
  ```python
  response = client.post(
      "/agent-work-orders",
      json={
          "repository_url": "https://github.com/owner/repo",
          "sandbox_type": "git_branch",
          "workflow_type": "agent_workflow_plan",
          "user_request": "Fix the login bug where users can't sign in",  # ADD THIS
      },
  )
  ```
- Update any other test cases that create work orders
- Save the file

### Update Workflow Operations Tests

- Open `python/tests/agent_work_orders/test_workflow_operations.py`
- Update `test_classify_issue_success()` to use meaningful user request:
  ```python
  result = await workflow_operations.classify_issue(
      mock_executor,
      mock_loader,
      "Add user authentication with JWT tokens and refresh token support",  # Meaningful request
      "wo-test",
      "/tmp/working",
  )
  ```
- Update other test cases to use meaningful user requests instead of empty JSON
- Save the file

### Run Model Unit Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_models.py -v`
- Verify new `user_request` tests pass
- Fix any failures

### Run GitHub Client Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_github_integration.py -v`
- Verify `get_issue()` tests pass
- Fix any failures

### Run API Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/test_api.py -v`
- Verify all API tests pass with `user_request` field
- Fix any failures

### Run All Agent Work Orders Tests

- Execute: `cd python && uv run pytest tests/agent_work_orders/ -v`
- Target: 100% of tests pass
- Fix any failures

### Run Type Checking

- Execute: `cd python && uv run mypy src/agent_work_orders/`
- Verify no type errors
- Fix any issues

### Run Linting

- Execute: `cd python && uv run ruff check src/agent_work_orders/`
- Verify no linting issues
- Fix any issues

### Manual End-to-End Test

- Start server: `cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888 &`
- Wait: `sleep 5`
- Test with user request only:
  ```bash
  curl -X POST http://localhost:8888/agent-work-orders \
    -H "Content-Type: application/json" \
    -d '{
      "repository_url": "https://github.com/Wirasm/dylan.git",
      "sandbox_type": "git_branch",
      "workflow_type": "agent_workflow_plan",
      "user_request": "Add a new feature for user profile management with avatar upload"
    }' | jq
  ```
- Get work order ID from response
- Wait: `sleep 30`
- Check status: `curl http://localhost:8888/agent-work-orders/{WORK_ORDER_ID} | jq`
- Check steps: `curl http://localhost:8888/agent-work-orders/{WORK_ORDER_ID}/steps | jq`
- Verify:
  - Classifier received full user request (not empty JSON)
  - Classifier returned appropriate classification
  - Planner received the user request context
  - Workflow progressed normally
- Test with GitHub issue reference:
  ```bash
  curl -X POST http://localhost:8888/agent-work-orders \
    -H "Content-Type: application/json" \
    -d '{
      "repository_url": "https://github.com/Wirasm/dylan.git",
      "sandbox_type": "git_branch",
      "workflow_type": "agent_workflow_plan",
      "user_request": "Implement the feature described in GitHub issue #1"
    }' | jq
  ```
- Verify:
  - System detected issue reference
  - Issue details were fetched
  - Both user request and issue context passed to agents
- Stop server: `pkill -f "uvicorn.*8888"`

## Testing Strategy

### Unit Tests

**Model Tests:**
- Test `user_request` field accepts string values
- Test `user_request` field is required (validation fails if missing)
- Test `github_issue_number` remains optional
- Test model serialization with all fields

**GitHub Client Tests:**
- Test `get_issue()` with valid issue number
- Test `get_issue()` with invalid issue number
- Test `get_issue()` with network timeout
- Test `get_issue()` returns correct JSON structure

**Workflow Orchestrator Tests:**
- Test GitHub issue regex detection from user request
- Test fetching GitHub issue when detected
- Test fallback to user request only if issue fetch fails
- Test classification input merges user request with issue data

### Integration Tests

**Full Workflow Tests:**
- Test complete workflow with user request only (no GitHub issue)
- Test complete workflow with explicit GitHub issue number
- Test complete workflow with GitHub issue mentioned in user request
- Test workflow handles GitHub API failures gracefully

**API Integration Tests:**
- Test POST /agent-work-orders with user_request field
- Test POST /agent-work-orders validates user_request is required
- Test POST /agent-work-orders accepts both user_request and github_issue_number

### Edge Cases

**User Request Parsing:**
- User request mentions "issue #42"
- User request mentions "GitHub issue 42"
- User request mentions "issue#42" (no space)
- User request contains multiple issue references (use first one)
- User request doesn't mention any issues
- Very long user requests (>10KB)
- Empty user request (should fail validation)

**GitHub Issue Handling:**
- Issue number provided but fetch fails
- Issue exists but is closed
- Issue exists but has no body
- Issue number is invalid (non-numeric)
- Repository doesn't have issues enabled

**Backward Compatibility:**
- Existing tests must still pass (with user_request added)
- API accepts requests without github_issue_number

## Acceptance Criteria

**Core Functionality:**
- ✅ `user_request` field added to `CreateAgentWorkOrderRequest` model
- ✅ `user_request` field is required and validated
- ✅ `github_issue_number` field remains optional
- ✅ API accepts and passes `user_request` to workflow
- ✅ Workflow uses `user_request` for classification (not empty JSON)
- ✅ GitHub issue references auto-detected from user request
- ✅ `get_issue()` method fetches GitHub issue details via gh CLI
- ✅ Classification input merges user request with issue data when available

**Test Coverage:**
- ✅ All existing tests pass with zero regressions
- ✅ New model tests for `user_request` field
- ✅ New GitHub client tests for `get_issue()` method
- ✅ Updated API tests include `user_request` field
- ✅ Updated workflow tests use meaningful user requests

**Code Quality:**
- ✅ Type checking passes (mypy)
- ✅ Linting passes (ruff)
- ✅ Code follows existing patterns
- ✅ Comprehensive docstrings

**End-to-End Validation:**
- ✅ User can create work order with custom request (no GitHub issue)
- ✅ Classifier receives full user request context
- ✅ Planner receives full user request context
- ✅ Workflow progresses successfully with user request
- ✅ System detects GitHub issue references in user request
- ✅ System fetches and merges GitHub issue data when detected
- ✅ Workflow handles missing GitHub issues gracefully

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

```bash
# Unit Tests
cd python && uv run pytest tests/agent_work_orders/test_models.py -v
cd python && uv run pytest tests/agent_work_orders/test_github_integration.py -v
cd python && uv run pytest tests/agent_work_orders/test_api.py -v
cd python && uv run pytest tests/agent_work_orders/test_workflow_operations.py -v

# Full Test Suite
cd python && uv run pytest tests/agent_work_orders/ -v --tb=short
cd python && uv run pytest tests/agent_work_orders/ --cov=src/agent_work_orders --cov-report=term-missing
cd python && uv run pytest  # All backend tests

# Quality Checks
cd python && uv run mypy src/agent_work_orders/
cd python && uv run ruff check src/agent_work_orders/

# End-to-End Test
cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888 &
sleep 5
curl http://localhost:8888/health | jq

# Test 1: User request only (no GitHub issue)
WORK_ORDER=$(curl -X POST http://localhost:8888/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{"repository_url":"https://github.com/Wirasm/dylan.git","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","user_request":"Add user profile management with avatar upload functionality"}' \
  | jq -r '.agent_work_order_id')

echo "Work Order 1: $WORK_ORDER"
sleep 30

# Verify classifier received user request
curl http://localhost:8888/agent-work-orders/$WORK_ORDER/steps | jq '.steps[] | {step, success, output}'

# Test 2: User request with GitHub issue reference
WORK_ORDER2=$(curl -X POST http://localhost:8888/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{"repository_url":"https://github.com/Wirasm/dylan.git","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","user_request":"Implement the feature described in GitHub issue #1"}' \
  | jq -r '.agent_work_order_id')

echo "Work Order 2: $WORK_ORDER2"
sleep 30

# Verify issue was fetched and merged with user request
curl http://localhost:8888/agent-work-orders/$WORK_ORDER2/steps | jq '.steps[] | {step, success, output}'

# Cleanup
pkill -f "uvicorn.*8888"
```

## Notes

**Design Decisions:**
- `user_request` is required because it's the primary input to the system
- `github_issue_number` remains optional for backward compatibility and explicit issue references
- GitHub issue auto-detection uses regex to find common patterns ("issue #42", "GitHub issue 42")
- If both explicit `github_issue_number` and detected issue exist, explicit takes precedence
- If GitHub issue fetch fails, workflow continues with user request only (resilient design)
- Classification input merges user request with issue data to provide maximum context

**Why This Fixes the Problem:**
```
BEFORE:
- No way to provide custom user requests
- issue_json = "{}" (empty)
- Classifier has no context
- Planner has no context
- Workflow fails or produces irrelevant output

AFTER:
- user_request field provides clear description
- issue_json populated from user request + optional GitHub issue
- Classifier receives: "Add user authentication with JWT tokens"
- Planner receives: Full context about what to build
- Workflow succeeds with meaningful output
```

**GitHub Issue Detection Examples:**
- "Implement issue #42" → Detects issue 42
- "Fix GitHub issue 123" → Detects issue 123
- "Resolve issue#456 in the API" → Detects issue 456
- "Add login feature" → No issue detected, uses request as-is

**Future Enhancements:**
- Support multiple GitHub issue references
- Support GitHub PR references
- Add user_request to work order state for historical tracking
- Support Jira, Linear, or other issue tracker references
- Add user_request validation (min/max length, profanity filter)
- Support rich text formatting in user requests
- Add example user requests in API documentation
