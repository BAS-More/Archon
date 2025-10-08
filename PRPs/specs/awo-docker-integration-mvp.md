# Feature: Agent Work Orders Docker Integration (MVP)

## Feature Description

Containerize the Agent Work Orders (AWO) system as a Docker service integrated into Archon's docker-compose architecture. This MVP focuses on getting AWO running reliably in Docker with Claude Code CLI executing inside the container, persistent storage for repositories, and proper authentication for GitHub and Anthropic services.

The scope is deliberately minimal: Docker integration, Claude CLI setup, and persistent volumes. Advanced features like Supabase state persistence, Settings UI integration, and automated cleanup are deferred to future phases per the PRD.

## User Story

As an Archon developer
I want the Agent Work Orders system to run as a Docker container alongside other Archon services
So that I can develop and deploy AWO with the same tooling as the rest of Archon, with persistent repository storage and reliable Claude Code CLI execution

## Problem Statement

Agent Work Orders currently runs standalone outside Docker, creating deployment and development friction:

**Current State:**
- Manual startup: `cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888`
- Not in `docker-compose.yml` - separate from Archon's architecture
- Repositories cloned to `/tmp/agent-work-orders/` - lost on reboot
- Claude Code CLI runs on **host machine**, not in container
- No integration with `make dev` or `make dev-docker`
- Configuration scattered across environment variables

**Critical Issue - Claude CLI Execution:**
The biggest problem: if AWO runs in Docker, but Claude Code CLI executes on the host, you get:
- Path mismatches (container paths vs host paths)
- File access issues (container can't access host files easily)
- Authentication complexity (credentials in two places)
- Deployment failures (production servers won't have Claude CLI installed)

**Example Failure Scenario:**
```
1. AWO (in Docker) clones repo to /var/lib/archon-awo/repositories/wo-123/repo
2. AWO calls: `claude --print "implement feature" /var/lib/archon-awo/...`
3. Claude CLI (on host) can't access /var/lib/archon-awo/ (it's inside Docker!)
4. Execution fails
```

## Solution Statement

Create a self-contained Docker service that runs AWO with Claude Code CLI installed and executing inside the same container:

**Architecture:**
```
┌─────────────────────────────────────────┐
│  archon-awo (Docker Container)          │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ AWO FastAPI Server (port 8888)     │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Claude Code CLI (installed)        │ │
│  │ gh CLI (installed)                 │ │
│  │ git (installed)                    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Volume: /var/lib/archon-awo/           │
│  ├── repositories/{work-order-id}/      │
│  ├── outputs/{work-order-id}/           │
│  └── logs/                              │
└─────────────────────────────────────────┘
```

**Key Principles:**
1. Everything executes inside container (no host dependencies)
2. Single Docker volume for all persistent data
3. Standard Linux paths (`/var/lib/archon-awo/`)
4. Opt-in Docker profile (like agents service)
5. Keep in-memory state (defer Supabase to Phase 2)
6. Simple environment variable configuration

## Relevant Files

Use these files to implement the feature:

**Docker Configuration:**
- `docker-compose.yml`:182 - Add `archon-awo` service definition after `archon-agents`
  - Define service with opt-in profile
  - Single volume mount for persistent data
  - Environment variables for authentication
  - Dependency on archon-server for shared config

**AWO Configuration:**
- `python/src/agent_work_orders/config.py`:17-62 - Update paths for Docker
  - Change from `/tmp/agent-work-orders/` to `/var/lib/archon-awo/`
  - Support both Docker and local development paths
  - Add Claude API key configuration

**Sandbox Manager:**
- `python/src/agent_work_orders/sandbox_manager/git_branch_sandbox.py`:30-32 - Update repository clone path
  - Use new `/var/lib/archon-awo/repositories/` location
  - Ensure directories created before clone

**Environment:**
- `.env.example`:69 - Add AWO environment variables
  - `ARCHON_AWO_PORT=8888`
  - `GITHUB_TOKEN=` (for gh CLI)
  - `ANTHROPIC_API_KEY=` (for Claude Code CLI)
  - `AWO_DATA_DIR=/var/lib/archon-awo`

**Makefile:**
- `Makefile`:24 - Add AWO development commands
  - `make dev-awo` - Start backend + AWO
  - `make awo-logs` - View AWO logs
  - `make awo-restart` - Restart AWO service

### New Files

- `python/Dockerfile.awo` - Dockerfile for AWO service
  - Install Claude Code CLI, gh CLI, git
  - Set up Python environment
  - Configure authentication
  - Create data directories

## Implementation Plan

### Phase 1: Foundation - Dockerfile and Claude CLI Setup

Create the Dockerfile with all required dependencies including Claude Code CLI. This is the critical foundation - getting Claude CLI to run inside the container.

### Phase 2: Core Implementation - Docker Compose Integration

Add AWO service to docker-compose.yml with volume configuration, environment variables, and proper dependencies.

### Phase 3: Configuration - Path Updates and Authentication

Update AWO code to use container paths and handle authentication for GitHub and Anthropic services.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### Research Claude Code CLI Installation

- Check Claude Code documentation: https://docs.claude.com/claude-code
- Determine installation method (npm, binary, or other)
- Test installation locally: `claude --version`
- Document authentication method (API key, config file, etc.)
- Test headless execution: `claude --print "test" --output-format=stream-json`
- Verify it works without interactive prompts

### Create Dockerfile for AWO Service

- Create `python/Dockerfile.awo`
- Use Python 3.12 slim base image for consistency with other services
- Install system dependencies:
  ```dockerfile
  FROM python:3.12-slim

  WORKDIR /app

  # Install system dependencies
  RUN apt-get update && apt-get install -y \
      git \
      curl \
      ca-certificates \
      gnupg \
      && rm -rf /var/lib/apt/lists/*
  ```
- Install gh CLI (GitHub CLI):
  ```dockerfile
  # Install gh CLI
  RUN mkdir -p /etc/apt/keyrings && \
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
      chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
      apt-get update && \
      apt-get install -y gh
  ```
- Install Node.js (needed for Claude Code CLI if npm-based):
  ```dockerfile
  # Install Node.js 20 LTS
  RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
      apt-get install -y nodejs
  ```
- Install Claude Code CLI (adjust based on research):
  ```dockerfile
  # Install Claude Code CLI
  # Option 1: If npm package
  RUN npm install -g @anthropic-ai/claude-code-cli

  # Option 2: If binary download
  # RUN curl -L https://github.com/anthropics/claude-code/releases/download/v1.0.0/claude-linux-x64 \
  #     -o /usr/local/bin/claude && chmod +x /usr/local/bin/claude
  ```
- Install Python dependencies with uv:
  ```dockerfile
  # Install uv
  RUN pip install --no-cache-dir uv

  # Copy dependency files
  COPY pyproject.toml uv.lock* ./

  # Install AWO dependencies
  RUN uv pip install --system --no-cache .
  ```
- Copy AWO source code:
  ```dockerfile
  # Copy AWO source
  COPY src/agent_work_orders/ src/agent_work_orders/
  COPY src/__init__.py src/
  ```
- Create data directory:
  ```dockerfile
  # Create data directory with proper permissions
  RUN mkdir -p /var/lib/archon-awo/repositories \
               /var/lib/archon-awo/outputs \
               /var/lib/archon-awo/logs && \
      chmod -R 755 /var/lib/archon-awo
  ```
- Set environment variables:
  ```dockerfile
  ENV PYTHONPATH=/app
  ENV PYTHONUNBUFFERED=1
  ENV AWO_DATA_DIR=/var/lib/archon-awo
  ENV ARCHON_AWO_PORT=8888
  ```
- Configure entry point:
  ```dockerfile
  # Health check
  HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
      CMD curl -f http://localhost:${ARCHON_AWO_PORT}/health || exit 1

  # Run server
  CMD ["sh", "-c", "uvicorn src.agent_work_orders.main:app --host 0.0.0.0 --port ${ARCHON_AWO_PORT}"]
  ```
- Save file

### Test Dockerfile Build Locally

- Build the image:
  ```bash
  cd /Users/rasmus/Projects/cole/archon
  docker build -f python/Dockerfile.awo -t archon-awo:test ./python
  ```
- Verify build succeeds without errors
- Check installed tools:
  ```bash
  docker run --rm archon-awo:test claude --version
  docker run --rm archon-awo:test gh --version
  docker run --rm archon-awo:test git --version
  docker run --rm archon-awo:test python --version
  ```
- Inspect image size: `docker images archon-awo:test`
- Document any issues and fix before proceeding

### Add AWO Service to Docker Compose

- Open `docker-compose.yml`
- Add service after `archon-agents` service (around line 182):
  ```yaml
  # Agent Work Orders Service
  archon-awo:
    profiles:
      - awo  # Opt-in profile
    build:
      context: ./python
      dockerfile: Dockerfile.awo
      args:
        BUILDKIT_INLINE_CACHE: 1
    container_name: archon-awo
    ports:
      - "${ARCHON_AWO_PORT:-8888}:${ARCHON_AWO_PORT:-8888}"
    environment:
      # Core configuration
      - ARCHON_AWO_PORT=${ARCHON_AWO_PORT:-8888}
      - AWO_DATA_DIR=/var/lib/archon-awo
      - LOG_LEVEL=${LOG_LEVEL:-INFO}

      # Authentication
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

      # Claude CLI configuration
      - CLAUDE_CLI_PATH=claude
      - GH_CLI_PATH=gh

      # Optional: Supabase for future use
      - SUPABASE_URL=${SUPABASE_URL:-}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY:-}
    networks:
      - app-network
    volumes:
      # Single volume for all persistent data
      - awo-data:/var/lib/archon-awo

      # Hot reload for development (source code)
      - ./python/src/agent_work_orders:/app/src/agent_work_orders

      # Command files
      - ./python/.claude/commands/agent-work-orders:/app/.claude/commands/agent-work-orders
    depends_on:
      archon-server:
        condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${ARCHON_AWO_PORT:-8888}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
  ```
- Add volume definition at bottom of file (in volumes section):
  ```yaml
  volumes:
    awo-data:  # Single volume for AWO data
  ```
- Save file

### Update Environment Configuration

- Open `.env.example`
- Add new section after existing port configuration (around line 37):
  ```bash
  # Agent Work Orders Configuration (Optional - requires --profile awo)
  ARCHON_AWO_PORT=8888

  # GitHub Personal Access Token (for cloning private repos and creating PRs)
  # Get from: https://github.com/settings/tokens
  # Required scopes: repo, workflow
  GITHUB_TOKEN=

  # Anthropic API Key (for Claude Code CLI)
  # Get from: https://console.anthropic.com/settings/keys
  ANTHROPIC_API_KEY=

  # AWO Data Directory (inside Docker container)
  AWO_DATA_DIR=/var/lib/archon-awo
  ```
- Add comment explaining the profile:
  ```bash
  # To enable AWO: docker compose --profile awo up -d
  ```
- Save file

### Update AWO Configuration Class

- Open `python/src/agent_work_orders/config.py`
- Replace the `AgentWorkOrdersConfig` class:
  ```python
  class AgentWorkOrdersConfig:
      """Configuration for Agent Work Orders service"""

      # ============================================================================
      # Storage Paths - Docker-aware with local development fallback
      # ============================================================================

      # Base data directory
      # Docker: /var/lib/archon-awo
      # Local dev: ./tmp/agent-work-orders
      AWO_DATA_DIR: str = os.getenv(
          "AWO_DATA_DIR",
          str(Path.cwd() / "tmp" / "agent-work-orders")
      )

      @classmethod
      def repository_dir(cls) -> Path:
          """Directory for cloned repositories"""
          return Path(cls.AWO_DATA_DIR) / "repositories"

      @classmethod
      def output_dir(cls) -> Path:
          """Directory for command outputs and artifacts"""
          return Path(cls.AWO_DATA_DIR) / "outputs"

      @classmethod
      def log_dir(cls) -> Path:
          """Directory for execution logs"""
          return Path(cls.AWO_DATA_DIR) / "logs"

      # ============================================================================
      # CLI Tool Paths
      # ============================================================================

      CLAUDE_CLI_PATH: str = os.getenv("CLAUDE_CLI_PATH", "claude")
      GH_CLI_PATH: str = os.getenv("GH_CLI_PATH", "gh")

      # ============================================================================
      # Authentication
      # ============================================================================

      GITHUB_TOKEN: str | None = os.getenv("GITHUB_TOKEN")
      ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")

      # ============================================================================
      # Execution Settings
      # ============================================================================

      EXECUTION_TIMEOUT: int = int(os.getenv("AGENT_WORK_ORDER_TIMEOUT", "3600"))
      LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

      # ============================================================================
      # Command Files Directory
      # ============================================================================

      _python_root = Path(__file__).parent.parent.parent
      _default_commands_dir = str(_python_root / ".claude" / "commands" / "agent-work-orders")
      COMMANDS_DIRECTORY: str = os.getenv("AGENT_WORK_ORDER_COMMANDS_DIR", _default_commands_dir)

      # ============================================================================
      # Claude CLI Flags
      # ============================================================================

      CLAUDE_CLI_VERBOSE: bool = os.getenv("CLAUDE_CLI_VERBOSE", "true").lower() == "true"
      _max_turns_env = os.getenv("CLAUDE_CLI_MAX_TURNS")
      CLAUDE_CLI_MAX_TURNS: int | None = int(_max_turns_env) if _max_turns_env else None
      CLAUDE_CLI_MODEL: str = os.getenv("CLAUDE_CLI_MODEL", "sonnet")
      CLAUDE_CLI_SKIP_PERMISSIONS: bool = os.getenv("CLAUDE_CLI_SKIP_PERMISSIONS", "true").lower() == "true"

      # ============================================================================
      # Artifact Logging
      # ============================================================================

      ENABLE_PROMPT_LOGGING: bool = os.getenv("ENABLE_PROMPT_LOGGING", "true").lower() == "true"
      ENABLE_OUTPUT_ARTIFACTS: bool = os.getenv("ENABLE_OUTPUT_ARTIFACTS", "true").lower() == "true"

      # ============================================================================
      # Deprecated - Backward Compatibility
      # ============================================================================

      TEMP_DIR_BASE: str = AWO_DATA_DIR  # Old name, keep for compatibility

      @classmethod
      def ensure_directories(cls) -> None:
          """Ensure all required directories exist"""
          for directory in [cls.repository_dir(), cls.output_dir(), cls.log_dir()]:
              directory.mkdir(parents=True, exist_ok=True)
  ```
- Update any references to `ensure_temp_dir()` to use `ensure_directories()`
- Save file

### Update Sandbox Manager Paths

- Open `python/src/agent_work_orders/sandbox_manager/git_branch_sandbox.py`
- Update `__init__` method (around line 27):
  ```python
  def __init__(self, repository_url: str, sandbox_identifier: str):
      self.repository_url = repository_url
      self.sandbox_identifier = sandbox_identifier

      # Ensure directories exist
      config.ensure_directories()

      # Use configurable repository directory
      self.working_dir = str(config.repository_dir() / sandbox_identifier)

      self._logger = logger.bind(
          sandbox_identifier=sandbox_identifier,
          repository_url=repository_url,
          working_dir=self.working_dir,
      )
  ```
- Save file

### Update Agent Executor for Container Environment

- Open `python/src/agent_work_orders/agent_executor/agent_cli_executor.py`
- Verify Claude CLI path is configurable (should already use `config.CLAUDE_CLI_PATH`)
- Ensure all file operations use absolute paths from config
- Add logging for CLI tool versions on first use:
  ```python
  # In __init__ or first execution
  self._logger.info(
      "cli_tools_configured",
      claude_cli_path=config.CLAUDE_CLI_PATH,
      gh_cli_path=config.GH_CLI_PATH,
  )
  ```
- Save file

### Update Makefile with AWO Commands

- Open `Makefile`
- Add new commands after line 24 (after `check` target):
  ```makefile
  # Agent Work Orders development
  dev-awo: check
  	@echo "Starting development with Agent Work Orders..."
  	@echo "Backend + AWO: Docker | Frontend: Local with hot reload"
  	@$(COMPOSE) --profile awo up -d --build
  	@set -a; [ -f .env ] && . ./.env; set +a; \
  	echo "Backend running at http://$${HOST:-localhost}:$${ARCHON_SERVER_PORT:-8181}"; \
  	echo "AWO running at http://$${HOST:-localhost}:$${ARCHON_AWO_PORT:-8888}"
  	@echo "Starting frontend..."
  	@cd archon-ui-main && \
  	VITE_ARCHON_SERVER_PORT=$${ARCHON_SERVER_PORT:-8181} \
  	npm run dev

  # View AWO logs
  awo-logs:
  	@echo "Viewing AWO logs (Ctrl+C to exit)..."
  	@$(COMPOSE) logs -f archon-awo

  # Restart AWO service
  awo-restart:
  	@echo "Restarting AWO service..."
  	@$(COMPOSE) restart archon-awo
  	@echo "✓ AWO restarted"

  # Shell into AWO container
  awo-shell:
  	@echo "Opening shell in AWO container..."
  	@$(COMPOSE) exec archon-awo /bin/bash
  ```
- Update help text:
  ```makefile
  help:
  	@echo "Archon Development Commands"
  	@echo "==========================="
  	@echo "  make dev         - Backend in Docker, frontend local (recommended)"
  	@echo "  make dev-awo     - Backend + AWO in Docker, frontend local"
  	@echo "  make dev-docker  - Everything in Docker"
  	@echo "  make awo-logs    - View Agent Work Orders logs"
  	@echo "  make awo-restart - Restart AWO service"
  	@echo "  make awo-shell   - Shell into AWO container"
  	@echo "  make stop        - Stop all services"
  	# ... rest of help
  ```
- Update `stop` target to include awo profile:
  ```makefile
  stop:
  	@echo "Stopping all services..."
  	@$(COMPOSE) --profile backend --profile frontend --profile full --profile awo down
  	@echo "✓ Services stopped"
  ```
- Save file

### Create Local .env File

- Copy example: `cp .env.example .env`
- Add your actual credentials:
  - `GITHUB_TOKEN=ghp_...` (your actual token)
  - `ANTHROPIC_API_KEY=sk-ant-...` (your actual key)
- Verify ports don't conflict:
  ```bash
  lsof -i :8888
  # If in use, change ARCHON_AWO_PORT in .env
  ```
- Save file

### Test Docker Build End-to-End

- Build with docker-compose:
  ```bash
  docker compose --profile awo build archon-awo
  ```
- Verify build completes without errors
- Check build output for any warnings
- Inspect final image:
  ```bash
  docker images | grep archon-awo
  ```
- Expected size: ~500MB-1GB (depending on Node.js + Claude CLI)

### Test AWO Container Startup

- Start AWO service:
  ```bash
  docker compose --profile awo up -d archon-awo
  ```
- Watch startup logs:
  ```bash
  docker compose logs -f archon-awo
  ```
- Verify container is running:
  ```bash
  docker compose ps archon-awo
  ```
- Test health endpoint:
  ```bash
  curl http://localhost:8888/health | jq
  ```
- Expected output: `{"status": "healthy", "service": "agent-work-orders", "version": "0.1.0"}`

### Verify Claude CLI Inside Container

- Shell into container:
  ```bash
  docker compose exec archon-awo /bin/bash
  ```
- Check Claude CLI:
  ```bash
  claude --version
  which claude
  ```
- Check gh CLI:
  ```bash
  gh --version
  which gh
  ```
- Check git:
  ```bash
  git --version
  ```
- Test Claude CLI authentication:
  ```bash
  # Test simple execution
  echo "test prompt" > /tmp/test.txt
  claude --print /tmp/test.txt --output-format=stream-json 2>&1 | head -20
  ```
- Exit container: `exit`

### Verify Volume Persistence

- Check volume created:
  ```bash
  docker volume ls | grep awo-data
  ```
- Inspect volume:
  ```bash
  docker volume inspect archon_awo-data
  ```
- Check directory structure inside container:
  ```bash
  docker compose exec archon-awo ls -la /var/lib/archon-awo/
  ```
- Expected: `repositories/`, `outputs/`, `logs/` directories
- Create test file in volume:
  ```bash
  docker compose exec archon-awo touch /var/lib/archon-awo/test-persistence.txt
  ```
- Restart container:
  ```bash
  docker compose restart archon-awo
  ```
- Verify file persists:
  ```bash
  docker compose exec archon-awo ls /var/lib/archon-awo/test-persistence.txt
  ```

### Test Work Order Execution

- Create a test work order via API:
  ```bash
  curl -X POST http://localhost:8888/agent-work-orders \
    -H "Content-Type: application/json" \
    -d '{
      "repository_url": "https://github.com/Wirasm/dylan.git",
      "sandbox_type": "git_branch",
      "workflow_type": "agent_workflow_plan",
      "user_request": "Test Docker integration - add a simple README file"
    }' | jq
  ```
- Note the `agent_work_order_id` from response
- Monitor logs:
  ```bash
  docker compose logs -f archon-awo
  ```
- Check repository was cloned:
  ```bash
  docker compose exec archon-awo ls -la /var/lib/archon-awo/repositories/
  ```
- Should see directory for work order ID
- Check inside repository:
  ```bash
  docker compose exec archon-awo ls -la /var/lib/archon-awo/repositories/sandbox-wo-{ID}/
  ```
- Should see cloned repository contents

### Test Hot Reload in Development

- Make a simple change to AWO code:
  - Edit `python/src/agent_work_orders/main.py`
  - Change version in health endpoint: `"version": "0.1.1-test"`
- Wait a few seconds for uvicorn to reload
- Check logs for reload message:
  ```bash
  docker compose logs archon-awo | grep -i reload
  ```
- Test updated endpoint:
  ```bash
  curl http://localhost:8888/health | jq
  ```
- Should see new version number
- Revert change back to `"0.1.0"`

### Test with make Commands

- Stop current container:
  ```bash
  docker compose --profile awo down
  ```
- Test `make dev-awo`:
  ```bash
  make dev-awo
  ```
- Verify AWO starts with backend
- Frontend should start and show Vite dev server
- Test `make awo-logs` (in new terminal):
  ```bash
  make awo-logs
  ```
- Test `make awo-restart`:
  ```bash
  make awo-restart
  ```
- Test `make stop`:
  ```bash
  make stop
  ```
- All services should stop cleanly

### Write Integration Tests

- Create `python/tests/agent_work_orders/test_docker_integration.py`:
  ```python
  """Docker integration tests for AWO

  Tests Docker-specific functionality like paths, volumes, and CLI tools.
  """

  import pytest
  from pathlib import Path

  from src.agent_work_orders.config import config


  def test_data_directory_configured():
      """Test that AWO_DATA_DIR is configured"""
      assert config.AWO_DATA_DIR
      assert isinstance(config.AWO_DATA_DIR, str)


  def test_repository_directory_path():
      """Test repository directory path construction"""
      repo_dir = config.repository_dir()
      assert isinstance(repo_dir, Path)
      assert repo_dir.name == "repositories"


  def test_output_directory_path():
      """Test output directory path construction"""
      output_dir = config.output_dir()
      assert isinstance(output_dir, Path)
      assert output_dir.name == "outputs"


  def test_log_directory_path():
      """Test log directory path construction"""
      log_dir = config.log_dir()
      assert isinstance(log_dir, Path)
      assert log_dir.name == "logs"


  def test_directories_can_be_created():
      """Test that ensure_directories creates all required directories"""
      config.ensure_directories()

      assert config.repository_dir().exists()
      assert config.output_dir().exists()
      assert config.log_dir().exists()


  def test_cli_tools_configured():
      """Test that CLI tools are configured"""
      assert config.CLAUDE_CLI_PATH
      assert config.GH_CLI_PATH

      # Should have sensible defaults
      assert config.CLAUDE_CLI_PATH in ["claude", "/usr/local/bin/claude"]
      assert config.GH_CLI_PATH in ["gh", "/usr/local/bin/gh"]


  def test_authentication_optional():
      """Test that authentication is optional (not required for tests)"""
      # These can be None in test environment
      assert config.GITHUB_TOKEN is None or isinstance(config.GITHUB_TOKEN, str)
      assert config.ANTHROPIC_API_KEY is None or isinstance(config.ANTHROPIC_API_KEY, str)
  ```
- Save file
- Run tests:
  ```bash
  cd python && uv run pytest tests/agent_work_orders/test_docker_integration.py -v
  ```
- Verify all tests pass

### Run Full Test Suite

- Run all AWO tests:
  ```bash
  cd python && uv run pytest tests/agent_work_orders/ -v
  ```
- Verify no regressions
- Check for any test failures related to path changes
- Fix any failing tests
- Run with coverage:
  ```bash
  cd python && uv run pytest tests/agent_work_orders/ --cov=src/agent_work_orders --cov-report=term-missing
  ```
- Target: >80% coverage maintained

### Update Documentation

- Update `README.md` to include AWO Docker instructions:
  - Add section under "What's Included" about Agent Work Orders
  - Document `--profile awo` flag
  - Add to Quick Test section
  - Document required environment variables
- Create brief AWO quickstart in README:
  ```markdown
  ## Agent Work Orders (Optional)

  Enable AI-driven development workflows with GitHub integration:

  ```bash
  # Add to .env:
  GITHUB_TOKEN=ghp_your_token_here
  ANTHROPIC_API_KEY=sk-ant_your_key_here

  # Start with AWO enabled:
  docker compose --profile awo up -d

  # Or using make:
  make dev-awo
  ```

  Access API at http://localhost:8888/docs
  ```
- Save README changes

### Create Troubleshooting Guide

- Create `docs/agent-work-orders-docker.md`:
  ```markdown
  # Agent Work Orders Docker Guide

  ## Quick Start

  1. Add credentials to `.env`:
     ```bash
     GITHUB_TOKEN=ghp_...
     ANTHROPIC_API_KEY=sk-ant-...
     ```

  2. Start AWO:
     ```bash
     docker compose --profile awo up -d
     ```

  3. Verify:
     ```bash
     curl http://localhost:8888/health
     ```

  ## Troubleshooting

  ### Container won't start

  Check logs:
  ```bash
  docker compose logs archon-awo
  ```

  ### Claude CLI not working

  Verify installation:
  ```bash
  docker compose exec archon-awo claude --version
  ```

  Check API key:
  ```bash
  docker compose exec archon-awo env | grep ANTHROPIC_API_KEY
  ```

  ### Repository clone fails

  Check GitHub token:
  ```bash
  docker compose exec archon-awo gh auth status
  ```

  ### Volume permission errors

  Check ownership:
  ```bash
  docker compose exec archon-awo ls -la /var/lib/archon-awo/
  ```

  ## Development

  - **Hot reload**: Edit files in `python/src/agent_work_orders/`
  - **View logs**: `make awo-logs`
  - **Restart**: `make awo-restart`
  - **Shell access**: `make awo-shell`

  ## Volume Management

  View volume:
  ```bash
  docker volume inspect archon_awo-data
  ```

  Backup volume:
  ```bash
  docker run --rm -v archon_awo-data:/data -v $(pwd):/backup \
    alpine tar czf /backup/awo-backup.tar.gz /data
  ```

  Restore volume:
  ```bash
  docker run --rm -v archon_awo-data:/data -v $(pwd):/backup \
    alpine tar xzf /backup/awo-backup.tar.gz -C /
  ```
  ```
- Save file

### Final Validation

Execute every validation command to ensure everything works:

```bash
# Build and start
docker compose --profile awo up -d --build

# Health check
curl http://localhost:8888/health | jq

# Check Claude CLI
docker compose exec archon-awo claude --version

# Check gh CLI
docker compose exec archon-awo gh --version

# Check volumes
docker volume ls | grep awo
docker volume inspect archon_awo-data | jq

# Check directory structure
docker compose exec archon-awo ls -la /var/lib/archon-awo/

# Run tests
cd python && uv run pytest tests/agent_work_orders/ -v

# Test hot reload (change version in main.py, verify)
curl http://localhost:8888/health | jq .version

# Test work order creation
curl -X POST http://localhost:8888/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{"repository_url":"https://github.com/Wirasm/dylan.git","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","user_request":"Test"}' | jq

# Check logs
docker compose logs archon-awo --tail=50

# Verify make commands
make awo-logs
make awo-restart
make stop

# Cleanup
docker compose --profile awo down
```

## Testing Strategy

### Unit Tests

**Configuration Tests:**
- Test config loads from environment variables
- Test default values for local development
- Test Docker paths vs local paths
- Test directory creation methods

**Path Tests:**
- Test repository_dir() returns correct Path
- Test output_dir() returns correct Path
- Test log_dir() returns correct Path
- Test ensure_directories() creates all directories

### Integration Tests

**Docker Container Tests:**
- Test container starts successfully
- Test health check endpoint responds
- Test Claude CLI is accessible in container
- Test gh CLI is accessible in container
- Test git is accessible in container

**Volume Tests:**
- Test volume is created
- Test data persists across container restarts
- Test directory structure is correct
- Test file permissions are correct

**Authentication Tests:**
- Test GITHUB_TOKEN is available in container
- Test ANTHROPIC_API_KEY is available in container
- Test gh CLI can authenticate
- Test Claude CLI can authenticate

### Edge Cases

**Missing Dependencies:**
- Claude CLI not installed (build should fail)
- gh CLI not installed (build should fail)
- git not installed (build should fail)

**Missing Authentication:**
- No GITHUB_TOKEN (should fail when accessing private repos)
- No ANTHROPIC_API_KEY (Claude CLI should fail)
- Invalid tokens (should give clear error messages)

**Volume Issues:**
- Volume full (should fail gracefully)
- Volume permission denied (should fail with clear error)
- Volume not mounted (should detect and error)

**Path Issues:**
- Working directory doesn't exist (should create)
- Permission denied on directory creation (should fail)
- Paths exceed maximum length (should handle gracefully)

## Acceptance Criteria

**Docker Integration:**
- ✅ AWO service defined in docker-compose.yml with `--profile awo`
- ✅ Dockerfile.awo builds successfully
- ✅ Container starts and passes health checks
- ✅ Service accessible at http://localhost:8888
- ✅ Depends on archon-server properly

**Claude Code CLI:**
- ✅ Claude CLI installed in container
- ✅ Claude CLI executes successfully inside container
- ✅ Claude CLI authenticated with ANTHROPIC_API_KEY
- ✅ Claude CLI can access files in /var/lib/archon-awo/
- ✅ JSONL output parsing works correctly

**Git Integration:**
- ✅ git CLI installed in container
- ✅ gh CLI installed in container
- ✅ gh CLI authenticated with GITHUB_TOKEN
- ✅ Can clone public repositories
- ✅ Can clone private repositories (with token)

**Volume Persistence:**
- ✅ Single volume `awo-data` created
- ✅ Volume mounted at /var/lib/archon-awo/
- ✅ Repositories persist across container restarts
- ✅ Outputs persist across container restarts
- ✅ Logs persist across container restarts

**Configuration:**
- ✅ Config loads from environment variables
- ✅ Paths work in both Docker and local development
- ✅ Authentication configured via .env
- ✅ All required env vars documented in .env.example

**Developer Experience:**
- ✅ `make dev-awo` starts AWO with backend
- ✅ `make awo-logs` shows logs
- ✅ `make awo-restart` restarts service
- ✅ `make awo-shell` provides container access
- ✅ Hot reload works in development mode
- ✅ `make stop` stops AWO service

**Testing:**
- ✅ All existing tests pass
- ✅ New Docker integration tests pass
- ✅ Test coverage >80% maintained
- ✅ Manual end-to-end test passes

**Documentation:**
- ✅ README updated with AWO instructions
- ✅ .env.example has all AWO variables
- ✅ Troubleshooting guide created
- ✅ Docker-specific docs written

## Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

```bash
# Build image
docker build -f python/Dockerfile.awo -t archon-awo:test ./python

# Verify CLI tools installed
docker run --rm archon-awo:test claude --version
docker run --rm archon-awo:test gh --version
docker run --rm archon-awo:test git --version

# Start with docker-compose
docker compose --profile awo up -d --build

# Health check
curl http://localhost:8888/health | jq

# Verify volume
docker volume ls | grep awo-data
docker volume inspect archon_awo-data | jq

# Check directory structure
docker compose exec archon-awo ls -la /var/lib/archon-awo/

# Verify environment variables
docker compose exec archon-awo env | grep -E "(GITHUB_TOKEN|ANTHROPIC_API_KEY|AWO_DATA_DIR)"

# Test CLI tools in container
docker compose exec archon-awo claude --version
docker compose exec archon-awo gh --version

# Create test work order
curl -X POST http://localhost:8888/agent-work-orders \
  -H "Content-Type: application/json" \
  -d '{"repository_url":"https://github.com/Wirasm/dylan.git","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","user_request":"Add README"}' | jq

# View logs
docker compose logs archon-awo --tail=100

# Test persistence (restart and verify volume)
docker compose restart archon-awo
sleep 5
docker compose exec archon-awo ls /var/lib/archon-awo/repositories/

# Run tests
cd python && uv run pytest tests/agent_work_orders/ -v
cd python && uv run pytest tests/agent_work_orders/test_docker_integration.py -v

# Test make commands
make awo-logs
make awo-restart
make awo-shell
make stop

# Resource usage
docker stats archon-awo --no-stream

# Cleanup
docker compose --profile awo down
docker volume rm archon_awo-data
```

## Notes

### Critical Decision: Claude CLI Installation Method

**Need to verify:**
1. Is Claude Code CLI distributed as npm package or binary?
2. What's the official installation command?
3. Does it require Node.js?
4. How does authentication work in headless mode?

**Action:** Research Claude Code CLI docs before implementing Dockerfile.

### Docker Volume vs Bind Mount

**Using Named Volume (awo-data):**
- ✅ Docker-managed, portable
- ✅ Better performance on Mac/Windows
- ✅ Easier backup with Docker commands
- ❌ Not easily accessible from host filesystem

**Alternative - Bind Mount:**
```yaml
volumes:
  - ./data/agent-work-orders:/var/lib/archon-awo
```
- ✅ Easy to inspect from host
- ❌ Permission issues on Linux
- ❌ Slower on Mac/Windows

**Decision:** Use named volume for production-ready approach.

### Authentication Handling

**GitHub Token:**
- Passed via environment variable
- gh CLI uses: `gh auth login --with-token < token`
- Or: `GITHUB_TOKEN` env var (simpler)

**Anthropic API Key:**
- Passed via environment variable
- Claude CLI likely uses: `ANTHROPIC_API_KEY` env var
- Or config file at `~/.claude/config.json`

**Best Practice:** Environment variables for both (simpler, more secure in Docker).

### Why Keep In-Memory State for MVP

**In-Memory (Current):**
- ✅ Simple, no database setup required
- ✅ Fast for MVP
- ✅ PRD says "Phase 2+" for Supabase
- ❌ Lost on container restart
- ❌ Can't scale horizontally

**Supabase (Future):**
- ✅ Persistent across restarts
- ✅ Multi-instance support
- ✅ Better for production
- ❌ More complex setup
- ❌ Not needed for MVP testing

**Decision:** In-memory for MVP, Supabase in Phase 2.

### Future Enhancements (Not MVP)

**Phase 2:**
- Migrate state to Supabase
- Add proper work order persistence
- Step history in database

**Phase 3:**
- Settings UI integration
- Encrypted credential storage
- Web-based work order monitoring

**Phase 4:**
- Automated cleanup jobs
- Repository caching
- Multi-instance coordination

### Resource Requirements

**Estimated Container Size:**
- Base Python image: ~150MB
- Node.js (if needed): ~200MB
- Claude CLI: ~50-100MB
- Dependencies: ~100MB
- **Total:** ~500-600MB

**Runtime Memory:**
- Idle: ~100MB
- Active work order: ~500MB-1GB
- Claude CLI execution: +500MB

**Disk Space (Volume):**
- Average repository: 50-500MB
- Plan for: 10GB minimum
- Production: 50GB recommended

### Security Considerations

**Container Security:**
- TODO: Run as non-root user
- TODO: Drop unnecessary capabilities
- TODO: Read-only root filesystem where possible

**Secret Management:**
- Tokens in environment variables (acceptable for MVP)
- Future: Use Docker secrets or vault
- Never commit tokens to git

**Network Isolation:**
- Container in app-network (isolated)
- Only exposes port 8888
- No direct host access needed
