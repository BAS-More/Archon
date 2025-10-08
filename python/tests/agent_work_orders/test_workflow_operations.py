"""Tests for Workflow Operations"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.agent_work_orders.models import (
    CommandExecutionResult,
    WorkflowStep,
)
from src.agent_work_orders.workflow_engine import workflow_operations
from src.agent_work_orders.workflow_engine.agent_names import (
    BRANCH_GENERATOR,
    CLASSIFIER,
    COMMITTER,
    IMPLEMENTOR,
    PLAN_FINDER,
    PLANNER,
    PR_CREATOR,
)


@pytest.mark.asyncio
async def test_classify_issue_success():
    """Test successful issue classification"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="/feature",
            result_text="/feature",
            stderr=None,
            exit_code=0,
            session_id="session-123",
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/classifier.md")

    result = await workflow_operations.classify_issue(
        mock_executor,
        mock_loader,
        '{"title": "Add feature"}',
        "wo-test",
        "/tmp/working",
    )

    assert result.step == WorkflowStep.CLASSIFY
    assert result.agent_name == CLASSIFIER
    assert result.success is True
    assert result.output == "/feature"
    assert result.session_id == "session-123"
    mock_loader.load_command.assert_called_once_with("classifier")


@pytest.mark.asyncio
async def test_classify_issue_failure():
    """Test failed issue classification"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=False,
            stdout=None,
            stderr="Error",
            exit_code=1,
            error_message="Classification failed",
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/classifier.md")

    result = await workflow_operations.classify_issue(
        mock_executor,
        mock_loader,
        '{"title": "Add feature"}',
        "wo-test",
        "/tmp/working",
    )

    assert result.step == WorkflowStep.CLASSIFY
    assert result.agent_name == CLASSIFIER
    assert result.success is False
    assert result.error_message == "Classification failed"


@pytest.mark.asyncio
async def test_build_plan_feature_success():
    """Test successful feature plan creation"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="Plan created successfully",
            result_text="Plan created successfully",
            stderr=None,
            exit_code=0,
            session_id="session-123",
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/planner_feature.md")

    result = await workflow_operations.build_plan(
        mock_executor,
        mock_loader,
        "/feature",
        "42",
        "wo-test",
        '{"title": "Add feature"}',
        "/tmp/working",
    )

    assert result.step == WorkflowStep.PLAN
    assert result.agent_name == PLANNER
    assert result.success is True
    assert result.output == "Plan created successfully"
    mock_loader.load_command.assert_called_once_with("planner_feature")


@pytest.mark.asyncio
async def test_build_plan_bug_success():
    """Test successful bug plan creation"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="Bug plan created",
            result_text="Bug plan created",
            stderr=None,
            exit_code=0,
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/planner_bug.md")

    result = await workflow_operations.build_plan(
        mock_executor,
        mock_loader,
        "/bug",
        "42",
        "wo-test",
        '{"title": "Fix bug"}',
        "/tmp/working",
    )

    assert result.success is True
    mock_loader.load_command.assert_called_once_with("planner_bug")


@pytest.mark.asyncio
async def test_build_plan_invalid_class():
    """Test plan creation with invalid issue class"""
    mock_executor = MagicMock()
    mock_loader = MagicMock()

    result = await workflow_operations.build_plan(
        mock_executor,
        mock_loader,
        "/invalid",
        "42",
        "wo-test",
        '{"title": "Test"}',
        "/tmp/working",
    )

    assert result.step == WorkflowStep.PLAN
    assert result.success is False
    assert "Unknown issue class" in result.error_message


@pytest.mark.asyncio
async def test_find_plan_file_success():
    """Test successful plan file finding"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="specs/issue-42-wo-test-planner-feature.md",
            result_text="specs/issue-42-wo-test-planner-feature.md",
            stderr=None,
            exit_code=0,
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/plan_finder.md")

    result = await workflow_operations.find_plan_file(
        mock_executor,
        mock_loader,
        "42",
        "wo-test",
        "Previous output",
        "/tmp/working",
    )

    assert result.step == WorkflowStep.FIND_PLAN
    assert result.agent_name == PLAN_FINDER
    assert result.success is True
    assert result.output == "specs/issue-42-wo-test-planner-feature.md"


@pytest.mark.asyncio
async def test_find_plan_file_not_found():
    """Test plan file not found"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="0",
            result_text="0",
            stderr=None,
            exit_code=0,
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/plan_finder.md")

    result = await workflow_operations.find_plan_file(
        mock_executor,
        mock_loader,
        "42",
        "wo-test",
        "Previous output",
        "/tmp/working",
    )

    assert result.success is False
    assert result.error_message == "Plan file not found"


@pytest.mark.asyncio
async def test_implement_plan_success():
    """Test successful plan implementation"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="Implementation completed",
            result_text="Implementation completed",
            stderr=None,
            exit_code=0,
            session_id="session-123",
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/implementor.md")

    result = await workflow_operations.implement_plan(
        mock_executor,
        mock_loader,
        "specs/plan.md",
        "wo-test",
        "/tmp/working",
    )

    assert result.step == WorkflowStep.IMPLEMENT
    assert result.agent_name == IMPLEMENTOR
    assert result.success is True
    assert result.output == "Implementation completed"


@pytest.mark.asyncio
async def test_generate_branch_success():
    """Test successful branch generation"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="feat-issue-42-wo-test-add-feature",
            result_text="feat-issue-42-wo-test-add-feature",
            stderr=None,
            exit_code=0,
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/branch_generator.md")

    result = await workflow_operations.generate_branch(
        mock_executor,
        mock_loader,
        "/feature",
        "42",
        "wo-test",
        '{"title": "Add feature"}',
        "/tmp/working",
    )

    assert result.step == WorkflowStep.GENERATE_BRANCH
    assert result.agent_name == BRANCH_GENERATOR
    assert result.success is True
    assert result.output == "feat-issue-42-wo-test-add-feature"


@pytest.mark.asyncio
async def test_create_commit_success():
    """Test successful commit creation"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="implementor: feat: add user authentication",
            result_text="implementor: feat: add user authentication",
            stderr=None,
            exit_code=0,
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/committer.md")

    result = await workflow_operations.create_commit(
        mock_executor,
        mock_loader,
        "implementor",
        "/feature",
        '{"title": "Add auth"}',
        "wo-test",
        "/tmp/working",
    )

    assert result.step == WorkflowStep.COMMIT
    assert result.agent_name == COMMITTER
    assert result.success is True
    assert result.output == "implementor: feat: add user authentication"


@pytest.mark.asyncio
async def test_create_pull_request_success():
    """Test successful PR creation"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=True,
            stdout="https://github.com/owner/repo/pull/123",
            result_text="https://github.com/owner/repo/pull/123",
            stderr=None,
            exit_code=0,
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/pr_creator.md")

    result = await workflow_operations.create_pull_request(
        mock_executor,
        mock_loader,
        "feat-issue-42",
        '{"title": "Add feature"}',
        "specs/plan.md",
        "wo-test",
        "/tmp/working",
    )

    assert result.step == WorkflowStep.CREATE_PR
    assert result.agent_name == PR_CREATOR
    assert result.success is True
    assert result.output == "https://github.com/owner/repo/pull/123"


@pytest.mark.asyncio
async def test_create_pull_request_failure():
    """Test failed PR creation"""
    mock_executor = MagicMock()
    mock_executor.build_command = MagicMock(return_value=("cli command", "prompt"))
    mock_executor.execute_async = AsyncMock(
        return_value=CommandExecutionResult(
            success=False,
            stdout=None,
            stderr="PR creation failed",
            exit_code=1,
            error_message="GitHub API error",
        )
    )

    mock_loader = MagicMock()
    mock_loader.load_command = MagicMock(return_value="/path/to/pr_creator.md")

    result = await workflow_operations.create_pull_request(
        mock_executor,
        mock_loader,
        "feat-issue-42",
        '{"title": "Add feature"}',
        "specs/plan.md",
        "wo-test",
        "/tmp/working",
    )

    assert result.success is False
    assert result.error_message == "GitHub API error"
