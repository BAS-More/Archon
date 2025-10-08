"""Workflow Phase Tracker

Tracks workflow phases by inspecting git commits.
"""

from pathlib import Path

from ..models import AgentWorkflowPhase, GitProgressSnapshot
from ..utils import git_operations
from ..utils.structured_logger import get_logger

logger = get_logger(__name__)


class WorkflowPhaseTracker:
    """Tracks workflow execution phases via git inspection"""

    def __init__(self):
        self._logger = logger

    async def get_current_phase(
        self, git_branch_name: str, repo_path: str | Path
    ) -> AgentWorkflowPhase:
        """Determine current phase by inspecting git commits

        Args:
            git_branch_name: Git branch name
            repo_path: Path to git repository

        Returns:
            Current workflow phase
        """
        self._logger.info(
            "workflow_phase_detection_started",
            git_branch_name=git_branch_name,
        )

        try:
            commits = await git_operations.get_commit_count(git_branch_name, repo_path)
            has_planning = await git_operations.has_planning_commits(
                git_branch_name, repo_path
            )

            if has_planning and commits > 0:
                phase = AgentWorkflowPhase.COMPLETED
            else:
                phase = AgentWorkflowPhase.PLANNING

            self._logger.info(
                "workflow_phase_detected",
                git_branch_name=git_branch_name,
                phase=phase.value,
                commits=commits,
                has_planning=has_planning,
            )

            return phase

        except Exception as e:
            self._logger.error(
                "workflow_phase_detection_failed",
                git_branch_name=git_branch_name,
                error=str(e),
                exc_info=True,
            )
            # Default to PLANNING if detection fails
            return AgentWorkflowPhase.PLANNING

    async def get_git_progress_snapshot(
        self,
        agent_work_order_id: str,
        git_branch_name: str,
        repo_path: str | Path,
    ) -> GitProgressSnapshot:
        """Get git progress for UI display

        Args:
            agent_work_order_id: Work order ID
            git_branch_name: Git branch name
            repo_path: Path to git repository

        Returns:
            GitProgressSnapshot with current progress
        """
        self._logger.info(
            "git_progress_snapshot_started",
            agent_work_order_id=agent_work_order_id,
            git_branch_name=git_branch_name,
        )

        try:
            current_phase = await self.get_current_phase(git_branch_name, repo_path)
            commit_count = await git_operations.get_commit_count(
                git_branch_name, repo_path
            )
            files_changed = await git_operations.get_files_changed(
                git_branch_name, repo_path
            )
            latest_commit = await git_operations.get_latest_commit_message(
                git_branch_name, repo_path
            )

            snapshot = GitProgressSnapshot(
                agent_work_order_id=agent_work_order_id,
                current_phase=current_phase,
                git_commit_count=commit_count,
                git_files_changed=files_changed,
                latest_commit_message=latest_commit,
                git_branch_name=git_branch_name,
            )

            self._logger.info(
                "git_progress_snapshot_completed",
                agent_work_order_id=agent_work_order_id,
                phase=current_phase.value,
                commits=commit_count,
                files=files_changed,
            )

            return snapshot

        except Exception as e:
            self._logger.error(
                "git_progress_snapshot_failed",
                agent_work_order_id=agent_work_order_id,
                error=str(e),
                exc_info=True,
            )
            # Return minimal snapshot on error
            return GitProgressSnapshot(
                agent_work_order_id=agent_work_order_id,
                current_phase=AgentWorkflowPhase.PLANNING,
                git_commit_count=0,
                git_files_changed=0,
                latest_commit_message=None,
                git_branch_name=git_branch_name,
            )
