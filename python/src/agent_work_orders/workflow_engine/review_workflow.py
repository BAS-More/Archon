"""Review Workflow with Automatic Blocker Resolution

Reviews implementation against spec and automatically resolves blocker issues with retry logic (max 3 attempts).
"""

import json
from typing import TYPE_CHECKING

from ..agent_executor.agent_cli_executor import AgentCLIExecutor
from ..command_loader.claude_command_loader import ClaudeCommandLoader
from ..models import StepExecutionResult, WorkflowStep
from ..utils.structured_logger import get_logger
from .agent_names import REVIEWER

if TYPE_CHECKING:
    import structlog

logger = get_logger(__name__)


class ReviewIssue:
    """Represents a single review issue"""

    def __init__(
        self,
        issue_title: str,
        issue_description: str,
        issue_severity: str,
        affected_files: list[str],
        screenshots: list[str] | None = None,
    ):
        self.issue_title = issue_title
        self.issue_description = issue_description
        self.issue_severity = issue_severity
        self.affected_files = affected_files
        self.screenshots = screenshots or []

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "issue_title": self.issue_title,
            "issue_description": self.issue_description,
            "issue_severity": self.issue_severity,
            "affected_files": self.affected_files,
            "screenshots": self.screenshots,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ReviewIssue":
        """Create ReviewIssue from dictionary"""
        return cls(
            issue_title=data["issue_title"],
            issue_description=data["issue_description"],
            issue_severity=data["issue_severity"],
            affected_files=data["affected_files"],
            screenshots=data.get("screenshots", []),
        )


class ReviewResult:
    """Represents review execution result"""

    def __init__(
        self,
        review_passed: bool,
        review_issues: list[ReviewIssue],
        screenshots: list[str] | None = None,
    ):
        self.review_passed = review_passed
        self.review_issues = review_issues
        self.screenshots = screenshots or []

    def get_blocker_count(self) -> int:
        """Get count of blocker issues"""
        return sum(1 for issue in self.review_issues if issue.issue_severity == "blocker")

    def get_blocker_issues(self) -> list[ReviewIssue]:
        """Get list of blocker issues"""
        return [issue for issue in self.review_issues if issue.issue_severity == "blocker"]


async def run_review(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    spec_file: str,
    work_order_id: str,
    working_dir: str,
    bound_logger: "structlog.stdlib.BoundLogger",
) -> ReviewResult:
    """Execute review against specification

    Args:
        executor: Agent CLI executor
        command_loader: Command loader
        spec_file: Path to specification file
        work_order_id: Work order ID
        working_dir: Working directory
        bound_logger: Logger instance

    Returns:
        ReviewResult with issues found
    """
    bound_logger.info("review_execution_started", spec_file=spec_file)

    # Execute review command
    result = await executor.execute_command(
        command_name="review_runner",
        arguments=[spec_file, work_order_id],
        working_directory=working_dir,
        logger=bound_logger,
    )

    if not result.success:
        bound_logger.error("review_execution_failed", error=result.error_message)
        # Return empty review result indicating failure
        return ReviewResult(review_passed=False, review_issues=[])

    # Parse review results from output
    return parse_review_results(result.result_text or result.stdout or "", bound_logger)


def parse_review_results(
    output: str, logger: "structlog.stdlib.BoundLogger"
) -> ReviewResult:
    """Parse review results from JSON output

    Args:
        output: Command output (should be JSON object)
        logger: Logger instance

    Returns:
        ReviewResult
    """
    try:
        # Try to parse as JSON
        data = json.loads(output)

        if not isinstance(data, dict):
            logger.error("review_results_invalid_format", error="Expected JSON object")
            return ReviewResult(review_passed=False, review_issues=[])

        review_issues = [
            ReviewIssue.from_dict(issue) for issue in data.get("review_issues", [])
        ]
        review_passed = data.get("review_passed", False)
        screenshots = data.get("screenshots", [])

        blocker_count = sum(1 for issue in review_issues if issue.issue_severity == "blocker")

        logger.info(
            "review_results_parsed",
            review_passed=review_passed,
            total_issues=len(review_issues),
            blockers=blocker_count,
        )

        return ReviewResult(
            review_passed=review_passed,
            review_issues=review_issues,
            screenshots=screenshots,
        )

    except json.JSONDecodeError as e:
        logger.error("review_results_parse_failed", error=str(e), output_preview=output[:500])
        return ReviewResult(review_passed=False, review_issues=[])


async def resolve_review_issue(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    review_issue: ReviewIssue,
    work_order_id: str,
    working_dir: str,
    bound_logger: "structlog.stdlib.BoundLogger",
) -> StepExecutionResult:
    """Resolve a single blocker review issue

    Args:
        executor: Agent CLI executor
        command_loader: Command loader
        review_issue: Review issue to resolve
        work_order_id: Work order ID
        working_dir: Working directory
        bound_logger: Logger instance

    Returns:
        StepExecutionResult with resolution outcome
    """
    bound_logger.info(
        "review_issue_resolution_started",
        issue_title=review_issue.issue_title,
        severity=review_issue.issue_severity,
    )

    # Convert review issue to JSON for passing to resolve command
    issue_json = json.dumps(review_issue.to_dict())

    # Execute resolve_failed_review command
    result = await executor.execute_command(
        command_name="resolve_failed_review",
        arguments=[issue_json],
        working_directory=working_dir,
        logger=bound_logger,
    )

    if not result.success:
        return StepExecutionResult(
            step=WorkflowStep.RESOLVE_REVIEW,
            agent_name=REVIEWER,
            success=False,
            output=result.result_text or result.stdout,
            error_message=f"Review issue resolution failed: {result.error_message}",
            duration_seconds=result.duration_seconds or 0,
            session_id=result.session_id,
        )

    return StepExecutionResult(
        step=WorkflowStep.RESOLVE_REVIEW,
        agent_name=REVIEWER,
        success=True,
        output=f"Resolved review issue: {review_issue.issue_title}",
        error_message=None,
        duration_seconds=result.duration_seconds or 0,
        session_id=result.session_id,
    )


async def run_review_with_resolution(
    executor: AgentCLIExecutor,
    command_loader: ClaudeCommandLoader,
    spec_file: str,
    work_order_id: str,
    working_dir: str,
    bound_logger: "structlog.stdlib.BoundLogger",
    max_attempts: int = 3,
) -> ReviewResult:
    """Run review with automatic blocker resolution and retry logic

    Tech debt and skippable issues are allowed to pass. Only blockers prevent completion.

    Args:
        executor: Agent CLI executor
        command_loader: Command loader
        spec_file: Path to specification file
        work_order_id: Work order ID
        working_dir: Working directory
        bound_logger: Logger instance
        max_attempts: Maximum retry attempts (default 3)

    Returns:
        Final ReviewResult
    """
    bound_logger.info("review_workflow_started", max_attempts=max_attempts)

    for attempt in range(1, max_attempts + 1):
        bound_logger.info("review_attempt_started", attempt=attempt)

        # Run review
        review_result = await run_review(
            executor, command_loader, spec_file, work_order_id, working_dir, bound_logger
        )

        blocker_count = review_result.get_blocker_count()

        if blocker_count == 0:
            # No blockers, review passes (tech_debt and skippable are acceptable)
            bound_logger.info(
                "review_workflow_completed",
                attempt=attempt,
                outcome="no_blockers",
                total_issues=len(review_result.review_issues),
            )
            return review_result

        if attempt >= max_attempts:
            # Max attempts reached
            bound_logger.warning(
                "review_workflow_max_attempts_reached",
                attempt=attempt,
                blocker_count=blocker_count,
            )
            return review_result

        # Resolve each blocker issue
        blocker_issues = review_result.get_blocker_issues()
        bound_logger.info(
            "review_issue_resolution_batch_started",
            blocker_count=len(blocker_issues),
        )

        for blocker_issue in blocker_issues:
            resolution_result = await resolve_review_issue(
                executor,
                command_loader,
                blocker_issue,
                work_order_id,
                working_dir,
                bound_logger,
            )

            if not resolution_result.success:
                bound_logger.warning(
                    "review_issue_resolution_failed",
                    issue_title=blocker_issue.issue_title,
                )

    # Should not reach here, but return last result if we do
    return review_result
