"""Unit tests for DiscoveryService class."""
import pytest
from unittest.mock import patch, Mock
from src.server.services.crawling.discovery_service import DiscoveryService


class TestDiscoveryService:
    """Test suite for DiscoveryService class."""

    @patch('requests.get')
    def test_discover_files_basic(self, mock_get):
        """Test main discovery method returns single best file."""
        service = DiscoveryService()
        base_url = "https://example.com"
        
        # Mock robots.txt response (no sitemaps)
        robots_response = Mock()
        robots_response.status_code = 200
        robots_response.text = "User-agent: *\nDisallow: /admin/"
        
        # Mock file existence - llms-full.txt doesn't exist, but llms.txt does
        def mock_get_side_effect(url, **kwargs):
            response = Mock()
            if url.endswith('robots.txt'):
                return robots_response
            elif url.endswith('llms-full.txt'):
                response.status_code = 404  # Highest priority doesn't exist
            elif url.endswith('llms.txt'):
                response.status_code = 200  # Second priority exists
            else:
                response.status_code = 404
            return response
        
        mock_get.side_effect = mock_get_side_effect
        
        result = service.discover_files(base_url)
        
        # Should return single URL string (not dict, not list)
        assert isinstance(result, str)
        assert result == 'https://example.com/llms.txt'

    @patch('requests.get')  
    def test_discover_files_no_files_found(self, mock_get):
        """Test discovery when no files are found."""
        service = DiscoveryService()
        base_url = "https://example.com"
        
        # Mock all HTTP requests to return 404
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        result = service.discover_files(base_url)
        
        # Should return None when no files found
        assert result is None

    @patch('requests.get') 
    def test_discover_files_priority_order(self, mock_get):
        """Test that discovery follows the correct priority order."""
        service = DiscoveryService()
        base_url = "https://example.com"
        
        # Mock robots.txt response (no sitemaps declared)
        robots_response = Mock()
        robots_response.status_code = 200
        robots_response.text = "User-agent: *\nDisallow: /admin/"
        
        # Mock file existence - both sitemap.xml and llms.txt exist, but llms.txt has higher priority
        def mock_get_side_effect(url, **kwargs):
            response = Mock()
            if url.endswith('robots.txt'):
                return robots_response
            elif url.endswith('llms.txt') or url.endswith('sitemap.xml'):
                response.status_code = 200  # Both exist
            else:
                response.status_code = 404
            return response
        
        mock_get.side_effect = mock_get_side_effect
        
        result = service.discover_files(base_url)
        
        # Should return llms.txt since it has higher priority than sitemap.xml
        assert result == 'https://example.com/llms.txt'

    @patch('requests.get')
    def test_discover_files_robots_sitemap_priority(self, mock_get):
        """Test that robots.txt sitemap declarations have highest priority."""
        service = DiscoveryService()
        base_url = "https://example.com"
        
        # Mock robots.txt response WITH sitemap declaration  
        robots_response = Mock()
        robots_response.status_code = 200
        robots_response.text = "User-agent: *\nSitemap: https://example.com/declared-sitemap.xml"
        
        # Mock other files also exist
        def mock_get_side_effect(url, **kwargs):
            response = Mock()
            if url.endswith('robots.txt'):
                return robots_response
            elif 'llms' in url or 'sitemap' in url:
                response.status_code = 200
            else:
                response.status_code = 404
            return response
        
        mock_get.side_effect = mock_get_side_effect
        
        result = service.discover_files(base_url)
        
        # Should return the sitemap declared in robots.txt (highest priority)
        assert result == 'https://example.com/declared-sitemap.xml'

    @patch('requests.get')
    def test_discover_best_sitemap_robots_priority(self, mock_get):
        """Test sitemap discovery prioritizes robots.txt declarations."""
        service = DiscoveryService()
        base_url = "https://example.com"
        
        # Mock robots.txt with sitemap
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "Sitemap: https://example.com/robots-sitemap.xml"
        mock_get.return_value = mock_response
        
        result = service._discover_best_sitemap(base_url)
        
        # Should return the sitemap from robots.txt (highest priority)
        assert result == "https://example.com/robots-sitemap.xml"

    @patch('requests.get')
    def test_discover_best_llms_file_priority_order(self, mock_get):
        """Test llms file discovery follows priority order."""
        service = DiscoveryService()
        base_url = "https://example.com"
        
        # Mock HTTP responses - only llms.txt exists, not llms-full.txt
        def mock_get_side_effect(url, **kwargs):
            response = Mock()
            if url.endswith('llms-full.txt'):
                response.status_code = 404  # Higher priority file doesn't exist
            elif url.endswith('llms.txt'):
                response.status_code = 200  # Standard file exists
            else:
                response.status_code = 404
            return response
        
        mock_get.side_effect = mock_get_side_effect
        
        result = service._discover_best_llms_file(base_url)
        
        # Should find llms.txt since llms-full.txt doesn't exist
        assert result == "https://example.com/llms.txt"

    @patch('requests.get')
    def test_discover_best_llms_file_subdirectory_fallback(self, mock_get):
        """Test llms file discovery falls back to subdirectories."""
        service = DiscoveryService()
        base_url = "https://example.com"
        
        # Mock HTTP responses - no root files, but static/llms.txt exists
        def mock_get_side_effect(url, **kwargs):
            response = Mock()
            if '/static/llms.txt' in url:
                response.status_code = 200  # Found in subdirectory
            else:
                response.status_code = 404
            return response
        
        mock_get.side_effect = mock_get_side_effect
        
        result = service._discover_best_llms_file(base_url)
        
        # Should find the file in static subdirectory
        assert result == "https://example.com/static/llms.txt"

    @patch('requests.get')
    def test_check_url_exists(self, mock_get):
        """Test URL existence checking."""
        service = DiscoveryService()
        
        # Test successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response
        
        assert service._check_url_exists("https://example.com/exists") is True
        
        # Test 404 response
        mock_response.status_code = 404
        assert service._check_url_exists("https://example.com/not-found") is False
        
        # Test network error
        mock_get.side_effect = Exception("Network error")
        assert service._check_url_exists("https://example.com/error") is False

    @patch('requests.get')
    def test_parse_robots_txt_with_sitemap(self, mock_get):
        """Test robots.txt parsing with sitemap directives."""
        service = DiscoveryService()
        
        # Mock successful robots.txt response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = """User-agent: *
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-news.xml"""
        mock_get.return_value = mock_response
        
        result = service._parse_robots_txt("https://example.com")
        
        assert len(result) == 2
        assert "https://example.com/sitemap.xml" in result
        assert "https://example.com/sitemap-news.xml" in result
        mock_get.assert_called_once_with("https://example.com/robots.txt", timeout=30)

    @patch('requests.get')
    def test_parse_robots_txt_no_sitemap(self, mock_get):
        """Test robots.txt parsing without sitemap directives."""
        service = DiscoveryService()
        
        # Mock robots.txt without sitemaps
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = """User-agent: *
Disallow: /admin/
Allow: /public/"""
        mock_get.return_value = mock_response
        
        result = service._parse_robots_txt("https://example.com")
        
        assert len(result) == 0
        mock_get.assert_called_once_with("https://example.com/robots.txt", timeout=30)

    @patch('requests.get')
    def test_parse_robots_txt_not_found(self, mock_get):
        """Test robots.txt parsing when file is not found."""
        service = DiscoveryService()
        
        # Mock 404 response
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        result = service._parse_robots_txt("https://example.com")
        
        assert len(result) == 0
        mock_get.assert_called_once_with("https://example.com/robots.txt", timeout=30)

    @patch('requests.get')
    def test_check_standard_patterns(self, mock_get):
        """Test standard file pattern checking."""
        service = DiscoveryService()
        
        # Mock responses for different files
        def mock_response_side_effect(url, **kwargs):
            mock_response = Mock()
            if 'llms.txt' in url:
                mock_response.status_code = 200
            elif 'sitemap.xml' in url:
                mock_response.status_code = 200
            else:
                mock_response.status_code = 404
            return mock_response
        
        mock_get.side_effect = mock_response_side_effect
        
        result = service._check_standard_patterns("https://example.com")
        
        assert 'sitemaps' in result
        assert 'llms_files' in result
        assert 'robots_files' in result
        
        # Should find the files that returned 200
        assert any('llms.txt' in url for url in result['llms_files'])
        assert any('sitemap.xml' in url for url in result['sitemaps'])

    @patch('requests.get')
    def test_parse_html_meta_tags(self, mock_get):
        """Test HTML meta tag parsing for sitemaps."""
        service = DiscoveryService()
        
        # Mock HTML with sitemap references
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = """
        <html>
        <head>
            <link rel="sitemap" href="/sitemap.xml">
            <meta name="sitemap" content="https://example.com/sitemap-meta.xml">
        </head>
        <body>Content here</body>
        </html>
        """
        mock_get.return_value = mock_response
        
        result = service._parse_html_meta_tags("https://example.com")
        
        # Should find sitemaps from both link and meta tags
        assert len(result) >= 1
        assert any('sitemap' in url.lower() for url in result)
        mock_get.assert_called_once_with("https://example.com", timeout=30)

    @patch('requests.get')
    def test_parse_html_meta_tags_not_found(self, mock_get):
        """Test HTML meta tag parsing when page not found."""
        service = DiscoveryService()
        
        # Mock 404 response
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        result = service._parse_html_meta_tags("https://example.com")
        
        assert len(result) == 0
        mock_get.assert_called_once_with("https://example.com", timeout=30)

    @patch('requests.get')
    def test_check_well_known_directory(self, mock_get):
        """Test .well-known directory file checking."""
        service = DiscoveryService()
        
        # Mock responses - some files exist, some don't
        def mock_response_side_effect(url, **kwargs):
            mock_response = Mock()
            if 'ai.txt' in url:
                mock_response.status_code = 200
            else:
                mock_response.status_code = 404
            return mock_response
        
        mock_get.side_effect = mock_response_side_effect
        
        result = service._check_well_known_directory("https://example.com")
        
        # Should find the ai.txt file
        assert len(result) >= 1
        assert any('ai.txt' in url for url in result)

    @patch('requests.get')
    def test_try_common_variations(self, mock_get):
        """Test pattern variations for discovery targets."""
        service = DiscoveryService()
        
        # Mock responses for variations
        def mock_response_side_effect(url, **kwargs):
            mock_response = Mock()
            if 'docs/llms.txt' in url or 'sitemaps/sitemap.xml' in url:
                mock_response.status_code = 200
            else:
                mock_response.status_code = 404
            return mock_response
        
        mock_get.side_effect = mock_response_side_effect
        
        result = service._try_common_variations("https://example.com")
        
        assert 'sitemaps' in result
        assert 'llms_files' in result
        
        # Should find at least one variation
        assert len(result['llms_files']) >= 1 or len(result['sitemaps']) >= 1

    @patch('requests.get')
    def test_network_error_handling(self, mock_get):
        """Test error scenarios with network failures."""
        service = DiscoveryService()
        
        # Mock network error
        mock_get.side_effect = Exception("Network error")
        
        # Should not raise exception, but return empty results
        result = service._parse_robots_txt("https://example.com")
        assert result == []
        
        result = service._check_standard_patterns("https://example.com")
        assert isinstance(result, dict)
        
        result = service._parse_html_meta_tags("https://example.com")
        assert result == []
        
        result = service._check_well_known_directory("https://example.com")
        assert result == []
        
        result = service._try_common_variations("https://example.com")
        assert isinstance(result, dict)

    def test_discover_files_with_exceptions(self):
        """Test main discovery method handles exceptions gracefully."""
        service = DiscoveryService()
        
        # Mock methods to raise exceptions
        with patch.object(service, '_parse_robots_txt', side_effect=Exception("Test error")):
            with patch.object(service, '_check_standard_patterns', side_effect=Exception("Test error")):
                with patch.object(service, '_parse_html_meta_tags', side_effect=Exception("Test error")):
                    with patch.object(service, '_check_well_known_directory', side_effect=Exception("Test error")):
                        with patch.object(service, '_try_common_variations', side_effect=Exception("Test error")):
                            result = service.discover_files("https://example.com")
        
        # Should still return proper structure even with all methods failing
        assert isinstance(result, dict)
        assert 'sitemaps' in result
        assert 'llms_files' in result
        assert 'robots_files' in result
        assert 'well_known_files' in result

    @patch('requests.get')
    def test_robots_txt_with_malformed_content(self, mock_get):
        """Test robots.txt parsing with malformed content."""
        service = DiscoveryService()
        
        # Mock malformed robots.txt content
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = """User-agent: *
Disallow: /admin/
Sitemap: 
Sitemap: not-a-valid-url
Sitemap: https://example.com/valid-sitemap.xml"""
        mock_get.return_value = mock_response
        
        result = service._parse_robots_txt("https://example.com")
        
        # Should only include the valid sitemap URL
        assert len(result) == 1
        assert "https://example.com/valid-sitemap.xml" in result

    def test_discovery_targets_constant(self):
        """Test that discovery targets constant is properly defined."""
        service = DiscoveryService()
        
        assert hasattr(service, 'DISCOVERY_TARGETS')
        targets = service.DISCOVERY_TARGETS
        
        # Verify required target types exist
        assert 'llms_files' in targets
        assert 'sitemap_files' in targets
        assert 'robots_files' in targets
        assert 'well_known_files' in targets
        
        # Verify they contain expected files
        assert 'llms.txt' in targets['llms_files']
        assert 'sitemap.xml' in targets['sitemap_files']
        assert 'robots.txt' in targets['robots_files']
        assert '.well-known/ai.txt' in targets['well_known_files']