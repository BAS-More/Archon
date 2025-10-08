# Feature: Agent Work Orders - MVP v2 (PRD-Aligned)

## Feature Description

A **minimal but PRD-compliant** implementation of the Agent Work Order System. This MVP implements the absolute minimum from the PRD while respecting all core architectural principles: git-first philosophy, workflow types, phase tracking, structured logging, and proper module boundaries.

**What's included in this MVP:**

- Single workflow type: `agent_workflow_plan` (planning only)
- Git branch sandbox (agent creates branch during execution)
- Phase tracking via git commit inspection
- Structured logging with structlog
- GitHub repository verification
- Interactive agent prompting
- GitHub PR creation
- Proper naming conventions from PRD
- **Completely isolated module** in `python/src/agent_work_orders/`

**What's deliberately excluded (for Phase 2+):**

- Additional workflow types (build, test, combinations)
- Git worktree sandbox
- E2B and Dagger sandboxes (stubs only)
- Supabase persistence (in-memory only)
- Advanced error handling and retry logic
- Work order cancellation
- Custom workflows
- Webhook triggers

**Value**: Proves the core PRD concept with minimal complexity while maintaining architectural integrity for future expansion.

## User Story

As a developer using AI coding assistants
I want to create an agent work order that executes a planning workflow in an isolated git branch
So that I can automate planning tasks with full git audit trails and GitHub integration

## Problem Statement

The current MVP plan deviates significantly from the PRD:

- Wrong naming conventions (`work_order` vs `agent_work_order`)
- Missing workflow types (just "initial_prompt")
- Missing phase tracking via git inspection
- Missing command loader for `.claude/commands/*.md`
- Basic logging instead of structured logging
- Pre-creates branch instead of letting agent create it
- Missing several "Must Have" features from PRD

We need a **minimal but compliant** implementation that respects the PRD's architecture.

## Solution Statement

Build an **ultra-minimal MVP** that implements **only the planning workflow** but does it according to PRD specifications:

**Architecture** (PRD-compliant, isolated):

```
python/src/agent_work_orders/          # Isolated module
├── __init__.py
├── main.py                            # FastAPI app
├── models.py                          # All Pydantic models (PRD names)
├── config.py                          # Configuration
├── agent_executor/
│   ├── __init__.py
│   └── agent_cli_executor.py         # Execute claude CLI
├── sandbox_manager/
│   ├── __init__.py
│   ├── sandbox_protocol.py           # Abstract interface
│   ├── git_branch_sandbox.py         # Git branch implementation
│   └── sandbox_factory.py            # Factory pattern
├── workflow_engine/
│   ├── __init__.py
│   ├── workflow_orchestrator.py      # Orchestrate execution
│   └── workflow_phase_tracker.py     # Track phases via git
├── github_integration/
│   ├── __init__.py
│   └── github_client.py              # gh CLI wrapper
├── command_loader/
│   ├── __init__.py
│   └── claude_command_loader.py      # Load .claude/commands/*.md
├── state_manager/
│   ├── __init__.py
│   └── work_order_repository.py      # In-memory CRUD
└── api/
    ├── __init__.py
    └── routes.py                      # API endpoints
```

This ensures:

1. PRD naming conventions followed exactly
2. Git-first philosophy (agent creates branch)
3. Minimal state (5 fields from PRD)
4. Structured logging with structlog
5. Workflow-based execution
6. Phase tracking via git
7. Complete isolation for future extraction

## Relevant Files

### Existing Files (Reference Only)

**For Patterns**:

- `python/src/server/main.py` - App mounting reference
- `python/src/mcp_server/mcp_server.py` - Isolated service reference
- `archon-ui-main/src/features/projects/` - Frontend patterns

### New Files (All in Isolated Module)

**Backend - Agent Work Orders Module** (PRD-compliant structure):

**Core**:

- `python/src/agent_work_orders/__init__.py` - Module initialization
- `python/src/agent_work_orders/main.py` - FastAPI app
- `python/src/agent_work_orders/models.py` - All Pydantic models (PRD names)
- `python/src/agent_work_orders/config.py` - Configuration

**Agent Executor**:

- `python/src/agent_work_orders/agent_executor/__init__.py`
- `python/src/agent_work_orders/agent_executor/agent_cli_executor.py` - Execute Claude CLI

**Sandbox Manager**:

- `python/src/agent_work_orders/sandbox_manager/__init__.py`
- `python/src/agent_work_orders/sandbox_manager/sandbox_protocol.py` - Abstract interface
- `python/src/agent_work_orders/sandbox_manager/git_branch_sandbox.py` - Git implementation
- `python/src/agent_work_orders/sandbox_manager/sandbox_factory.py` - Factory pattern

**Workflow Engine**:

- `python/src/agent_work_orders/workflow_engine/__init__.py`
- `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py` - Main orchestrator
- `python/src/agent_work_orders/workflow_engine/workflow_phase_tracker.py` - Track via git

**GitHub Integration**:

- `python/src/agent_work_orders/github_integration/__init__.py`
- `python/src/agent_work_orders/github_integration/github_client.py` - gh CLI wrapper

**Command Loader**:

- `python/src/agent_work_orders/command_loader/__init__.py`
- `python/src/agent_work_orders/command_loader/claude_command_loader.py` - Load commands - commmand location .claude/commands/agent-work-orders

**State Manager**:

- `python/src/agent_work_orders/state_manager/__init__.py`
- `python/src/agent_work_orders/state_manager/work_order_repository.py` - In-memory storage

**API**:

- `python/src/agent_work_orders/api/__init__.py`
- `python/src/agent_work_orders/api/routes.py` - All endpoints

**Utilities**:

- `python/src/agent_work_orders/utils/__init__.py`
- `python/src/agent_work_orders/utils/id_generator.py` - Generate IDs
- `python/src/agent_work_orders/utils/git_operations.py` - Git helpers
- `python/src/agent_work_orders/utils/structured_logger.py` - Structlog setup

**Server Integration**:

- `python/src/server/main.py` - Mount sub-app (1 line change)

**Frontend** (Standard feature structure):

- `archon-ui-main/src/features/agent-work-orders/types/index.ts`
- `archon-ui-main/src/features/agent-work-orders/services/agentWorkOrderService.ts`
- `archon-ui-main/src/features/agent-work-orders/hooks/useAgentWorkOrderQueries.ts`
- `archon-ui-main/src/features/agent-work-orders/components/RepositoryConnector.tsx`
- `archon-ui-main/src/features/agent-work-orders/components/SandboxSelector.tsx`
- `archon-ui-main/src/features/agent-work-orders/components/WorkflowSelector.tsx`
- `archon-ui-main/src/features/agent-work-orders/components/AgentPromptInterface.tsx`
- `archon-ui-main/src/features/agent-work-orders/components/PhaseTracker.tsx`
- `archon-ui-main/src/features/agent-work-orders/components/AgentWorkOrderList.tsx`
- `archon-ui-main/src/features/agent-work-orders/components/AgentWorkOrderCard.tsx`
- `archon-ui-main/src/features/agent-work-orders/views/AgentWorkOrdersView.tsx`
- `archon-ui-main/src/features/agent-work-orders/views/AgentWorkOrderDetailView.tsx`
- `archon-ui-main/src/pages/AgentWorkOrdersPage.tsx`

**Command Files** (precreated here):

- .claude/commands/agent-work-orders/feature.md (is the plan command)

**Tests**:

- `python/tests/agent_work_orders/test_models.py`
- `python/tests/agent_work_orders/test_agent_executor.py`
- `python/tests/agent_work_orders/test_sandbox_manager.py`
- `python/tests/agent_work_orders/test_workflow_engine.py`
- `python/tests/agent_work_orders/test_github_integration.py`
- `python/tests/agent_work_orders/test_command_loader.py`
- `python/tests/agent_work_orders/test_state_manager.py`
- `python/tests/agent_work_orders/test_api.py`

## Implementation Plan

### Phase 1: Core Architecture & Models

**Goal**: Set up PRD-compliant module structure with proper naming and models.

**Deliverables**:

- Complete directory structure following PRD
- All Pydantic models with PRD naming
- Structured logging setup with structlog
- Configuration management

### Phase 2: Execution Pipeline

**Goal**: Implement the core execution pipeline (sandbox → agent → git).

**Deliverables**:

- Sandbox protocol and git branch implementation
- Agent CLI executor
- Command loader for `.claude/commands/*.md`
- Git operations utilities

### Phase 3: Workflow Orchestration

**Goal**: Implement workflow orchestrator and phase tracking.

**Deliverables**:

- Workflow orchestrator
- Phase tracker (inspects git for progress)
- GitHub integration (verify repo, create PR)
- State manager (in-memory)

### Phase 4: API Layer

**Goal**: REST API endpoints following PRD specification.

**Deliverables**:

- All API endpoints from PRD
- Request/response validation
- Error handling
- Integration with workflow engine

### Phase 5: Frontend

**Goal**: Complete UI following PRD user workflow.

**Deliverables**:

- Repository connector
- Sandbox selector (git branch only, others disabled)
- Workflow selector (plan only for now)
- Agent prompt interface
- Phase tracker UI
- List and detail views

### Phase 6: Integration & Testing

**Goal**: End-to-end integration and validation.

**Deliverables**:

- Mount in main server
- Navigation integration
- Comprehensive tests
- Documentation

## Step by Step Tasks

### Module Structure Setup

#### Create directory structure

- Create `python/src/agent_work_orders/` with all subdirectories
- Create `__init__.py` files in all modules
- Create `python/tests/agent_work_orders/` directory
- Follow PRD structure exactly

### Models & Configuration

#### Define PRD-compliant Pydantic models

- Create `python/src/agent_work_orders/models.py`
- Define all enums from PRD:

  ```python
  class AgentWorkOrderStatus(str, Enum):
      PENDING = "pending"
      RUNNING = "running"
      COMPLETED = "completed"
      FAILED = "failed"

  class AgentWorkflowType(str, Enum):
      PLAN = "agent_workflow_plan"  # Only this for MVP

  class SandboxType(str, Enum):
      GIT_BRANCH = "git_branch"  # Only this for MVP
      # Placeholders for Phase 2+
      GIT_WORKTREE = "git_worktree"
      E2B = "e2b"
      DAGGER = "dagger"

  class AgentWorkflowPhase(str, Enum):
      PLANNING = "planning"
      COMPLETED = "completed"
  ```

- Define `AgentWorkOrderState` (minimal 5 fields):
  ```python
  class AgentWorkOrderState(BaseModel):
      agent_work_order_id: str
      repository_url: str
      sandbox_identifier: str
      git_branch_name: str | None = None
      agent_session_id: str | None = None
  ```
- Define `AgentWorkOrder` (full model with computed fields):

  ```python
  class AgentWorkOrder(BaseModel):
      # Core (from state)
      agent_work_order_id: str
      repository_url: str
      sandbox_identifier: str
      git_branch_name: str | None
      agent_session_id: str | None

      # Metadata
      workflow_type: AgentWorkflowType
      sandbox_type: SandboxType
      github_issue_number: str | None = None
      status: AgentWorkOrderStatus
      current_phase: AgentWorkflowPhase | None = None
      created_at: datetime
      updated_at: datetime

      # Computed from git
      github_pull_request_url: str | None = None
      git_commit_count: int = 0
      git_files_changed: int = 0
      error_message: str | None = None
  ```

- Define request/response models from PRD
- Write tests: `test_models.py`

#### Create configuration

- Create `python/src/agent_work_orders/config.py`
- Load configuration from environment:
  ```python
  class AgentWorkOrdersConfig:
      CLAUDE_CLI_PATH: str = "claude"
      EXECUTION_TIMEOUT: int = 300
      COMMANDS_DIRECTORY: str = ".claude/commands"
      TEMP_DIR_BASE: str = "/tmp/agent-work-orders"
      LOG_LEVEL: str = "INFO"
  ```

### Structured Logging

#### Set up structlog

- Create `python/src/agent_work_orders/utils/structured_logger.py`
- Configure structlog following PRD:

  ```python
  import structlog

  def configure_structured_logging(log_level: str = "INFO"):
      structlog.configure(
          processors=[
              structlog.contextvars.merge_contextvars,
              structlog.stdlib.add_log_level,
              structlog.processors.TimeStamper(fmt="iso"),
              structlog.processors.StackInfoRenderer(),
              structlog.processors.format_exc_info,
              structlog.dev.ConsoleRenderer()  # Pretty console for MVP
          ],
          wrapper_class=structlog.stdlib.BoundLogger,
          logger_factory=structlog.stdlib.LoggerFactory(),
          cache_logger_on_first_use=True,
      )
  ```

- Use event naming from PRD: `{module}_{noun}_{verb_past_tense}`
- Examples: `agent_work_order_created`, `git_branch_created`, `workflow_phase_started`

### Utilities

#### Implement ID generator

- Create `python/src/agent_work_orders/utils/id_generator.py`
- Generate work order IDs: `f"wo-{secrets.token_hex(4)}"`
- Test uniqueness

#### Implement git operations

- Create `python/src/agent_work_orders/utils/git_operations.py`
- Helper functions:
  - `get_commit_count(branch_name: str) -> int`
  - `get_files_changed(branch_name: str) -> int`
  - `get_latest_commit_message(branch_name: str) -> str`
  - `has_planning_commits(branch_name: str) -> bool`
- Use subprocess to run git commands
- Write tests with mocked subprocess

### Sandbox Manager

#### Implement sandbox protocol

- Create `python/src/agent_work_orders/sandbox_manager/sandbox_protocol.py`
- Define Protocol:

  ```python
  from typing import Protocol

  class AgentSandbox(Protocol):
      sandbox_identifier: str
      repository_url: str

      async def setup(self) -> None: ...
      async def execute_command(self, command: str) -> CommandExecutionResult: ...
      async def get_git_branch_name(self) -> str | None: ...
      async def cleanup(self) -> None: ...
  ```

#### Implement git branch sandbox

- Create `python/src/agent_work_orders/sandbox_manager/git_branch_sandbox.py`
- Implementation:
  - `setup()`: Clone repo to temp directory, checkout default branch
  - `execute_command()`: Run commands in repo directory
  - `get_git_branch_name()`: Check current branch (agent creates it during execution)
  - `cleanup()`: Remove temp directory
- **Important**: Do NOT create branch in setup - agent creates it
- Write tests with mocked subprocess

#### Implement sandbox factory

- Create `python/src/agent_work_orders/sandbox_manager/sandbox_factory.py`
- Factory creates correct sandbox type:
  ```python
  class SandboxFactory:
      def create_sandbox(
          self,
          sandbox_type: SandboxType,
          repository_url: str,
          sandbox_identifier: str
      ) -> AgentSandbox:
          if sandbox_type == SandboxType.GIT_BRANCH:
              return GitBranchSandbox(repository_url, sandbox_identifier)
          else:
              raise NotImplementedError(f"Sandbox type {sandbox_type} not implemented")
  ```

### Agent Executor

#### Implement CLI executor

- Create `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Build Claude CLI command:
  ```python
  def build_command(command_file: str, args: list[str], model: str = "sonnet") -> str:
      # Load command from .claude/commands/{command_file}
      # Build: claude -f {command_file} {args} --model {model} --output-format stream-json
      ...
  ```
- Execute command:
  ```python
  async def execute_async(
      self,
      command: str,
      working_directory: str,
      timeout_seconds: int = 300
  ) -> CommandExecutionResult:
      # Use asyncio.create_subprocess_shell
      # Capture stdout/stderr
      # Parse JSONL output for session_id
      # Return result with success/failure
      ...
  ```
- Log with structlog:
  ```python
  logger.info("agent_command_started", command=command)
  logger.info("agent_command_completed", session_id=session_id, duration=duration)
  ```
- Write tests with mocked subprocess

### Command Loader

#### Implement command loader

- Create `python/src/agent_work_orders/command_loader/claude_command_loader.py`
- Load command files from `.claude/commands/`:

  ```python
  class ClaudeCommandLoader:
      def __init__(self, commands_directory: str):
          self.commands_directory = commands_directory

      def load_command(self, command_name: str) -> str:
          """Load command file (e.g., 'agent_workflow_plan.md')"""
          file_path = Path(self.commands_directory) / f"{command_name}.md"
          if not file_path.exists():
              raise CommandNotFoundError(f"Command file not found: {file_path}")
          return file_path.read_text()
  ```

- Validate command files exist
- Write tests with fixture command files

### GitHub Integration

#### Implement GitHub client

- Create `python/src/agent_work_orders/github_integration/github_client.py`
- Use `gh` CLI for all operations:

  ```python
  class GitHubClient:
      async def verify_repository_access(self, repository_url: str) -> bool:
          """Check if repository is accessible via gh CLI"""
          # Run: gh repo view {owner}/{repo}
          # Return True if accessible
          ...

      async def get_repository_info(self, repository_url: str) -> GitHubRepository:
          """Get repository metadata"""
          # Run: gh repo view {owner}/{repo} --json name,owner,defaultBranch
          ...

      async def create_pull_request(
          self,
          repository_url: str,
          head_branch: str,
          base_branch: str,
          title: str,
          body: str
      ) -> GitHubPullRequest:
          """Create PR via gh CLI"""
          # Run: gh pr create --title --body --head --base
          ...
  ```

- Log all operations with structlog
- Write tests with mocked subprocess

### Workflow Engine

#### Implement phase tracker

- Create `python/src/agent_work_orders/workflow_engine/workflow_phase_tracker.py`
- Inspect git to determine phase:

  ```python
  class WorkflowPhaseTracker:
      async def get_current_phase(
          self,
          git_branch_name: str
      ) -> AgentWorkflowPhase:
          """Determine phase by inspecting git commits"""
          # Check for planning artifacts (plan.md, specs/, etc.)
          commits = await git_operations.get_commit_count(git_branch_name)
          has_planning = await git_operations.has_planning_commits(git_branch_name)

          if has_planning and commits > 0:
              return AgentWorkflowPhase.COMPLETED
          else:
              return AgentWorkflowPhase.PLANNING

      async def get_git_progress_snapshot(
          self,
          agent_work_order_id: str,
          git_branch_name: str
      ) -> GitProgressSnapshot:
          """Get git progress for UI display"""
          return GitProgressSnapshot(
              agent_work_order_id=agent_work_order_id,
              current_phase=await self.get_current_phase(git_branch_name),
              git_commit_count=await git_operations.get_commit_count(git_branch_name),
              git_files_changed=await git_operations.get_files_changed(git_branch_name),
              # ... more fields
          )
  ```

- Write tests with fixture git repos

#### Implement workflow orchestrator

- Create `python/src/agent_work_orders/workflow_engine/workflow_orchestrator.py`
- Main orchestration logic:

  ```python
  class WorkflowOrchestrator:
      def __init__(
          self,
          agent_executor: AgentCLIExecutor,
          sandbox_factory: SandboxFactory,
          github_client: GitHubClient,
          phase_tracker: WorkflowPhaseTracker,
          command_loader: ClaudeCommandLoader,
          state_repository: WorkOrderRepository
      ):
          self.logger = structlog.get_logger()
          # ... store dependencies

      async def execute_workflow(
          self,
          agent_work_order_id: str,
          workflow_type: AgentWorkflowType,
          repository_url: str,
          sandbox_type: SandboxType,
          github_issue_number: str | None = None
      ) -> None:
          """Execute workflow asynchronously"""

          # Bind context for logging
          logger = self.logger.bind(
              agent_work_order_id=agent_work_order_id,
              workflow_type=workflow_type.value,
              sandbox_type=sandbox_type.value
          )

          logger.info("agent_work_order_started")

          try:
              # Update status to RUNNING
              await self.state_repository.update_status(
                  agent_work_order_id,
                  AgentWorkOrderStatus.RUNNING
              )

              # Create sandbox
              sandbox = self.sandbox_factory.create_sandbox(
                  sandbox_type,
                  repository_url,
                  f"sandbox-{agent_work_order_id}"
              )
              await sandbox.setup()
              logger.info("sandbox_created")

              # Load command
              command = self.command_loader.load_command(workflow_type.value)

              # Execute agent (agent creates branch during execution)
              args = [github_issue_number, agent_work_order_id] if github_issue_number else [agent_work_order_id]
              cli_command = self.agent_executor.build_command(command, args)
              result = await self.agent_executor.execute_async(cli_command, sandbox.working_dir)

              if not result.success:
                  raise WorkflowExecutionError(result.error_message)

              # Get branch name created by agent
              git_branch_name = await sandbox.get_git_branch_name()
              await self.state_repository.update_git_branch(agent_work_order_id, git_branch_name)
              logger.info("git_branch_created", git_branch_name=git_branch_name)

              # Track phase
              current_phase = await self.phase_tracker.get_current_phase(git_branch_name)
              logger.info("workflow_phase_completed", phase=current_phase.value)

              # Create PR
              pr = await self.github_client.create_pull_request(
                  repository_url,
                  git_branch_name,
                  "main",
                  f"feat: {workflow_type.value} for issue #{github_issue_number}",
                  "Agent work order execution completed."
              )
              logger.info("github_pull_request_created", pr_url=pr.pull_request_url)

              # Update status to COMPLETED
              await self.state_repository.update_status(
                  agent_work_order_id,
                  AgentWorkOrderStatus.COMPLETED,
                  pr_url=pr.pull_request_url
              )

              logger.info("agent_work_order_completed")

          except Exception as e:
              logger.error("agent_work_order_failed", error=str(e), exc_info=True)
              await self.state_repository.update_status(
                  agent_work_order_id,
                  AgentWorkOrderStatus.FAILED,
                  error_message=str(e)
              )
          finally:
              # Cleanup sandbox
              await sandbox.cleanup()
              logger.info("sandbox_cleanup_completed")
  ```

- Write tests mocking all dependencies

### State Manager

#### Implement in-memory repository

- Create `python/src/agent_work_orders/state_manager/work_order_repository.py`
- In-memory storage for MVP:

  ```python
  class WorkOrderRepository:
      def __init__(self):
          self._work_orders: dict[str, AgentWorkOrderState] = {}
          self._metadata: dict[str, dict] = {}  # Store metadata separately
          self._lock = asyncio.Lock()

      async def create(self, work_order: AgentWorkOrderState, metadata: dict) -> None:
          async with self._lock:
              self._work_orders[work_order.agent_work_order_id] = work_order
              self._metadata[work_order.agent_work_order_id] = metadata

      async def get(self, agent_work_order_id: str) -> tuple[AgentWorkOrderState, dict] | None:
          async with self._lock:
              if agent_work_order_id not in self._work_orders:
                  return None
              return (
                  self._work_orders[agent_work_order_id],
                  self._metadata[agent_work_order_id]
              )

      async def list(self) -> list[tuple[AgentWorkOrderState, dict]]:
          async with self._lock:
              return [
                  (self._work_orders[id], self._metadata[id])
                  for id in self._work_orders
              ]

      async def update_status(
          self,
          agent_work_order_id: str,
          status: AgentWorkOrderStatus,
          **kwargs
      ) -> None:
          async with self._lock:
              if agent_work_order_id in self._metadata:
                  self._metadata[agent_work_order_id]["status"] = status
                  self._metadata[agent_work_order_id]["updated_at"] = datetime.now()
                  for key, value in kwargs.items():
                      self._metadata[agent_work_order_id][key] = value
  ```

- Add TODO comments for Supabase migration in Phase 2
- Write tests for CRUD operations

### API Layer

#### Create API routes

- Create `python/src/agent_work_orders/api/routes.py`
- Define all endpoints from PRD:

  **POST /agent-work-orders** (create):

  ```python
  @router.post("/agent-work-orders", status_code=201)
  async def create_agent_work_order(
      request: CreateAgentWorkOrderRequest
  ) -> AgentWorkOrderResponse:
      # Generate ID
      # Create state
      # Start workflow in background (asyncio.create_task)
      # Return immediately
      ...
  ```

  **GET /agent-work-orders/{id}** (get status):

  ```python
  @router.get("/agent-work-orders/{agent_work_order_id}")
  async def get_agent_work_order(
      agent_work_order_id: str
  ) -> AgentWorkOrderResponse:
      # Get from state
      # Compute fields from git
      # Return full model
      ...
  ```

  **GET /agent-work-orders** (list):

  ```python
  @router.get("/agent-work-orders")
  async def list_agent_work_orders(
      status: AgentWorkOrderStatus | None = None
  ) -> list[AgentWorkOrder]:
      # List from state
      # Filter by status if provided
      # Return list
      ...
  ```

  **POST /agent-work-orders/{id}/prompt** (send prompt):

  ```python
  @router.post("/agent-work-orders/{agent_work_order_id}/prompt")
  async def send_prompt_to_agent(
      agent_work_order_id: str,
      request: AgentPromptRequest
  ) -> dict:
      # Find running work order
      # Send prompt to agent (resume session)
      # Return success
      ...
  ```

  **GET /agent-work-orders/{id}/git-progress** (git progress):

  ```python
  @router.get("/agent-work-orders/{agent_work_order_id}/git-progress")
  async def get_git_progress(
      agent_work_order_id: str
  ) -> GitProgressSnapshot:
      # Get work order
      # Get git progress from phase tracker
      # Return snapshot
      ...
  ```

  **GET /agent-work-orders/{id}/logs** (structured logs):

  ```python
  @router.get("/agent-work-orders/{agent_work_order_id}/logs")
  async def get_agent_work_order_logs(
      agent_work_order_id: str,
      limit: int = 100,
      offset: int = 0
  ) -> dict:
      # For MVP: return empty or mock logs
      # Phase 2: read from log files or Supabase
      return {"agent_work_order_id": agent_work_order_id, "log_entries": []}
  ```

  **POST /github/verify-repository** (verify repo):

  ```python
  @router.post("/github/verify-repository")
  async def verify_github_repository(
      request: GitHubRepositoryVerificationRequest
  ) -> GitHubRepositoryVerificationResponse:
      # Use GitHub client to verify
      # Return result
      ...
  ```

- Add error handling for all endpoints
- Use structured logging for all operations
- Write integration tests with TestClient

#### Create FastAPI app

- Create `python/src/agent_work_orders/main.py`
- Set up app with CORS:

  ```python
  from fastapi import FastAPI
  from fastapi.middleware.cors import CORSMiddleware
  from .api.routes import router
  from .utils.structured_logger import configure_structured_logging

  # Configure logging on startup
  configure_structured_logging()

  app = FastAPI(
      title="Agent Work Orders API",
      description="PRD-compliant agent work order system",
      version="0.1.0"
  )

  app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )

  app.include_router(router)

  @app.get("/health")
  async def health():
      return {"status": "healthy", "service": "agent-work-orders"}
  ```

### Server Integration

#### Mount in main server

- Edit `python/src/server/main.py`
- Import and mount:

  ```python
  from agent_work_orders.main import app as agent_work_orders_app

  app.mount("/api/agent-work-orders", agent_work_orders_app)
  ```

- Accessible at: `http://localhost:8181/api/agent-work-orders/*`

### Frontend Setup

#### Create feature structure

- Create `archon-ui-main/src/features/agent-work-orders/` with subdirectories
- Follow vertical slice architecture

### Frontend - Types

#### Define TypeScript types

- Create `archon-ui-main/src/features/agent-work-orders/types/index.ts`
- Mirror PRD models exactly:

  ```typescript
  export type AgentWorkOrderStatus =
    | "pending"
    | "running"
    | "completed"
    | "failed";

  export type AgentWorkflowType = "agent_workflow_plan";

  export type SandboxType = "git_branch" | "git_worktree" | "e2b" | "dagger";

  export type AgentWorkflowPhase = "planning" | "completed";

  export interface AgentWorkOrder {
    agent_work_order_id: string;
    repository_url: string;
    sandbox_identifier: string;
    git_branch_name: string | null;
    agent_session_id: string | null;
    workflow_type: AgentWorkflowType;
    sandbox_type: SandboxType;
    github_issue_number: string | null;
    status: AgentWorkOrderStatus;
    current_phase: AgentWorkflowPhase | null;
    created_at: string;
    updated_at: string;
    github_pull_request_url: string | null;
    git_commit_count: number;
    git_files_changed: number;
    error_message: string | null;
  }

  export interface CreateAgentWorkOrderRequest {
    repository_url: string;
    sandbox_type: SandboxType;
    workflow_type: AgentWorkflowType;
    github_issue_number?: string;
  }

  export interface GitProgressSnapshot {
    agent_work_order_id: string;
    current_phase: AgentWorkflowPhase;
    git_commit_count: number;
    git_files_changed: number;
    latest_commit_message: string | null;
  }
  ```

### Frontend - Service

#### Implement service layer

- Create `archon-ui-main/src/features/agent-work-orders/services/agentWorkOrderService.ts`
- Follow PRD API endpoints:

  ```typescript
  export const agentWorkOrderService = {
    async listAgentWorkOrders(): Promise<AgentWorkOrder[]> {
      const response = await callAPIWithETag<AgentWorkOrder[]>(
        "/api/agent-work-orders/agent-work-orders",
      );
      return response || [];
    },

    async getAgentWorkOrder(id: string): Promise<AgentWorkOrder> {
      return await callAPIWithETag<AgentWorkOrder>(
        `/api/agent-work-orders/agent-work-orders/${id}`,
      );
    },

    async createAgentWorkOrder(
      request: CreateAgentWorkOrderRequest,
    ): Promise<AgentWorkOrderResponse> {
      const response = await fetch("/api/agent-work-orders/agent-work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error("Failed to create agent work order");
      return response.json();
    },

    async getGitProgress(id: string): Promise<GitProgressSnapshot> {
      return await callAPIWithETag<GitProgressSnapshot>(
        `/api/agent-work-orders/agent-work-orders/${id}/git-progress`,
      );
    },

    async sendPrompt(id: string, prompt: string): Promise<void> {
      const response = await fetch(
        `/api/agent-work-orders/agent-work-orders/${id}/prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_work_order_id: id,
            prompt_text: prompt,
          }),
        },
      );
      if (!response.ok) throw new Error("Failed to send prompt");
    },

    async verifyRepository(
      url: string,
    ): Promise<GitHubRepositoryVerificationResponse> {
      const response = await fetch(
        "/api/agent-work-orders/github/verify-repository",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repository_url: url }),
        },
      );
      if (!response.ok) throw new Error("Failed to verify repository");
      return response.json();
    },
  };
  ```

### Frontend - Hooks

#### Implement query hooks

- Create `archon-ui-main/src/features/agent-work-orders/hooks/useAgentWorkOrderQueries.ts`
- Query keys:
  ```typescript
  export const agentWorkOrderKeys = {
    all: ["agent-work-orders"] as const,
    lists: () => [...agentWorkOrderKeys.all, "list"] as const,
    detail: (id: string) => [...agentWorkOrderKeys.all, "detail", id] as const,
    gitProgress: (id: string) =>
      [...agentWorkOrderKeys.all, "git-progress", id] as const,
  };
  ```
- Hooks with smart polling:

  ```typescript
  export function useAgentWorkOrders() {
    return useQuery({
      queryKey: agentWorkOrderKeys.lists(),
      queryFn: agentWorkOrderService.listAgentWorkOrders,
      refetchInterval: (data) => {
        const hasRunning = data?.some((wo) => wo.status === "running");
        return hasRunning ? 3000 : false; // 3s polling per PRD
      },
    });
  }

  export function useAgentWorkOrderDetail(id: string | undefined) {
    return useQuery({
      queryKey: id ? agentWorkOrderKeys.detail(id) : ["disabled"],
      queryFn: () =>
        id ? agentWorkOrderService.getAgentWorkOrder(id) : Promise.reject(),
      enabled: !!id,
      refetchInterval: (data) => {
        return data?.status === "running" ? 3000 : false;
      },
    });
  }

  export function useGitProgress(id: string | undefined) {
    return useQuery({
      queryKey: id ? agentWorkOrderKeys.gitProgress(id) : ["disabled"],
      queryFn: () =>
        id ? agentWorkOrderService.getGitProgress(id) : Promise.reject(),
      enabled: !!id,
      refetchInterval: 3000, // Always poll for progress
    });
  }

  export function useCreateAgentWorkOrder() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: agentWorkOrderService.createAgentWorkOrder,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: agentWorkOrderKeys.lists() });
      },
    });
  }
  ```

### Frontend - Components

#### Create repository connector

- Create `archon-ui-main/src/features/agent-work-orders/components/RepositoryConnector.tsx`
- Input for repository URL
- "Verify & Connect" button
- Display verification result
- Show repository info (owner, name, default branch)

#### Create sandbox selector

- Create `archon-ui-main/src/features/agent-work-orders/components/SandboxSelector.tsx`
- Radio buttons for: git_branch (enabled), git_worktree (disabled), e2b (disabled), dagger (disabled)
- Descriptions from PRD
- "Coming Soon" labels for disabled options

#### Create workflow selector

- Create `archon-ui-main/src/features/agent-work-orders/components/WorkflowSelector.tsx`
- Radio buttons for workflow types
- For MVP: only `agent_workflow_plan` enabled
- Others disabled with "Coming Soon"

#### Create agent prompt interface

- Create `archon-ui-main/src/features/agent-work-orders/components/AgentPromptInterface.tsx`
- Textarea for prompts
- "Execute" button
- Display current status
- Show current phase badge
- Use `useSendPrompt` hook

#### Create phase tracker

- Create `archon-ui-main/src/features/agent-work-orders/components/PhaseTracker.tsx`
- Display workflow phases: PLANNING → COMPLETED
- Visual indicators per PRD (✅ ✓ ⏳)
- Show git statistics from `GitProgressSnapshot`
- Display: commit count, files changed, latest commit
- Links to branch and PR

#### Create list components

- Create card component for list view
- Create list component with grid layout
- Show: ID, repo, status, phase, created time
- Click to navigate to detail

### Frontend - Views

#### Create main view

- Create `archon-ui-main/src/features/agent-work-orders/views/AgentWorkOrdersView.tsx`
- Three-step wizard:
  1. Repository Connector
  2. Sandbox Selector + Workflow Selector
  3. Agent Prompt Interface (after creation)
- Agent work order list below
- Follow PRD user workflow

#### Create detail view

- Create `archon-ui-main/src/features/agent-work-orders/views/AgentWorkOrderDetailView.tsx`
- Display all work order fields
- PhaseTracker component
- AgentPromptInterface for interactive prompting
- Git progress display
- Link to GitHub branch and PR
- Back navigation

#### Create page and navigation

- Create page wrapper with error boundary
- Add to navigation menu
- Add routing

### Command File

#### Create planning workflow command

- User creates `.claude/commands/agent_workflow_plan.md`
- Example content:

  ```markdown
  # Agent Workflow: Plan

  Create a detailed implementation plan for the given GitHub issue.

  Steps:

  1. Read the issue description
  2. Analyze requirements
  3. Create plan.md in specs/ directory
  4. Commit changes to git
  ```

- Instruct user to create this file

### Testing

#### Write comprehensive tests

- Test all modules independently
- Mock external dependencies (subprocess, git, gh CLI)
- Test API endpoints with TestClient
- Test frontend hooks with mocked services
- Aim for >80% coverage

### Validation

#### Run all validation commands

- Execute commands from "Validation Commands" section
- Verify zero regressions
- Test standalone mode
- Test integrated mode

## Testing Strategy

### Unit Tests

**Backend** (all in `python/tests/agent_work_orders/`):

- Model validation
- Sandbox manager (mocked subprocess)
- Agent executor (mocked subprocess)
- Command loader (fixture files)
- GitHub client (mocked gh CLI)
- Phase tracker (fixture git repos)
- Workflow orchestrator (mocked dependencies)
- State repository

**Frontend**:

- Query hooks
- Service methods
- Type definitions

### Integration Tests

**Backend**:

- Full API flow with TestClient
- Workflow execution (may need real git repo)

**Frontend**:

- Component rendering
- User workflows

### Edge Cases

- Invalid repository URL
- Repository not accessible
- Command file not found
- Agent execution timeout
- Git operations fail
- GitHub PR creation fails
- Network errors during polling
- Work order completes while viewing detail

## Acceptance Criteria

**Architecture**:

- ✅ Complete isolation in `python/src/agent_work_orders/`
- ✅ PRD naming conventions followed exactly
- ✅ Modular structure per PRD (agent_executor, sandbox_manager, etc.)
- ✅ Structured logging with structlog
- ✅ Git-first philosophy (agent creates branch)
- ✅ Minimal state (5 core fields)
- ✅ Workflow-based execution

**Functionality**:

- ✅ Verify GitHub repository
- ✅ Select sandbox type (git branch only for MVP)
- ✅ Select workflow type (plan only for MVP)
- ✅ Create agent work order
- ✅ Execute `agent_workflow_plan` workflow
- ✅ Agent creates git branch during execution
- ✅ Track phases via git inspection (planning → completed)
- ✅ Display git progress (commits, files)
- ✅ Create GitHub PR automatically
- ✅ Interactive prompting (send prompts to running agent)
- ✅ View work orders in list
- ✅ View work order details with real-time updates

**PRD Compliance**:

- ✅ All models use PRD names (`AgentWorkOrder`, not `WorkOrder`)
- ✅ All endpoints follow PRD spec
- ✅ Logs endpoint exists (returns empty for MVP)
- ✅ Git progress endpoint exists
- ✅ Repository verification endpoint exists
- ✅ Structured logging event names follow PRD convention
- ✅ Phase tracking works per PRD specification

**Testing**:

- ✅ >80% test coverage
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ No regressions

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

**Module Tests** (isolated):

- `cd python && uv run pytest tests/agent_work_orders/ -v` - All tests
- `cd python && uv run pytest tests/agent_work_orders/test_models.py -v` - Models
- `cd python && uv run pytest tests/agent_work_orders/test_sandbox_manager.py -v` - Sandbox
- `cd python && uv run pytest tests/agent_work_orders/test_agent_executor.py -v` - Executor
- `cd python && uv run pytest tests/agent_work_orders/test_workflow_engine.py -v` - Workflows
- `cd python && uv run pytest tests/agent_work_orders/test_api.py -v` - API

**Code Quality**:

- `cd python && uv run ruff check src/agent_work_orders/` - Lint
- `cd python && uv run mypy src/agent_work_orders/` - Type check

**Regression Tests**:

- `cd python && uv run pytest` - All backend tests
- `cd python && uv run ruff check` - Lint entire codebase

**Frontend**:

- `cd archon-ui-main && npm run test features/agent-work-orders` - Feature tests
- `cd archon-ui-main && npm run biome:check` - Lint/format
- `cd archon-ui-main && npx tsc --noEmit` - Type check

**Integration**:

- `docker compose build` - Build succeeds
- `docker compose up -d` - Start services
- `curl http://localhost:8181/api/agent-work-orders/health` - Health check
- `curl http://localhost:8181/api/agent-work-orders/agent-work-orders` - List endpoint

**Standalone Mode**:

- `cd python && uv run uvicorn agent_work_orders.main:app --port 8888` - Run standalone
- `curl http://localhost:8888/health` - Standalone health
- `curl http://localhost:8888/agent-work-orders` - Standalone list

**Manual E2E** (Critical):

- Open `http://localhost:3737/agent-work-orders`
- Verify repository connection flow
- Select git branch sandbox
- Select agent_workflow_plan workflow
- Create work order with GitHub issue number
- Verify status changes: pending → running → completed
- Verify phase updates in UI (planning → completed)
- Verify git progress displays (commits, files)
- Verify PR created in GitHub
- Send interactive prompt to running agent
- View logs (should be empty for MVP)

**PRD Compliance Checks**:

- Verify all API endpoints match PRD specification
- Verify structured log event names follow PRD convention
- Verify git-first approach (branch created by agent, not pre-created)
- Verify minimal state (only 5 core fields stored)
- Verify workflow-based execution (not generic prompts)

## Notes

### PRD Compliance

This MVP is **minimal but fully compliant** with the PRD:

**What's Included from PRD "Must Have":**

- ✅ Accept work order requests via HTTP POST
- ✅ Execute agent workflows (just `plan` for MVP)
- ✅ Commit all agent changes to git
- ✅ Create GitHub PRs automatically
- ✅ Work order status via HTTP GET (polling)
- ✅ Structured logging with correlation IDs
- ✅ Modular architecture

**What's Included from PRD "Should Have":**

- ✅ Support predefined workflows (1 workflow for MVP)
- ✅ GitHub repository verification UI
- ✅ Sandbox selection (git branch only)
- ✅ Interactive agent prompting
- ✅ GitHub issue integration
- ❌ Error handling and retry (basic only)

**What's Deferred to Phase 2:**

- Additional workflow types (build, test, combinations)
- Git worktree, E2B, Dagger sandboxes
- Supabase persistence
- Advanced error handling
- Work order cancellation
- Custom workflows
- Webhook triggers

### Key Differences from Previous MVP

1. **Proper Naming**: `agent_work_order` everywhere (not `work_order`)
2. **Workflow-Based**: Uses workflow types, not generic prompts
3. **Git-First**: Agent creates branch during execution
4. **Phase Tracking**: Inspects git to determine progress
5. **Structured Logging**: Uses structlog with PRD event names
6. **Command Loader**: Loads workflows from `.claude/commands/*.md`
7. **Proper Modules**: Follows PRD structure (agent_executor, sandbox_manager, etc.)
8. **Complete API**: All PRD endpoints (logs, git-progress, verify-repo, prompt)

### Dependencies

**New Dependencies to Add**:

```bash
cd python
uv add structlog  # Structured logging
```

**Existing Dependencies**:

- FastAPI, Pydantic
- subprocess, asyncio (stdlib)

### Environment Variables

```bash
CLAUDE_CLI_PATH=claude
AGENT_WORK_ORDER_TIMEOUT=300
AGENT_WORK_ORDER_COMMANDS_DIR=.claude/commands
AGENT_WORK_ORDER_TEMP_DIR=/tmp/agent-work-orders
```

### Command File Required

User must create `.claude/commands/agent_workflow_plan.md`:

```markdown
# Agent Workflow: Plan

You are executing a planning workflow for a GitHub issue.

**Your Task:**

1. Read the GitHub issue description
2. Analyze the requirements thoroughly
3. Create a detailed implementation plan
4. Save the plan to `specs/plan.md`
5. Create a git branch named `feat-issue-{issue_number}-wo-{work_order_id}`
6. Commit all changes to git with clear commit messages

**Branch Naming:**
Use format: `feat-issue-{issue_number}-wo-{work_order_id}`

**Commit Message Format:**
```

plan: Create implementation plan for issue #{issue_number}

- Analyzed requirements
- Created detailed plan
- Documented approach

Work Order: {work_order_id}

```

**Deliverables:**
- Git branch created
- specs/plan.md file with detailed plan
- All changes committed to git
```

### URL Structure

When mounted at `/api/agent-work-orders`:

- Health: `http://localhost:8181/api/agent-work-orders/health`
- Create: `POST http://localhost:8181/api/agent-work-orders/agent-work-orders`
- List: `GET http://localhost:8181/api/agent-work-orders/agent-work-orders`
- Detail: `GET http://localhost:8181/api/agent-work-orders/agent-work-orders/{id}`
- Git Progress: `GET http://localhost:8181/api/agent-work-orders/agent-work-orders/{id}/git-progress`
- Logs: `GET http://localhost:8181/api/agent-work-orders/agent-work-orders/{id}/logs`
- Prompt: `POST http://localhost:8181/api/agent-work-orders/agent-work-orders/{id}/prompt`
- Verify Repo: `POST http://localhost:8181/api/agent-work-orders/github/verify-repository`

### Success Metrics

**MVP Success**:

- Complete PRD-aligned implementation in 3-5 days
- All PRD naming conventions followed
- Structured logging working
- Phase tracking via git working
- Successfully execute planning workflow
- GitHub PR created automatically
- > 80% test coverage

**PRD Alignment Verification**:

- All model names match PRD
- All endpoint paths match PRD
- All log event names match PRD convention
- Git-first philosophy implemented correctly
- Minimal state (5 fields) implemented correctly
- Workflow-based execution working

### Code Style

**Python**:

- Use structlog for ALL logging
- Follow PRD naming conventions exactly
- Use async/await for I/O
- Type hints everywhere
- Services raise exceptions (don't return tuples)

**Frontend**:

- Follow PRD naming in types
- Use TanStack Query
- 3-second polling intervals per PRD
- Radix UI components
- Glassmorphism styling

### Development Tips

**Testing Structured Logging**:

```python
import structlog

logger = structlog.get_logger()
logger = logger.bind(agent_work_order_id="wo-test123")
logger.info("agent_work_order_created")
# Output: {"event": "agent_work_order_created", "agent_work_order_id": "wo-test123", ...}
```

**Testing Git Operations**:

```python
# Create fixture repo for tests
import tempfile
import subprocess

def create_fixture_repo():
    repo_dir = tempfile.mkdtemp()
    subprocess.run(["git", "init"], cwd=repo_dir)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo_dir)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=repo_dir)
    return repo_dir
```

**Testing Phase Tracking**:

```python
# Mock git operations to simulate phase progression
with patch("git_operations.has_planning_commits") as mock:
    mock.return_value = True
    phase = await tracker.get_current_phase("feat-wo-123")
    assert phase == AgentWorkflowPhase.COMPLETED
```

### Future Enhancements (Phase 2+)

**Easy to Add** (properly structured):

- Additional workflow types (modify workflow_definitions.py)
- Git worktree sandbox (add implementation)
- E2B sandbox (implement protocol)
- Dagger sandbox (implement protocol)
- Supabase persistence (swap state_manager implementation)
- Enhanced phase tracking (more phases)
- Logs to Supabase (implement logs endpoint fully)

### Migration Path to Phase 2

**Supabase Integration**:

1. Create table schema for agent work orders
2. Implement SupabaseWorkOrderRepository
3. Swap in state_manager initialization
4. No other changes needed (abstracted)

**Additional Sandboxes**:

1. Implement E2BSandbox(AgentSandbox)
2. Implement DaggerSandbox(AgentSandbox)
3. Update sandbox_factory
4. Enable in frontend selector

**More Workflows**:

1. Create `.claude/commands/agent_workflow_build.md`
2. Add enum value: `BUILD = "agent_workflow_build"`
3. Update phase tracker for implementation phase
4. Enable in frontend selector
