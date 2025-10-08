"""Test Workflow with Automatic Resolution

Executes test suite and automatically resolves failures with retry logic (max 4 attempts).
"""

import json
from typing import TYPE_CHECKING

from ..agent_executor.agent_cli_executor import AgentCLIExecutor
from ..command_loader.claude_command_loader import ClaudeCommandLoader
from ..models import StepExecutionResult, WorkflowStep
from ..utils.structured_logger import get_logger
from .agent_names import TESTER

if TYPE_CHECKING:
    import structlog

logger = get_logger(__name__)


class TestResult:
    """Represents a single test result"""

    def __init__(
        self,
        test_name: str,
        passed: bool,
        execution_command: str,
        test_purpose: str,
        error: str | None = None,
    ):
        self.test_name = test_name
        self.passed = passed
        self.execution_command = execution_command
        self.test_purpose = test_purpose
        self.error = error

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "test_name": self.test_name,
            "passed": self.passed,
            "execution_command": self.execution_command,
            "test_purpose": self.test_purpose,
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TestResult":
        """Create TestResult from dictionary"""
        return cls(
            test_name=data["test_name"],
            passed=data["passed"],
            execution_command=data["execution_command"],
            test_purpose=data["test_purpose"],
            error=data.get("error"),
        )


async def run_tests(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    work_order_id: str,
    working_dir: str,
    bound_logger: "structlog.stdlib.BoundLogger",
) -> StepExecutionResult:
    """Execute test suite and return results

    Args:
        executor: Agent CLI executor
        command_loader: Command loader
        work_order_id: Work order ID
        working_dir: Working directory
        bound_logger: Logger instance

    Returns:
        StepExecutionResult with test results
    """
    bound_logger.info("test_execution_started")

    # Execute test command
    result = await executor.execute_command(
        command_name="test",
        arguments=[],
        working_directory=working_dir,
        logger=bound_logger,
    )

    if not result.success:
        return StepExecutionResult(
            step=WorkflowStep.TEST,
            agent_name=TESTER,
            success=False,
            output=result.result_text or result.stdout,
            error_message=f"Test execution failed: {result.error_message}",
            duration_seconds=result.duration_seconds or 0,
            session_id=result.session_id,
        )

    # Parse test results from output
    test_results, passed_count, failed_count = parse_test_results(
        result.result_text or result.stdout or "", bound_logger
    )

    success = failed_count == 0
    output_summary = f"Tests: {passed_count} passed, {failed_count} failed"

    return StepExecutionResult(
        step=WorkflowStep.TEST,
        agent_name=TESTER,
        success=success,
        output=output_summary,
        error_message=None if success else f"{failed_count} test(s) failed",
        duration_seconds=result.duration_seconds or 0,
        session_id=result.session_id,
    )


def parse_test_results(
    output: str, logger: "structlog.stdlib.BoundLogger"
) -> tuple[list[TestResult], int, int]:
    """Parse test results from JSON output

    Args:
        output: Command output (should be JSON array)
        logger: Logger instance

    Returns:
        Tuple of (test_results, passed_count, failed_count)
    """
    try:
        # Try to parse as JSON
        data = json.loads(output)

        if not isinstance(data, list):
            logger.error("test_results_invalid_format", error="Expected JSON array")
            return [], 0, 0

        test_results = [TestResult.from_dict(item) for item in data]
        passed_count = sum(1 for t in test_results if t.passed)
        failed_count = sum(1 for t in test_results if not t.passed)

        logger.info(
            "test_results_parsed",
            passed=passed_count,
            failed=failed_count,
            total=len(test_results),
        )

        return test_results, passed_count, failed_count

    except json.JSONDecodeError as e:
        logger.error("test_results_parse_failed", error=str(e), output_preview=output[:500])
        return [], 0, 0


async def resolve_failed_test(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    test_result: TestResult,
    work_order_id: str,
    working_dir: str,
    bound_logger: "structlog.stdlib.BoundLogger",
) -> StepExecutionResult:
    """Resolve a single failed test

    Args:
        executor: Agent CLI executor
        command_loader: Command loader
        test_result: Failed test result
        work_order_id: Work order ID
        working_dir: Working directory
        bound_logger: Logger instance

    Returns:
        StepExecutionResult with resolution outcome
    """
    bound_logger.info(
        "test_resolution_started",
        test_name=test_result.test_name,
    )

    # Convert test result to JSON for passing to resolve command
    test_json = json.dumps(test_result.to_dict())

    # Execute resolve_failed_test command
    result = await executor.execute_command(
        command_name="resolve_failed_test",
        arguments=[test_json],
        working_directory=working_dir,
        logger=bound_logger,
    )

    if not result.success:
        return StepExecutionResult(
            step=WorkflowStep.RESOLVE_TEST,
            agent_name=TESTER,
            success=False,
            output=result.result_text or result.stdout,
            error_message=f"Test resolution failed: {result.error_message}",
            duration_seconds=result.duration_seconds or 0,
            session_id=result.session_id,
        )

    return StepExecutionResult(
        step=WorkflowStep.RESOLVE_TEST,
        agent_name=TESTER,
        success=True,
        output=f"Resolved test: {test_result.test_name}",
        error_message=None,
        duration_seconds=result.duration_seconds or 0,
        session_id=result.session_id,
    )


async def run_tests_with_resolution(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    work_order_id: str,
    working_dir: str,
    bound_logger: "structlog.stdlib.BoundLogger",
    max_attempts: int = 4,
) -> tuple[list[TestResult], int, int]:
    """Run tests with automatic failure resolution and retry logic

    Args:
        executor: Agent CLI executor
        command_loader: Command loader
        work_order_id: Work order ID
        working_dir: Working directory
        bound_logger: Logger instance
        max_attempts: Maximum retry attempts (default 4)

    Returns:
        Tuple of (final_test_results, passed_count, failed_count)
    """
    bound_logger.info("test_workflow_started", max_attempts=max_attempts)

    for attempt in range(1, max_attempts + 1):
        bound_logger.info("test_attempt_started", attempt=attempt)

        # Run tests
        test_result = await run_tests(
            executor, command_loader, work_order_id, working_dir, bound_logger
        )

        if test_result.success:
            bound_logger.info("test_workflow_completed", attempt=attempt, outcome="all_passed")
            # Parse final results
            # Re-run to get the actual test results
            final_result = await executor.execute_command(
                command_name="test",
                arguments=[],
                working_directory=working_dir,
                logger=bound_logger,
            )
            final_results, passed, failed = parse_test_results(
                final_result.result_text or final_result.stdout or "", bound_logger
            )
            return final_results, passed, failed

        # Parse failures
        test_execution = await executor.execute_command(
            command_name="test",
            arguments=[],
            working_directory=working_dir,
            logger=bound_logger,
        )
        test_results, passed_count, failed_count = parse_test_results(
            test_execution.result_text or test_execution.stdout or "", bound_logger
        )

        if failed_count == 0:
            # No failures, we're done
            bound_logger.info("test_workflow_completed", attempt=attempt, outcome="all_passed")
            return test_results, passed_count, failed_count

        if attempt >= max_attempts:
            # Max attempts reached
            bound_logger.warning(
                "test_workflow_max_attempts_reached",
                attempt=attempt,
                failed_count=failed_count,
            )
            return test_results, passed_count, failed_count

        # Resolve each failed test
        failed_tests = [t for t in test_results if not t.passed]
        bound_logger.info(
            "test_resolution_batch_started",
            failed_count=len(failed_tests),
        )

        for failed_test in failed_tests:
            resolution_result = await resolve_failed_test(
                executor,
                command_loader,
                failed_test,
                work_order_id,
                working_dir,
                bound_logger,
            )

            if not resolution_result.success:
                bound_logger.warning(
                    "test_resolution_failed",
                    test_name=failed_test.test_name,
                )

    # Should not reach here, but return last results if we do
    return test_results, passed_count, failed_count
