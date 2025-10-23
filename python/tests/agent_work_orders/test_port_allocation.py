"""Tests for Port Allocation"""

import pytest
from unittest.mock import patch

from src.agent_work_orders.utils.port_allocation import (
    get_ports_for_work_order,
    is_port_available,
    find_next_available_ports,
    create_ports_env_file,
)


@pytest.mark.unit
def test_get_ports_for_work_order_deterministic():
    """Test that same work order ID always gets same ports"""
    work_order_id = "wo-abc123"

    backend1, frontend1 = get_ports_for_work_order(work_order_id)
    backend2, frontend2 = get_ports_for_work_order(work_order_id)

    assert backend1 == backend2
    assert frontend1 == frontend2
    assert 9100 <= backend1 <= 9114
    assert 9200 <= frontend1 <= 9214


@pytest.mark.unit
def test_get_ports_for_work_order_range():
    """Test that ports are within expected ranges"""
    work_order_id = "wo-test123"

    backend, frontend = get_ports_for_work_order(work_order_id)

    assert 9100 <= backend <= 9114
    assert 9200 <= frontend <= 9214
    assert frontend == backend + 100


@pytest.mark.unit
def test_get_ports_for_work_order_different_ids():
    """Test that different work order IDs can get different ports"""
    ids = [f"wo-test{i}" for i in range(20)]
    port_pairs = [get_ports_for_work_order(wid) for wid in ids]

    # With 15 slots, we should see some variation
    unique_backends = len(set(p[0] for p in port_pairs))
    assert unique_backends > 1  # At least some variation


@pytest.mark.unit
def test_get_ports_for_work_order_fallback_hash():
    """Test fallback to hash when base36 conversion fails"""
    # Non-alphanumeric work order ID
    work_order_id = "--------"

    backend, frontend = get_ports_for_work_order(work_order_id)

    # Should still work via hash fallback
    assert 9100 <= backend <= 9114
    assert 9200 <= frontend <= 9214


@pytest.mark.unit
def test_is_port_available_mock_available():
    """Test port availability check when port is available"""
    with patch("socket.socket") as mock_socket:
        mock_socket_instance = mock_socket.return_value.__enter__.return_value
        mock_socket_instance.bind.return_value = None  # Successful bind

        result = is_port_available(9100)

        assert result is True
        mock_socket_instance.bind.assert_called_once_with(('localhost', 9100))


@pytest.mark.unit
def test_is_port_available_mock_unavailable():
    """Test port availability check when port is unavailable"""
    with patch("socket.socket") as mock_socket:
        mock_socket_instance = mock_socket.return_value.__enter__.return_value
        mock_socket_instance.bind.side_effect = OSError("Port in use")

        result = is_port_available(9100)

        assert result is False


@pytest.mark.unit
def test_find_next_available_ports_first_available():
    """Test finding ports when first choice is available"""
    work_order_id = "wo-test123"

    # Mock all ports as available
    with patch(
        "src.agent_work_orders.utils.port_allocation.is_port_available",
        return_value=True,
    ):
        backend, frontend = find_next_available_ports(work_order_id)

        # Should get the deterministic ports
        expected_backend, expected_frontend = get_ports_for_work_order(work_order_id)
        assert backend == expected_backend
        assert frontend == expected_frontend


@pytest.mark.unit
def test_find_next_available_ports_fallback():
    """Test finding ports when first choice is unavailable"""
    work_order_id = "wo-test123"

    # Mock first port as unavailable, second as available
    def mock_availability(port):
        base_backend, _ = get_ports_for_work_order(work_order_id)
        return port != base_backend and port != base_backend + 100

    with patch(
        "src.agent_work_orders.utils.port_allocation.is_port_available",
        side_effect=mock_availability,
    ):
        backend, frontend = find_next_available_ports(work_order_id)

        # Should get next available ports
        base_backend, _ = get_ports_for_work_order(work_order_id)
        assert backend != base_backend  # Should be different from base
        assert 9100 <= backend <= 9114
        assert frontend == backend + 100


@pytest.mark.unit
def test_find_next_available_ports_exhausted():
    """Test that RuntimeError is raised when all ports are unavailable"""
    work_order_id = "wo-test123"

    # Mock all ports as unavailable
    with patch(
        "src.agent_work_orders.utils.port_allocation.is_port_available",
        return_value=False,
    ):
        with pytest.raises(RuntimeError) as exc_info:
            find_next_available_ports(work_order_id)

        assert "No available ports" in str(exc_info.value)


@pytest.mark.unit
def test_create_ports_env_file(tmp_path):
    """Test creating .ports.env file"""
    worktree_path = str(tmp_path)
    backend_port = 9107
    frontend_port = 9207

    create_ports_env_file(worktree_path, backend_port, frontend_port)

    ports_env_path = tmp_path / ".ports.env"
    assert ports_env_path.exists()

    content = ports_env_path.read_text()
    assert "BACKEND_PORT=9107" in content
    assert "FRONTEND_PORT=9207" in content
    assert "VITE_BACKEND_URL=http://localhost:9107" in content


@pytest.mark.unit
def test_create_ports_env_file_overwrites(tmp_path):
    """Test that creating .ports.env file overwrites existing file"""
    worktree_path = str(tmp_path)
    ports_env_path = tmp_path / ".ports.env"

    # Create existing file with old content
    ports_env_path.write_text("OLD_CONTENT=true\n")

    # Create new file
    create_ports_env_file(worktree_path, 9100, 9200)

    content = ports_env_path.read_text()
    assert "OLD_CONTENT" not in content
    assert "BACKEND_PORT=9100" in content
