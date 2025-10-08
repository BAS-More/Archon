"""Structured Logging Setup

Configures structlog for PRD-compliant event logging.
Event naming follows: {module}_{noun}_{verb_past_tense}
"""

import structlog


def configure_structured_logging(log_level: str = "INFO") -> None:
    """Configure structlog with console rendering

    Event naming convention: {module}_{noun}_{verb_past_tense}
    Examples:
        - agent_work_order_created
        - git_branch_created
        - workflow_phase_started
        - sandbox_cleanup_completed
    """
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(),  # Pretty console for MVP
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance

    Args:
        name: Optional name for the logger

    Returns:
        Configured structlog logger
    """
    return structlog.get_logger(name)  # type: ignore[no-any-return]
