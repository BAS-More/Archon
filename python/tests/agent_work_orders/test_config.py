"""Tests for agent work orders configuration

Tests configuration loading, service discovery, and URL construction.
"""

import pytest
from unittest.mock import patch


@pytest.mark.unit
def test_config_default_values():
    """Test configuration default values"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.CLAUDE_CLI_PATH == "claude"
    assert config.GH_CLI_PATH == "gh"
    assert config.EXECUTION_TIMEOUT == 3600
    assert config.LOG_LEVEL == "INFO"
    assert config.SERVICE_DISCOVERY_MODE == "local"


@pytest.mark.unit
@patch.dict("os.environ", {"SERVICE_DISCOVERY_MODE": "local"})
def test_config_local_service_discovery():
    """Test local service discovery mode"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.SERVICE_DISCOVERY_MODE == "local"
    assert config.get_archon_server_url() == "http://localhost:8181"
    assert config.get_archon_mcp_url() == "http://localhost:8051"


@pytest.mark.unit
@patch.dict("os.environ", {"SERVICE_DISCOVERY_MODE": "docker_compose"})
def test_config_docker_service_discovery():
    """Test docker_compose service discovery mode"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.SERVICE_DISCOVERY_MODE == "docker_compose"
    assert config.get_archon_server_url() == "http://archon-server:8181"
    assert config.get_archon_mcp_url() == "http://archon-mcp:8051"


@pytest.mark.unit
@patch.dict("os.environ", {"ARCHON_SERVER_URL": "http://custom-server:9999"})
def test_config_explicit_server_url_override():
    """Test explicit ARCHON_SERVER_URL overrides service discovery"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.get_archon_server_url() == "http://custom-server:9999"


@pytest.mark.unit
@patch.dict("os.environ", {"ARCHON_MCP_URL": "http://custom-mcp:7777"})
def test_config_explicit_mcp_url_override():
    """Test explicit ARCHON_MCP_URL overrides service discovery"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.get_archon_mcp_url() == "http://custom-mcp:7777"


@pytest.mark.unit
@patch.dict("os.environ", {"CLAUDE_CLI_PATH": "/custom/path/to/claude"})
def test_config_claude_cli_path_override():
    """Test CLAUDE_CLI_PATH can be overridden"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.CLAUDE_CLI_PATH == "/custom/path/to/claude"


@pytest.mark.unit
@patch.dict("os.environ", {"LOG_LEVEL": "DEBUG"})
def test_config_log_level_override():
    """Test LOG_LEVEL can be overridden"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.LOG_LEVEL == "DEBUG"


@pytest.mark.unit
@patch.dict("os.environ", {"CORS_ORIGINS": "http://example.com,http://test.com"})
def test_config_cors_origins_override():
    """Test CORS_ORIGINS can be overridden"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.CORS_ORIGINS == "http://example.com,http://test.com"


@pytest.mark.unit
def test_config_ensure_temp_dir(tmp_path):
    """Test ensure_temp_dir creates directory"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig
    import os

    # Use tmp_path for testing
    test_temp_dir = str(tmp_path / "test-agent-work-orders")

    with patch.dict("os.environ", {"AGENT_WORK_ORDER_TEMP_DIR": test_temp_dir}):
        config = AgentWorkOrdersConfig()
        temp_dir = config.ensure_temp_dir()

        assert temp_dir.exists()
        assert temp_dir.is_dir()
        assert str(temp_dir) == test_temp_dir


@pytest.mark.unit
@patch.dict(
    "os.environ",
    {
        "SERVICE_DISCOVERY_MODE": "docker_compose",
        "ARCHON_SERVER_URL": "http://explicit-server:8888",
    },
)
def test_config_explicit_url_overrides_discovery_mode():
    """Test explicit URL takes precedence over service discovery mode"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    # Even in docker_compose mode, explicit URL should win
    assert config.SERVICE_DISCOVERY_MODE == "docker_compose"
    assert config.get_archon_server_url() == "http://explicit-server:8888"


@pytest.mark.unit
@patch.dict("os.environ", {"STATE_STORAGE_TYPE": "file"})
def test_config_state_storage_type():
    """Test STATE_STORAGE_TYPE configuration"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.STATE_STORAGE_TYPE == "file"


@pytest.mark.unit
@patch.dict("os.environ", {"FILE_STATE_DIRECTORY": "/custom/state/dir"})
def test_config_file_state_directory():
    """Test FILE_STATE_DIRECTORY configuration"""
    from src.agent_work_orders.config import AgentWorkOrdersConfig

    config = AgentWorkOrdersConfig()

    assert config.FILE_STATE_DIRECTORY == "/custom/state/dir"
