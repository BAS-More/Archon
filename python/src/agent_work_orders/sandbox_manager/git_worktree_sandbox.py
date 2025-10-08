"""Git Worktree Sandbox Implementation

Provides isolated execution environment using git worktrees.
Enables parallel execution of multiple work orders without conflicts.
"""

import asyncio
import time

from ..models import CommandExecutionResult, SandboxSetupError
from ..utils.git_operations import get_current_branch
from ..utils.port_allocation import find_next_available_ports
from ..utils.structured_logger import get_logger
from ..utils.worktree_operations import (
    create_worktree,
    get_worktree_path,
    remove_worktree,
    setup_worktree_environment,
)

logger = get_logger(__name__)


class GitWorktreeSandbox:
    """Git worktree-based sandbox implementation

    Creates a git worktree under trees/<work_order_id>/ where the agent
    executes workflows. Enables parallel execution with isolated environments
    and deterministic port allocation.
    """

    def __init__(self, repository_url: str, sandbox_identifier: str):
        self.repository_url = repository_url
        self.sandbox_identifier = sandbox_identifier
        self.working_dir = get_worktree_path(repository_url, sandbox_identifier)
        self.backend_port: int | None = None
        self.frontend_port: int | None = None
        self._logger = logger.bind(
            sandbox_identifier=sandbox_identifier,
            repository_url=repository_url,
        )

    async def setup(self) -> None:
        """Create worktree and set up isolated environment

        Creates worktree from origin/main and allocates unique ports.
        """
        self._logger.info("worktree_sandbox_setup_started")

        try:
            # Allocate ports deterministically
            self.backend_port, self.frontend_port = find_next_available_ports(
                self.sandbox_identifier
            )
            self._logger.info(
                "ports_allocated",
                backend_port=self.backend_port,
                frontend_port=self.frontend_port,
            )

            # Create worktree with temporary branch name
            # Agent will create the actual feature branch during execution
            temp_branch = f"wo-{self.sandbox_identifier}"

            worktree_path, error = create_worktree(
                self.repository_url,
                self.sandbox_identifier,
                temp_branch,
                self._logger
            )

            if error or not worktree_path:
                raise SandboxSetupError(f"Failed to create worktree: {error}")

            # Set up environment with port configuration
            setup_worktree_environment(
                worktree_path,
                self.backend_port,
                self.frontend_port,
                self._logger
            )

            self._logger.info(
                "worktree_sandbox_setup_completed",
                working_dir=self.working_dir,
                backend_port=self.backend_port,
                frontend_port=self.frontend_port,
            )

        except Exception as e:
            self._logger.error(
                "worktree_sandbox_setup_failed",
                error=str(e),
                exc_info=True
            )
            raise SandboxSetupError(f"Worktree sandbox setup failed: {e}") from e

    async def execute_command(
        self, command: str, timeout: int = 300
    ) -> CommandExecutionResult:
        """Execute command in the worktree directory

        Args:
            command: Shell command to execute
            timeout: Timeout in seconds

        Returns:
            CommandExecutionResult
        """
        self._logger.info("command_execution_started", command=command)
        start_time = time.time()

        try:
            process = await asyncio.create_subprocess_shell(
                command,
                cwd=self.working_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=timeout
                )
            except TimeoutError:
                process.kill()
                await process.wait()
                duration = time.time() - start_time
                self._logger.error(
                    "command_execution_timeout", command=command, timeout=timeout
                )
                return CommandExecutionResult(
                    success=False,
                    stdout=None,
                    stderr=None,
                    exit_code=-1,
                    error_message=f"Command timed out after {timeout}s",
                    duration_seconds=duration,
                )

            duration = time.time() - start_time
            success = process.returncode == 0

            result = CommandExecutionResult(
                success=success,
                stdout=stdout.decode() if stdout else None,
                stderr=stderr.decode() if stderr else None,
                exit_code=process.returncode or 0,
                error_message=None if success else stderr.decode() if stderr else "Command failed",
                duration_seconds=duration,
            )

            if success:
                self._logger.info(
                    "command_execution_completed", command=command, duration=duration
                )
            else:
                self._logger.error(
                    "command_execution_failed",
                    command=command,
                    exit_code=process.returncode,
                    duration=duration,
                )

            return result

        except Exception as e:
            duration = time.time() - start_time
            self._logger.error(
                "command_execution_error", command=command, error=str(e), exc_info=True
            )
            return CommandExecutionResult(
                success=False,
                stdout=None,
                stderr=None,
                exit_code=-1,
                error_message=str(e),
                duration_seconds=duration,
            )

    async def get_git_branch_name(self) -> str | None:
        """Get current git branch name in worktree

        Returns:
            Current branch name or None
        """
        try:
            return await get_current_branch(self.working_dir)
        except Exception as e:
            self._logger.error("git_branch_query_failed", error=str(e))
            return None

    async def cleanup(self) -> None:
        """Remove worktree"""
        self._logger.info("worktree_sandbox_cleanup_started")

        try:
            success, error = remove_worktree(
                self.repository_url,
                self.sandbox_identifier,
                self._logger
            )
            if success:
                self._logger.info("worktree_sandbox_cleanup_completed")
            else:
                self._logger.error(
                    "worktree_sandbox_cleanup_failed",
                    error=error
                )
        except Exception as e:
            self._logger.error(
                "worktree_sandbox_cleanup_failed",
                error=str(e),
                exc_info=True
            )
