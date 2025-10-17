"""
Discovery Service for Automatic File Detection

Handles automatic discovery and parsing of llms.txt, sitemap.xml, and related files
to enhance crawling capabilities with priority-based discovery methods.
"""

from urllib.parse import urljoin

import requests

from ...config.logfire_config import get_logger

logger = get_logger(__name__)


class DiscoveryService:
    """Service for discovering related files automatically during crawls."""

    # Maximum response size to prevent memory exhaustion (10MB default)
    MAX_RESPONSE_SIZE = 10 * 1024 * 1024  # 10 MB

    # Global priority order - select ONE best file from all categories
    # All these files contain similar AI/crawling guidance content
    DISCOVERY_PRIORITY = [
        # LLMs files (highest priority - most comprehensive AI guidance)
        "llms-full.txt",
        "llms.txt",
        "llms.md",
        "llms.mdx",
        "llms.markdown",

        # Sitemap files (structural crawling guidance)
        "sitemap_index.xml",
        "sitemap-index.xml",
        "sitemap.xml",

        # Robots file (basic crawling rules)
        "robots.txt",

        # Well-known variants (alternative locations)
        ".well-known/ai.txt",
        ".well-known/llms.txt",
        ".well-known/sitemap.xml"
    ]

    # Categorized discovery targets for helper methods
    # Maintains the same order and values as DISCOVERY_PRIORITY
    DISCOVERY_TARGETS = {
        "llms_files": [
            "llms-full.txt",
            "llms.txt",
            "llms.md",
            "llms.mdx",
            "llms.markdown",
        ],
        "sitemap_files": [
            "sitemap_index.xml",
            "sitemap-index.xml",
            "sitemap.xml",
        ],
        "robots_files": [
            "robots.txt",
        ],
        "well_known_files": [
            ".well-known/ai.txt",
            ".well-known/llms.txt",
            ".well-known/sitemap.xml",
        ],
    }

    def _read_response_with_limit(self, response: requests.Response, url: str, max_size: int | None = None) -> str:
        """
        Read response content with size limit to prevent memory exhaustion.

        Args:
            response: The response object to read from
            url: URL being read (for logging)
            max_size: Maximum bytes to read (defaults to MAX_RESPONSE_SIZE)

        Returns:
            Response text content

        Raises:
            ValueError: If response exceeds size limit
        """
        if max_size is None:
            max_size = self.MAX_RESPONSE_SIZE

        try:
            chunks = []
            total_size = 0

            # Read response in chunks to enforce size limit
            for chunk in response.iter_content(chunk_size=8192, decode_unicode=False):
                if chunk:
                    total_size += len(chunk)
                    if total_size > max_size:
                        response.close()
                        size_mb = max_size / (1024 * 1024)
                        logger.warning(
                            f"Response size exceeded limit of {size_mb:.1f}MB for {url}, "
                            f"received {total_size / (1024 * 1024):.1f}MB"
                        )
                        raise ValueError(f"Response size exceeds {size_mb:.1f}MB limit")
                    chunks.append(chunk)

            # Decode the complete response
            content_bytes = b''.join(chunks)
            # Try to decode with the response encoding or fall back to utf-8
            encoding = response.encoding or 'utf-8'
            try:
                return content_bytes.decode(encoding)
            except UnicodeDecodeError:
                # Fallback to utf-8 with error replacement
                return content_bytes.decode('utf-8', errors='replace')

        except Exception:
            # Ensure response is closed on any error
            response.close()
            raise

    def discover_files(self, base_url: str) -> str | None:
        """
        Main discovery orchestrator - selects ONE best file across all categories.
        All files contain similar AI/crawling guidance, so we only need the best one.

        Args:
            base_url: Base URL to discover files for

        Returns:
            Single best URL found, or None if no files discovered
        """
        try:
            logger.info(f"Starting single-file discovery for {base_url}")

            # Check files in global priority order
            # IMPORTANT: Check root-level llms files BEFORE same-directory sitemaps
            # This ensures llms.txt at root is preferred over /docs/sitemap.xml
            from urllib.parse import urlparse

            # Get the directory path of the base URL
            parsed = urlparse(base_url)
            base_path = parsed.path.rstrip('/')

            # Known file extensions - only treat as file if last segment has one of these
            FILE_EXTENSIONS = {
                '.html', '.htm', '.xml', '.json', '.txt', '.md', '.csv',
                '.rss', '.yaml', '.yml', '.pdf', '.zip'
            }

            # Extract directory (remove filename if present)
            last_segment = base_path.split('/')[-1] if base_path else ''
            # Check if the last segment ends with a known file extension
            has_file_extension = any(last_segment.lower().endswith(ext) for ext in FILE_EXTENSIONS)

            if has_file_extension:
                # Last segment is a file, strip it to get directory
                base_dir = '/'.join(base_path.split('/')[:-1])
            else:
                # Last segment is a directory (e.g., /docs.v2)
                base_dir = base_path

            # Phase 1: Check llms files at ALL priority levels before checking sitemaps
            for filename in self.DISCOVERY_PRIORITY:
                if not filename.startswith('llms') and not filename.startswith('.well-known/llms') and not filename.startswith('.well-known/ai'):
                    continue  # Skip non-llms files in this phase

                # Priority 1a: Check same directory for llms files
                if base_dir and base_dir != '/':
                    same_dir_url = f"{parsed.scheme}://{parsed.netloc}{base_dir}/{filename}"
                    if self._check_url_exists(same_dir_url):
                        logger.info(f"Discovery found best file in same directory: {same_dir_url}")
                        return same_dir_url

                # Priority 1b: Check root-level for llms files
                file_url = urljoin(base_url, filename)
                if self._check_url_exists(file_url):
                    logger.info(f"Discovery found best file at root: {file_url}")
                    return file_url

                # Priority 1c: Check subdirectories for llms files
                subdirs = []
                if base_dir and base_dir != '/':
                    base_dir_name = base_dir.split('/')[-1]
                    if base_dir_name:
                        subdirs.append(base_dir_name)
                subdirs.extend(["docs", "static", "public", "assets", "doc", "api"])

                for subdir in subdirs:
                    subdir_url = urljoin(base_url, f"{subdir}/{filename}")
                    if self._check_url_exists(subdir_url):
                        logger.info(f"Discovery found best file in subdirectory: {subdir_url}")
                        return subdir_url

            # Phase 2: Check sitemaps and robots.txt (only if no llms files found)
            for filename in self.DISCOVERY_PRIORITY:
                if filename.startswith('llms') or filename.startswith('.well-known/llms') or filename.startswith('.well-known/ai'):
                    continue  # Skip llms files, already checked

                # Priority 2a: Check same directory
                if base_dir and base_dir != '/':
                    same_dir_url = f"{parsed.scheme}://{parsed.netloc}{base_dir}/{filename}"
                    if self._check_url_exists(same_dir_url):
                        logger.info(f"Discovery found best file in same directory: {same_dir_url}")
                        return same_dir_url

                # Priority 2b: Check root-level
                file_url = urljoin(base_url, filename)
                if self._check_url_exists(file_url):
                    logger.info(f"Discovery found best file at root: {file_url}")
                    return file_url

                # Priority 2c: For sitemap files, check common subdirectories
                if filename.endswith('.xml') and not filename.startswith('.well-known'):
                    subdirs = []
                    if base_dir and base_dir != '/':
                        base_dir_name = base_dir.split('/')[-1]
                        if base_dir_name:
                            subdirs.append(base_dir_name)
                    subdirs.extend(["docs", "sitemaps", "sitemap", "xml", "feed"])

                    for subdir in subdirs:
                        subdir_url = urljoin(base_url, f"{subdir}/{filename}")
                        if self._check_url_exists(subdir_url):
                            logger.info(f"Discovery found best file in subdirectory: {subdir_url}")
                            return subdir_url

            # Check HTML meta tags for sitemap references as final fallback
            html_sitemaps = self._parse_html_meta_tags(base_url)
            if html_sitemaps:
                best_file = html_sitemaps[0]
                logger.info(f"Discovery found best file from HTML meta tags: {best_file}")
                return best_file

            logger.info(f"Discovery completed for {base_url}: no files found")
            return None

        except Exception:
            logger.exception(f"Unexpected error during discovery for {base_url}")
            return None

    def _discover_best_sitemap(self, base_url: str) -> str | None:
        """
        Discover the best available sitemap using priority-based selection.

        Priority order:
        1. Sitemaps from robots.txt (highest priority - explicitly declared)
        2. Standard locations (sitemap_index.xml > sitemap-index.xml > sitemap.xml)
        3. Common subdirectory variations
        4. HTML meta tag references
        5. .well-known directory
        """
        try:
            # Priority 1: Check robots.txt for sitemap declarations
            robots_sitemaps = self._parse_robots_txt(base_url)
            if robots_sitemaps:
                return robots_sitemaps[0]  # Use first sitemap from robots.txt

            # Priority 2: Check standard locations in priority order
            for filename in self.DISCOVERY_TARGETS["sitemap_files"]:
                sitemap_url = urljoin(base_url, filename)
                if self._check_url_exists(sitemap_url):
                    return sitemap_url

            # Priority 3: Check common subdirectory variations
            subdirs = ["sitemaps", "sitemap", "xml", "feed"]
            for subdir in subdirs:
                for filename in self.DISCOVERY_TARGETS["sitemap_files"]:
                    sitemap_url = urljoin(base_url, f"{subdir}/{filename}")
                    if self._check_url_exists(sitemap_url):
                        return sitemap_url

            # Priority 4: Check HTML meta tag references
            html_sitemaps = self._parse_html_meta_tags(base_url)
            if html_sitemaps:
                return html_sitemaps[0]  # Use first sitemap from HTML

            # Priority 5: Check .well-known directory
            well_known_sitemap = urljoin(base_url, ".well-known/sitemap.xml")
            if self._check_url_exists(well_known_sitemap):
                return well_known_sitemap

        except Exception:
            logger.exception(f"Error discovering best sitemap for {base_url}")

        return None

    def _discover_best_llms_file(self, base_url: str) -> str | None:
        """
        Discover the best available llms file using priority-based selection.

        Priority order:
        1. Standard locations (llms-full.txt > llms.txt > llms.md > llms.mdx > llms.markdown)
        2. Common subdirectory variations (static, public, docs, assets)
        3. .well-known directory variants
        """
        try:
            # Priority 1: Check standard root locations in priority order
            for filename in self.DISCOVERY_TARGETS["llms_files"]:
                llms_url = urljoin(base_url, filename)
                if self._check_url_exists(llms_url):
                    return llms_url

            # Priority 2: Check common subdirectory variations
            subdirs = ["static", "public", "docs", "assets", "doc", "api"]
            for subdir in subdirs:
                for filename in self.DISCOVERY_TARGETS["llms_files"]:
                    llms_url = urljoin(base_url, f"{subdir}/{filename}")
                    if self._check_url_exists(llms_url):
                        return llms_url

            # Priority 3: Check .well-known directory variants
            for well_known_file in [".well-known/ai.txt", ".well-known/llms.txt"]:
                well_known_url = urljoin(base_url, well_known_file)
                if self._check_url_exists(well_known_url):
                    return well_known_url

        except Exception:
            logger.exception(f"Error discovering best llms file for {base_url}")

        return None

    def _discover_robots_file(self, base_url: str) -> str | None:
        """
        Discover robots.txt file (always single file at root).
        """
        try:
            robots_url = urljoin(base_url, "robots.txt")
            if self._check_url_exists(robots_url):
                return robots_url
        except Exception:
            logger.exception(f"Error discovering robots file for {base_url}")

        return None

    def _check_url_exists(self, url: str) -> bool:
        """
        Check if a URL exists and returns a successful response.
        """
        try:
            resp = requests.get(url, timeout=5, allow_redirects=True, verify=True)
            success = resp.status_code == 200
            logger.debug(f"URL check: {url} -> {resp.status_code} ({'exists' if success else 'not found'})")
            resp.close()
            return success
        except Exception as e:
            logger.debug(f"URL check failed: {url} -> {e}")
            return False

    def _parse_robots_txt(self, base_url: str) -> list[str]:
        """
        Extract sitemap URLs from robots.txt.

        Args:
            base_url: Base URL to check robots.txt for

        Returns:
            List of sitemap URLs found in robots.txt
        """
        sitemaps: list[str] = []

        try:
            # Use robots.txt relative to the given URL, not always root
            robots_url = urljoin(base_url, "robots.txt")
            logger.info(f"Checking robots.txt at {robots_url}")

            resp = requests.get(robots_url, timeout=30, stream=True, verify=True)

            try:
                if resp.status_code != 200:
                    logger.info(f"No robots.txt found: HTTP {resp.status_code}")
                    return sitemaps

                # Read response with size limit
                content = self._read_response_with_limit(resp, robots_url)

                # Parse robots.txt content for sitemap directives
                for raw_line in content.splitlines():
                    line = raw_line.strip()
                    if line.lower().startswith("sitemap:"):
                        sitemap_value = line.split(":", 1)[1].strip()
                        if sitemap_value:
                            # Allow absolute and relative sitemap values
                            if sitemap_value.lower().startswith(("http://", "https://")):
                                sitemap_url = sitemap_value
                            else:
                                # Resolve relative path against base_url
                                sitemap_url = urljoin(base_url, sitemap_value)
                            sitemaps.append(sitemap_url)
                            logger.info(f"Found sitemap in robots.txt: {sitemap_url}")

            finally:
                # Ensure response is always closed
                resp.close()

        except requests.exceptions.RequestException:
            logger.exception(f"Network error fetching robots.txt from {base_url}")
        except ValueError as e:
            # Size limit exceeded
            logger.warning(f"robots.txt too large at {base_url}: {e}")
        except Exception:
            logger.exception(f"Unexpected error parsing robots.txt from {base_url}")

        return sitemaps

    def _check_standard_patterns(self, base_url: str) -> dict[str, list[str]]:
        """
        Check common file locations for discovery targets.

        Args:
            base_url: Base URL to check standard locations for

        Returns:
            Dictionary with file types and discovered URLs
        """
        discovered: dict[str, list[str]] = {
            "sitemaps": [],
            "llms_files": [],
            "robots_files": []
        }

        try:
            # Check all discovery targets at standard locations
            all_targets = []
            for target_type, files in self.DISCOVERY_TARGETS.items():
                if target_type != "well_known_files":  # Skip well-known, handled separately
                    for filename in files:
                        all_targets.append((target_type, filename))

            for target_type, filename in all_targets:
                try:
                    file_url = urljoin(base_url, filename)
                    resp = requests.get(file_url, timeout=30, allow_redirects=True, stream=True, verify=True)

                    try:
                        if resp.status_code == 200:
                            # Map target type to discovery category
                            if target_type == "sitemap_files":
                                discovered["sitemaps"].append(file_url)
                            elif target_type == "llms_files":
                                discovered["llms_files"].append(file_url)
                            elif target_type == "robots_files":
                                discovered["robots_files"].append(file_url)

                            logger.info(f"Found {target_type} file: {file_url}")

                    finally:
                        resp.close()

                except requests.exceptions.RequestException:
                    logger.debug(f"File not found or network error: {filename}")
                except Exception:
                    logger.exception(f"Unexpected error checking {filename}")

        except Exception:
            logger.exception(f"Unexpected error in standard pattern checking for {base_url}")

        return discovered

    def _parse_html_meta_tags(self, base_url: str) -> list[str]:
        """
        Extract sitemap references from HTML meta tags.

        Args:
            base_url: Base URL to check HTML for meta tags

        Returns:
            List of sitemap URLs found in HTML meta tags
        """
        sitemaps: list[str] = []

        try:
            logger.info(f"Checking HTML meta tags for sitemaps at {base_url}")
            resp = requests.get(base_url, timeout=30, stream=True, verify=True)

            try:
                if resp.status_code != 200:
                    logger.debug(f"Could not fetch HTML for meta tag parsing: HTTP {resp.status_code}")
                    return sitemaps

                # Read response with size limit
                content = self._read_response_with_limit(resp, base_url)

                # Look for sitemap meta tags or link elements
                import re
                from urllib.parse import urlparse

                # Check for <link rel="sitemap" href="..."> (case-insensitive)
                sitemap_link_pattern = re.compile(
                    r'<link[^>]*rel=["\']sitemap["\'][^>]*href=["\']([^"\']+)["\']',
                    re.IGNORECASE
                )
                matches = sitemap_link_pattern.findall(content)

                for match in matches:
                    sitemap_url = urljoin(base_url, match)
                    if urlparse(sitemap_url).scheme in ("http", "https"):
                        sitemaps.append(sitemap_url)
                        logger.info(f"Found sitemap in HTML link tag: {sitemap_url}")

                # Check for <meta name="sitemap" content="..."> (case-insensitive)
                sitemap_meta_pattern = re.compile(
                    r'<meta[^>]*name=["\']sitemap["\'][^>]*content=["\']([^"\']+)["\']',
                    re.IGNORECASE
                )
                matches = sitemap_meta_pattern.findall(content)

                for match in matches:
                    sitemap_url = urljoin(base_url, match)
                    if urlparse(sitemap_url).scheme in ("http", "https"):
                        sitemaps.append(sitemap_url)
                        logger.info(f"Found sitemap in HTML meta tag: {sitemap_url}")

            finally:
                resp.close()

        except requests.exceptions.RequestException:
            logger.exception(f"Network error fetching HTML from {base_url}")
        except ValueError as e:
            # Size limit exceeded
            logger.warning(f"HTML response too large at {base_url}: {e}")
        except Exception:
            logger.exception(f"Unexpected error parsing HTML meta tags from {base_url}")

        return sitemaps

    def _check_well_known_directory(self, base_url: str) -> list[str]:
        """
        Check .well-known/* files for discovery targets.

        Args:
            base_url: Base URL to check .well-known directory for

        Returns:
            List of URLs found in .well-known directory
        """
        well_known_files: list[str] = []

        try:
            for filename in self.DISCOVERY_TARGETS["well_known_files"]:
                try:
                    file_url = urljoin(base_url, filename)
                    resp = requests.get(file_url, timeout=30, allow_redirects=True, stream=True, verify=True)

                    try:
                        if resp.status_code == 200:
                            well_known_files.append(file_url)
                            logger.info(f"Found .well-known file: {file_url}")

                    finally:
                        resp.close()

                except requests.exceptions.RequestException:
                    logger.debug(f"Well-known file not found or network error: {filename}")
                except Exception:
                    logger.exception(f"Unexpected error checking well-known file: {filename}")

        except Exception:
            logger.exception(f"Unexpected error checking .well-known directory for {base_url}")

        return well_known_files

    def _try_common_variations(self, base_url: str) -> dict[str, list[str]]:
        """
        Try pattern variations for discovery targets.

        Args:
            base_url: Base URL to try variations for

        Returns:
            Dictionary with file types and discovered variation URLs
        """
        discovered: dict[str, list[str]] = {
            "sitemaps": [],
            "llms_files": []
        }

        try:
            # Common subdirectories to check
            subdirs = ["public", "static", "assets", "docs", "doc", "api"]

            # Try llms.txt variants in subdirectories
            for subdir in subdirs:
                for llms_file in self.DISCOVERY_TARGETS["llms_files"]:
                    try:
                        file_url = urljoin(base_url, f"{subdir}/{llms_file}")
                        resp = requests.get(file_url, timeout=30, allow_redirects=True, stream=True, verify=True)

                        try:
                            if resp.status_code == 200:
                                discovered["llms_files"].append(file_url)
                                logger.info(f"Found llms file variant: {file_url}")

                        finally:
                            resp.close()

                    except requests.exceptions.RequestException:
                        logger.debug(f"Variant not found: {subdir}/{llms_file}")
                    except Exception:
                        logger.exception(f"Error checking variant: {subdir}/{llms_file}")

            # Try sitemap variants with different paths
            sitemap_paths = [
                "sitemaps/sitemap.xml",
                "sitemap/sitemap.xml",
                "xml/sitemap.xml",
                "feed/sitemap.xml"
            ]

            for sitemap_path in sitemap_paths:
                try:
                    file_url = urljoin(base_url, sitemap_path)
                    resp = requests.get(file_url, timeout=30, allow_redirects=True, stream=True, verify=True)

                    try:
                        if resp.status_code == 200:
                            discovered["sitemaps"].append(file_url)
                            logger.info(f"Found sitemap variant: {file_url}")

                    finally:
                        resp.close()

                except requests.exceptions.RequestException:
                    logger.debug(f"Sitemap variant not found: {sitemap_path}")
                except Exception:
                    logger.exception(f"Error checking sitemap variant: {sitemap_path}")

        except Exception:
            logger.exception(f"Unexpected error trying common variations for {base_url}")

        return discovered
