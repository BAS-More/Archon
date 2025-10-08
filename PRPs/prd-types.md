# Data Models for Agent Work Order System

**Purpose:** This document defines all data models needed for the agent work order feature in plain English.

**Philosophy:** Git-first architecture - store minimal state in database, compute everything else from git.

---

## Table of Contents

1. [Core Work Order Models](#core-work-order-models)
2. [Workflow & Phase Tracking](#workflow--phase-tracking)
3. [Sandbox Models](#sandbox-models)
4. [GitHub Integration](#github-integration)
5. [Agent Execution](#agent-execution)
6. [Logging & Observability](#logging--observability)

---

## Core Work Order Models

### AgentWorkOrderStateMinimal

**What it is:** The absolute minimum state we persist in database/Supabase.

**Purpose:** Following git-first philosophy - only store identifiers, query everything else from git.

**Where stored:**
- Phase 1: In-memory Python dictionary
- Phase 2+: Supabase database

**Fields:**

| Field Name | Type | Required | Description | Example |
|------------|------|----------|-------------|---------|
| `agent_work_order_id` | string | Yes | Unique identifier for this work order | `"wo-a1b2c3d4"` |
| `repository_url` | string | Yes | GitHub repository URL | `"https://github.com/user/repo.git"` |
| `sandbox_identifier` | string | Yes | Execution environment identifier | `"git-worktree-wo-a1b2c3d4"` or `"e2b-sb-xyz789"` |
| `git_branch_name` | string | No | Git branch created for this work order | `"feat-issue-42-wo-a1b2c3d4"` |
| `agent_session_id` | string | No | Claude Code session ID (for resumption) | `"session-xyz789"` |

**Why `sandbox_identifier` is separate from `git_branch_name`:**
- `git_branch_name` = Git concept (what branch the code is on)
- `sandbox_identifier` = Execution environment ID (where the agent runs)
- Git worktree: `sandbox_identifier = "/Users/user/.worktrees/wo-abc123"` (path to worktree)
- E2B: `sandbox_identifier = "e2b-sb-xyz789"` (E2B's sandbox ID)
- Dagger: `sandbox_identifier = "dagger-container-abc123"` (container ID)

**What we DON'T store:** Current phase, commit count, files changed, PR URL, test results, sandbox state (is_active) - all computed from git or sandbox APIs.

---

### AgentWorkOrder (Full Model)

**What it is:** Complete work order model combining database state + computed fields from git/GitHub.

**Purpose:** Used for API responses and UI display.

**Fields:**

**Core Identifiers (from database):**
- `agent_work_order_id` - Unique ID
- `repository_url` - GitHub repo URL
- `sandbox_identifier` - Execution environment ID (e.g., worktree path, E2B sandbox ID)
- `git_branch_name` - Branch name (null until created)
- `agent_session_id` - Claude session ID (null until started)

**Metadata (from database):**
- `workflow_type` - Which workflow to run (plan/implement/validate/plan_implement/plan_implement_validate)
- `sandbox_type` - Execution environment (git_branch/git_worktree/e2b/dagger)
- `agent_model_type` - Claude model (sonnet/opus/haiku)
- `status` - Current status (pending/initializing/running/completed/failed/cancelled)
- `github_issue_number` - Optional issue number
- `created_at` - When work order was created
- `updated_at` - Last update timestamp
- `execution_started_at` - When execution began
- `execution_completed_at` - When execution finished
- `error_message` - Error if failed
- `error_details` - Detailed error info
- `created_by_user_id` - User who created it (Phase 2+)

**Computed Fields (from git/GitHub - NOT in database):**
- `current_phase` - Current workflow phase (planning/implementing/validating/completed) - **computed by inspecting git commits**
- `github_pull_request_url` - PR URL - **computed from GitHub API**
- `github_pull_request_number` - PR number
- `git_commit_count` - Number of commits - **computed from `git log --oneline | wc -l`**
- `git_files_changed` - Files changed - **computed from `git diff --stat`**
- `git_lines_added` - Lines added - **computed from `git diff --stat`**
- `git_lines_removed` - Lines removed - **computed from `git diff --stat`**
- `latest_git_commit_sha` - Latest commit SHA
- `latest_git_commit_message` - Latest commit message

---

### CreateAgentWorkOrderRequest

**What it is:** Request payload to create a new work order.

**Purpose:** Sent from frontend to backend to initiate work order.

**Fields:**
- `repository_url` - GitHub repo URL to work on
- `sandbox_type` - Which sandbox to use (git_branch/git_worktree/e2b/dagger)
- `workflow_type` - Which workflow to execute
- `agent_model_type` - Which Claude model to use (default: sonnet)
- `github_issue_number` - Optional issue to work on
- `initial_prompt` - Optional initial prompt to send to agent

---

### AgentWorkOrderResponse

**What it is:** Response after creating or fetching a work order.

**Purpose:** Returned by API endpoints.

**Fields:**
- `agent_work_order` - Full AgentWorkOrder object
- `logs_url` - URL to fetch execution logs

---

### ListAgentWorkOrdersRequest

**What it is:** Request to list work orders with filters.

**Purpose:** Support filtering and pagination in UI.

**Fields:**
- `status_filter` - Filter by status (array)
- `sandbox_type_filter` - Filter by sandbox type (array)
- `workflow_type_filter` - Filter by workflow type (array)
- `limit` - Results per page (default 50, max 100)
- `offset` - Pagination offset
- `sort_by` - Field to sort by (default: created_at)
- `sort_order` - asc or desc (default: desc)

---

### ListAgentWorkOrdersResponse

**What it is:** Response containing list of work orders.

**Fields:**
- `agent_work_orders` - Array of AgentWorkOrder objects
- `total_count` - Total matching work orders
- `has_more` - Whether more results available
- `offset` - Current offset
- `limit` - Current limit

---

## Workflow & Phase Tracking

### WorkflowPhaseHistoryEntry

**What it is:** Single phase execution record in workflow history.

**Purpose:** Track timing and commits for each workflow phase.

**How created:** Computed by analyzing git commits, not stored directly.

**Fields:**
- `phase_name` - Which phase (planning/implementing/validating/completed)
- `phase_started_at` - When phase began
- `phase_completed_at` - When phase finished (null if still running)
- `phase_duration_seconds` - Duration (if completed)
- `git_commits_in_phase` - Number of commits during this phase
- `git_commit_shas` - Array of commit SHAs from this phase

**Example:** "Planning phase started at 10:00:00, completed at 10:02:30, duration 150 seconds, 1 commit (abc123)"

---

### GitProgressSnapshot

**What it is:** Point-in-time snapshot of work order progress via git inspection.

**Purpose:** Polled by frontend every 3 seconds to show progress without streaming.

**How created:** Backend queries git to compute current state.

**Fields:**
- `agent_work_order_id` - Work order ID
- `current_phase` - Current workflow phase (computed from commits)
- `git_commit_count` - Total commits on branch
- `git_files_changed` - Total files changed
- `git_lines_added` - Total lines added
- `git_lines_removed` - Total lines removed
- `latest_commit_message` - Most recent commit message
- `latest_commit_sha` - Most recent commit SHA
- `latest_commit_timestamp` - When latest commit was made
- `snapshot_timestamp` - When this snapshot was taken
- `phase_history` - Array of WorkflowPhaseHistoryEntry objects

**Example UI usage:** Frontend polls `/api/agent-work-orders/{id}/git-progress` every 3 seconds to update progress bar.

---

## Sandbox Models

### SandboxConfiguration

**What it is:** Configuration for creating a sandbox instance.

**Purpose:** Passed to sandbox factory to create appropriate sandbox type.

**Fields:**

**Common (all sandbox types):**
- `sandbox_type` - Type of sandbox (git_branch/git_worktree/e2b/dagger)
- `sandbox_identifier` - Unique ID (usually work order ID)
- `repository_url` - Repo to clone
- `git_branch_name` - Branch to create/use
- `environment_variables` - Env vars to set in sandbox (dict)

**E2B specific (Phase 2+):**
- `e2b_template_id` - E2B template ID
- `e2b_timeout_seconds` - Sandbox timeout

**Dagger specific (Phase 2+):**
- `dagger_image_name` - Docker image name
- `dagger_container_config` - Additional Dagger config (dict)

---

### SandboxState

**What it is:** Current state of an active sandbox.

**Purpose:** Query sandbox status, returned by `sandbox.get_current_state()`.

**Fields:**
- `sandbox_identifier` - Sandbox ID
- `sandbox_type` - Type of sandbox
- `is_active` - Whether sandbox is currently active
- `git_branch_name` - Current git branch
- `working_directory` - Current working directory in sandbox
- `sandbox_created_at` - When sandbox was created
- `last_activity_at` - Last activity timestamp
- `sandbox_metadata` - Sandbox-specific state (dict) - e.g., E2B sandbox ID, Docker container ID

---

### CommandExecutionResult

**What it is:** Result of executing a command in a sandbox.

**Purpose:** Returned by `sandbox.execute_command(command)`.

**Fields:**
- `command` - Command that was executed
- `exit_code` - Command exit code (0 = success)
- `stdout_output` - Standard output
- `stderr_output` - Standard error output
- `execution_success` - Whether command succeeded (exit_code == 0)
- `execution_duration_seconds` - How long command took
- `execution_timestamp` - When command was executed

---

## GitHub Integration

### GitHubRepository

**What it is:** GitHub repository information and access status.

**Purpose:** Store repository metadata after verification.

**Fields:**
- `repository_owner` - Owner username (e.g., "user")
- `repository_name` - Repo name (e.g., "repo")
- `repository_url` - Full URL (e.g., "https://github.com/user/repo.git")
- `repository_clone_url` - Git clone URL
- `default_branch` - Default branch name (usually "main")
- `is_accessible` - Whether we verified access
- `is_private` - Whether repo is private
- `access_verified_at` - When access was last verified
- `repository_description` - Repo description

---

### GitHubRepositoryVerificationRequest

**What it is:** Request to verify repository access.

**Purpose:** Frontend asks backend to verify it can access a repo.

**Fields:**
- `repository_url` - Repo URL to verify

---

### GitHubRepositoryVerificationResponse

**What it is:** Response from repository verification.

**Purpose:** Tell frontend whether repo is accessible.

**Fields:**
- `repository` - GitHubRepository object with details
- `verification_success` - Whether verification succeeded
- `error_message` - Error message if failed
- `error_details` - Detailed error info (dict)

---

### GitHubPullRequest

**What it is:** Pull request model.

**Purpose:** Represent a created PR.

**Fields:**
- `pull_request_number` - PR number
- `pull_request_title` - PR title
- `pull_request_body` - PR description
- `pull_request_url` - PR URL
- `pull_request_state` - State (open/closed/merged)
- `pull_request_head_branch` - Source branch
- `pull_request_base_branch` - Target branch
- `pull_request_author` - GitHub user who created PR
- `pull_request_created_at` - When created
- `pull_request_updated_at` - When last updated
- `pull_request_merged_at` - When merged (if applicable)
- `pull_request_is_draft` - Whether it's a draft PR

---

### CreateGitHubPullRequestRequest

**What it is:** Request to create a pull request.

**Purpose:** Backend creates PR after work order completes.

**Fields:**
- `repository_owner` - Repo owner
- `repository_name` - Repo name
- `pull_request_title` - PR title
- `pull_request_body` - PR description
- `pull_request_head_branch` - Source branch (work order branch)
- `pull_request_base_branch` - Target branch (usually "main")
- `pull_request_is_draft` - Create as draft (default: false)

---

### GitHubIssue

**What it is:** GitHub issue model.

**Purpose:** Link work orders to GitHub issues.

**Fields:**
- `issue_number` - Issue number
- `issue_title` - Issue title
- `issue_body` - Issue description
- `issue_state` - State (open/closed)
- `issue_author` - User who created issue
- `issue_assignees` - Assigned users (array)
- `issue_labels` - Labels (array)
- `issue_created_at` - When created
- `issue_updated_at` - When last updated
- `issue_closed_at` - When closed
- `issue_url` - Issue URL

---

## Agent Execution

### AgentCommandDefinition

**What it is:** Represents a Claude Code slash command loaded from `.claude/commands/*.md`.

**Purpose:** Catalog available commands for workflows.

**Fields:**
- `command_name` - Command name (e.g., "/agent_workflow_plan")
- `command_file_path` - Path to .md file
- `command_description` - Description from file
- `command_arguments` - Expected arguments (array)
- `command_content` - Full file content

**How loaded:** Scan `.claude/commands/` directory at startup, parse markdown files.

---

### AgentCommandBuildRequest

**What it is:** Request to build a Claude Code CLI command string.

**Purpose:** Convert high-level command to actual CLI string.

**Fields:**
- `command_name` - Command to execute (e.g., "/plan")
- `command_arguments` - Arguments (array)
- `agent_model_type` - Claude model (sonnet/opus/haiku)
- `output_format` - CLI output format (text/json/stream-json)
- `dangerously_skip_permissions` - Skip permission prompts (required for automation)
- `working_directory` - Directory to run in
- `timeout_seconds` - Command timeout (default 300, max 3600)

---

### AgentCommandBuildResult

**What it is:** Built CLI command ready to execute.

**Purpose:** Actual command string to run via subprocess.

**Fields:**
- `cli_command_string` - Complete CLI command (e.g., `"claude -p '/plan Issue #42' --model sonnet --output-format stream-json"`)
- `working_directory` - Directory to run in
- `timeout_seconds` - Timeout value

---

### AgentCommandExecutionRequest

**What it is:** High-level request to execute an agent command.

**Purpose:** Frontend or orchestrator requests command execution.

**Fields:**
- `agent_work_order_id` - Work order this is for
- `command_name` - Command to execute
- `command_arguments` - Arguments (array)
- `agent_model_type` - Model to use
- `working_directory` - Execution directory

---

### AgentCommandExecutionResult

**What it is:** Result of executing a Claude Code command.

**Purpose:** Capture stdout/stderr, parse session ID, track timing.

**Fields:**

**Execution metadata:**
- `command_name` - Command executed
- `command_arguments` - Arguments used
- `execution_success` - Whether succeeded
- `exit_code` - Exit code
- `execution_duration_seconds` - How long it took
- `execution_started_at` - Start time
- `execution_completed_at` - End time
- `agent_work_order_id` - Work order ID

**Output:**
- `stdout_output` - Standard output (may be JSONL)
- `stderr_output` - Standard error
- `agent_session_id` - Claude session ID (parsed from output)

**Parsed results (from JSONL output):**
- `parsed_result_text` - Result text extracted from JSONL
- `parsed_result_is_error` - Whether result indicates error
- `parsed_result_total_cost_usd` - Total cost
- `parsed_result_duration_ms` - Duration from result message

**Example JSONL parsing:** Last line of stdout contains result message with session_id, cost, duration.

---

### SendAgentPromptRequest

**What it is:** Request to send interactive prompt to running agent.

**Purpose:** Allow user to interact with agent mid-execution.

**Fields:**
- `agent_work_order_id` - Active work order
- `prompt_text` - Prompt to send (e.g., "Now implement the auth module")
- `continue_session` - Continue existing session vs start new (default: true)

---

### SendAgentPromptResponse

**What it is:** Response after sending prompt.

**Purpose:** Confirm prompt was accepted.

**Fields:**
- `agent_work_order_id` - Work order ID
- `prompt_accepted` - Whether prompt was accepted and queued
- `execution_started` - Whether execution has started
- `message` - Status message
- `error_message` - Error if rejected

---

## Logging & Observability

### AgentExecutionLogEntry

**What it is:** Single structured log entry from work order execution.

**Purpose:** Observability - track everything that happens during execution.

**Fields:**
- `log_entry_id` - Unique log ID
- `agent_work_order_id` - Work order this belongs to
- `log_timestamp` - When log was created
- `log_level` - Level (debug/info/warning/error/critical)
- `event_name` - Structured event name (e.g., "agent_command_started", "git_commit_created")
- `log_message` - Human-readable message
- `log_context` - Additional context data (dict)

**Storage:**
- Phase 1: Console output (pretty-print in dev)
- Phase 2+: JSONL files + Supabase table

**Example log events:**
```
event_name: "agent_work_order_created"
event_name: "git_branch_created"
event_name: "agent_command_started"
event_name: "agent_command_completed"
event_name: "workflow_phase_started"
event_name: "workflow_phase_completed"
event_name: "git_commit_created"
event_name: "github_pull_request_created"
```

---

### ListAgentExecutionLogsRequest

**What it is:** Request to fetch execution logs.

**Purpose:** UI can display logs for debugging.

**Fields:**
- `agent_work_order_id` - Work order to get logs for
- `log_level_filter` - Filter by levels (array)
- `event_name_filter` - Filter by event names (array)
- `limit` - Results per page (default 100, max 1000)
- `offset` - Pagination offset

---

### ListAgentExecutionLogsResponse

**What it is:** Response containing log entries.

**Fields:**
- `agent_work_order_id` - Work order ID
- `log_entries` - Array of AgentExecutionLogEntry objects
- `total_count` - Total log entries
- `has_more` - Whether more available

---

## Enums (Type Definitions)

### AgentWorkOrderStatus

**What it is:** Possible work order statuses.

**Values:**
- `pending` - Created, waiting to start
- `initializing` - Setting up sandbox
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Execution failed
- `cancelled` - User cancelled (Phase 2+)
- `paused` - Paused by user (Phase 3+)

---

### AgentWorkflowType

**What it is:** Supported workflow types.

**Values:**
- `agent_workflow_plan` - Planning only
- `agent_workflow_implement` - Implementation only
- `agent_workflow_validate` - Validation/testing only
- `agent_workflow_plan_implement` - Plan + Implement
- `agent_workflow_plan_implement_validate` - Full workflow
- `agent_workflow_custom` - User-defined (Phase 3+)

---

### AgentWorkflowPhase

**What it is:** Workflow execution phases (computed from git, not stored).

**Values:**
- `initializing` - Setting up environment
- `planning` - Creating implementation plan
- `implementing` - Writing code
- `validating` - Running tests/validation
- `completed` - All phases done

**How detected:** By analyzing commit messages in git log.

---

### SandboxType

**What it is:** Available sandbox environments.

**Values:**
- `git_branch` - Isolated git branch (Phase 1)
- `git_worktree` - Git worktree (Phase 1) - better for parallel work orders
- `e2b` - E2B cloud sandbox (Phase 2+) - primary cloud target
- `dagger` - Dagger container (Phase 2+) - primary container target
- `local_docker` - Local Docker (Phase 3+)

---

### AgentModelType

**What it is:** Claude model options.

**Values:**
- `sonnet` - Claude 3.5 Sonnet (balanced, default)
- `opus` - Claude 3 Opus (highest quality)
- `haiku` - Claude 3.5 Haiku (fastest)

---

## Summary: What Gets Stored vs Computed

### Stored in Database (Minimal State)

**5 core fields:**
1. `agent_work_order_id` - Unique ID
2. `repository_url` - Repo URL
3. `sandbox_identifier` - Execution environment ID (worktree path, E2B sandbox ID, etc.)
4. `git_branch_name` - Branch name
5. `agent_session_id` - Claude session

**Metadata (for queries/filters):**
- `workflow_type`, `sandbox_type`, `agent_model_type`
- `status`, `github_issue_number`
- `created_at`, `updated_at`, `execution_started_at`, `execution_completed_at`
- `error_message`, `error_details`
- `created_by_user_id` (Phase 2+)

### Computed from Git/Sandbox APIs (NOT in database)

**Everything else:**
- `current_phase` → Analyze git commits
- `git_commit_count` → `git log --oneline | wc -l`
- `git_files_changed` → `git diff --stat`
- `git_lines_added/removed` → `git diff --stat`
- `latest_commit_sha/message` → `git log -1`
- `phase_history` → Analyze commit timestamps and messages
- `github_pull_request_url` → Query GitHub API
- `sandbox_state` (is_active, etc.) → Query sandbox API or check filesystem
- Test results → Read committed test_results.json file

**This is the key insight:** Git is our database for work progress, sandbox APIs tell us execution state. We only store identifiers needed to find the right sandbox and git branch.

---

**End of Data Models Document**
