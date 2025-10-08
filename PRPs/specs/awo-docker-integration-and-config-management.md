# Feature: Agent Work Orders Docker Integration and Configuration Management

## Feature Description

Integrate the Agent Work Orders (AWO) system into Archon's Docker Compose architecture with a robust configuration management strategy. This includes containerizing the AWO service, implementing persistent storage for cloned repositories, establishing an Archon home directory structure for configuration, and creating a unified settings management system that integrates with Archon's existing credential and configuration infrastructure.

The feature addresses the growing complexity of background agent execution configuration by providing a structured, maintainable approach to managing GitHub credentials, repository storage, Claude CLI settings, and execution parameters.

## User Story

As an Archon administrator
I want the Agent Work Orders system to be fully integrated into Archon's Docker setup with centralized configuration management
So that I can deploy, configure, and maintain the agent execution environment as a cohesive part of the Archon platform without manual setup or scattered configuration files

## Problem Statement

The Agent Work Orders system currently operates outside Archon's containerized architecture, creating several critical issues:

### 1. Lack of Docker Integration
- AWO runs standalone via `uv run uvicorn` on port 8888 (not in Docker)
- Not included in `docker-compose.yml` - manual startup required
- No Docker health checks or dependency management
- Not accessible via standard Archon service discovery
- Cannot benefit from Docker networking, isolation, or orchestration

### 2. Fragile Repository Management
- Repositories cloned to `/tmp/agent-work-orders/{work-order-id}/` on host
- No persistent storage - data lost on server reboot
- No cleanup strategy - `/tmp` fills up over time
- Example: Currently has 7 work orders consuming disk space indefinitely
- No volume mounts - repositories disappear when container restarts
- Git operations tied to host filesystem, not portable to Docker

### 3. Scattered Configuration
- Configuration spread across multiple locations:
  - Environment variables (`CLAUDE_CLI_PATH`, `GH_CLI_PATH`, etc.)
  - `AgentWorkOrdersConfig` class in `config.py`
  - Hardcoded defaults (`/tmp/agent-work-orders`, `claude`, `gh`)
  - GitHub token hardcoded in test commands
- No centralized configuration management
- No integration with Archon's credential system
- Settings not managed via Archon's Settings UI
- No `~/.archon` home directory for persistent config

### 4. Missing Infrastructure Integration
- Not integrated with Archon's existing services:
  - No access to Archon's Supabase connection for state persistence
  - No integration with Archon's credential/settings API
  - No shared environment configuration
  - No MCP integration for agent monitoring
- API runs on separate port (8888) vs Archon server (8181)
- No proxy configuration through main UI

### 5. Developer Experience Issues
- Manual startup required: `cd python && uv run uvicorn src.agent_work_orders.main:app --port 8888`
- Not included in `make dev` or `make dev-docker` commands
- No hot-reload in development
- Different deployment process than rest of Archon
- Configuration changes require code edits, not environment updates

### 6. Production Readiness Gaps
- No volume strategy for Docker deployment
- Repository clones not persisted across container restarts
- No backup/restore strategy for work order data
- Missing observability integration (no Logfire integration)
- No health endpoints integrated with Docker Compose
- Cannot scale horizontally (tied to local filesystem)

## Solution Statement

Implement a comprehensive Docker integration and configuration management system for Agent Work Orders:

### 1. Docker Compose Integration
- Add `archon-awo` service to `docker-compose.yml` with optional profile
- Create `python/Dockerfile.awo` following existing Archon patterns
- Configure service discovery for AWO within Docker network
- Integrate health checks and dependency management
- Add to `make dev` and `make dev-docker` commands

### 2. Persistent Repository Storage
- Create Docker volumes for:
  - `/var/archon/repositories` - Cloned Git repositories (persistent)
  - `/var/archon/work-orders` - Work order metadata and artifacts
  - `/var/archon/config` - Configuration files
- Implement structured directory layout:
  ```
  /var/archon/
  ├── repositories/
  │   └── {work-order-id}/
  │       └── {cloned-repo}/
  ├── work-orders/
  │   └── {work-order-id}/
  │       ├── prompts/
  │       ├── outputs/
  │       └── metadata.json
  └── config/
      ├── claude/
      ├── github/
      └── agent-settings.yaml
  ```
- Configure sandbox manager to use Docker volumes instead of `/tmp`
- Implement cleanup policies (configurable retention)

### 3. Centralized Configuration Management
- Create `~/.archon/` home directory structure (or Docker volume equivalent):
  ```
  ~/.archon/
  ├── config.yaml           # Main configuration
  ├── credentials/          # Encrypted credentials
  │   ├── github.json
  │   └── claude.json
  ├── repositories/         # Repository clones
  └── logs/                 # Agent execution logs
  ```
- Integrate with Archon's existing settings system:
  - Store AWO settings in Supabase `credentials` table
  - Expose settings via Archon Settings UI
  - Support encrypted credential storage
- Consolidate environment variables into structured config
- Support configuration hot-reload without restarts

### 4. Settings Management UI Integration
- Add "Agent Work Orders" section to Archon Settings page
- Expose key configuration:
  - GitHub Token (encrypted in DB)
  - Claude CLI path and model selection
  - Repository storage location
  - Cleanup policies (retention days)
  - Execution timeouts
  - Max concurrent work orders
- Real-time validation of credentials
- Test connection buttons for GitHub/Claude

### 5. Supabase State Persistence
- Migrate `WorkOrderRepository` from in-memory to Supabase
- Create database schema:
  - `agent_work_orders` table (core state)
  - `agent_work_order_steps` table (step history)
  - `agent_work_order_artifacts` table (prompts/outputs)
- Implement proper state transitions
- Enable multi-instance deployment (state in DB, not memory)

### 6. Environment Parity
- Share Supabase connection from main Archon server
- Use same credential management system
- Integrate with Archon's logging infrastructure (Logfire)
- Share Docker network for service communication
- Align port configuration with Archon's `.env` patterns

## Relevant Files

Use these files to implement the feature:

**Docker Configuration:**
- `docker-compose.yml`:180 - Add new `archon-awo` service definition with profile support
  - Define service with build context pointing to `python/Dockerfile.awo`
  - Configure port mapping `${ARCHON_AWO_PORT:-8888}:${ARCHON_AWO_PORT:-8888}`
  - Set up volume mounts for repositories, config, and work orders
  - Add dependency on `archon-server` for shared credentials
  - Configure environment variables from main `.env`

**New Dockerfile:**
- `python/Dockerfile.awo` - Create new Dockerfile for AWO service
  - Base on existing `Dockerfile.server` pattern
  - Install Claude CLI and gh CLI in container
  - Copy AWO source code (`src/agent_work_orders/`)
  - Set up entry point: `uvicorn src.agent_work_orders.main:app`
  - Configure healthcheck endpoint

**Environment Configuration:**
- `.env.example`:69 - Add AWO-specific environment variables
  - `ARCHON_AWO_PORT=8888` (service port)
  - `ARCHON_AWO_ENABLED=false` (opt-in via profile)
  - `AWO_REPOSITORY_DIR=/var/archon/repositories` (persistent storage)
  - `AWO_MAX_CONCURRENT=5` (execution limits)
  - `AWO_RETENTION_DAYS=7` (cleanup policy)

**Configuration Management:**
- `python/src/agent_work_orders/config.py`:17-62 - Refactor configuration class
  - Remove hardcoded defaults
  - Load from environment with fallbacks
  - Support volume paths for Docker (`/var/archon/*`)
  - Add `ARCHON_CONFIG_DIR` support
  - Integrate with Archon's credential service

**Sandbox Manager:**
- `python/src/agent_work_orders/sandbox_manager/git_branch_sandbox.py`:30-32 - Update working directory path
  - Change from `/tmp/agent-work-orders/` to configurable volume path
  - Support both Docker volumes and local development
  - Implement path validation and creation

**State Repository:**
- `python/src/agent_work_orders/state_manager/work_order_repository.py`:16-174 - Migrate to Supabase
  - Replace in-memory dicts with Supabase queries
  - Implement proper async DB operations
  - Add transaction support
  - Share Supabase client from main Archon server

**API Integration:**
- `python/src/server/api_routes/` - Create AWO API routes in main server
  - Add optional proxy routes to AWO service
  - Integrate with main server's authentication
  - Expose AWO endpoints via main server (port 8181)
  - Add settings endpoints for AWO configuration

**Settings UI:**
- `archon-ui-main/src/features/settings/` - Add AWO settings section
  - Create AWO settings component
  - Add credential management forms
  - Implement validation and test buttons
  - Integrate with existing settings patterns

**Makefile:**
- `Makefile`:8-25 - Add AWO-specific commands
  - Update `make dev` to optionally start AWO
  - Add `make dev-awo` for AWO development
  - Include AWO in `make stop` and `make clean`

**Database Migration:**
- `migration/` - Add AWO tables to Supabase schema
  - Create `agent_work_orders` table
  - Create `agent_work_order_steps` table
  - Create `agent_work_order_artifacts` table
  - Add indexes for performance

### New Files

- `python/Dockerfile.awo` - Dockerfile for AWO service container
- `python/src/agent_work_orders/integration/` - Integration layer with main Archon
  - `supabase_repository.py` - Supabase-based state repository
  - `credential_provider.py` - Integration with Archon's credential system
  - `config_loader.py` - Load config from Archon settings
- `archon-ui-main/src/features/settings/components/AgentWorkOrdersSettings.tsx` - Settings UI component
- `archon-ui-main/src/features/settings/services/awoSettingsService.ts` - API client for AWO settings
- `migration/awo_setup.sql` - Database schema for AWO tables
- `docs/agent-work-orders-deployment.md` - Deployment and configuration guide

## Implementation Plan

### Phase 1: Foundation - Docker Integration

Add AWO as an optional Docker Compose service with proper volume configuration and health checks. This establishes the containerization foundation.

### Phase 2: Core Implementation - Configuration Management

Implement centralized configuration system with Archon integration, including credential management, environment variable consolidation, and settings UI.

### Phase 3: Integration - State Persistence and Observability

Migrate from in-memory state to Supabase, integrate with Archon's logging/monitoring, and implement repository cleanup policies.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### Research Current Configuration Patterns

- Read `docker-compose.yml` to understand existing service definitions
- Examine `Dockerfile.server`, `Dockerfile.mcp`, and `Dockerfile.agents` for patterns
- Study `.env.example` for environment variable structure
- Review `python/src/server/config/config.py` for Archon's config loading
- Analyze `python/src/server/services/credential_service.py` for credential management patterns
- Document findings in implementation notes

### Create Dockerfile for AWO Service

- Create `python/Dockerfile.awo` based on `Dockerfile.server` pattern
- Use multi-stage build (builder + runtime)
- Install system dependencies:
  ```dockerfile
  RUN apt-get update && apt-get install -y \
      git \
      gh \  # GitHub CLI
      curl \
      && rm -rf /var/lib/apt/lists/*
  ```
- Install Claude CLI in container:
  ```dockerfile
  RUN curl -fsSL https://raw.githubusercontent.com/anthropics/claude-cli/main/install.sh | sh
  ```
- Install Python dependencies using uv (agent_work_orders group)
- Copy AWO source code: `COPY src/agent_work_orders/ src/agent_work_orders/`
- Set environment variables for paths:
  - `ENV AWO_REPOSITORY_DIR=/var/archon/repositories`
  - `ENV AWO_CONFIG_DIR=/var/archon/config`
- Configure entry point: `CMD uvicorn src.agent_work_orders.main:app --host 0.0.0.0 --port ${ARCHON_AWO_PORT:-8888}`
- Add healthcheck: `HEALTHCHECK CMD curl -f http://localhost:${ARCHON_AWO_PORT}/health || exit 1`
- Save file and test build: `docker build -f python/Dockerfile.awo -t archon-awo ./python`

### Add AWO Service to Docker Compose

- Open `docker-compose.yml`
- Add new service definition after `archon-agents`:
  ```yaml
  archon-awo:
    profiles:
      - awo  # Opt-in profile
    build:
      context: ./python
      dockerfile: Dockerfile.awo
      args:
        BUILDKIT_INLINE_CACHE: 1
        ARCHON_AWO_PORT: ${ARCHON_AWO_PORT:-8888}
    container_name: archon-awo
    ports:
      - "${ARCHON_AWO_PORT:-8888}:${ARCHON_AWO_PORT:-8888}"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - LOGFIRE_TOKEN=${LOGFIRE_TOKEN:-}
      - SERVICE_DISCOVERY_MODE=docker_compose
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - ARCHON_AWO_PORT=${ARCHON_AWO_PORT:-8888}
      - ARCHON_SERVER_PORT=${ARCHON_SERVER_PORT:-8181}
      - ARCHON_HOST=${HOST:-localhost}
      - AWO_REPOSITORY_DIR=/var/archon/repositories
      - AWO_CONFIG_DIR=/var/archon/config
      - AWO_MAX_CONCURRENT=${AWO_MAX_CONCURRENT:-5}
      - AWO_RETENTION_DAYS=${AWO_RETENTION_DAYS:-7}
      - GITHUB_TOKEN=${GITHUB_TOKEN:-}
    networks:
      - app-network
    volumes:
      - awo-repositories:/var/archon/repositories
      - awo-config:/var/archon/config
      - awo-work-orders:/var/archon/work-orders
      - ./python/src/agent_work_orders:/app/src/agent_work_orders  # Hot reload
    depends_on:
      archon-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${ARCHON_AWO_PORT:-8888}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
  ```
- Add volume definitions at bottom of file:
  ```yaml
  volumes:
    awo-repositories:
    awo-config:
    awo-work-orders:
  ```
- Save file

### Update Environment Configuration

- Open `.env.example`
- Add new section after existing ports configuration (line 37):
  ```bash
  # Agent Work Orders Configuration
  ARCHON_AWO_PORT=8888
  AWO_REPOSITORY_DIR=/var/archon/repositories
  AWO_CONFIG_DIR=/var/archon/config
  AWO_MAX_CONCURRENT=5
  AWO_RETENTION_DAYS=7
  GITHUB_TOKEN=  # GitHub personal access token for repository operations
  ```
- Save file
- Copy to `.env` if you're testing: `cp .env.example .env.new && echo "# Update your .env with new AWO settings"`

### Refactor AWO Configuration Class

- Open `python/src/agent_work_orders/config.py`
- Update `AgentWorkOrdersConfig` class to use Docker-friendly paths:
  ```python
  class AgentWorkOrdersConfig:
      """Configuration for Agent Work Orders service"""

      # Service configuration
      CLAUDE_CLI_PATH: str = os.getenv("CLAUDE_CLI_PATH", "claude")
      GH_CLI_PATH: str = os.getenv("GH_CLI_PATH", "gh")
      EXECUTION_TIMEOUT: int = int(os.getenv("AGENT_WORK_ORDER_TIMEOUT", "3600"))

      # Storage paths - Docker-aware
      # In Docker: /var/archon/repositories
      # In development: ./tmp/agent-work-orders
      REPOSITORY_DIR: str = os.getenv(
          "AWO_REPOSITORY_DIR",
          str(Path.cwd() / "tmp" / "agent-work-orders")
      )

      CONFIG_DIR: str = os.getenv(
          "AWO_CONFIG_DIR",
          str(Path.home() / ".archon" / "config")
      )

      WORK_ORDER_DIR: str = os.getenv(
          "AWO_WORK_ORDER_DIR",
          str(Path.cwd() / "tmp" / "work-orders")
      )

      # Execution limits
      MAX_CONCURRENT: int = int(os.getenv("AWO_MAX_CONCURRENT", "5"))
      RETENTION_DAYS: int = int(os.getenv("AWO_RETENTION_DAYS", "7"))

      # GitHub configuration
      GITHUB_TOKEN: str | None = os.getenv("GITHUB_TOKEN")

      # Command files directory
      _python_root = Path(__file__).parent.parent.parent
      _default_commands_dir = str(_python_root / ".claude" / "commands" / "agent-work-orders")
      COMMANDS_DIRECTORY: str = os.getenv("AGENT_WORK_ORDER_COMMANDS_DIR", _default_commands_dir)

      # Deprecated - kept for backward compatibility
      TEMP_DIR_BASE: str = REPOSITORY_DIR

      LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

      # ... rest of configuration

      @classmethod
      def ensure_directories(cls) -> None:
          """Ensure all required directories exist"""
          for directory in [cls.REPOSITORY_DIR, cls.CONFIG_DIR, cls.WORK_ORDER_DIR]:
              Path(directory).mkdir(parents=True, exist_ok=True)
  ```
- Update `ensure_temp_dir()` method to `ensure_directories()`
- Save file

### Update Sandbox Manager for Docker Volumes

- Open `python/src/agent_work_orders/sandbox_manager/git_branch_sandbox.py`
- Update `__init__` method (line 27-36):
  ```python
  def __init__(self, repository_url: str, sandbox_identifier: str):
      self.repository_url = repository_url
      self.sandbox_identifier = sandbox_identifier

      # Use configurable repository directory
      repo_base = Path(config.REPOSITORY_DIR)
      repo_base.mkdir(parents=True, exist_ok=True)

      self.working_dir = str(repo_base / sandbox_identifier)

      self._logger = logger.bind(
          sandbox_identifier=sandbox_identifier,
          repository_url=repository_url,
          working_dir=self.working_dir,
      )
  ```
- Save file

### Update Makefile for AWO Integration

- Open `Makefile`
- Add AWO commands after line 24:
  ```makefile
  # Agent Work Orders commands
  dev-awo: check
  	@echo "Starting development with Agent Work Orders..."
  	@$(COMPOSE) --profile backend --profile awo up -d --build
  	@echo "Backend + AWO running"
  	@cd archon-ui-main && npm run dev

  awo-logs:
  	@echo "Viewing AWO logs..."
  	@$(COMPOSE) logs -f archon-awo

  awo-restart:
  	@echo "Restarting AWO service..."
  	@$(COMPOSE) restart archon-awo
  ```
- Update help section to include new commands:
  ```makefile
  help:
  	@echo "Archon Development Commands"
  	@echo "==========================="
  	@echo "  make dev         - Backend in Docker, frontend local (recommended)"
  	@echo "  make dev-awo     - Backend + AWO in Docker, frontend local"
  	@echo "  make dev-docker  - Everything in Docker"
  	@echo "  make awo-logs    - View Agent Work Orders logs"
  	@echo "  make awo-restart - Restart AWO service"
  	# ... rest of help
  ```
- Save file

### Create Supabase Migration for AWO Tables

- Create `migration/awo_setup.sql`
- Add schema definitions:
  ```sql
  -- Agent Work Orders Tables

  -- Core work order state (5 fields per PRD)
  CREATE TABLE IF NOT EXISTS agent_work_orders (
      agent_work_order_id TEXT PRIMARY KEY,
      repository_url TEXT NOT NULL,
      sandbox_identifier TEXT NOT NULL,
      git_branch_name TEXT,
      agent_session_id TEXT,

      -- Metadata (not core state)
      workflow_type TEXT NOT NULL,
      sandbox_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      user_request TEXT NOT NULL,
      github_issue_number TEXT,
      current_phase TEXT,
      github_pull_request_url TEXT,
      git_commit_count INTEGER DEFAULT 0,
      git_files_changed INTEGER DEFAULT 0,
      error_message TEXT,

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Step execution history
  CREATE TABLE IF NOT EXISTS agent_work_order_steps (
      id BIGSERIAL PRIMARY KEY,
      agent_work_order_id TEXT NOT NULL REFERENCES agent_work_orders(agent_work_order_id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      output TEXT,
      error_message TEXT,
      duration_seconds FLOAT,
      session_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(agent_work_order_id, step_order)
  );

  -- Artifacts (prompts, outputs, logs)
  CREATE TABLE IF NOT EXISTS agent_work_order_artifacts (
      id BIGSERIAL PRIMARY KEY,
      agent_work_order_id TEXT NOT NULL REFERENCES agent_work_orders(agent_work_order_id) ON DELETE CASCADE,
      artifact_type TEXT NOT NULL,  -- 'prompt', 'output', 'log'
      step_name TEXT,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_agent_work_orders_status ON agent_work_orders(status);
  CREATE INDEX IF NOT EXISTS idx_agent_work_orders_created_at ON agent_work_orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_work_order_steps_work_order ON agent_work_order_steps(agent_work_order_id);
  CREATE INDEX IF NOT EXISTS idx_agent_work_order_artifacts_work_order ON agent_work_order_artifacts(agent_work_order_id);

  -- RLS Policies (open for now, can be restricted later)
  ALTER TABLE agent_work_orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE agent_work_order_steps ENABLE ROW LEVEL SECURITY;
  ALTER TABLE agent_work_order_artifacts ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Allow all operations on agent_work_orders" ON agent_work_orders FOR ALL USING (true);
  CREATE POLICY "Allow all operations on agent_work_order_steps" ON agent_work_order_steps FOR ALL USING (true);
  CREATE POLICY "Allow all operations on agent_work_order_artifacts" ON agent_work_order_artifacts FOR ALL USING (true);
  ```
- Save file
- Document in README: "Run `migration/awo_setup.sql` in Supabase SQL editor to enable AWO"

### Create Supabase Repository Implementation

- Create `python/src/agent_work_orders/integration/` directory
- Create `__init__.py` in that directory
- Create `python/src/agent_work_orders/integration/supabase_repository.py`:
  ```python
  """Supabase-based Work Order Repository

  Replaces in-memory storage with Supabase persistence.
  """

  from datetime import datetime
  from postgrest import APIError

  from ..models import AgentWorkOrderState, AgentWorkOrderStatus, StepHistory, StepExecutionResult
  from ..utils.structured_logger import get_logger

  logger = get_logger(__name__)


  class SupabaseWorkOrderRepository:
      """Supabase-based repository for work order state

      Stores core state (5 fields) and metadata in Supabase.
      Thread-safe via database transactions.
      """

      def __init__(self, supabase_client):
          self.supabase = supabase_client
          self._logger = logger

      async def create(self, work_order: AgentWorkOrderState, metadata: dict) -> None:
          """Create a new work order"""
          try:
              data = {
                  "agent_work_order_id": work_order.agent_work_order_id,
                  "repository_url": work_order.repository_url,
                  "sandbox_identifier": work_order.sandbox_identifier,
                  "git_branch_name": work_order.git_branch_name,
                  "agent_session_id": work_order.agent_session_id,
                  **metadata,  # Merge metadata fields
              }

              self.supabase.table("agent_work_orders").insert(data).execute()

              self._logger.info(
                  "work_order_created",
                  agent_work_order_id=work_order.agent_work_order_id,
              )
          except Exception as e:
              self._logger.error("work_order_creation_failed", error=str(e), exc_info=True)
              raise

      # ... implement other methods (get, list, update_status, etc.)
  ```
- Implement all methods from `WorkOrderRepository` interface
- Save file

### Add AWO Configuration to Settings Service

- Open `python/src/server/services/credential_service.py`
- Add AWO credential keys:
  ```python
  # Agent Work Orders credentials
  GITHUB_TOKEN_AWO = "github_token_awo"
  CLAUDE_CLI_PATH = "claude_cli_path"
  AWO_MAX_CONCURRENT = "awo_max_concurrent"
  AWO_RETENTION_DAYS = "awo_retention_days"
  ```
- Add helper functions:
  ```python
  async def get_awo_github_token() -> str | None:
      """Get GitHub token for AWO"""
      return await get_credential(GITHUB_TOKEN_AWO)

  async def set_awo_github_token(token: str) -> None:
      """Set GitHub token for AWO (encrypted)"""
      await set_credential(GITHUB_TOKEN_AWO, token, is_secret=True)
  ```
- Save file

### Create AWO Settings API Routes

- Create `python/src/server/api_routes/awo_settings_api.py`:
  ```python
  """Agent Work Orders Settings API"""

  from fastapi import APIRouter, HTTPException
  from pydantic import BaseModel

  from ..services.credential_service import (
      get_awo_github_token,
      set_awo_github_token,
  )

  router = APIRouter(prefix="/api/awo/settings", tags=["awo-settings"])


  class AWOSettings(BaseModel):
      github_token: str | None = None
      claude_cli_path: str = "claude"
      max_concurrent: int = 5
      retention_days: int = 7


  @router.get("/")
  async def get_awo_settings() -> AWOSettings:
      """Get AWO settings"""
      github_token = await get_awo_github_token()
      return AWOSettings(
          github_token="***" if github_token else None,  # Masked
          # Load other settings from config
      )


  @router.post("/github-token")
  async def update_github_token(token: str):
      """Update GitHub token for AWO"""
      await set_awo_github_token(token)
      return {"status": "success"}
  ```
- Save file
- Import in `python/src/server/main.py`:
  ```python
  from .api_routes.awo_settings_api import router as awo_settings_router

  # ... later in file
  app.include_router(awo_settings_router)
  ```

### Create Settings UI Component

- Create `archon-ui-main/src/features/settings/components/AgentWorkOrdersSettings.tsx`:
  ```tsx
  import { useState } from 'react';
  import { Card, CardHeader, CardTitle, CardContent } from '@/features/ui/primitives/card';
  import { Button } from '@/features/ui/primitives/button';
  import { Input } from '@/features/ui/primitives/input';
  import { Label } from '@/features/ui/primitives/label';
  import { useToast } from '@/features/ui/hooks/useToast';

  export function AgentWorkOrdersSettings() {
      const [githubToken, setGithubToken] = useState('');
      const [isSaving, setIsSaving] = useState(false);
      const { toast } = useToast();

      const handleSaveGithubToken = async () => {
          setIsSaving(true);
          try {
              const response = await fetch('/api/awo/settings/github-token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token: githubToken }),
              });

              if (!response.ok) throw new Error('Failed to save token');

              toast({
                  title: 'Success',
                  description: 'GitHub token saved successfully',
              });
              setGithubToken('');
          } catch (error) {
              toast({
                  title: 'Error',
                  description: 'Failed to save GitHub token',
                  variant: 'destructive',
              });
          } finally {
              setIsSaving(false);
          }
      };

      return (
          <Card>
              <CardHeader>
                  <CardTitle>Agent Work Orders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="space-y-2">
                      <Label htmlFor="github-token">GitHub Personal Access Token</Label>
                      <Input
                          id="github-token"
                          type="password"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                          placeholder="ghp_..."
                      />
                      <p className="text-sm text-muted-foreground">
                          Required for cloning private repositories and creating pull requests
                      </p>
                  </div>

                  <Button onClick={handleSaveGithubToken} disabled={isSaving || !githubToken}>
                      {isSaving ? 'Saving...' : 'Save GitHub Token'}
                  </Button>
              </CardContent>
          </Card>
      );
  }
  ```
- Save file
- Import and add to settings page

### Add Repository Cleanup Job

- Create `python/src/agent_work_orders/utils/cleanup.py`:
  ```python
  """Repository cleanup utilities"""

  import asyncio
  import shutil
  from datetime import datetime, timedelta
  from pathlib import Path

  from ..config import config
  from ..utils.structured_logger import get_logger

  logger = get_logger(__name__)


  async def cleanup_old_repositories() -> dict:
      """Clean up repositories older than retention period

      Returns:
          Dict with cleanup stats
      """
      logger.info("repository_cleanup_started", retention_days=config.RETENTION_DAYS)

      repo_dir = Path(config.REPOSITORY_DIR)
      if not repo_dir.exists():
          return {"removed": 0, "kept": 0}

      cutoff_date = datetime.now() - timedelta(days=config.RETENTION_DAYS)
      removed = 0
      kept = 0

      for work_order_dir in repo_dir.iterdir():
          if not work_order_dir.is_dir():
              continue

          # Check modification time
          mod_time = datetime.fromtimestamp(work_order_dir.stat().st_mtime)

          if mod_time < cutoff_date:
              try:
                  shutil.rmtree(work_order_dir)
                  removed += 1
                  logger.info("repository_removed", path=str(work_order_dir))
              except Exception as e:
                  logger.error("repository_removal_failed", path=str(work_order_dir), error=str(e))
          else:
              kept += 1

      logger.info("repository_cleanup_completed", removed=removed, kept=kept)
      return {"removed": removed, "kept": kept}
  ```
- Save file
- Add periodic cleanup task to `main.py` lifespan

### Write Integration Tests

- Create `python/tests/agent_work_orders/test_docker_integration.py`:
  ```python
  """Docker integration tests for AWO"""

  import pytest
  from pathlib import Path

  from src.agent_work_orders.config import config


  def test_docker_volume_paths():
      """Test that Docker volume paths are configurable"""
      assert config.REPOSITORY_DIR
      assert config.CONFIG_DIR
      assert config.WORK_ORDER_DIR


  def test_directories_can_be_created():
      """Test that required directories can be created"""
      config.ensure_directories()

      assert Path(config.REPOSITORY_DIR).exists()
      assert Path(config.CONFIG_DIR).exists()
      assert Path(config.WORK_ORDER_DIR).exists()


  @pytest.mark.asyncio
  async def test_cleanup_old_repositories():
      """Test repository cleanup function"""
      from src.agent_work_orders.utils.cleanup import cleanup_old_repositories

      stats = await cleanup_old_repositories()
      assert "removed" in stats
      assert "kept" in stats
  ```
- Save file

### Update Documentation

- Update `README.md` section on Agent Work Orders:
  - Add instructions for enabling AWO via Docker profile
  - Document environment variables
  - Explain volume persistence
  - Add configuration guide
- Create `docs/agent-work-orders-deployment.md`:
  - Docker deployment guide
  - Volume management
  - Backup/restore procedures
  - Troubleshooting common issues

### Test Docker Build

- Build the AWO Docker image:
  ```bash
  docker build -f python/Dockerfile.awo -t archon-awo:test ./python
  ```
- Verify build succeeds
- Check image size is reasonable
- Inspect layers for optimization opportunities

### Test Docker Compose Integration

- Start services with AWO profile:
  ```bash
  docker compose --profile awo up -d --build
  ```
- Verify AWO container starts successfully
- Check logs: `docker compose logs archon-awo`
- Test health endpoint: `curl http://localhost:8888/health`
- Verify volumes are created: `docker volume ls | grep awo`
- Inspect volume mounts: `docker inspect archon-awo | grep Mounts -A 20`

### Test Repository Persistence

- Create a test work order via API
- Check that repository is cloned to volume
- Restart AWO container: `docker compose restart archon-awo`
- Verify repository still exists after restart
- Check volume: `docker volume inspect archon_awo-repositories`

### Test Settings Integration

- Navigate to Archon Settings UI: `http://localhost:3737/settings`
- Locate "Agent Work Orders" section
- Add GitHub token via UI
- Verify token is encrypted in database
- Test token retrieval (masked display)
- Verify AWO can use token from settings

### Run Unit Tests

- Execute AWO test suite:
  ```bash
  cd python && uv run pytest tests/agent_work_orders/ -v
  ```
- Verify all tests pass
- Check test coverage: `uv run pytest tests/agent_work_orders/ --cov=src/agent_work_orders`
- Target: >80% coverage

### Run Integration Tests

- Start full Docker environment: `docker compose --profile awo up -d`
- Run end-to-end tests:
  ```bash
  cd python && uv run pytest tests/agent_work_orders/test_docker_integration.py -v
  ```
- Test cleanup job:
  ```bash
  docker compose exec archon-awo python -m src.agent_work_orders.utils.cleanup
  ```
- Verify logs show successful cleanup

### Performance Testing

- Create multiple concurrent work orders (5+)
- Monitor Docker container resources: `docker stats archon-awo`
- Check volume disk usage: `du -sh /var/lib/docker/volumes/archon_awo-repositories`
- Verify MAX_CONCURRENT limit is respected
- Test cleanup under load

### Update Makefile Commands

- Test `make dev-awo` command
- Verify AWO starts with backend services
- Test `make awo-logs` command
- Test `make awo-restart` command
- Verify `make stop` stops AWO service
- Test `make clean` removes AWO volumes (with confirmation)

### Documentation Review

- Review all updated documentation for accuracy
- Ensure environment variable examples are correct
- Verify Docker Compose configuration is documented
- Check that troubleshooting section covers common issues
- Add migration guide for existing deployments

### Validation Commands

Execute every command to validate the feature works correctly with zero regressions.

- `docker build -f python/Dockerfile.awo -t archon-awo:test ./python` - Build AWO Docker image
- `docker compose --profile awo up -d --build` - Start AWO with Docker Compose
- `docker compose logs archon-awo` - View AWO logs
- `curl http://localhost:8888/health | jq` - Test AWO health endpoint
- `docker volume ls | grep awo` - Verify volumes created
- `docker volume inspect archon_awo-repositories | jq` - Inspect repository volume
- `docker exec archon-awo ls -la /var/archon/repositories` - Check repository directory
- `cd python && uv run pytest tests/agent_work_orders/ -v` - Run all AWO tests
- `cd python && uv run pytest tests/agent_work_orders/test_docker_integration.py -v` - Run Docker integration tests
- `make dev-awo` - Test Makefile integration
- `make awo-logs` - Test log viewing
- `curl -X POST http://localhost:8888/agent-work-orders -H "Content-Type: application/json" -d '{"repository_url":"https://github.com/test/repo","sandbox_type":"git_branch","workflow_type":"agent_workflow_plan","user_request":"Test"}' | jq` - Create test work order
- `docker compose restart archon-awo && sleep 5 && curl http://localhost:8888/health` - Test restart persistence
- `docker stats archon-awo --no-stream` - Check resource usage
- `make stop` - Stop all services
- `docker compose down -v` - Clean up (removes volumes)

## Testing Strategy

### Unit Tests

**Configuration Tests:**
- Test config loads from environment variables
- Test default values when env vars not set
- Test Docker volume paths vs development paths
- Test directory creation (ensure_directories)

**Repository Cleanup Tests:**
- Test cleanup removes old directories
- Test cleanup respects retention period
- Test cleanup handles missing directories
- Test cleanup error handling

**Supabase Repository Tests:**
- Test create/get/update/delete operations
- Test transaction handling
- Test error handling and retries
- Test step history persistence

### Integration Tests

**Docker Compose Tests:**
- Test AWO service starts successfully
- Test health check passes
- Test service depends on archon-server
- Test volumes are mounted correctly
- Test environment variables are passed

**Volume Persistence Tests:**
- Test repositories persist across container restarts
- Test configuration persists in volume
- Test work order artifacts are saved
- Test cleanup doesn't affect active work orders

**Settings Integration Tests:**
- Test GitHub token can be saved via UI
- Test token is encrypted in database
- Test AWO can retrieve token from settings
- Test settings validation

### Edge Cases

**Volume Management:**
- Disk full scenario (repository volume)
- Volume permissions issues
- Multiple containers accessing same volume
- Volume backup/restore

**Configuration:**
- Missing environment variables
- Invalid paths in configuration
- Conflicting settings (env vs database)
- Hot-reload configuration changes

**Multi-Instance Deployment:**
- Multiple AWO containers with shared Supabase
- Concurrent work order creation
- Race conditions in repository cloning
- Lock contention in cleanup jobs

**Cleanup:**
- Cleanup running while work order active
- Very large repositories (>1GB)
- Repositories with permission issues
- Partial cleanup failures

## Acceptance Criteria

**Docker Integration:**
- ✅ AWO service defined in docker-compose.yml with opt-in profile
- ✅ Dockerfile.awo builds successfully with all dependencies
- ✅ Service starts and passes health checks
- ✅ Volumes created and mounted correctly
- ✅ Service accessible via Docker network from other services

**Configuration Management:**
- ✅ All configuration loaded from environment variables
- ✅ Docker volume paths configurable and working
- ✅ Settings integrated with Archon's credential system
- ✅ GitHub token encrypted and stored in Supabase
- ✅ Configuration hot-reload works without restarts

**Repository Persistence:**
- ✅ Repositories cloned to Docker volumes, not /tmp
- ✅ Repositories persist across container restarts
- ✅ Cleanup job removes old repositories based on retention
- ✅ Active work orders protected from cleanup
- ✅ Volume backup/restore documented

**Settings UI:**
- ✅ AWO settings section added to Archon Settings page
- ✅ GitHub token can be added via UI
- ✅ Token masked when displayed
- ✅ Configuration validated before saving
- ✅ Test buttons verify credentials work

**Supabase Integration:**
- ✅ Work order state persisted in Supabase
- ✅ Step history saved to database
- ✅ Artifacts stored with proper references
- ✅ Transactions ensure data consistency
- ✅ Multiple instances can share database

**Developer Experience:**
- ✅ `make dev-awo` starts AWO with backend
- ✅ Hot-reload works in development mode
- ✅ `make awo-logs` shows AWO logs
- ✅ `make stop` stops AWO service
- ✅ Documentation updated with examples

**Testing:**
- ✅ All existing tests pass
- ✅ New Docker integration tests pass
- ✅ Configuration tests pass
- ✅ >80% code coverage maintained
- ✅ End-to-end workflow test passes

## Notes

### Design Decisions

**Why Docker Volumes Instead of Host Bind Mounts?**
- Volumes are Docker-managed and portable across platforms
- Better performance than bind mounts on Windows/Mac
- Easier backup/restore with Docker tooling
- No permission issues between host and container
- Can be used in production deployments

**Why Opt-In Profile for AWO?**
- AWO is specialized functionality not needed by all users
- Reduces resource usage for users who don't need agent execution
- Follows Archon's pattern (agents service also has opt-in profile)
- Easier to disable for troubleshooting

**Why Separate Volumes for Repos, Config, and Work Orders?**
- Allows different backup policies (repos are transient, config is critical)
- Easier to mount only what's needed in different deployment scenarios
- Can set different size limits on each volume
- Clearer separation of concerns

**Why Integrate with Archon's Credential System?**
- Centralized credential management
- Encryption at rest for sensitive tokens
- Consistent UI experience with rest of Archon
- Audit trail for credential changes
- Easier multi-instance deployment

### Migration Path from Existing Deployments

For users currently running AWO standalone:

1. **Backup existing work orders:**
   ```bash
   tar -czf awo-backup.tar.gz /tmp/agent-work-orders/
   ```

2. **Run Supabase migration:**
   - Execute `migration/awo_setup.sql` in Supabase SQL editor

3. **Update environment:**
   - Add new AWO variables to `.env` from `.env.example`
   - Add GitHub token to Archon Settings UI

4. **Start with Docker:**
   ```bash
   docker compose --profile awo up -d --build
   ```

5. **Verify migration:**
   - Check logs: `docker compose logs archon-awo`
   - Test health: `curl http://localhost:8888/health`
   - Create test work order

6. **Clean up old data:**
   ```bash
   # After verifying everything works
   rm -rf /tmp/agent-work-orders/
   ```

### Future Enhancements

**Phase 2 Improvements:**
- Add S3/object storage backend for repository storage
- Implement distributed lock manager for multi-instance coordination
- Add metrics and observability (Prometheus, Grafana)
- Implement work order queue with priority scheduling
- Add WebSocket progress updates via main server

**Advanced Features:**
- Repository caching layer to avoid repeated clones
- Incremental git fetch instead of full clone
- Sparse checkout for monorepos
- Git worktree support for faster branch switching
- Repository archive/unarchive for space management

**Horizontal Scaling:**
- Shared file system for multi-instance deployments (NFS, EFS)
- Distributed queue for work order processing
- Load balancing across multiple AWO instances
- Pod affinity rules for Kubernetes deployments

### Resource Requirements

**Disk Space:**
- Base container: ~500MB
- Average repository: 50-500MB
- Recommend: 10GB minimum for volume
- Production: 50-100GB for active development

**Memory:**
- Base container: 512MB
- With 5 concurrent work orders: 2-4GB
- Claude CLI execution: 500MB-1GB per instance
- Recommend: 4GB minimum

**CPU:**
- Idle: <0.1 CPU
- Active work order: 0.5-1.0 CPU
- Recommend: 2 CPU cores minimum

### Security Considerations

**Credential Storage:**
- GitHub tokens encrypted in Supabase
- No tokens in environment variables (in production)
- RLS policies limit access to credentials
- Audit log for credential changes

**Repository Isolation:**
- Each work order in separate directory
- No shared state between work orders
- Clean checkout on each execution
- Sandboxed git operations

**Container Security:**
- Run as non-root user (TODO: add to Dockerfile)
- Read-only root filesystem (where possible)
- Drop unnecessary capabilities
- Network isolation via Docker networks

### Troubleshooting Common Issues

**Volume Permission Errors:**
```bash
# Check volume ownership
docker exec archon-awo ls -la /var/archon/

# Fix permissions if needed
docker exec -u root archon-awo chown -R app:app /var/archon/
```

**Disk Full on Repository Volume:**
```bash
# Check volume usage
docker exec archon-awo du -sh /var/archon/repositories/*

# Manual cleanup
docker exec archon-awo python -m src.agent_work_orders.utils.cleanup

# Or reduce retention days in .env
AWO_RETENTION_DAYS=3
```

**Container Won't Start:**
```bash
# Check logs
docker compose logs archon-awo

# Verify dependencies
docker compose ps archon-server

# Test configuration
docker compose config | grep -A 20 archon-awo
```

**Health Check Failing:**
```bash
# Test health endpoint manually
docker exec archon-awo curl -f http://localhost:8888/health

# Check if port is bound
docker exec archon-awo netstat -tlnp | grep 8888
```
