"""Tests for Agent Work Orders Models"""

import pytest
from datetime import datetime

from src.agent_work_orders.models import (
    AgentWorkOrder,
    AgentWorkOrderState,
    AgentWorkOrderStatus,
    AgentWorkflowPhase,
    AgentWorkflowType,
    CommandExecutionResult,
    CreateAgentWorkOrderRequest,
    SandboxType,
    StepExecutionResult,
    StepHistory,
    WorkflowStep,
)


def test_agent_work_order_status_enum():
    """Test AgentWorkOrderStatus enum values"""
    assert AgentWorkOrderStatus.PENDING.value == "pending"
    assert AgentWorkOrderStatus.RUNNING.value == "running"
    assert AgentWorkOrderStatus.COMPLETED.value == "completed"
    assert AgentWorkOrderStatus.FAILED.value == "failed"


def test_agent_workflow_type_enum():
    """Test AgentWorkflowType enum values"""
    assert AgentWorkflowType.PLAN.value == "agent_workflow_plan"


def test_sandbox_type_enum():
    """Test SandboxType enum values"""
    assert SandboxType.GIT_BRANCH.value == "git_branch"
    assert SandboxType.GIT_WORKTREE.value == "git_worktree"
    assert SandboxType.E2B.value == "e2b"
    assert SandboxType.DAGGER.value == "dagger"


def test_agent_workflow_phase_enum():
    """Test AgentWorkflowPhase enum values"""
    assert AgentWorkflowPhase.PLANNING.value == "planning"
    assert AgentWorkflowPhase.COMPLETED.value == "completed"


def test_agent_work_order_state_creation():
    """Test creating AgentWorkOrderState"""
    state = AgentWorkOrderState(
        agent_work_order_id="wo-test123",
        repository_url="https://github.com/owner/repo",
        sandbox_identifier="sandbox-wo-test123",
        git_branch_name=None,
        agent_session_id=None,
    )

    assert state.agent_work_order_id == "wo-test123"
    assert state.repository_url == "https://github.com/owner/repo"
    assert state.sandbox_identifier == "sandbox-wo-test123"
    assert state.git_branch_name is None
    assert state.agent_session_id is None


def test_agent_work_order_creation():
    """Test creating complete AgentWorkOrder"""
    now = datetime.now()

    work_order = AgentWorkOrder(
        agent_work_order_id="wo-test123",
        repository_url="https://github.com/owner/repo",
        sandbox_identifier="sandbox-wo-test123",
        git_branch_name="feat-wo-test123",
        agent_session_id="session-123",
        workflow_type=AgentWorkflowType.PLAN,
        sandbox_type=SandboxType.GIT_BRANCH,
        github_issue_number="42",
        status=AgentWorkOrderStatus.RUNNING,
        current_phase=AgentWorkflowPhase.PLANNING,
        created_at=now,
        updated_at=now,
        github_pull_request_url=None,
        git_commit_count=0,
        git_files_changed=0,
        error_message=None,
    )

    assert work_order.agent_work_order_id == "wo-test123"
    assert work_order.workflow_type == AgentWorkflowType.PLAN
    assert work_order.status == AgentWorkOrderStatus.RUNNING
    assert work_order.current_phase == AgentWorkflowPhase.PLANNING


def test_create_agent_work_order_request():
    """Test CreateAgentWorkOrderRequest validation"""
    request = CreateAgentWorkOrderRequest(
        repository_url="https://github.com/owner/repo",
        sandbox_type=SandboxType.GIT_BRANCH,
        workflow_type=AgentWorkflowType.PLAN,
        user_request="Add user authentication feature",
        github_issue_number="42",
    )

    assert request.repository_url == "https://github.com/owner/repo"
    assert request.sandbox_type == SandboxType.GIT_BRANCH
    assert request.workflow_type == AgentWorkflowType.PLAN
    assert request.user_request == "Add user authentication feature"
    assert request.github_issue_number == "42"


def test_create_agent_work_order_request_optional_fields():
    """Test CreateAgentWorkOrderRequest with optional fields"""
    request = CreateAgentWorkOrderRequest(
        repository_url="https://github.com/owner/repo",
        sandbox_type=SandboxType.GIT_BRANCH,
        workflow_type=AgentWorkflowType.PLAN,
        user_request="Fix the login bug",
    )

    assert request.user_request == "Fix the login bug"
    assert request.github_issue_number is None


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


def test_workflow_step_enum():
    """Test WorkflowStep enum values"""
    assert WorkflowStep.CLASSIFY.value == "classify"
    assert WorkflowStep.PLAN.value == "plan"
    assert WorkflowStep.FIND_PLAN.value == "find_plan"
    assert WorkflowStep.IMPLEMENT.value == "implement"
    assert WorkflowStep.GENERATE_BRANCH.value == "generate_branch"
    assert WorkflowStep.COMMIT.value == "commit"
    assert WorkflowStep.REVIEW.value == "review"
    assert WorkflowStep.TEST.value == "test"
    assert WorkflowStep.CREATE_PR.value == "create_pr"


def test_step_execution_result_success():
    """Test creating successful StepExecutionResult"""
    result = StepExecutionResult(
        step=WorkflowStep.CLASSIFY,
        agent_name="classifier",
        success=True,
        output="/feature",
        duration_seconds=1.5,
        session_id="session-123",
    )

    assert result.step == WorkflowStep.CLASSIFY
    assert result.agent_name == "classifier"
    assert result.success is True
    assert result.output == "/feature"
    assert result.error_message is None
    assert result.duration_seconds == 1.5
    assert result.session_id == "session-123"
    assert isinstance(result.timestamp, datetime)


def test_step_execution_result_failure():
    """Test creating failed StepExecutionResult"""
    result = StepExecutionResult(
        step=WorkflowStep.PLAN,
        agent_name="planner",
        success=False,
        error_message="Planning failed: timeout",
        duration_seconds=30.0,
    )

    assert result.step == WorkflowStep.PLAN
    assert result.agent_name == "planner"
    assert result.success is False
    assert result.output is None
    assert result.error_message == "Planning failed: timeout"
    assert result.duration_seconds == 30.0
    assert result.session_id is None


def test_step_history_creation():
    """Test creating StepHistory"""
    history = StepHistory(agent_work_order_id="wo-test123", steps=[])

    assert history.agent_work_order_id == "wo-test123"
    assert len(history.steps) == 0


def test_step_history_with_steps():
    """Test StepHistory with multiple steps"""
    step1 = StepExecutionResult(
        step=WorkflowStep.CLASSIFY,
        agent_name="classifier",
        success=True,
        output="/feature",
        duration_seconds=1.0,
    )

    step2 = StepExecutionResult(
        step=WorkflowStep.PLAN,
        agent_name="planner",
        success=True,
        output="Plan created",
        duration_seconds=5.0,
    )

    history = StepHistory(agent_work_order_id="wo-test123", steps=[step1, step2])

    assert history.agent_work_order_id == "wo-test123"
    assert len(history.steps) == 2
    assert history.steps[0].step == WorkflowStep.CLASSIFY
    assert history.steps[1].step == WorkflowStep.PLAN


def test_step_history_get_current_step_initial():
    """Test get_current_step returns CLASSIFY when no steps"""
    history = StepHistory(agent_work_order_id="wo-test123", steps=[])

    assert history.get_current_step() == WorkflowStep.CLASSIFY


def test_step_history_get_current_step_retry_failed():
    """Test get_current_step returns same step when failed"""
    failed_step = StepExecutionResult(
        step=WorkflowStep.PLAN,
        agent_name="planner",
        success=False,
        error_message="Planning failed",
        duration_seconds=5.0,
    )

    history = StepHistory(agent_work_order_id="wo-test123", steps=[failed_step])

    assert history.get_current_step() == WorkflowStep.PLAN


def test_step_history_get_current_step_next():
    """Test get_current_step returns next step after success"""
    classify_step = StepExecutionResult(
        step=WorkflowStep.CLASSIFY,
        agent_name="classifier",
        success=True,
        output="/feature",
        duration_seconds=1.0,
    )

    history = StepHistory(agent_work_order_id="wo-test123", steps=[classify_step])

    assert history.get_current_step() == WorkflowStep.PLAN


def test_command_execution_result_with_result_text():
    """Test CommandExecutionResult includes result_text field"""
    result = CommandExecutionResult(
        success=True,
        stdout='{"type":"result","result":"/feature"}',
        result_text="/feature",
        stderr=None,
        exit_code=0,
        session_id="session-123",
    )
    assert result.result_text == "/feature"
    assert result.stdout == '{"type":"result","result":"/feature"}'
    assert result.success is True


def test_command_execution_result_without_result_text():
    """Test CommandExecutionResult works without result_text (backward compatibility)"""
    result = CommandExecutionResult(
        success=True,
        stdout="raw output",
        stderr=None,
        exit_code=0,
    )
    assert result.result_text is None
    assert result.stdout == "raw output"
