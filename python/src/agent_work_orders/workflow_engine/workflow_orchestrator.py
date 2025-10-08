"""Workflow Orchestrator

Main orchestration logic for workflow execution.
"""

import json
import re

from ..agent_executor.agent_cli_executor import AgentCLIExecutor
from ..command_loader.claude_command_loader import ClaudeCommandLoader
from ..github_integration.github_client import GitHubClient
from ..models import (
    AgentWorkflowType,
    AgentWorkOrderStatus,
    SandboxType,
    StepHistory,
    WorkflowExecutionError,
)
from ..sandbox_manager.sandbox_factory import SandboxFactory
from ..state_manager.work_order_repository import WorkOrderRepository
from ..utils.id_generator import generate_sandbox_identifier
from ..utils.structured_logger import get_logger
from . import workflow_operations
from .agent_names import IMPLEMENTOR
from .workflow_phase_tracker import WorkflowPhaseTracker

logger = get_logger(__name__)


class WorkflowOrchestrator:
    """Orchestrates workflow execution"""

    def __init__(
        self,
        agent_executor: AgentCLIExecutor,
        sandbox_factory: SandboxFactory,
        github_client: GitHubClient,
        phase_tracker: WorkflowPhaseTracker,
        command_loader: ClaudeCommandLoader,
        state_repository: WorkOrderRepository,
    ):
        self.agent_executor = agent_executor
        self.sandbox_factory = sandbox_factory
        self.github_client = github_client
        self.phase_tracker = phase_tracker
        self.command_loader = command_loader
        self.state_repository = state_repository
        self._logger = logger

    async def execute_workflow(
        self,
        agent_work_order_id: str,
        workflow_type: AgentWorkflowType,
        repository_url: str,
        sandbox_type: SandboxType,
        user_request: str,
        github_issue_number: str | None = None,
        github_issue_json: str | None = None,
    ) -> None:
        """Execute workflow as sequence of atomic operations

        This runs in the background and updates state as it progresses.

        Args:
            agent_work_order_id: Work order ID
            workflow_type: Workflow to execute
            repository_url: Git repository URL
            sandbox_type: Sandbox environment type
            user_request: User's description of the work to be done
            github_issue_number: Optional GitHub issue number
            github_issue_json: Optional GitHub issue JSON
        """
        bound_logger = self._logger.bind(
            agent_work_order_id=agent_work_order_id,
            workflow_type=workflow_type.value,
            sandbox_type=sandbox_type.value,
        )

        bound_logger.info("agent_work_order_started")

        # Initialize step history
        step_history = StepHistory(agent_work_order_id=agent_work_order_id)

        sandbox = None

        try:
            # Update status to RUNNING
            await self.state_repository.update_status(
                agent_work_order_id, AgentWorkOrderStatus.RUNNING
            )

            # Create sandbox
            sandbox_identifier = generate_sandbox_identifier(agent_work_order_id)
            sandbox = self.sandbox_factory.create_sandbox(
                sandbox_type, repository_url, sandbox_identifier
            )
            await sandbox.setup()
            bound_logger.info("sandbox_created", sandbox_identifier=sandbox_identifier)

            # Parse GitHub issue from user request if mentioned
            issue_match = re.search(r'(?:issue|#)\s*#?(\d+)', user_request, re.IGNORECASE)
            if issue_match and not github_issue_number:
                github_issue_number = issue_match.group(1)
                bound_logger.info("github_issue_detected_in_request", issue_number=github_issue_number)

            # Fetch GitHub issue if number provided
            if github_issue_number and not github_issue_json:
                try:
                    issue_data = await self.github_client.get_issue(repository_url, github_issue_number)
                    github_issue_json = json.dumps(issue_data)
                    bound_logger.info("github_issue_fetched", issue_number=github_issue_number)
                except Exception as e:
                    bound_logger.warning("github_issue_fetch_failed", error=str(e))
                    # Continue without issue data - use user_request only

            # Prepare classification input: merge user request with issue data if available
            classification_input = user_request
            if github_issue_json:
                issue_data = json.loads(github_issue_json)
                classification_input = f"User Request: {user_request}\n\nGitHub Issue Details:\nTitle: {issue_data.get('title', '')}\nBody: {issue_data.get('body', '')}"

            # Step 1: Classify issue
            classify_result = await workflow_operations.classify_issue(
                self.agent_executor,
                self.command_loader,
                classification_input,
                agent_work_order_id,
                sandbox.working_dir,
            )
            step_history.steps.append(classify_result)
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            if not classify_result.success:
                raise WorkflowExecutionError(
                    f"Classification failed: {classify_result.error_message}"
                )

            issue_class = classify_result.output
            bound_logger.info("step_completed", step="classify", issue_class=issue_class)

            # Step 2: Build plan
            plan_result = await workflow_operations.build_plan(
                self.agent_executor,
                self.command_loader,
                issue_class or "",
                github_issue_number or "",
                agent_work_order_id,
                classification_input,
                sandbox.working_dir,
            )
            step_history.steps.append(plan_result)
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            if not plan_result.success:
                raise WorkflowExecutionError(f"Planning failed: {plan_result.error_message}")

            bound_logger.info("step_completed", step="plan")

            # Step 3: Find plan file
            plan_finder_result = await workflow_operations.find_plan_file(
                self.agent_executor,
                self.command_loader,
                github_issue_number or "",
                agent_work_order_id,
                plan_result.output or "",
                sandbox.working_dir,
            )
            step_history.steps.append(plan_finder_result)
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            if not plan_finder_result.success:
                raise WorkflowExecutionError(
                    f"Plan file not found: {plan_finder_result.error_message}"
                )

            plan_file = plan_finder_result.output
            bound_logger.info("step_completed", step="find_plan", plan_file=plan_file)

            # Step 4: Generate branch
            branch_result = await workflow_operations.generate_branch(
                self.agent_executor,
                self.command_loader,
                issue_class or "",
                github_issue_number or "",
                agent_work_order_id,
                classification_input,
                sandbox.working_dir,
            )
            step_history.steps.append(branch_result)
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            if not branch_result.success:
                raise WorkflowExecutionError(
                    f"Branch creation failed: {branch_result.error_message}"
                )

            git_branch_name = branch_result.output
            await self.state_repository.update_git_branch(agent_work_order_id, git_branch_name or "")
            bound_logger.info("step_completed", step="branch", branch_name=git_branch_name)

            # Step 5: Implement plan
            implement_result = await workflow_operations.implement_plan(
                self.agent_executor,
                self.command_loader,
                plan_file or "",
                agent_work_order_id,
                sandbox.working_dir,
            )
            step_history.steps.append(implement_result)
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            if not implement_result.success:
                raise WorkflowExecutionError(
                    f"Implementation failed: {implement_result.error_message}"
                )

            bound_logger.info("step_completed", step="implement")

            # Step 6: Commit changes
            commit_result = await workflow_operations.create_commit(
                self.agent_executor,
                self.command_loader,
                IMPLEMENTOR,
                issue_class or "",
                classification_input,
                agent_work_order_id,
                sandbox.working_dir,
            )
            step_history.steps.append(commit_result)
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            if not commit_result.success:
                raise WorkflowExecutionError(f"Commit failed: {commit_result.error_message}")

            bound_logger.info("step_completed", step="commit")

            # Step 7: Run tests (if enabled)
            from ..config import config
            if config.ENABLE_TEST_PHASE:
                from .test_workflow import run_tests_with_resolution

                bound_logger.info("test_phase_started")
                test_results, passed_count, failed_count = await run_tests_with_resolution(
                    self.agent_executor,
                    self.command_loader,
                    agent_work_order_id,
                    sandbox.working_dir,
                    bound_logger,
                    max_attempts=config.MAX_TEST_RETRY_ATTEMPTS,
                )

                # Record test execution in step history
                test_summary = f"Tests: {passed_count} passed, {failed_count} failed"
                from ..models import StepExecutionResult
                test_step = StepExecutionResult(
                    step=WorkflowStep.TEST,
                    agent_name="Tester",
                    success=(failed_count == 0),
                    output=test_summary,
                    error_message=f"{failed_count} test(s) failed" if failed_count > 0 else None,
                    duration_seconds=0,
                )
                step_history.steps.append(test_step)
                await self.state_repository.save_step_history(agent_work_order_id, step_history)

                if failed_count > 0:
                    bound_logger.warning("test_phase_completed_with_failures", failed_count=failed_count)
                else:
                    bound_logger.info("test_phase_completed", passed_count=passed_count)

            # Step 8: Run review (if enabled)
            if config.ENABLE_REVIEW_PHASE:
                from .review_workflow import run_review_with_resolution

                # Determine spec file path from plan_file or default
                spec_file = plan_file if plan_file else f"PRPs/specs/{issue_class}-spec.md"

                bound_logger.info("review_phase_started", spec_file=spec_file)
                review_result = await run_review_with_resolution(
                    self.agent_executor,
                    self.command_loader,
                    spec_file,
                    agent_work_order_id,
                    sandbox.working_dir,
                    bound_logger,
                    max_attempts=config.MAX_REVIEW_RETRY_ATTEMPTS,
                )

                # Record review execution in step history
                blocker_count = review_result.get_blocker_count()
                review_summary = f"Review: {len(review_result.review_issues)} issues found, {blocker_count} blockers"
                review_step = StepExecutionResult(
                    step=WorkflowStep.REVIEW,
                    agent_name="Reviewer",
                    success=(blocker_count == 0),
                    output=review_summary,
                    error_message=f"{blocker_count} blocker(s) remaining" if blocker_count > 0 else None,
                    duration_seconds=0,
                )
                step_history.steps.append(review_step)
                await self.state_repository.save_step_history(agent_work_order_id, step_history)

                if blocker_count > 0:
                    bound_logger.warning("review_phase_completed_with_blockers", blocker_count=blocker_count)
                else:
                    bound_logger.info("review_phase_completed", issue_count=len(review_result.review_issues))

            # Step 9: Create PR
            pr_result = await workflow_operations.create_pull_request(
                self.agent_executor,
                self.command_loader,
                git_branch_name or "",
                classification_input,
                plan_file or "",
                agent_work_order_id,
                sandbox.working_dir,
            )
            step_history.steps.append(pr_result)
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            if pr_result.success:
                pr_url = pr_result.output
                await self.state_repository.update_status(
                    agent_work_order_id,
                    AgentWorkOrderStatus.COMPLETED,
                    github_pull_request_url=pr_url,
                )
                bound_logger.info("step_completed", step="create_pr", pr_url=pr_url)
            else:
                # PR creation failed but workflow succeeded
                await self.state_repository.update_status(
                    agent_work_order_id,
                    AgentWorkOrderStatus.COMPLETED,
                    error_message=f"PR creation failed: {pr_result.error_message}",
                )

            # Save step history to state
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            bound_logger.info("agent_work_order_completed", total_steps=len(step_history.steps))

        except Exception as e:
            error_msg = str(e)
            bound_logger.error("agent_work_order_failed", error=error_msg, exc_info=True)

            # Save partial step history even on failure
            await self.state_repository.save_step_history(agent_work_order_id, step_history)

            await self.state_repository.update_status(
                agent_work_order_id,
                AgentWorkOrderStatus.FAILED,
                error_message=error_msg,
            )

        finally:
            # Cleanup sandbox
            if sandbox:
                try:
                    await sandbox.cleanup()
                    bound_logger.info("sandbox_cleanup_completed")
                except Exception as cleanup_error:
                    bound_logger.error(
                        "sandbox_cleanup_failed",
                        error=str(cleanup_error),
                        exc_info=True,
                    )
