"""Port allocation utilities for isolated agent work order execution.

Provides deterministic port allocation (backend: 9100-9114, frontend: 9200-9214)
based on work order ID to enable parallel execution without port conflicts.
"""

import os
import socket


def get_ports_for_work_order(work_order_id: str) -> tuple[int, int]:
    """Deterministically assign ports based on work order ID.

    Args:
        work_order_id: The work order identifier

    Returns:
        Tuple of (backend_port, frontend_port)
    """
    # Convert first 8 chars of work order ID to index (0-14)
    # Using base 36 conversion and modulo for consistent mapping
    try:
        # Take first 8 alphanumeric chars and convert from base 36
        id_chars = ''.join(c for c in work_order_id[:8] if c.isalnum())
        index = int(id_chars, 36) % 15
    except ValueError:
        # Fallback to simple hash if conversion fails
        index = hash(work_order_id) % 15

    backend_port = 9100 + index
    frontend_port = 9200 + index

    return backend_port, frontend_port


def is_port_available(port: int) -> bool:
    """Check if a port is available for binding.

    Args:
        port: Port number to check

    Returns:
        True if port is available, False otherwise
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            s.bind(('localhost', port))
            return True
    except OSError:
        return False


def find_next_available_ports(work_order_id: str, max_attempts: int = 15) -> tuple[int, int]:
    """Find available ports starting from deterministic assignment.

    Args:
        work_order_id: The work order ID
        max_attempts: Maximum number of attempts (default 15)

    Returns:
        Tuple of (backend_port, frontend_port)

    Raises:
        RuntimeError: If no available ports found
    """
    base_backend, base_frontend = get_ports_for_work_order(work_order_id)
    base_index = base_backend - 9100

    for offset in range(max_attempts):
        index = (base_index + offset) % 15
        backend_port = 9100 + index
        frontend_port = 9200 + index

        if is_port_available(backend_port) and is_port_available(frontend_port):
            return backend_port, frontend_port

    raise RuntimeError("No available ports in the allocated range")


def create_ports_env_file(worktree_path: str, backend_port: int, frontend_port: int) -> None:
    """Create .ports.env file in worktree with port configuration.

    Args:
        worktree_path: Path to the worktree
        backend_port: Backend port number
        frontend_port: Frontend port number
    """
    ports_env_path = os.path.join(worktree_path, ".ports.env")

    with open(ports_env_path, "w") as f:
        f.write(f"BACKEND_PORT={backend_port}\n")
        f.write(f"FRONTEND_PORT={frontend_port}\n")
        f.write(f"VITE_BACKEND_URL=http://localhost:{backend_port}\n")
