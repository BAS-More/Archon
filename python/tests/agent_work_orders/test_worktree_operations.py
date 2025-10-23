"""Tests for Worktree Operations"""

import os
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from tempfile import TemporaryDirectory

from src.agent_work_orders.utils.worktree_operations import (
    _get_repo_hash,
    get_base_repo_path,
    get_worktree_path,
    ensure_base_repository,
    create_worktree,
    validate_worktree,
    remove_worktree,
    setup_worktree_environment,
)


@pytest.mark.unit
def test_get_repo_hash_consistent():
    """Test that same URL always produces same hash"""
    url = "https://github.com/owner/repo"

    hash1 = _get_repo_hash(url)
    hash2 = _get_repo_hash(url)

    assert hash1 == hash2
    assert len(hash1) == 8  # 8-character hash


@pytest.mark.unit
def test_get_repo_hash_different_urls():
    """Test that different URLs produce different hashes"""
    url1 = "https://github.com/owner/repo1"
    url2 = "https://github.com/owner/repo2"

    hash1 = _get_repo_hash(url1)
    hash2 = _get_repo_hash(url2)

    assert hash1 != hash2


@pytest.mark.unit
def test_get_base_repo_path():
    """Test getting base repository path"""
    url = "https://github.com/owner/repo"

    path = get_base_repo_path(url)

    assert "repos" in path
    assert "main" in path
    assert Path(path).is_absolute()


@pytest.mark.unit
def test_get_worktree_path():
    """Test getting worktree path"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"

    path = get_worktree_path(url, work_order_id)

    assert "repos" in path
    assert "trees" in path
    assert work_order_id in path
    assert Path(path).is_absolute()


@pytest.mark.unit
def test_ensure_base_repository_new_clone():
    """Test ensuring base repository when it doesn't exist"""
    url = "https://github.com/owner/repo"
    mock_logger = MagicMock()

    mock_result = MagicMock()
    mock_result.returncode = 0

    with patch("subprocess.run", return_value=mock_result), patch(
        "os.path.exists", return_value=False
    ), patch("pathlib.Path.mkdir"):
        base_path, error = ensure_base_repository(url, mock_logger)

        assert base_path is not None
        assert error is None
        assert "main" in base_path


@pytest.mark.unit
def test_ensure_base_repository_already_exists():
    """Test ensuring base repository when it already exists"""
    url = "https://github.com/owner/repo"
    mock_logger = MagicMock()

    mock_result = MagicMock()
    mock_result.returncode = 0

    with patch("subprocess.run", return_value=mock_result), patch(
        "os.path.exists", return_value=True
    ):
        base_path, error = ensure_base_repository(url, mock_logger)

        assert base_path is not None
        assert error is None


@pytest.mark.unit
def test_ensure_base_repository_clone_failure():
    """Test ensuring base repository when clone fails"""
    url = "https://github.com/owner/repo"
    mock_logger = MagicMock()

    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "Clone failed"

    with patch("subprocess.run", return_value=mock_result), patch(
        "os.path.exists", return_value=False
    ), patch("pathlib.Path.mkdir"):
        base_path, error = ensure_base_repository(url, mock_logger)

        assert base_path is None
        assert error is not None
        assert "Clone failed" in error


@pytest.mark.unit
def test_create_worktree_success():
    """Test creating worktree successfully"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    branch_name = "feat-test"
    mock_logger = MagicMock()

    mock_result = MagicMock()
    mock_result.returncode = 0

    with patch(
        "src.agent_work_orders.utils.worktree_operations.ensure_base_repository",
        return_value=("/tmp/base", None),
    ), patch("subprocess.run", return_value=mock_result), patch(
        "os.path.exists", return_value=False
    ), patch("pathlib.Path.mkdir"):
        worktree_path, error = create_worktree(
            url, work_order_id, branch_name, mock_logger
        )

        assert worktree_path is not None
        assert error is None
        assert work_order_id in worktree_path


@pytest.mark.unit
def test_create_worktree_already_exists():
    """Test creating worktree when it already exists"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    branch_name = "feat-test"
    mock_logger = MagicMock()

    expected_path = get_worktree_path(url, work_order_id)

    with patch(
        "src.agent_work_orders.utils.worktree_operations.ensure_base_repository",
        return_value=("/tmp/base", None),
    ), patch("os.path.exists", return_value=True):
        worktree_path, error = create_worktree(
            url, work_order_id, branch_name, mock_logger
        )

        assert worktree_path == expected_path
        assert error is None


@pytest.mark.unit
def test_create_worktree_branch_exists():
    """Test creating worktree when branch already exists"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    branch_name = "feat-test"
    mock_logger = MagicMock()

    # First call fails with "already exists", second succeeds
    mock_result_fail = MagicMock()
    mock_result_fail.returncode = 1
    mock_result_fail.stderr = "already exists"

    mock_result_success = MagicMock()
    mock_result_success.returncode = 0

    with patch(
        "src.agent_work_orders.utils.worktree_operations.ensure_base_repository",
        return_value=("/tmp/base", None),
    ), patch(
        "subprocess.run", side_effect=[mock_result_success, mock_result_fail, mock_result_success]
    ), patch("os.path.exists", return_value=False), patch("pathlib.Path.mkdir"):
        worktree_path, error = create_worktree(
            url, work_order_id, branch_name, mock_logger
        )

        assert worktree_path is not None
        assert error is None


@pytest.mark.unit
def test_create_worktree_base_repo_failure():
    """Test creating worktree when base repo setup fails"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    branch_name = "feat-test"
    mock_logger = MagicMock()

    with patch(
        "src.agent_work_orders.utils.worktree_operations.ensure_base_repository",
        return_value=(None, "Base repo error"),
    ):
        worktree_path, error = create_worktree(
            url, work_order_id, branch_name, mock_logger
        )

        assert worktree_path is None
        assert error == "Base repo error"


@pytest.mark.unit
def test_validate_worktree_success():
    """Test validating worktree when everything is correct"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    worktree_path = get_worktree_path(url, work_order_id)

    state = {"worktree_path": worktree_path}

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = worktree_path  # Git knows about it

    with patch("os.path.exists", return_value=True), patch(
        "subprocess.run", return_value=mock_result
    ):
        is_valid, error = validate_worktree(url, work_order_id, state)

        assert is_valid is True
        assert error is None


@pytest.mark.unit
def test_validate_worktree_no_path_in_state():
    """Test validating worktree when state has no path"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    state = {}  # No worktree_path

    is_valid, error = validate_worktree(url, work_order_id, state)

    assert is_valid is False
    assert "No worktree_path" in error


@pytest.mark.unit
def test_validate_worktree_directory_not_found():
    """Test validating worktree when directory doesn't exist"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    worktree_path = get_worktree_path(url, work_order_id)

    state = {"worktree_path": worktree_path}

    with patch("os.path.exists", return_value=False):
        is_valid, error = validate_worktree(url, work_order_id, state)

        assert is_valid is False
        assert "not found" in error


@pytest.mark.unit
def test_validate_worktree_not_registered_with_git():
    """Test validating worktree when git doesn't know about it"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    worktree_path = get_worktree_path(url, work_order_id)

    state = {"worktree_path": worktree_path}

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "/some/other/path"  # Doesn't contain our path

    with patch("os.path.exists", return_value=True), patch(
        "subprocess.run", return_value=mock_result
    ):
        is_valid, error = validate_worktree(url, work_order_id, state)

        assert is_valid is False
        assert "not registered" in error


@pytest.mark.unit
def test_remove_worktree_success():
    """Test removing worktree successfully"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    mock_logger = MagicMock()

    mock_result = MagicMock()
    mock_result.returncode = 0

    with patch("os.path.exists", return_value=True), patch(
        "subprocess.run", return_value=mock_result
    ):
        success, error = remove_worktree(url, work_order_id, mock_logger)

        assert success is True
        assert error is None


@pytest.mark.unit
def test_remove_worktree_fallback_to_manual():
    """Test removing worktree with fallback to manual removal"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    mock_logger = MagicMock()

    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "Git remove failed"

    with patch("os.path.exists", return_value=True), patch(
        "subprocess.run", return_value=mock_result
    ), patch("shutil.rmtree"):
        success, error = remove_worktree(url, work_order_id, mock_logger)

        # Should succeed via manual cleanup
        assert success is True
        assert error is None


@pytest.mark.unit
def test_remove_worktree_no_base_repo():
    """Test removing worktree when base repo doesn't exist"""
    url = "https://github.com/owner/repo"
    work_order_id = "wo-test123"
    mock_logger = MagicMock()

    def mock_exists(path):
        # Base repo doesn't exist, but worktree directory does
        return "main" not in path

    with patch("os.path.exists", side_effect=mock_exists), patch("shutil.rmtree"):
        success, error = remove_worktree(url, work_order_id, mock_logger)

        assert success is True
        assert error is None


@pytest.mark.unit
def test_setup_worktree_environment(tmp_path):
    """Test setting up worktree environment"""
    worktree_path = str(tmp_path)
    backend_port = 9107
    frontend_port = 9207
    mock_logger = MagicMock()

    setup_worktree_environment(worktree_path, backend_port, frontend_port, mock_logger)

    ports_env_path = tmp_path / ".ports.env"
    assert ports_env_path.exists()

    content = ports_env_path.read_text()
    assert "BACKEND_PORT=9107" in content
    assert "FRONTEND_PORT=9207" in content
