# Product Requirements Document: Agent Work Order System

**Version:** 1.0
**Date:** 2025-10-08
**Status:** Draft
**Author:** AI Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Core Principles](#core-principles)
4. [User Workflow](#user-workflow)
5. [System Architecture](#system-architecture)
6. [Data Models](#data-models)
7. [API Specification](#api-specification)
8. [Module Specifications](#module-specifications)
9. [Logging Strategy](#logging-strategy)
10. [Implementation Phases](#implementation-phases)
11. [Success Metrics](#success-metrics)
12. [Appendix](#appendix)

---

## Overview

### Problem Statement

Development teams need an automated system to execute AI agent workflows against GitHub repositories. Current manual processes are slow, error-prone, and don't provide clear visibility into agent execution progress.

### Solution Statement

Build a **modular, git-first agent work order system** that:

- Accepts work order requests via HTTP API
- Executes AI agents in isolated environments (git branches initially, pluggable sandboxes later)
- Tracks all changes via git commits
- Integrates with GitHub for PR creation and issue tracking
- Provides real-time progress visibility via polling
- Uses structured logging for complete observability

### Inspiration

Based on the proven ADW (AI Developer Workflow) pattern, which demonstrates:

- Git as single source of truth ✅
- Minimal state (5 fields) ✅
- CLI-based execution (stateless) ✅
- Composable workflows ✅

---

## Goals & Non-Goals

### Goals (MVP - Phase 1)

✅ **Must Have:**

- Accept work order requests via HTTP POST
- Execute agent workflows in git branch isolation
- Commit all agent changes to git
- Create GitHub pull requests automatically
- Provide work order status via HTTP GET (polling)
- Structured logging with correlation IDs
- Modular architecture for easy extension

✅ **Should Have:**

- Support 3 predefined workflows: `agent_workflow_plan`, `agent_workflow_implement`, `agent_workflow_validate`
- GitHub repository connection/verification UI
- Sandbox type selection (git branch, worktree initially) Worktree for multiple parallel work orders
- Interactive agent prompt interface
- GitHub issue integration
- Error handling and retry logic

### Non-Goals (MVP - Phase 1)

❌ **Will Not Include:**

- WebSocket real-time streaming (just phase-level progress updates)
- Custom workflow definitions (user-created)
- Advanced sandbox environments (E2B, Dagger - placeholders only)
- Multi-user authentication (future, will be part of entire app not just this feature)
- Work order cancellation/pause
- Character-by-character log streaming (will likely never support this)
- Kubernetes deployment

### Future Goals (Phase 2+)

🔮 **Planned for Later:**

- Supabase database integration (already set up in project)
- Pluggable sandbox system (worktrees → E2B → Dagger)
- Custom workflow definitions
- Work order pause/resume/cancel
- Multi-repository support
- Webhook triggers

---

## Core Principles

### 1. **Git-First Philosophy**

**Git is the single source of truth.**

- Each work order gets a dedicated branch -> Worktree for multiple parallel work orders
- All agent changes committed to git
- Test results committed as files
- Branch name contains work order ID
- Git history = audit trail

### 2. **Minimal State**

**Store only identifiers, query everything else from git.**

```python
# Store ONLY this (5 core fields)
agent_work_order_state = {
    "agent_work_order_id": "wo-abc12345",
    "repository_url": "https://github.com/user/repo.git",
    "sandbox_identifier": "git-worktree-wo-abc12345",  # Execution environment ID
    "git_branch_name": "feat-issue-42-wo-abc12345",
    "agent_session_id": "session-xyz789"  # Optional, for resumption
}

# Query everything else from git:
# - What's been done? → git log
# - What changed? → git diff
# - Current status? → git status
# - Test results? → cat test_results.json (committed)
# - Sandbox state → Query sandbox API (e.g., check if worktree exists, or E2B API)
```

### 3. **Modularity**

**Each concern gets its own module with clear boundaries.**

```
agent_work_orders/
├── agent_executor/        # Agent CLI execution
├── sandbox_manager/       # Sandbox abstraction (git branches, future: e2b, dagger)
├── github_integration/    # GitHub API operations
├── workflow_engine/       # Workflow orchestration
├── command_loader/        # Load .claude/commands/*.md
└── state_manager/         # Work order state persistence
```

### 4. **Structured Logging**

**Every operation logged with context for debugging.**

```python
import structlog

logger = structlog.get_logger()

logger.info(
    "agent_work_order_created",
    agent_work_order_id="wo-abc123",
    sandbox_identifier="git-worktree-wo-abc123",
    repository_url="https://github.com/user/repo",
    workflow_type="agent_workflow_plan",
    github_issue_number="42"
)

logger.info(
    "sandbox_created",
    agent_work_order_id="wo-abc123",
    sandbox_identifier="git-worktree-wo-abc123",
    sandbox_type="git_worktree",
    git_branch_name="feat-issue-42-wo-abc123"
)
```

### 5. **Pluggable Sandboxes**

**Sandbox abstraction from day one. E2B and Dagger are primary targets for actual sandbox implementation.**

```python
class AgentSandbox(Protocol):
    def create(self) -> str: ...
    def execute_command(self, command: str) -> CommandResult: ...
    def cleanup(self) -> None: ...

# Phase 1: Git branches
class GitBranchSandbox(AgentSandbox): ...

# Phase 1: Git worktrees
class GitWorktreeSandbox(AgentSandbox): ...

# Phase 2+: E2B (primary cloud sandbox)
class E2BSandbox(AgentSandbox): ...

# Phase 2+: Dagger (primary container sandbox)
class DaggerSandbox(AgentSandbox): ...
```

---

## User Workflow

### Step-by-Step User Experience

**1. Connect GitHub Repository**

User enters a GitHub repository URL and verifies connection:

```
┌─────────────────────────────────────┐
│  Connect GitHub Repository          │
├─────────────────────────────────────┤
│                                     │
│  Repository URL:                    │
│  ┌─────────────────────────────┐   │
│  │ https://github.com/user/repo│   │
│  └─────────────────────────────┘   │
│                                     │
│  [Connect & Verify Repository]     │
│                                     │
└─────────────────────────────────────┘
```

**Result:** System validates repository access, displays repository info.

---

**2. Select Sandbox Type**

User chooses execution environment:

```
┌─────────────────────────────────────┐
│  Select Sandbox Environment         │
├─────────────────────────────────────┤
│                                     │
│  ○ Git Branch (Recommended)         │
│     Simple, fast, runs in branch    │
│                                     │
│  ○ Git Worktree                     │
│     Isolated, parallel-safe         │
│                                     │
│  ○ E2B Sandbox (Coming Soon)        │
│     Cloud-based, full isolation     │
│                                     │
│  ○ Dagger Container (Coming Soon)   │
│     Docker-based, reproducible      │
│                                     │
└─────────────────────────────────────┘
```

**Phase 1:** Only Git Branch and Git Worktree available.
**Phase 2+:** E2B and Dagger become active options (when this is available, the sandbox is created and the agent is started, branch and worktree are created in the workflow by the agent).

---

**3. Start Agent Execution**

System "spins" up sandbox and presents prompt interface (branch and/or worktree is not yet crated, its created by the agent and the workflows):

```
┌─────────────────────────────────────┐
│  Agent Work Order: wo-abc12345      │
├─────────────────────────────────────┤
│  Repository: user/repo              │
│  Sandbox: Git Branch                │
│  Branch: (TBD)           │
│  Status: ● Running                  │
├─────────────────────────────────────┤
│                                     │
│  Prompt Agent:                      │
│  ┌─────────────────────────────┐   │
│  │ /plan Issue #42             │   │
│  │                             │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Execute]                          │
│                                     │
└─────────────────────────────────────┘
```

**User can:**

- Enter prompts/commands for the agent
- Execute workflows
- Executed workflow determines the workflow of the order, creates and names branch etc
- Monitor progress

---

**4. Track Execution Progress**

System polls git to show phase-level progress:

```
┌─────────────────────────────────────┐
│  Execution Progress                 │
├─────────────────────────────────────┤
│                                     │
│  ✅ Planning Phase Complete         │
│     - Created plan.md               │
│     - Committed to branch           │
│                                     │
│  🔄 Implementation Phase Running    │
│     - Executing /implement          │
│     - Changes detected in git       │
│                                     │
│  ⏳ Testing Phase Pending           │
│                                     │
├─────────────────────────────────────┤
│  Git Activity:                      │
│  • 3 commits                        │
│  • 12 files changed                 │
│  • 245 lines added                  │
│                                     │
│  [View Branch] [View PR]            │
│                                     │
└─────────────────────────────────────┘
```

**Progress tracking via git inspection:**

- No character-by-character streaming
- Phase-level updates (planning → implementing → testing)
- Git stats (commits, files changed, lines)
- Links to branch and PR

---

**5. View Results**

When complete, user sees summary and links:

```
┌─────────────────────────────────────┐
│  Work Order Complete ✅              │
├─────────────────────────────────────┤
│                                     │
│  All phases completed successfully  │
│                                     │
│  📋 Plan: specs/plan.md             │
│  💻 Implementation: 12 files        │
│  ✅ Tests: All passing              │
│                                     │
│  🔗 Pull Request: #123              │
│  🌿 Branch: feat-wo-abc12345        │
│                                     │
│  [View PR on GitHub]                │
│  [Create New Work Order]            │
│                                     │
└─────────────────────────────────────┘
```

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐    │
│  │ Repository   │  │ Sandbox      │  │ Agent Prompt   │    │
│  │ Connector    │  │ Selector     │  │ Interface      │    │
│  └──────────────┘  └──────────────┘  └────────────────┘    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐    │
│  │ Progress     │  │ Work Order   │  │ Work Order     │    │
│  │ Tracker      │  │ List         │  │ Detail View    │    │
│  └──────────────┘  └──────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP (Polling every 3s)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           API Layer (REST Endpoints)                  │  │
│  │  POST /api/agent-work-orders                         │  │
│  │  GET  /api/agent-work-orders/{id}                    │  │
│  │  GET  /api/agent-work-orders/{id}/logs               │  │
│  │  POST /api/github/verify-repository                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Workflow Engine (Orchestration)               │  │
│  │  - Execute workflows asynchronously                   │  │
│  │  - Update work order state                            │  │
│  │  - Track git progress                                 │  │
│  │  - Handle errors and retries                          │  │
│  └──────────────────────────────────────────────────────┘  │
│         │              │              │                      │
│         ▼              ▼              ▼                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐     │
│  │ Agent    │  │ Sandbox  │  │ GitHub Integration   │     │
│  │ Executor │  │ Manager  │  │ (gh CLI wrapper)     │     │
│  └──────────┘  └──────────┘  └──────────────────────┘     │
│         │              │              │                      │
│         ▼              ▼              ▼                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐     │
│  │ Command  │  │ State    │  │ Structured Logging   │     │
│  │ Loader   │  │ Manager  │  │ (structlog)          │     │
│  └──────────┘  └──────────┘  └──────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Git Repository      │
                │   (Branch = Sandbox)  │
                └───────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   GitHub (PRs/Issues) │
                └───────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Supabase (Phase 2)  │
                │   (Work Order State)  │
                └───────────────────────┘
```

### Directory Structure (CONECPTUAL - IMPORTANT- MUST FIT THE ARCHITECTURE OF THE PROJECT)

```
agent-work-order-system/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── main.py                      # FastAPI app
│   │   │   ├── agent_work_order_routes.py   # Work order endpoints
│   │   │   ├── github_routes.py             # Repository verification
│   │   │   └── dependencies.py              # Shared dependencies
│   │   │
│   │   ├── agent_executor/
│   │   │   ├── __init__.py
│   │   │   ├── agent_cli_executor.py        # Execute claude CLI
│   │   │   ├── agent_command_builder.py     # Build CLI commands
│   │   │   └── agent_response_parser.py     # Parse JSONL output
│   │   │
│   │   ├── sandbox_manager/
│   │   │   ├── __init__.py
│   │   │   ├── sandbox_protocol.py          # Abstract interface
│   │   │   ├── git_branch_sandbox.py        # Phase 1: Git branches
│   │   │   ├── git_worktree_sandbox.py      # Phase 1: Git worktrees
│   │   │   ├── e2b_sandbox.py               # Phase 2+: E2B (primary cloud)
│   │   │   ├── dagger_sandbox.py            # Phase 2+: Dagger (primary container)
│   │   │   └── sandbox_factory.py           # Create sandbox instances
│   │   │
│   │   ├── github_integration/
│   │   │   ├── __init__.py
│   │   │   ├── github_repository_client.py  # Repo operations
│   │   │   ├── github_pull_request_client.py # PR operations
│   │   │   ├── github_issue_client.py       # Issue operations
│   │   │   └── github_models.py             # GitHub data types
│   │   │
│   │   ├── workflow_engine/
│   │   │   ├── __init__.py
│   │   │   ├── workflow_orchestrator.py     # Execute workflows
│   │   │   ├── workflow_phase_tracker.py    # Track phase progress via git
│   │   │   ├── workflow_definitions.py      # Workflow types
│   │   │   └── workflow_executor.py         # Run workflow steps
│   │   │
│   │   ├── command_loader/
│   │   │   ├── __init__.py
│   │   │   ├── claude_command_loader.py     # Load .claude/commands/*.md
│   │   │   ├── command_validator.py         # Validate commands
│   │   │   └── command_models.py            # Command data types
│   │   │
│   │   ├── state_manager/
│   │   │   ├── __init__.py
│   │   │   ├── work_order_state_repository.py  # CRUD operations
│   │   │   ├── in_memory_store.py           # Phase 1: In-memory
│   │   │   ├── supabase_client.py           # Phase 2: Supabase
│   │   │   └── models.py                    # Pydantic models
│   │   │
│   │   ├── logging_config/
│   │   │   ├── __init__.py
│   │   │   └── structured_logger.py         # Structlog setup
│   │   │
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── id_generator.py              # Generate work order IDs
│   │       └── git_operations.py            # Git helpers
│   │
│   ├── tests/
│   │   ├── test_agent_executor/
│   │   ├── test_sandbox_manager/
│   │   ├── test_github_integration/
│   │   └── test_workflow_engine/
│   │
│   ├── pyproject.toml
│   ├── uv.lock
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── agent_work_order/
│   │   │   │   ├── RepositoryConnector.tsx
│   │   │   │   ├── SandboxSelector.tsx
│   │   │   │   ├── AgentPromptInterface.tsx
│   │   │   │   ├── ProgressTracker.tsx
│   │   │   │   ├── AgentWorkOrderList.tsx
│   │   │   │   ├── AgentWorkOrderDetailView.tsx
│   │   │   │   └── AgentWorkOrderStatusBadge.tsx
│   │   │   │
│   │   │   └── ui/                          # Reusable UI components
│   │   │
│   │   ├── hooks/
│   │   │   ├── useRepositoryVerification.ts
│   │   │   ├── useAgentWorkOrderPolling.ts
│   │   │   ├── useAgentWorkOrderCreation.ts
│   │   │   ├── useGitProgressTracking.ts
│   │   │   └── useAgentWorkOrderList.ts
│   │   │
│   │   ├── api/
│   │   │   ├── agent_work_order_client.ts
│   │   │   ├── github_client.ts
│   │   │   └── types.ts
│   │   │
│   │   └── lib/
│   │       └── utils.ts
│   │
│   ├── package.json
│   └── README.md
│
├── .claude/
│   ├── commands/
│   │   ├── agent_workflow_plan.md
│   │   ├── agent_workflow_build.md
│   │   ├── agent_workflow_test.md
│   │   └── ...
│   │
│   └── settings.json
│
├── docs/
│   ├── PRD.md                              # This file
│   ├── ARCHITECTURE.md
│   └── API.md
│
└── README.md
```

---

## Data Models

### 1. AgentWorkOrder (Core Model)

**Pydantic Model:**

```python
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class AgentWorkOrderStatus(str, Enum):
    """Work order execution status."""
    PENDING = "pending"                    # Created, not started
    RUNNING = "running"                    # Currently executing
    COMPLETED = "completed"                # Finished successfully
    FAILED = "failed"                      # Execution failed
    CANCELLED = "cancelled"                # User cancelled (future)


class AgentWorkflowType(str, Enum):
    """Supported workflow types."""
    PLAN = "agent_workflow_plan"           # Planning only
    BUILD = "agent_workflow_build"         # Implementation only
    TEST = "agent_workflow_test"           # Testing only
    PLAN_BUILD = "agent_workflow_plan_build"  # Plan + Build
    PLAN_BUILD_TEST = "agent_workflow_plan_build_test"  # Full workflow


class SandboxType(str, Enum):
    """Available sandbox types."""
    GIT_BRANCH = "git_branch"              # Phase 1: Git branches
    GIT_WORKTREE = "git_worktree"          # Phase 1: Git worktrees
    E2B = "e2b"                            # Phase 2+: E2B cloud sandbox
    DAGGER = "dagger"                      # Phase 2+: Dagger containers


class AgentWorkflowPhase(str, Enum):
    """Workflow execution phases for progress tracking."""
    PLANNING = "planning"
    IMPLEMENTING = "implementing"
    TESTING = "testing"
    COMPLETED = "completed"


class AgentWorkOrderState(BaseModel):
    """
    Minimal persistent state for agent work orders.

    Stored in memory (Phase 1) or Supabase (Phase 2+).
    Git is queried for everything else.
    """
    agent_work_order_id: str = Field(
        ...,
        description="Unique work order identifier (e.g., 'wo-abc12345')"
    )
    repository_url: str = Field(
        ...,
        description="GitHub repository URL"
    )
    git_branch_name: Optional[str] = Field(
        None,
        description="Git branch name (set after creation)"
    )
    agent_session_id: Optional[str] = Field(
        None,
        description="Claude session ID for resumption"
    )


class AgentWorkOrder(BaseModel):
    """
    Complete work order model with computed fields.

    Combines database state with git-derived information.
    """
    # Core identifiers (from database)
    agent_work_order_id: str
    repository_url: str
    git_branch_name: Optional[str] = None
    agent_session_id: Optional[str] = None

    # Metadata (from database)
    workflow_type: AgentWorkflowType
    sandbox_type: SandboxType
    github_issue_number: Optional[str] = None
    status: AgentWorkOrderStatus = AgentWorkOrderStatus.PENDING
    current_phase: Optional[AgentWorkflowPhase] = None
    created_at: datetime
    updated_at: datetime

    # Computed fields (from git/GitHub)
    github_pull_request_url: Optional[str] = None
    git_commit_count: int = 0
    git_files_changed: int = 0
    git_lines_added: int = 0
    git_lines_removed: int = 0
    error_message: Optional[str] = None

    # Execution details
    execution_started_at: Optional[datetime] = None
    execution_completed_at: Optional[datetime] = None


class CreateAgentWorkOrderRequest(BaseModel):
    """Request to create a new work order."""
    repository_url: str = Field(
        ...,
        description="GitHub repository URL",
        example="https://github.com/user/repo.git"
    )
    sandbox_type: SandboxType = Field(
        ...,
        description="Sandbox type to use for execution"
    )
    workflow_type: AgentWorkflowType = Field(
        ...,
        description="Workflow type to execute"
    )
    github_issue_number: Optional[str] = Field(
        None,
        description="GitHub issue number to work on",
        example="42"
    )
    initial_prompt: Optional[str] = Field(
        None,
        description="Initial prompt to send to agent"
    )


class AgentPromptRequest(BaseModel):
    """Request to send a prompt to an active agent."""
    agent_work_order_id: str = Field(
        ...,
        description="Work order ID"
    )
    prompt_text: str = Field(
        ...,
        description="Prompt to send to the agent"
    )


class AgentWorkOrderResponse(BaseModel):
    """Response containing work order details."""
    agent_work_order: AgentWorkOrder
    logs_url: str = Field(
        ...,
        description="URL to fetch execution logs"
    )


class GitProgressSnapshot(BaseModel):
    """Snapshot of git progress for a work order."""
    agent_work_order_id: str
    current_phase: AgentWorkflowPhase
    git_commit_count: int
    git_files_changed: int
    git_lines_added: int
    git_lines_removed: int
    latest_commit_message: Optional[str] = None
    latest_commit_sha: Optional[str] = None
    snapshot_timestamp: datetime
```

### 2. GitHub Models

```python
class GitHubRepository(BaseModel):
    """GitHub repository information."""
    repository_owner: str
    repository_name: str
    repository_url: str
    default_branch: str = "main"
    is_accessible: bool = False
    access_verified_at: Optional[datetime] = None


class GitHubRepositoryVerificationRequest(BaseModel):
    """Request to verify GitHub repository access."""
    repository_url: str = Field(
        ...,
        description="GitHub repository URL to verify"
    )


class GitHubRepositoryVerificationResponse(BaseModel):
    """Response from repository verification."""
    repository: GitHubRepository
    verification_success: bool
    error_message: Optional[str] = None


class GitHubPullRequest(BaseModel):
    """GitHub pull request details."""
    pull_request_number: int
    pull_request_title: str
    pull_request_url: str
    head_branch: str
    base_branch: str
    state: str  # open, closed, merged


class GitHubIssue(BaseModel):
    """GitHub issue details."""
    issue_number: int
    issue_title: str
    issue_body: str
    issue_state: str
    issue_url: str
```

---

## API Specification

### Base URL

```
Fit in current project
```

### Endpoints

#### 1. Verify GitHub Repository

**POST** `/github/verify-repository`

Verifies access to a GitHub repository.

**Request:**

```json
{
  "repository_url": "https://github.com/user/repo.git"
}
```

**Response:** `200 OK`

```json
{
  "repository": {
    "repository_owner": "user",
    "repository_name": "repo",
    "repository_url": "https://github.com/user/repo.git",
    "default_branch": "main",
    "is_accessible": true,
    "access_verified_at": "2025-10-08T10:00:00Z"
  },
  "verification_success": true,
  "error_message": null
}
```

#### 2. Create Agent Work Order

**POST** `/agent-work-orders`

Creates a new agent work order and starts execution asynchronously.

**Request:**

```json
{
  "repository_url": "https://github.com/user/repo.git",
  "sandbox_type": "git_branch",
  "workflow_type": "agent_workflow_plan_build_test",
  "github_issue_number": "42",
  "initial_prompt": "I want to build a new feature x, here is the desciption of the feature"
}
```

**Response:** `201 Created`

```json
{
  "agent_work_order": {
    "agent_work_order_id": "wo-abc12345",
    "repository_url": "https://github.com/user/repo.git",
    "git_branch_name": "feat-wo-abc12345",
    "sandbox_type": "git_branch",
    "workflow_type": "agent_workflow_plan_build_test",
    "github_issue_number": "42",
    "status": "running",
    "current_phase": "planning",
    "created_at": "2025-10-08T10:00:00Z",
    "updated_at": "2025-10-08T10:00:00Z",
    "execution_started_at": "2025-10-08T10:00:05Z",
    "github_pull_request_url": null,
    "git_commit_count": 0
  },
  "logs_url": "/api/agent-work-orders/wo-abc12345/logs"
}
```

#### 3. Send Prompt to Agent

**POST** `/agent-work-orders/{agent_work_order_id}/prompt`

Sends a prompt to an active agent work order.

**Request:**

```json
{
  "agent_work_order_id": "wo-abc12345",
  "prompt_text": "Now implement the authentication module"
}
```

**Response:** `200 OK`

```json
{
  "agent_work_order_id": "wo-abc12345",
  "prompt_accepted": true,
  "message": "Prompt sent to agent successfully"
}
```

#### 4. Get Agent Work Order Status

**GET** `/agent-work-orders/{agent_work_order_id}`

Retrieves current status of a work order with git progress.

**Response:** `200 OK`

```json
{
  "agent_work_order": {
    "agent_work_order_id": "wo-abc12345",
    "repository_url": "https://github.com/user/repo.git",
    "git_branch_name": "feat-wo-abc12345",
    "sandbox_type": "git_branch",
    "workflow_type": "agent_workflow_plan_build_test",
    "github_issue_number": "42",
    "status": "running",
    "current_phase": "implementing",
    "created_at": "2025-10-08T10:00:00Z",
    "updated_at": "2025-10-08T10:05:00Z",
    "execution_started_at": "2025-10-08T10:00:05Z",
    "github_pull_request_url": "https://github.com/user/repo/pull/123",
    "git_commit_count": 3,
    "git_files_changed": 12,
    "git_lines_added": 245,
    "git_lines_removed": 18
  },
  "logs_url": "/api/agent-work-orders/wo-abc12345/logs"
}
```

#### 5. Get Git Progress

**GET** `/agent-work-orders/{agent_work_order_id}/git-progress`

Retrieves detailed git progress for phase-level tracking.

**Response:** `200 OK`

```json
{
  "agent_work_order_id": "wo-abc12345",
  "current_phase": "implementing",
  "git_commit_count": 3,
  "git_files_changed": 12,
  "git_lines_added": 245,
  "git_lines_removed": 18,
  "latest_commit_message": "feat: implement user authentication",
  "latest_commit_sha": "abc123def456",
  "snapshot_timestamp": "2025-10-08T10:05:30Z",
  "phase_history": [
    {
      "phase": "planning",
      "started_at": "2025-10-08T10:00:05Z",
      "completed_at": "2025-10-08T10:02:30Z",
      "commits": 1
    },
    {
      "phase": "implementing",
      "started_at": "2025-10-08T10:02:35Z",
      "completed_at": null,
      "commits": 2
    }
  ]
}
```

#### 6. Get Agent Work Order Logs

**GET** `/agent-work-orders/{agent_work_order_id}/logs`

Retrieves structured logs for a work order.

**Query Parameters:**

- `limit` (optional): Number of log entries to return (default: 100)
- `offset` (optional): Offset for pagination (default: 0)

**Response:** `200 OK`

```json
{
  "agent_work_order_id": "wo-abc12345",
  "log_entries": [
    {
      "timestamp": "2025-10-08T10:00:05Z",
      "level": "info",
      "event": "agent_work_order_started",
      "agent_work_order_id": "wo-abc12345",
      "workflow_type": "agent_workflow_plan_build_test",
      "sandbox_type": "git_branch"
    },
    {
      "timestamp": "2025-10-08T10:00:10Z",
      "level": "info",
      "event": "git_branch_created",
      "agent_work_order_id": "wo-abc12345",
      "git_branch_name": "feat-wo-abc12345"
    },
    {
      "timestamp": "2025-10-08T10:02:30Z",
      "level": "info",
      "event": "workflow_phase_completed",
      "agent_work_order_id": "wo-abc12345",
      "phase": "planning",
      "execution_duration_seconds": 145.2
    }
  ],
  "total_count": 45,
  "has_more": true
}
```

#### 7. List Agent Work Orders

**GET** `/agent-work-orders`

Lists all work orders with optional filtering.

**Query Parameters:**

- `status` (optional): Filter by status (pending, running, completed, failed)
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**Response:** `200 OK`

```json
{
  "agent_work_orders": [
    {
      "agent_work_order_id": "wo-abc12345",
      "repository_url": "https://github.com/user/repo.git",
      "status": "completed",
      "sandbox_type": "git_branch",
      "workflow_type": "agent_workflow_plan_build_test",
      "created_at": "2025-10-08T10:00:00Z",
      "updated_at": "2025-10-08T10:15:00Z"
    }
  ],
  "total_count": 1,
  "has_more": false
}
```

---

## Module Specifications

### 1. Agent Executor Module

**Purpose:** Execute Claude Code CLI commands in subprocess.

**Key Files:**

- `agent_cli_executor.py` - Main executor
- `agent_command_builder.py` - Build CLI commands
- `agent_response_parser.py` - Parse JSONL output

**Example Usage:**

```python
from agent_executor import AgentCLIExecutor, AgentCommandBuilder

# Build command
command_builder = AgentCommandBuilder(
    command_name="/agent_workflow_plan",
    arguments=["42", "wo-abc123"],
    model="sonnet",
    output_format="stream-json"
)
cli_command = command_builder.build()

# Execute
executor = AgentCLIExecutor()
result = await executor.execute_async(
    cli_command=cli_command,
    working_directory="/path/to/repo",
    timeout_seconds=300
)

# Parse output
if result.execution_success:
    session_id = result.agent_session_id
    logger.info("agent_command_success", session_id=session_id)
```

### 2. Sandbox Manager Module

**Purpose:** Provide abstraction over different execution environments.

**Key Files:**

- `sandbox_protocol.py` - Abstract interface
- `git_branch_sandbox.py` - Git branch implementation
- `git_worktree_sandbox.py` - Git worktree implementation
- `e2b_sandbox.py` - E2B cloud sandbox (Phase 2+, primary cloud target)
- `dagger_sandbox.py` - Dagger containers (Phase 2+, primary container target)
- `sandbox_factory.py` - Factory pattern

**Example Usage:**

```python
from sandbox_manager import SandboxFactory, SandboxType

# Create sandbox
factory = SandboxFactory()
sandbox = factory.create_sandbox(
    sandbox_type=SandboxType.GIT_BRANCH,
    repository_url="https://github.com/user/repo.git",
    sandbox_identifier="wo-abc123"
)

# Setup
await sandbox.setup()

# Execute
result = await sandbox.execute_command("ls -la")

# Cleanup
await sandbox.cleanup()
```

**Sandbox Protocol:**

```python
from typing import Protocol

class AgentSandbox(Protocol):
    """
    Abstract interface for agent execution environments.

    Implementations:
    - GitBranchSandbox (Phase 1)
    - GitWorktreeSandbox (Phase 1)
    - E2BSandbox (Phase 2+ - primary cloud sandbox)
    - DaggerSandbox (Phase 2+ - primary container sandbox)
    """

    sandbox_identifier: str
    repository_url: str

    async def setup(self) -> None:
        """Initialize the sandbox environment."""
        ...

    async def execute_command(
        self,
        command: str,
        timeout_seconds: int = 300
    ) -> CommandExecutionResult:
        """Execute a command in the sandbox."""
        ...

    async def get_current_state(self) -> SandboxState:
        """Get current state of the sandbox."""
        ...

    async def cleanup(self) -> None:
        """Clean up sandbox resources."""
        ...
```

### 3. GitHub Integration Module

**Purpose:** Wrap GitHub CLI (`gh`) for repository operations.

**Key Files:**

- `github_repository_client.py` - Repository operations
- `github_pull_request_client.py` - PR creation/management
- `github_issue_client.py` - Issue operations

**Example Usage:**

```python
from github_integration import GitHubRepositoryClient, GitHubPullRequestClient

# Verify repository
repo_client = GitHubRepositoryClient()
is_accessible = await repo_client.verify_repository_access(
    repository_url="https://github.com/user/repo.git"
)

# Create PR
pr_client = GitHubPullRequestClient()
pull_request = await pr_client.create_pull_request(
    repository_owner="user",
    repository_name="repo",
    head_branch="feat-wo-abc123",
    base_branch="main",
    pull_request_title="feat: #42 - Add user authentication",
    pull_request_body="Implements user authentication system..."
)

logger.info(
    "github_pull_request_created",
    pull_request_url=pull_request.pull_request_url,
    pull_request_number=pull_request.pull_request_number
)
```

### 4. Workflow Engine Module

**Purpose:** Orchestrate multi-step agent workflows and track phase progress.

**Key Files:**

- `workflow_orchestrator.py` - Main orchestrator
- `workflow_phase_tracker.py` - Track phase progress via git inspection
- `workflow_definitions.py` - Workflow type definitions
- `workflow_executor.py` - Execute individual steps

**Example Usage:**

```python
from workflow_engine import WorkflowOrchestrator, AgentWorkflowType

orchestrator = WorkflowOrchestrator(
    agent_executor=agent_executor,
    sandbox_manager=sandbox_manager,
    github_client=github_client,
    phase_tracker=phase_tracker
)

# Execute workflow with phase tracking
await orchestrator.execute_workflow(
    agent_work_order_id="wo-abc123",
    workflow_type=AgentWorkflowType.PLAN_BUILD_TEST,
    repository_url="https://github.com/user/repo.git",
    github_issue_number="42"
)
```

**Phase Tracking:**

```python
class WorkflowPhaseTracker:
    """
    Track workflow phase progress by inspecting git.

    No streaming, just phase-level updates.
    """

    async def get_current_phase(
        self,
        agent_work_order_id: str,
        git_branch_name: str
    ) -> AgentWorkflowPhase:
        """
        Determine current phase by inspecting git commits.

        Logic:
        - Look for commit messages with phase markers
        - Count commits in different phases
        - Return current active phase
        """
        logger.info(
            "tracking_workflow_phase",
            agent_work_order_id=agent_work_order_id,
            git_branch_name=git_branch_name
        )

        # Inspect git log for phase markers
        commits = await self._get_commit_history(git_branch_name)

        # Determine phase from commits
        if self._has_test_commits(commits):
            return AgentWorkflowPhase.TESTING
        elif self._has_implementation_commits(commits):
            return AgentWorkflowPhase.IMPLEMENTING
        elif self._has_planning_commits(commits):
            return AgentWorkflowPhase.PLANNING
        else:
            return AgentWorkflowPhase.COMPLETED

    async def get_git_progress_snapshot(
        self,
        agent_work_order_id: str,
        git_branch_name: str
    ) -> GitProgressSnapshot:
        """
        Get git progress snapshot for UI display.

        Returns commit counts, file changes, line changes.
        """
        # Implementation...
```

### 5. Command Loader Module

**Purpose:** Load and validate .claude/commands/\*.md files.

**Key Files:**

- `claude_command_loader.py` - Scan and load commands
- `command_validator.py` - Validate command structure

**Example Usage:**

```python
from command_loader import ClaudeCommandLoader

loader = ClaudeCommandLoader(
    commands_directory=".claude/commands"
)

# Load all commands
commands = await loader.load_all_commands()

# Get specific command
plan_command = loader.get_command("/agent_workflow_plan")

logger.info(
    "commands_loaded",
    command_count=len(commands),
    command_names=[cmd.command_name for cmd in commands]
)
```

### 6. State Manager Module

**Purpose:** Persist and retrieve work order state.

**Key Files:**

- `work_order_state_repository.py` - CRUD operations
- `in_memory_store.py` - Phase 1: In-memory storage
- `supabase_client.py` - Phase 2: Supabase integration
- `models.py` - Database models

**Example Usage:**

```python
from state_manager import WorkOrderStateRepository

# Phase 1: In-memory
repository = WorkOrderStateRepository(storage_backend="in_memory")

# Phase 2: Supabase (already set up in project)
# repository = WorkOrderStateRepository(storage_backend="supabase")

# Create
await repository.create_work_order(
    agent_work_order_id="wo-abc123",
    repository_url="https://github.com/user/repo.git",
    workflow_type=AgentWorkflowType.PLAN,
    sandbox_type=SandboxType.GIT_BRANCH,
    github_issue_number="42"
)

# Update
await repository.update_work_order(
    agent_work_order_id="wo-abc123",
    git_branch_name="feat-wo-abc123",
    status=AgentWorkOrderStatus.RUNNING,
    current_phase=AgentWorkflowPhase.PLANNING
)

# Retrieve
work_order = await repository.get_work_order("wo-abc123")

# List
work_orders = await repository.list_work_orders(
    status=AgentWorkOrderStatus.RUNNING,
    limit=50
)
```

---

## Logging Strategy

### Structured Logging with Structlog

**Configuration:**

```python
# logging_config/structured_logger.py

import structlog
import logging
import sys

def configure_structured_logging(
    log_level: str = "INFO",
    log_file_path: str | None = None
) -> None:
    """
    Configure structlog for the application.

    Features:
    - JSON output for production
    - Pretty-print for development
    - Request ID propagation
    - Timestamp on every log
    - Exception formatting
    """

    # Processors for all environments
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    # Development: Pretty console output
    if log_file_path is None:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer()
        ]
    # Production: JSON output
    else:
        processors = shared_processors + [
            structlog.processors.JSONRenderer()
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )
```

### Standard Log Events

**Naming Convention:** `{module}_{noun}_{verb_past_tense}`

**Examples:**

```python
# Work order lifecycle
logger.info("agent_work_order_created", agent_work_order_id="wo-123")
logger.info("agent_work_order_started", agent_work_order_id="wo-123")
logger.info("agent_work_order_completed", agent_work_order_id="wo-123")
logger.error("agent_work_order_failed", agent_work_order_id="wo-123", error="...")

# Git operations
logger.info("git_branch_created", git_branch_name="feat-...")
logger.info("git_commit_created", git_commit_sha="abc123")
logger.info("git_push_completed", git_branch_name="feat-...")

# Agent execution
logger.info("agent_command_started", command_name="/plan")
logger.info("agent_command_completed", command_name="/plan", duration_seconds=120.5)
logger.error("agent_command_failed", command_name="/plan", error="...")

# GitHub operations
logger.info("github_repository_verified", repository_url="...", is_accessible=true)
logger.info("github_pull_request_created", pull_request_url="...")
logger.info("github_issue_commented", issue_number="42")

# Sandbox operations
logger.info("sandbox_created", sandbox_type="git_branch", sandbox_id="wo-123")
logger.info("sandbox_command_executed", command="ls -la")
logger.info("sandbox_cleanup_completed", sandbox_id="wo-123")

# Workflow phase tracking
logger.info("workflow_phase_started", phase="planning", agent_work_order_id="wo-123")
logger.info("workflow_phase_completed", phase="planning", duration_seconds=145.2)
logger.info("workflow_phase_transition", from_phase="planning", to_phase="implementing")
```

### Context Propagation

**Bind context to logger:**

```python
# At the start of work order execution
logger = structlog.get_logger().bind(
    agent_work_order_id="wo-abc123",
    repository_url="https://github.com/user/repo.git",
    workflow_type="agent_workflow_plan_build_test",
    sandbox_type="git_branch"
)

# All subsequent logs will include this context
logger.info("workflow_execution_started")
logger.info("git_branch_created", git_branch_name="feat-...")
logger.info("agent_command_completed", command_name="/plan")

# Output:
# {
#   "event": "workflow_execution_started",
#   "agent_work_order_id": "wo-abc123",
#   "repository_url": "https://github.com/user/repo.git",
#   "workflow_type": "agent_workflow_plan_build_test",
#   "sandbox_type": "git_branch",
#   "timestamp": "2025-10-08T10:00:00Z",
#   "level": "info"
# }
```

### Log Storage

**Development:** Console output (pretty-print)

**Production:**

- JSON file: `logs/agent_work_orders/{date}/{agent_work_order_id}.jsonl`
- Supabase: Store critical events in `work_order_logs` table (Phase 2)

---

## Implementation Phases

### Phase 1: MVP (Week 1-2)

**Goal:** Working system with git branch/worktree sandboxes, HTTP polling, repository connection flow.

**Deliverables:**

✅ **Backend:**

- FastAPI server with core endpoints
- Git branch and git worktree sandbox implementations
- Agent CLI executor
- In-memory state storage (minimal 5 fields)
- Structured logging (console output)
- 3 workflows: plan, build, test
- GitHub repository verification
- Git progress tracking (phase-level)

✅ **Frontend:**

- Repository connection/verification UI
- Sandbox type selector (git branch, worktree, E2B placeholder, Dagger placeholder)
- Agent prompt interface
- Progress tracker (shows current phase from git inspection)
- Work order list view
- Work order detail view with polling

✅ **Integration:**

- GitHub PR creation
- Git commit/push automation
- Phase detection from git commits

**Success Criteria:**

- Can connect and verify GitHub repository
- Can select sandbox type (git branch or worktree)
- Agent executes in selected sandbox
- User can send prompts to agent
- Phase progress visible via git inspection
- Changes committed and pushed
- PR created automatically
- Status visible in UI via polling

---

### Phase 2: Supabase & E2B/Dagger Sandboxes (Week 3-4)

**Goal:** Integrate Supabase for persistence, implement E2B and Dagger sandboxes.

**Deliverables:**

✅ **Backend:**

- Supabase client integration (already set up in project)
- Work order state persistence to Supabase
- E2B sandbox implementation (primary cloud sandbox)
- Dagger sandbox implementation (primary container sandbox)
- Retry logic for failed commands
- Error categorization

✅ **Frontend:**

- E2B and Dagger options active in sandbox selector
- Error display
- Retry button
- Loading states
- Toast notifications

✅ **DevOps:**

- Environment configuration
- Deployment scripts

**Success Criteria:**

- Work orders persisted to Supabase
- Can execute agents in E2B cloud sandboxes
- Can execute agents in Dagger containers
- Handles network failures gracefully
- Can retry failed work orders
- Production deployment ready

---

### Phase 3: Advanced Features (Week 5-6)

**Goal:** Custom workflows, better observability, webhook support.

**Deliverables:**

✅ **Backend:**

- Custom workflow definitions (user YAML)
- Work order cancellation
- Webhook support (GitHub events)
- Enhanced git progress tracking

✅ **Frontend:**

- Custom workflow editor
- Advanced filtering
- Analytics dashboard

**Success Criteria:**

- Users can define custom workflows
- Webhook triggers work
- Can cancel running work orders

---

### Phase 4: Scale & Polish (Week 7-8+)

**Goal:** Scale to production workloads, improve UX.

**Deliverables:**

✅ **Backend:**

- Multi-repository support
- Queue system for work orders
- Performance optimizations

✅ **Frontend:**

- Improved UX
- Better visualizations
- Performance optimizations

✅ **Infrastructure:**

- Distributed logging
- Metrics and monitoring
- Auto-scaling

**Success Criteria:**

- Scales to 100+ concurrent work orders
- Monitoring and alerting in place
- Production-grade performance

---

## Success Metrics

### Phase 1 (MVP)

| Metric                       | Target      |
| ---------------------------- | ----------- |
| Time to connect repository   | < 5 seconds |
| Time to create work order    | < 5 seconds |
| Agent execution success rate | > 80%       |
| PR creation success rate     | > 90%       |
| Polling latency              | < 3 seconds |
| Phase detection accuracy     | > 95%       |
| System availability          | > 95%       |

### Phase 2 (Production)

| Metric                        | Target       |
| ----------------------------- | ------------ |
| Agent execution success rate  | > 95%        |
| Error recovery rate           | > 80%        |
| Supabase query latency        | < 100ms      |
| E2B sandbox startup time      | < 30 seconds |
| Dagger container startup time | < 20 seconds |
| System availability           | > 99%        |

### Phase 3 (Advanced)

| Metric                          | Target         |
| ------------------------------- | -------------- |
| Custom workflow adoption        | > 50% of users |
| Webhook processing latency      | < 2 seconds    |
| Work order cancellation success | > 99%          |

### Phase 4 (Scale)

| Metric                   | Target       |
| ------------------------ | ------------ |
| Concurrent work orders   | 100+         |
| Work order queue latency | < 30 seconds |
| System availability      | > 99.9%      |

---

## Appendix

### A. Naming Conventions

**Module Names:**

- `agent_executor` (not `executor`)
- `sandbox_manager` (not `sandbox`)
- `github_integration` (not `github`)

**Function Names:**

- `create_agent_work_order()` (not `create_order()`)
- `execute_agent_command()` (not `run_cmd()`)
- `get_git_branch_name()` (not `get_branch()`)

**Variable Names:**

- `agent_work_order_id` (not `order_id`, `wo_id`)
- `git_branch_name` (not `branch`, `branch_name`)
- `repository_url` (not `repo`, `url`)
- `github_issue_number` (not `issue`, `issue_id`)

**Log Event Names:**

- `agent_work_order_created` (not `order_created`, `wo_created`)
- `git_branch_created` (not `branch_created`)
- `github_pull_request_created` (not `pr_created`)

### B. Technology Stack

**Backend:**

- Python 3.12+
- FastAPI (async web framework)
- Pydantic 2.0+ (data validation)
- Structlog (structured logging)
- Supabase (database - Phase 2+, already set up in project)
- E2B SDK (cloud sandboxes - Phase 2+)
- Dagger SDK (container sandboxes - Phase 2+)

**Frontend:**

- React 18+
- TypeScript 5+
- Vite (build tool)
- TanStack Query (data fetching/polling)
- Radix UI (component library)
- Tailwind CSS (styling)

**Infrastructure:**

- Docker (containerization)
- uv (Python package manager)
- bun (JavaScript runtime/package manager)

### C. Security Considerations

**Phase 1:**

- No authentication (localhost only)
- Git credentials via environment variables
- GitHub tokens via `gh` CLI

**Phase 2:**

- API key authentication
- Rate limiting
- Input validation

**Phase 3:**

- Multi-user authentication (OAuth)
- Repository access controls
- Audit logging

### D. Sandbox Priority

**Primary Sandbox Targets:**

1. **E2B** - Primary cloud-based sandbox
   - Full isolation
   - Cloud execution
   - Scalable
   - Production-ready

2. **Dagger** - Primary container sandbox
   - Docker-based
   - Reproducible
   - CI/CD friendly
   - Self-hosted option

**Local Sandboxes (Phase 1):**

- Git branches (simple, fast)
- Git worktrees (better isolation)

---

**End of PRD**
