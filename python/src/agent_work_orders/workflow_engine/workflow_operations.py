"""Workflow Operations

Atomic operations for workflow execution.
Each function executes one discrete agent operation.
"""

import time

from ..agent_executor.agent_cli_executor import AgentCLIExecutor
from ..command_loader.claude_command_loader import ClaudeCommandLoader
from ..models import StepExecutionResult, WorkflowStep
from ..utils.structured_logger import get_logger
from .agent_names import (
    BRANCH_GENERATOR,
    CLASSIFIER,
    COMMITTER,
    IMPLEMENTOR,
    PLAN_FINDER,
    PLANNER,
    PR_CREATOR,
)

logger = get_logger(__name__)


async def classify_issue(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    issue_json: str,
    work_order_id: str,
    working_dir: str,
) -> StepExecutionResult:
    """Classify issue type using classifier agent

    Returns: StepExecutionResult with issue_class in output (/bug, /feature, /chore)
    """
    start_time = time.time()

    try:
        command_file = command_loader.load_command("classifier")

        cli_command, prompt_text = executor.build_command(command_file, args=[issue_json])

        result = await executor.execute_async(
            cli_command, working_dir, prompt_text=prompt_text, work_order_id=work_order_id
        )

        duration = time.time() - start_time

        if result.success and result.result_text:
            issue_class = result.result_text.strip()

            return StepExecutionResult(
                step=WorkflowStep.CLASSIFY,
                agent_name=CLASSIFIER,
                success=True,
                output=issue_class,
                duration_seconds=duration,
                session_id=result.session_id,
            )
        else:
            return StepExecutionResult(
                step=WorkflowStep.CLASSIFY,
                agent_name=CLASSIFIER,
                success=False,
                error_message=result.error_message or "Classification failed",
                duration_seconds=duration,
            )

    except Exception as e:
        duration = time.time() - start_time
        logger.error("classify_issue_error", error=str(e), exc_info=True)
        return StepExecutionResult(
            step=WorkflowStep.CLASSIFY,
            agent_name=CLASSIFIER,
            success=False,
            error_message=str(e),
            duration_seconds=duration,
        )


async def build_plan(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    issue_class: str,
    issue_number: str,
    work_order_id: str,
    issue_json: str,
    working_dir: str,
) -> StepExecutionResult:
    """Build implementation plan based on issue classification

    Returns: StepExecutionResult with plan output
    """
    start_time = time.time()

    try:
        # Map issue class to planner command
        planner_map = {
            "/bug": "planner_bug",
            "/feature": "planner_feature",
            "/chore": "planner_chore",
        }

        planner_command = planner_map.get(issue_class)
        if not planner_command:
            return StepExecutionResult(
                step=WorkflowStep.PLAN,
                agent_name=PLANNER,
                success=False,
                error_message=f"Unknown issue class: {issue_class}",
                duration_seconds=time.time() - start_time,
            )

        command_file = command_loader.load_command(planner_command)

        # Pass issue_number, work_order_id, issue_json as arguments
        cli_command, prompt_text = executor.build_command(
            command_file, args=[issue_number, work_order_id, issue_json]
        )

        result = await executor.execute_async(
            cli_command, working_dir, prompt_text=prompt_text, work_order_id=work_order_id
        )

        duration = time.time() - start_time

        if result.success:
            return StepExecutionResult(
                step=WorkflowStep.PLAN,
                agent_name=PLANNER,
                success=True,
                output=result.result_text or result.stdout or "",
                duration_seconds=duration,
                session_id=result.session_id,
            )
        else:
            return StepExecutionResult(
                step=WorkflowStep.PLAN,
                agent_name=PLANNER,
                success=False,
                error_message=result.error_message or "Planning failed",
                duration_seconds=duration,
            )

    except Exception as e:
        duration = time.time() - start_time
        logger.error("build_plan_error", error=str(e), exc_info=True)
        return StepExecutionResult(
            step=WorkflowStep.PLAN,
            agent_name=PLANNER,
            success=False,
            error_message=str(e),
            duration_seconds=duration,
        )


async def find_plan_file(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    issue_number: str,
    work_order_id: str,
    previous_output: str,
    working_dir: str,
) -> StepExecutionResult:
    """Find plan file created by planner

    Returns: StepExecutionResult with plan file path in output
    """
    start_time = time.time()

    try:
        command_file = command_loader.load_command("plan_finder")

        cli_command, prompt_text = executor.build_command(
            command_file, args=[issue_number, work_order_id, previous_output]
        )

        result = await executor.execute_async(
            cli_command, working_dir, prompt_text=prompt_text, work_order_id=work_order_id
        )

        duration = time.time() - start_time

        if result.success and result.result_text and result.result_text.strip() != "0":
            plan_file_path = result.result_text.strip()
            return StepExecutionResult(
                step=WorkflowStep.FIND_PLAN,
                agent_name=PLAN_FINDER,
                success=True,
                output=plan_file_path,
                duration_seconds=duration,
                session_id=result.session_id,
            )
        else:
            return StepExecutionResult(
                step=WorkflowStep.FIND_PLAN,
                agent_name=PLAN_FINDER,
                success=False,
                error_message="Plan file not found",
                duration_seconds=duration,
            )

    except Exception as e:
        duration = time.time() - start_time
        logger.error("find_plan_file_error", error=str(e), exc_info=True)
        return StepExecutionResult(
            step=WorkflowStep.FIND_PLAN,
            agent_name=PLAN_FINDER,
            success=False,
            error_message=str(e),
            duration_seconds=duration,
        )


async def implement_plan(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    plan_file: str,
    work_order_id: str,
    working_dir: str,
) -> StepExecutionResult:
    """Implement the plan

    Returns: StepExecutionResult with implementation output
    """
    start_time = time.time()

    try:
        command_file = command_loader.load_command("implementor")

        cli_command, prompt_text = executor.build_command(command_file, args=[plan_file])

        result = await executor.execute_async(
            cli_command, working_dir, prompt_text=prompt_text, work_order_id=work_order_id
        )

        duration = time.time() - start_time

        if result.success:
            return StepExecutionResult(
                step=WorkflowStep.IMPLEMENT,
                agent_name=IMPLEMENTOR,
                success=True,
                output=result.result_text or result.stdout or "",
                duration_seconds=duration,
                session_id=result.session_id,
            )
        else:
            return StepExecutionResult(
                step=WorkflowStep.IMPLEMENT,
                agent_name=IMPLEMENTOR,
                success=False,
                error_message=result.error_message or "Implementation failed",
                duration_seconds=duration,
            )

    except Exception as e:
        duration = time.time() - start_time
        logger.error("implement_plan_error", error=str(e), exc_info=True)
        return StepExecutionResult(
            step=WorkflowStep.IMPLEMENT,
            agent_name=IMPLEMENTOR,
            success=False,
            error_message=str(e),
            duration_seconds=duration,
        )


async def generate_branch(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    issue_class: str,
    issue_number: str,
    work_order_id: str,
    issue_json: str,
    working_dir: str,
) -> StepExecutionResult:
    """Generate and create git branch

    Returns: StepExecutionResult with branch name in output
    """
    start_time = time.time()

    try:
        command_file = command_loader.load_command("branch_generator")

        cli_command, prompt_text = executor.build_command(
            command_file, args=[issue_class, issue_number, work_order_id, issue_json]
        )

        result = await executor.execute_async(
            cli_command, working_dir, prompt_text=prompt_text, work_order_id=work_order_id
        )

        duration = time.time() - start_time

        if result.success and result.result_text:
            branch_name = result.result_text.strip()
            return StepExecutionResult(
                step=WorkflowStep.GENERATE_BRANCH,
                agent_name=BRANCH_GENERATOR,
                success=True,
                output=branch_name,
                duration_seconds=duration,
                session_id=result.session_id,
            )
        else:
            return StepExecutionResult(
                step=WorkflowStep.GENERATE_BRANCH,
                agent_name=BRANCH_GENERATOR,
                success=False,
                error_message=result.error_message or "Branch generation failed",
                duration_seconds=duration,
            )

    except Exception as e:
        duration = time.time() - start_time
        logger.error("generate_branch_error", error=str(e), exc_info=True)
        return StepExecutionResult(
            step=WorkflowStep.GENERATE_BRANCH,
            agent_name=BRANCH_GENERATOR,
            success=False,
            error_message=str(e),
            duration_seconds=duration,
        )


async def create_commit(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    agent_name: str,
    issue_class: str,
    issue_json: str,
    work_order_id: str,
    working_dir: str,
) -> StepExecutionResult:
    """Create git commit

    Returns: StepExecutionResult with commit message in output
    """
    start_time = time.time()

    try:
        command_file = command_loader.load_command("committer")

        cli_command, prompt_text = executor.build_command(
            command_file, args=[agent_name, issue_class, issue_json]
        )

        result = await executor.execute_async(
            cli_command, working_dir, prompt_text=prompt_text, work_order_id=work_order_id
        )

        duration = time.time() - start_time

        if result.success and result.result_text:
            commit_message = result.result_text.strip()
            return StepExecutionResult(
                step=WorkflowStep.COMMIT,
                agent_name=COMMITTER,
                success=True,
                output=commit_message,
                duration_seconds=duration,
                session_id=result.session_id,
            )
        else:
            return StepExecutionResult(
                step=WorkflowStep.COMMIT,
                agent_name=COMMITTER,
                success=False,
                error_message=result.error_message or "Commit creation failed",
                duration_seconds=duration,
            )

    except Exception as e:
        duration = time.time() - start_time
        logger.error("create_commit_error", error=str(e), exc_info=True)
        return StepExecutionResult(
            step=WorkflowStep.COMMIT,
            agent_name=COMMITTER,
            success=False,
            error_message=str(e),
            duration_seconds=duration,
        )


async def create_pull_request(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    branch_name: str,
    issue_json: str,
    plan_file: str,
    work_order_id: str,
    working_dir: str,
) -> StepExecutionResult:
    """Create GitHub pull request

    Returns: StepExecutionResult with PR URL in output
    """
    start_time = time.time()

    try:
        command_file = command_loader.load_command("pr_creator")

        cli_command, prompt_text = executor.build_command(
            command_file, args=[branch_name, issue_json, plan_file, work_order_id]
        )

        result = await executor.execute_async(
            cli_command, working_dir, prompt_text=prompt_text, work_order_id=work_order_id
        )

        duration = time.time() - start_time

        if result.success and result.result_text:
            pr_url = result.result_text.strip()
            return StepExecutionResult(
                step=WorkflowStep.CREATE_PR,
                agent_name=PR_CREATOR,
                success=True,
                output=pr_url,
                duration_seconds=duration,
                session_id=result.session_id,
            )
        else:
            return StepExecutionResult(
                step=WorkflowStep.CREATE_PR,
                agent_name=PR_CREATOR,
                success=False,
                error_message=result.error_message or "PR creation failed",
                duration_seconds=duration,
            )

    except Exception as e:
        duration = time.time() - start_time
        logger.error("create_pull_request_error", error=str(e), exc_info=True)
        return StepExecutionResult(
            step=WorkflowStep.CREATE_PR,
            agent_name=PR_CREATOR,
            success=False,
            error_message=str(e),
            duration_seconds=duration,
        )
