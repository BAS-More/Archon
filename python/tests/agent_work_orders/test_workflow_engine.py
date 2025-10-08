"""Tests for Workflow Engine"""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, MagicMock, patch

from src.agent_work_orders.models import (
    AgentWorkOrderStatus,
    AgentWorkflowPhase,
    AgentWorkflowType,
    SandboxType,
    WorkflowExecutionError,
)
from src.agent_work_orders.workflow_engine.workflow_phase_tracker import (
    WorkflowPhaseTracker,
)
from src.agent_work_orders.workflow_engine.workflow_orchestrator import (
    WorkflowOrchestrator,
)


@pytest.mark.asyncio
async def test_phase_tracker_planning_phase():
    """Test detecting planning phase"""
    tracker = WorkflowPhaseTracker()

    with TemporaryDirectory() as tmpdir:
        with patch(
            "src.agent_work_orders.utils.git_operations.get_commit_count",
            return_value=0,
        ):
            with patch(
                "src.agent_work_orders.utils.git_operations.has_planning_commits",
                return_value=False,
            ):
                phase = await tracker.get_current_phase("feat-wo-test", tmpdir)

    assert phase == AgentWorkflowPhase.PLANNING


@pytest.mark.asyncio
async def test_phase_tracker_completed_phase():
    """Test detecting completed phase"""
    tracker = WorkflowPhaseTracker()

    with TemporaryDirectory() as tmpdir:
        with patch(
            "src.agent_work_orders.utils.git_operations.get_commit_count",
            return_value=3,
        ):
            with patch(
                "src.agent_work_orders.utils.git_operations.has_planning_commits",
                return_value=True,
            ):
                phase = await tracker.get_current_phase("feat-wo-test", tmpdir)

    assert phase == AgentWorkflowPhase.COMPLETED


@pytest.mark.asyncio
async def test_phase_tracker_git_progress_snapshot():
    """Test creating git progress snapshot"""
    tracker = WorkflowPhaseTracker()

    with TemporaryDirectory() as tmpdir:
        with patch(
            "src.agent_work_orders.utils.git_operations.get_commit_count",
            return_value=5,
        ):
            with patch(
                "src.agent_work_orders.utils.git_operations.get_files_changed",
                return_value=10,
            ):
                with patch(
                    "src.agent_work_orders.utils.git_operations.get_latest_commit_message",
                    return_value="plan: Create implementation plan",
                ):
                    with patch(
                        "src.agent_work_orders.utils.git_operations.has_planning_commits",
                        return_value=True,
                    ):
                        snapshot = await tracker.get_git_progress_snapshot(
                            "wo-test123", "feat-wo-test", tmpdir
                        )

    assert snapshot.agent_work_order_id == "wo-test123"
    assert snapshot.current_phase == AgentWorkflowPhase.COMPLETED
    assert snapshot.git_commit_count == 5
    assert snapshot.git_files_changed == 10
    assert snapshot.latest_commit_message == "plan: Create implementation plan"


@pytest.mark.asyncio
async def test_workflow_orchestrator_success():
    """Test successful workflow execution with atomic operations"""
    from src.agent_work_orders.models import StepExecutionResult, WorkflowStep

    # Create mocks for dependencies
    mock_agent_executor = MagicMock()
    mock_sandbox_factory = MagicMock()
    mock_sandbox = MagicMock()
    mock_sandbox.setup = AsyncMock()
    mock_sandbox.cleanup = AsyncMock()
    mock_sandbox.working_dir = "/tmp/sandbox"
    mock_sandbox_factory.create_sandbox = MagicMock(return_value=mock_sandbox)

    mock_github_client = MagicMock()
    mock_phase_tracker = MagicMock()
    mock_command_loader = MagicMock()

    mock_state_repository = MagicMock()
    mock_state_repository.update_status = AsyncMock()
    mock_state_repository.update_git_branch = AsyncMock()
    mock_state_repository.save_step_history = AsyncMock()

    # Mock workflow operations to return successful results
    with patch("src.agent_work_orders.workflow_engine.workflow_orchestrator.workflow_operations") as mock_ops:
        mock_ops.classify_issue = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.CLASSIFY,
                agent_name="classifier",
                success=True,
                output="/feature",
                duration_seconds=1.0,
            )
        )
        mock_ops.build_plan = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.PLAN,
                agent_name="planner",
                success=True,
                output="Plan created",
                duration_seconds=5.0,
            )
        )
        mock_ops.find_plan_file = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.FIND_PLAN,
                agent_name="plan_finder",
                success=True,
                output="specs/issue-42-wo-test123-planner-feature.md",
                duration_seconds=1.0,
            )
        )
        mock_ops.generate_branch = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.GENERATE_BRANCH,
                agent_name="branch_generator",
                success=True,
                output="feat-issue-42-wo-test123",
                duration_seconds=2.0,
            )
        )
        mock_ops.implement_plan = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.IMPLEMENT,
                agent_name="implementor",
                success=True,
                output="Implementation completed",
                duration_seconds=10.0,
            )
        )
        mock_ops.create_commit = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.COMMIT,
                agent_name="committer",
                success=True,
                output="implementor: feat: add feature",
                duration_seconds=1.0,
            )
        )
        mock_ops.create_pull_request = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.CREATE_PR,
                agent_name="pr_creator",
                success=True,
                output="https://github.com/owner/repo/pull/42",
                duration_seconds=2.0,
            )
        )

        orchestrator = WorkflowOrchestrator(
            agent_executor=mock_agent_executor,
            sandbox_factory=mock_sandbox_factory,
            github_client=mock_github_client,
            phase_tracker=mock_phase_tracker,
            command_loader=mock_command_loader,
            state_repository=mock_state_repository,
        )

        # Execute workflow
        await orchestrator.execute_workflow(
            agent_work_order_id="wo-test123",
            workflow_type=AgentWorkflowType.PLAN,
            repository_url="https://github.com/owner/repo",
            sandbox_type=SandboxType.GIT_BRANCH,
            user_request="Add new user authentication feature",
            github_issue_number="42",
            github_issue_json='{"title": "Add feature"}',
        )

        # Verify all workflow operations were called
        mock_ops.classify_issue.assert_called_once()
        mock_ops.build_plan.assert_called_once()
        mock_ops.find_plan_file.assert_called_once()
        mock_ops.generate_branch.assert_called_once()
        mock_ops.implement_plan.assert_called_once()
        mock_ops.create_commit.assert_called_once()
        mock_ops.create_pull_request.assert_called_once()

        # Verify sandbox operations
        mock_sandbox_factory.create_sandbox.assert_called_once()
        mock_sandbox.setup.assert_called_once()
        mock_sandbox.cleanup.assert_called_once()

        # Verify state updates
        assert mock_state_repository.update_status.call_count >= 2
        mock_state_repository.update_git_branch.assert_called_once_with(
            "wo-test123", "feat-issue-42-wo-test123"
        )
        # Verify step history was saved incrementally (7 steps + 1 final save = 8 total)
        assert mock_state_repository.save_step_history.call_count == 8


@pytest.mark.asyncio
async def test_workflow_orchestrator_agent_failure():
    """Test workflow execution with step failure"""
    from src.agent_work_orders.models import StepExecutionResult, WorkflowStep

    # Create mocks for dependencies
    mock_agent_executor = MagicMock()
    mock_sandbox_factory = MagicMock()
    mock_sandbox = MagicMock()
    mock_sandbox.setup = AsyncMock()
    mock_sandbox.cleanup = AsyncMock()
    mock_sandbox.working_dir = "/tmp/sandbox"
    mock_sandbox_factory.create_sandbox = MagicMock(return_value=mock_sandbox)

    mock_github_client = MagicMock()
    mock_phase_tracker = MagicMock()
    mock_command_loader = MagicMock()

    mock_state_repository = MagicMock()
    mock_state_repository.update_status = AsyncMock()
    mock_state_repository.save_step_history = AsyncMock()

    # Mock workflow operations - classification fails
    with patch("src.agent_work_orders.workflow_engine.workflow_orchestrator.workflow_operations") as mock_ops:
        mock_ops.classify_issue = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.CLASSIFY,
                agent_name="classifier",
                success=False,
                error_message="Classification failed",
                duration_seconds=1.0,
            )
        )

        orchestrator = WorkflowOrchestrator(
            agent_executor=mock_agent_executor,
            sandbox_factory=mock_sandbox_factory,
            github_client=mock_github_client,
            phase_tracker=mock_phase_tracker,
            command_loader=mock_command_loader,
            state_repository=mock_state_repository,
        )

        # Execute workflow
        await orchestrator.execute_workflow(
            agent_work_order_id="wo-test123",
            workflow_type=AgentWorkflowType.PLAN,
            repository_url="https://github.com/owner/repo",
            sandbox_type=SandboxType.GIT_BRANCH,
            user_request="Fix the critical bug in login system",
            github_issue_json='{"title": "Test"}',
        )

        # Verify classification was attempted
        mock_ops.classify_issue.assert_called_once()

        # Verify cleanup happened
        mock_sandbox.cleanup.assert_called_once()

        # Verify step history was saved even on failure (incremental + error handler = 2 times)
        assert mock_state_repository.save_step_history.call_count == 2

        # Check that status was updated to FAILED
        calls = [call for call in mock_state_repository.update_status.call_args_list]
        assert any(
            call[0][1] == AgentWorkOrderStatus.FAILED or call.kwargs.get("status") == AgentWorkOrderStatus.FAILED
            for call in calls
        )


@pytest.mark.asyncio
async def test_workflow_orchestrator_pr_creation_failure():
    """Test workflow execution with PR creation failure"""
    from src.agent_work_orders.models import StepExecutionResult, WorkflowStep

    # Create mocks for dependencies
    mock_agent_executor = MagicMock()
    mock_sandbox_factory = MagicMock()
    mock_sandbox = MagicMock()
    mock_sandbox.setup = AsyncMock()
    mock_sandbox.cleanup = AsyncMock()
    mock_sandbox.working_dir = "/tmp/sandbox"
    mock_sandbox_factory.create_sandbox = MagicMock(return_value=mock_sandbox)

    mock_github_client = MagicMock()
    mock_phase_tracker = MagicMock()
    mock_command_loader = MagicMock()

    mock_state_repository = MagicMock()
    mock_state_repository.update_status = AsyncMock()
    mock_state_repository.update_git_branch = AsyncMock()
    mock_state_repository.save_step_history = AsyncMock()

    # Mock workflow operations - all succeed except PR creation
    with patch("src.agent_work_orders.workflow_engine.workflow_orchestrator.workflow_operations") as mock_ops:
        mock_ops.classify_issue = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.CLASSIFY,
                agent_name="classifier",
                success=True,
                output="/feature",
                duration_seconds=1.0,
            )
        )
        mock_ops.build_plan = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.PLAN,
                agent_name="planner",
                success=True,
                output="Plan created",
                duration_seconds=5.0,
            )
        )
        mock_ops.find_plan_file = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.FIND_PLAN,
                agent_name="plan_finder",
                success=True,
                output="specs/plan.md",
                duration_seconds=1.0,
            )
        )
        mock_ops.generate_branch = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.GENERATE_BRANCH,
                agent_name="branch_generator",
                success=True,
                output="feat-issue-42",
                duration_seconds=2.0,
            )
        )
        mock_ops.implement_plan = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.IMPLEMENT,
                agent_name="implementor",
                success=True,
                output="Implementation completed",
                duration_seconds=10.0,
            )
        )
        mock_ops.create_commit = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.COMMIT,
                agent_name="committer",
                success=True,
                output="implementor: feat: add feature",
                duration_seconds=1.0,
            )
        )
        # PR creation fails
        mock_ops.create_pull_request = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.CREATE_PR,
                agent_name="pr_creator",
                success=False,
                error_message="GitHub API error",
                duration_seconds=2.0,
            )
        )

        orchestrator = WorkflowOrchestrator(
            agent_executor=mock_agent_executor,
            sandbox_factory=mock_sandbox_factory,
            github_client=mock_github_client,
            phase_tracker=mock_phase_tracker,
            command_loader=mock_command_loader,
            state_repository=mock_state_repository,
        )

        # Execute workflow
        await orchestrator.execute_workflow(
            agent_work_order_id="wo-test123",
            workflow_type=AgentWorkflowType.PLAN,
            repository_url="https://github.com/owner/repo",
            sandbox_type=SandboxType.GIT_BRANCH,
            user_request="Implement feature from issue 42",
            github_issue_number="42",
            github_issue_json='{"title": "Add feature"}',
        )

        # Verify PR creation was attempted
        mock_ops.create_pull_request.assert_called_once()

        # Verify workflow still marked as completed (PR failure is not critical)
        calls = [call for call in mock_state_repository.update_status.call_args_list]
        assert any(
            call[0][1] == AgentWorkOrderStatus.COMPLETED or call.kwargs.get("status") == AgentWorkOrderStatus.COMPLETED
            for call in calls
        )

        # Verify step history was saved incrementally (7 steps + 1 final save = 8 total)
        assert mock_state_repository.save_step_history.call_count == 8


@pytest.mark.asyncio
async def test_orchestrator_saves_step_history_incrementally():
    """Test that step history is saved after each step, not just at the end"""
    from src.agent_work_orders.models import (
        CommandExecutionResult,
        StepExecutionResult,
        WorkflowStep,
    )
    from src.agent_work_orders.workflow_engine.agent_names import CLASSIFIER

    # Create mocks
    mock_executor = MagicMock()
    mock_sandbox_factory = MagicMock()
    mock_github_client = MagicMock()
    mock_phase_tracker = MagicMock()
    mock_command_loader = MagicMock()
    mock_state_repository = MagicMock()

    # Track save_step_history calls
    save_calls = []
    async def track_save(wo_id, history):
        save_calls.append(len(history.steps))

    mock_state_repository.save_step_history = AsyncMock(side_effect=track_save)
    mock_state_repository.update_status = AsyncMock()
    mock_state_repository.update_git_branch = AsyncMock()

    # Mock sandbox
    mock_sandbox = MagicMock()
    mock_sandbox.working_dir = "/tmp/test"
    mock_sandbox.setup = AsyncMock()
    mock_sandbox.cleanup = AsyncMock()
    mock_sandbox_factory.create_sandbox = MagicMock(return_value=mock_sandbox)

    # Mock GitHub client
    mock_github_client.get_issue = AsyncMock(return_value={
        "title": "Test Issue",
        "body": "Test body"
    })

    # Create orchestrator
    orchestrator = WorkflowOrchestrator(
        agent_executor=mock_executor,
        sandbox_factory=mock_sandbox_factory,
        github_client=mock_github_client,
        phase_tracker=mock_phase_tracker,
        command_loader=mock_command_loader,
        state_repository=mock_state_repository,
    )

    # Mock workflow operations to return success for all steps
    with patch("src.agent_work_orders.workflow_engine.workflow_orchestrator.workflow_operations") as mock_ops:
        # Mock successful results for each step
        mock_ops.classify_issue = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.CLASSIFY,
                agent_name=CLASSIFIER,
                success=True,
                output="/feature",
                duration_seconds=1.0,
            )
        )

        mock_ops.build_plan = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.PLAN,
                agent_name="planner",
                success=True,
                output="Plan created",
                duration_seconds=2.0,
            )
        )

        mock_ops.find_plan_file = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.FIND_PLAN,
                agent_name="plan_finder",
                success=True,
                output="specs/plan.md",
                duration_seconds=0.5,
            )
        )

        mock_ops.generate_branch = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.GENERATE_BRANCH,
                agent_name="branch_generator",
                success=True,
                output="feat-issue-1-wo-test",
                duration_seconds=1.0,
            )
        )

        mock_ops.implement_plan = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.IMPLEMENT,
                agent_name="implementor",
                success=True,
                output="Implementation complete",
                duration_seconds=5.0,
            )
        )

        mock_ops.create_commit = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.COMMIT,
                agent_name="committer",
                success=True,
                output="Commit created",
                duration_seconds=1.0,
            )
        )

        mock_ops.create_pull_request = AsyncMock(
            return_value=StepExecutionResult(
                step=WorkflowStep.CREATE_PR,
                agent_name="pr_creator",
                success=True,
                output="https://github.com/owner/repo/pull/1",
                duration_seconds=1.0,
            )
        )

        # Execute workflow
        await orchestrator.execute_workflow(
            agent_work_order_id="wo-test",
            workflow_type=AgentWorkflowType.PLAN,
            repository_url="https://github.com/owner/repo",
            sandbox_type=SandboxType.GIT_BRANCH,
            user_request="Test feature request",
        )

    # Verify save_step_history was called after EACH step (7 times) + final save (8 total)
    # OR at minimum, verify it was called MORE than just once at the end
    assert len(save_calls) >= 7, f"Expected at least 7 incremental saves, got {len(save_calls)}"

    # Verify the progression: 1 step, 2 steps, 3 steps, etc.
    assert save_calls[0] == 1, "First save should have 1 step"
    assert save_calls[1] == 2, "Second save should have 2 steps"
    assert save_calls[2] == 3, "Third save should have 3 steps"
    assert save_calls[3] == 4, "Fourth save should have 4 steps"
    assert save_calls[4] == 5, "Fifth save should have 5 steps"
    assert save_calls[5] == 6, "Sixth save should have 6 steps"
    assert save_calls[6] == 7, "Seventh save should have 7 steps"


@pytest.mark.asyncio
async def test_step_history_visible_during_execution():
    """Test that step history can be retrieved during workflow execution"""
    from src.agent_work_orders.models import StepHistory

    # Create real state repository (in-memory)
    from src.agent_work_orders.state_manager.work_order_repository import WorkOrderRepository
    state_repo = WorkOrderRepository()

    # Create empty step history
    step_history = StepHistory(agent_work_order_id="wo-test")

    # Simulate incremental saves during workflow
    from src.agent_work_orders.models import StepExecutionResult, WorkflowStep

    # Step 1: Classify
    step_history.steps.append(StepExecutionResult(
        step=WorkflowStep.CLASSIFY,
        agent_name="classifier",
        success=True,
        output="/feature",
        duration_seconds=1.0,
    ))
    await state_repo.save_step_history("wo-test", step_history)

    # Retrieve and verify
    retrieved = await state_repo.get_step_history("wo-test")
    assert retrieved is not None
    assert len(retrieved.steps) == 1
    assert retrieved.steps[0].step == WorkflowStep.CLASSIFY

    # Step 2: Plan
    step_history.steps.append(StepExecutionResult(
        step=WorkflowStep.PLAN,
        agent_name="planner",
        success=True,
        output="Plan created",
        duration_seconds=2.0,
    ))
    await state_repo.save_step_history("wo-test", step_history)

    # Retrieve and verify progression
    retrieved = await state_repo.get_step_history("wo-test")
    assert len(retrieved.steps) == 2
    assert retrieved.steps[1].step == WorkflowStep.PLAN

    # Verify both steps are present
    assert retrieved.steps[0].step == WorkflowStep.CLASSIFY
    assert retrieved.steps[1].step == WorkflowStep.PLAN
