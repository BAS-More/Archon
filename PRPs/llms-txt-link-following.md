# PRP: Follow llms.txt Links to Other llms.txt Files

## Problem Statement

When discovering and crawling llms.txt files, Archon currently operates in "single-file mode" and ignores all links within the file. However, many sites use llms.txt files that reference other llms.txt files on the same domain or subdomains (e.g., a main llms.txt pointing to `/docs/llms.txt`, `/api/llms.txt`, etc.).

Additionally, users have no visibility into what files were discovered and chosen during the discovery phase, making it difficult to understand what content is being indexed.

## Goals

1. **Follow llms.txt links**: When an llms.txt file contains links to other llms.txt files on the same domain/subdomain, follow and index those files
2. **Same-domain only**: Only follow llms.txt links that are on the same root domain or subdomain
3. **UI feedback**: Show users what was discovered and what is being crawled in real-time

## Current Behavior

### Discovery Flow
1. `DiscoveryService.discover_files(base_url)` finds best file (e.g., `/docs/llms.txt`)
2. Returns single URL to `CrawlingService`
3. Crawls discovered file with `is_discovery_target=True` flag
4. At line 802-806 of `crawling_service.py`, skips ALL link extraction
5. Returns immediately with just the discovered file content

### Progress Updates
- Discovery phase shows: "Discovery completed: selected 1 best file"
- No information about what was discovered or why
- No information about followed links

## Proposed Solution

### Phase 1: Backend - llms.txt Link Following

#### 1.1 Modify Discovery Mode Link Extraction

**File**: `python/src/server/services/crawling/crawling_service.py`
**Location**: Lines 800-806

**Current Code**:
```python
if self.url_handler.is_link_collection_file(url, content):
    # If this file was selected by discovery, skip link extraction (single-file mode)
    if request.get("is_discovery_target"):
        logger.info(f"Discovery single-file mode: skipping link extraction for {url}")
        crawl_type = "discovery_single_file"
        logger.info(f"Discovery file crawling completed: {len(crawl_results)} result")
        return crawl_results, crawl_type
```

**Proposed Code**:
```python
if self.url_handler.is_link_collection_file(url, content):
    # If this file was selected by discovery, check if it's an llms.txt file
    if request.get("is_discovery_target"):
        # Check if this is an llms.txt file (not sitemap or other discovery targets)
        is_llms_file = self.url_handler.is_llms_variant(url)

        if is_llms_file:
            logger.info(f"Discovery llms.txt mode: checking for linked llms.txt files at {url}")

            # Extract all links from the file
            extracted_links_with_text = self.url_handler.extract_markdown_links_with_text(content, url)

            # Filter for llms.txt files only on same domain
            llms_links = []
            if extracted_links_with_text:
                original_domain = request.get("original_domain")
                for link, text in extracted_links_with_text:
                    # Check if link is to another llms.txt file
                    if self.url_handler.is_llms_variant(link):
                        # Check same domain/subdomain
                        if self._is_same_domain_or_subdomain(link, original_domain):
                            llms_links.append((link, text))
                            logger.info(f"Found linked llms.txt: {link}")

            if llms_links:
                # Build mapping and extract just URLs
                url_to_link_text = dict(llms_links)
                extracted_llms_urls = [link for link, _ in llms_links]

                logger.info(f"Following {len(extracted_llms_urls)} linked llms.txt files")

                # Crawl linked llms.txt files (no recursion, just one level)
                batch_results = await self.crawl_batch_with_progress(
                    extracted_llms_urls,
                    max_concurrent=request.get('max_concurrent'),
                    progress_callback=await self._create_crawl_progress_callback("crawling"),
                    link_text_fallbacks=url_to_link_text,
                )

                # Combine original llms.txt with linked files
                crawl_results.extend(batch_results)
                crawl_type = "llms_txt_with_linked_files"
                logger.info(f"llms.txt crawling completed: {len(crawl_results)} total files (1 main + {len(batch_results)} linked)")
                return crawl_results, crawl_type

        # For non-llms.txt discovery targets (sitemaps, robots.txt), keep single-file mode
        logger.info(f"Discovery single-file mode: skipping link extraction for {url}")
        crawl_type = "discovery_single_file"
        logger.info(f"Discovery file crawling completed: {len(crawl_results)} result")
        return crawl_results, crawl_type
```

#### 1.2 Add Subdomain Checking Method

**File**: `python/src/server/services/crawling/crawling_service.py`
**Location**: After `_is_same_domain` method (around line 728)

**New Method**:
```python
def _is_same_domain_or_subdomain(self, url: str, base_domain: str) -> bool:
    """
    Check if a URL belongs to the same root domain or subdomain.

    Examples:
        - docs.supabase.com matches supabase.com (subdomain)
        - api.supabase.com matches supabase.com (subdomain)
        - supabase.com matches supabase.com (exact match)
        - external.com does NOT match supabase.com

    Args:
        url: URL to check
        base_domain: Base domain URL to compare against

    Returns:
        True if the URL is from the same root domain or subdomain
    """
    try:
        from urllib.parse import urlparse
        u, b = urlparse(url), urlparse(base_domain)
        url_host = (u.hostname or "").lower()
        base_host = (b.hostname or "").lower()

        if not url_host or not base_host:
            return False

        # Exact match
        if url_host == base_host:
            return True

        # Check if url_host is a subdomain of base_host
        # Extract root domain (last 2 parts for .com, .org, etc.)
        def get_root_domain(host: str) -> str:
            parts = host.split('.')
            if len(parts) >= 2:
                return '.'.join(parts[-2:])
            return host

        url_root = get_root_domain(url_host)
        base_root = get_root_domain(base_host)

        return url_root == base_root
    except Exception:
        # If parsing fails, be conservative and exclude the URL
        return False
```

#### 1.3 Add llms.txt Variant Detection to URLHandler

**File**: `python/src/server/services/crawling/helpers/url_handler.py`

**Verify/Add Method** (should already exist, verify it works correctly):
```python
@staticmethod
def is_llms_variant(url: str) -> bool:
    """Check if URL is an llms.txt variant file."""
    url_lower = url.lower()
    return any(pattern in url_lower for pattern in [
        'llms.txt',
        'llms-full.txt',
        'llms.md',
        'llms.mdx',
        'llms.markdown'
    ])
```

### Phase 2: Enhanced Progress Reporting

#### 2.1 Add Discovery Metadata to Progress Updates

**File**: `python/src/server/services/crawling/crawling_service.py`
**Location**: Lines 383-398 (discovery phase)

**Proposed Changes**:
```python
# Add the single best discovered file to crawl list
if discovered_file:
    safe_logfire_info(f"Discovery found file: {discovered_file}")
    # Filter through is_binary_file() check like existing code
    if not self.url_handler.is_binary_file(discovered_file):
        discovered_urls.append(discovered_file)
        safe_logfire_info(f"Adding discovered file to crawl: {discovered_file}")

        # Determine file type for user feedback
        discovered_file_type = "unknown"
        if self.url_handler.is_llms_variant(discovered_file):
            discovered_file_type = "llms.txt"
        elif self.url_handler.is_sitemap(discovered_file):
            discovered_file_type = "sitemap"
        elif self.url_handler.is_robots_txt(discovered_file):
            discovered_file_type = "robots.txt"

        await update_mapped_progress(
            "discovery", 100,
            f"Discovery completed: found {discovered_file_type} file",
            current_url=url,
            discovered_file=discovered_file,
            discovered_file_type=discovered_file_type
        )
    else:
        safe_logfire_info(f"Skipping binary file: {discovered_file}")
else:
    safe_logfire_info(f"Discovery found no files for {url}")
    await update_mapped_progress(
        "discovery", 100,
        "Discovery completed: no special files found, will crawl main URL",
        current_url=url
    )
```

#### 2.2 Add Linked Files Progress

When following llms.txt links, add progress update:

```python
if llms_links:
    logger.info(f"Following {len(extracted_llms_urls)} linked llms.txt files")

    # Notify user about linked files being crawled
    await update_crawl_progress(
        60,  # 60% of crawling stage
        f"Found {len(extracted_llms_urls)} linked llms.txt files, crawling them now...",
        crawl_type="llms_txt_linked_files",
        linked_files=extracted_llms_urls
    )

    # Crawl linked llms.txt files
    batch_results = await self.crawl_batch_with_progress(...)
```

### Phase 3: Frontend UI Updates

#### 3.1 Progress Tracker UI Enhancement

**File**: `archon-ui-main/src/features/progress/components/ProgressCard.tsx` (or equivalent)

**Add Discovery Details Section**:
```tsx
// Show discovered file info
{progress.discovered_file && (
  <div className="discovery-info">
    <h4>Discovery Results</h4>
    <p>
      Found: <Badge>{progress.discovered_file_type}</Badge>
      <a href={progress.discovered_file} target="_blank" rel="noopener">
        {progress.discovered_file}
      </a>
    </p>
  </div>
)}

// Show linked files being crawled
{progress.linked_files && progress.linked_files.length > 0 && (
  <div className="linked-files-info">
    <h4>Following Linked Files</h4>
    <ul>
      {progress.linked_files.map(file => (
        <li key={file}>
          <a href={file} target="_blank" rel="noopener">{file}</a>
        </li>
      ))}
    </ul>
  </div>
)}
```

#### 3.2 Progress Status Messages

Update progress messages to be more informative:

- **Before**: "Discovery completed: selected 1 best file"
- **After**: "Discovery completed: found llms.txt file at /docs/llms.txt"

- **New**: "Found 3 linked llms.txt files, crawling them now..."
- **New**: "Crawled 4 llms.txt files total (1 main + 3 linked)"

## Implementation Plan

### Sprint 1: Backend Core Functionality ✅ COMPLETED
- [x] Add `_is_same_domain_or_subdomain` method to CrawlingService
- [x] Fix `is_llms_variant` method to detect llms.txt files in paths
- [x] Modify discovery mode link extraction logic
- [x] Add unit tests for subdomain checking (8 tests)
- [x] Add integration tests for llms.txt link following (7 tests)
- [x] Fix discovery priority bug (two-phase approach)

### Sprint 2: Progress Reporting ✅ COMPLETED
- [x] Add discovery metadata to progress updates (already in backend)
- [x] Add linked files progress updates (already in backend)
- [x] Update progress tracking to include new fields
- [x] Updated ProgressResponse and CrawlProgressData types

### Sprint 3: Frontend UI ✅ COMPLETED
- [x] Updated progress types to include new fields (discoveredFile, linkedFiles)
- [x] Added discovery status to ProgressStatus type
- [x] Added new crawl types (llms_txt_with_linked_files, discovery_*)
- [x] Implemented discovery info display in CrawlingProgress component
- [x] Implemented linked files display in CrawlingProgress component
- [x] Added "discovery" to active statuses list

## Testing Strategy

### Unit Tests

**File**: `python/tests/test_crawling_service.py`

```python
def test_is_same_domain_or_subdomain():
    service = CrawlingService()

    # Same domain
    assert service._is_same_domain_or_subdomain(
        "https://supabase.com/docs",
        "https://supabase.com"
    ) == True

    # Subdomain
    assert service._is_same_domain_or_subdomain(
        "https://docs.supabase.com/llms.txt",
        "https://supabase.com"
    ) == True

    # Different domain
    assert service._is_same_domain_or_subdomain(
        "https://external.com/llms.txt",
        "https://supabase.com"
    ) == False
```

### Integration Tests

**Test Cases**:
1. Discover llms.txt with no links → should crawl single file
2. Discover llms.txt with links to other llms.txt files on same domain → should crawl all
3. Discover llms.txt with mix of same-domain and external llms.txt links → should only crawl same-domain
4. Discover llms.txt with links to non-llms.txt files → should ignore them
5. Discover sitemap.xml → should remain in single-file mode (no change to current behavior)

### Manual Testing

Test with real sites:
- `supabase.com/docs` → May have links to other llms.txt files
- `anthropic.com` → Test with main site
- Sites with subdomain structure

## Edge Cases

1. **Circular references**: llms.txt A links to B, B links to A
   - **Solution**: Track visited URLs, skip if already crawled

2. **Deep nesting**: llms.txt A → B → C → D
   - **Solution**: Only follow one level (don't recursively follow links in linked files)

3. **Large number of linked files**: llms.txt with 100+ links
   - **Solution**: Respect max_concurrent settings, show progress

4. **Mixed content**: llms.txt with both llms.txt links and regular documentation links
   - **Solution**: Only follow llms.txt links, ignore others

5. **Subdomain vs different domain**: docs.site.com vs site.com vs docs.site.org
   - **Solution**: Check root domain (site.com), allow docs.site.com but not docs.site.org

## Success Metrics

1. **Functionality**: Successfully follows llms.txt links on real sites
2. **Safety**: Only follows same-domain/subdomain links
3. **Performance**: No significant slowdown for sites without linked files
4. **User Experience**: Clear visibility into what is being discovered and crawled
5. **Test Coverage**: >90% coverage for new code

## Open Questions

1. Should we limit the maximum number of linked llms.txt files to follow? (e.g., max 10)
2. Should linked llms.txt files themselves be allowed to have links? (currently: no, single level only)
3. Should we add a UI setting to enable/disable llms.txt link following?
4. Should we show a warning if external llms.txt links are found and ignored?

## References

- Current discovery logic: `python/src/server/services/crawling/discovery_service.py`
- Current crawling logic: `python/src/server/services/crawling/crawling_service.py` (lines 800-880)
- URL handler: `python/src/server/services/crawling/helpers/url_handler.py`
- Progress tracking: `python/src/server/utils/progress/progress_tracker.py`

---

## Implementation Summary

### Completed Implementation (Sprint 1)

#### Core Functionality ✅
All backend core functionality has been successfully implemented and tested:

1. **Subdomain Matching** (`crawling_service.py:744-788`)
   - Added `_is_same_domain_or_subdomain` method
   - Correctly matches subdomains (e.g., docs.supabase.com with supabase.com)
   - Extracts root domain for comparison
   - All 8 unit tests passing in `tests/test_crawling_service_subdomain.py`

2. **llms.txt Variant Detection** (`url_handler.py:633-665`)
   - **CRITICAL FIX**: Updated `is_llms_variant` method to detect:
     - Exact filename matches: `llms.txt`, `llms-full.txt`, `llms.md`, etc.
     - Files in `/llms/` directories: `/llms/guides.txt`, `/llms/swift.txt`, etc.
   - This was the root cause bug preventing link following from working
   - Method now properly recognizes all llms.txt variant files

3. **Link Following Logic** (`crawling_service.py:862-920`)
   - Implemented llms.txt link extraction and following
   - Filters for same-domain/subdomain links only
   - Respects discovery target mode
   - Crawls linked files in batch with progress tracking
   - Returns `llms_txt_with_linked_files` crawl type

4. **Discovery Priority Fix** (`discovery_service.py:137-214`)
   - **CRITICAL FIX**: Implemented two-phase discovery
   - Phase 1: Check ALL llms.txt files at ALL locations before sitemaps
   - Phase 2: Only check sitemaps if no llms.txt found
   - Resolves bug where sitemap.xml was found before llms.txt

5. **Enhanced Progress Reporting** (`crawling_service.py:389-413, 901-906`)
   - Discovery metadata includes file type information
   - Progress updates show linked files being crawled
   - Clear logging throughout the flow

#### Test Coverage ✅
Comprehensive test suite created and passing:

1. **Subdomain Tests** (`tests/test_crawling_service_subdomain.py`)
   - 8 tests covering: exact matches, subdomains, different domains, protocols, ports, edge cases, real-world examples
   - All tests passing

2. **Link Following Tests** (`tests/test_llms_txt_link_following.py`)
   - 7 tests covering:
     - Link extraction from Supabase llms.txt
     - llms.txt variant detection
     - Same-domain filtering
     - External link filtering
     - Non-llms link filtering
     - Complete integration flow
   - All tests passing

### Critical Bugs Fixed

1. **Discovery Priority Bug**
   - **Problem**: Sitemap.xml being found before llms.txt at root
   - **Solution**: Two-phase discovery prioritizes ALL llms.txt locations first
   - **File**: `discovery_service.py:137-214`

2. **is_llms_variant Bug**
   - **Problem**: Method only matched exact filenames, not paths like `/llms/guides.txt`
   - **Solution**: Added check for `.txt` files in `/llms/` directories
   - **File**: `url_handler.py:658-660`
   - **Impact**: This was THE blocking bug preventing link following

### Testing with Supabase Example

The implementation was validated against the real Supabase llms.txt structure:
- Main file: `https://supabase.com/docs/llms.txt`
- 8 linked files in `/llms/` directory:
  - `guides.txt`, `js.txt`, `dart.txt`, `swift.txt`, `kotlin.txt`, `python.txt`, `csharp.txt`, `cli.txt`

All tests pass, confirming:
- ✅ All 8 links are extracted
- ✅ All 8 links are recognized as llms.txt variants
- ✅ All 8 links match same domain
- ✅ External links are filtered out
- ✅ Non-llms links are filtered out
- ✅ Integration flow crawls 9 total files (1 main + 8 linked)

### Sprint 2 & 3 Completed ✅

**Progress Reporting Enhancement** - Completed
- Backend already passing discovered_file, discovered_file_type, and linked_files in progress updates
- Updated TypeScript types to support new fields
- Both camelCase and snake_case supported for backend compatibility

**Frontend UI Updates** - Completed
- Updated `progress.ts:6-26`: Added "discovery" to ProgressStatus type
- Updated `progress.ts:27-36`: Added new crawl types (llms_txt_with_linked_files, etc.)
- Updated `progress.ts:49-70`: Added discoveredFile, discoveredFileType, linkedFiles to CrawlProgressData
- Updated `progress.ts:124-169`: Added discovery fields to ProgressResponse (both case formats)
- Updated `CrawlingProgress.tsx:126-138`: Added "discovery" to active statuses
- Updated `CrawlingProgress.tsx:248-291`: Added Discovery Information and Linked Files UI sections

### How to Test

```bash
# Run unit tests
uv run pytest tests/test_crawling_service_subdomain.py -v
uv run pytest tests/test_llms_txt_link_following.py -v

# Test with actual crawl (after restarting backend)
docker compose restart archon-server
# Then crawl: https://supabase.com/docs
# Should discover /docs/llms.txt and follow 8 linked files
```

### Files Modified

**Backend:**

1. `python/src/server/services/crawling/crawling_service.py`
   - Lines 744-788: `_is_same_domain_or_subdomain` method
   - Lines 862-920: llms.txt link following logic
   - Lines 389-413: Enhanced discovery progress

2. `python/src/server/services/crawling/helpers/url_handler.py`
   - Lines 633-665: Fixed `is_llms_variant` method

3. `python/src/server/services/crawling/discovery_service.py`
   - Lines 137-214: Two-phase discovery priority fix

4. `python/tests/test_crawling_service_subdomain.py` (NEW)
   - 152 lines, 8 comprehensive test cases

5. `python/tests/test_llms_txt_link_following.py` (NEW)
   - 218 lines, 7 integration test cases

**Frontend:**

6. `archon-ui-main/src/features/progress/types/progress.ts`
   - Lines 6-26: Added "discovery" to ProgressStatus
   - Lines 27-36: Added new crawl types
   - Lines 49-70: Added discovery fields to CrawlProgressData
   - Lines 124-169: Added discovery fields to ProgressResponse

7. `archon-ui-main/src/features/progress/components/CrawlingProgress.tsx`
   - Lines 126-138: Added "discovery" to active statuses
   - Lines 248-291: Added Discovery Information and Linked Files UI sections
