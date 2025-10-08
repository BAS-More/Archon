"""Repository Factory

Creates appropriate repository instances based on configuration.
Supports both in-memory (for development/testing) and file-based (for production) storage.
"""

from ..config import config
from ..utils.structured_logger import get_logger
from .file_state_repository import FileStateRepository
from .work_order_repository import WorkOrderRepository

logger = get_logger(__name__)


def create_repository() -> WorkOrderRepository | FileStateRepository:
    """Create a work order repository based on configuration

    Returns:
        Repository instance (either in-memory or file-based)
    """
    storage_type = config.STATE_STORAGE_TYPE.lower()

    if storage_type == "file":
        state_dir = config.FILE_STATE_DIRECTORY
        logger.info(
            "repository_created",
            storage_type="file",
            state_directory=state_dir
        )
        return FileStateRepository(state_dir)
    elif storage_type == "memory":
        logger.info(
            "repository_created",
            storage_type="memory"
        )
        return WorkOrderRepository()
    else:
        logger.warning(
            "unknown_storage_type",
            storage_type=storage_type,
            fallback="memory"
        )
        return WorkOrderRepository()
