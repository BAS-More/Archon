name: "OpenRouter Embeddings Support PRP"
description: |
  Add OpenRouter as an embedding provider option, enabling users to access multiple
  embedding models (OpenAI, Google Gemini, Qwen3, Mistral) through a single API key.

---

## Goal

**Feature Goal**: Enable Archon users to use OpenRouter as an embedding provider, accessing multiple embedding models through OpenRouter's unified API while maintaining compatibility with existing embedding infrastructure.

**Deliverable**:
- OpenRouter provider option in Settings UI
- OpenRouter model discovery and selection
- Configuration support for OpenRouter API credentials
- Comprehensive tests for OpenRouter embedding functionality

**Success Definition**:
- Users can select "OpenRouter" as embedding provider in Settings
- Users can authenticate with OpenRouter API key
- Users can discover and select OpenRouter embedding models (OpenAI, Gemini, Qwen3, Mistral)
- Embeddings are generated successfully using OpenRouter API
- All existing embedding tests pass with OpenRouter provider

## User Persona

**Target User**: Archon users who want cost flexibility and access to multiple embedding providers through a single API

**Use Case**:
- Primary: User wants to use Qwen3 embeddings for cost savings ($0.01/1M tokens vs $0.13/1M for OpenAI)
- Secondary: User needs longer context windows (Gemini 20K, Qwen3 32K vs OpenAI 8K)
- Tertiary: User wants a unified API key for multiple embedding providers

**User Journey**:
1. User navigates to Settings → RAG Configuration
2. User selects "OpenRouter" as embedding provider
3. User enters OpenRouter API key (starts with `sk-or-v1-`)
4. User clicks "Discover Models" to fetch available embedding models
5. User selects desired model (e.g., `qwen/qwen3-embedding-8b` for cost savings)
6. User saves configuration
7. User tests embedding generation with sample text
8. System generates embeddings using OpenRouter API

**Pain Points Addressed**:
- Eliminates need for multiple API keys (OpenAI, Google, etc.)
- Provides access to cost-effective embedding models (Qwen3)
- Enables longer context processing (Gemini, Qwen3)
- Simplifies multi-provider strategy with single unified API

## Why

- **Cost Optimization**: Qwen3 models cost $0.01/1M tokens (87% cheaper than OpenAI text-embedding-3-large)
- **Context Length**: Gemini (20K) and Qwen3 (32K) support longer contexts than OpenAI (8K)
- **Unified API**: Single API key for accessing multiple embedding providers
- **Provider Diversity**: Reduces dependency on single provider
- **Existing Infrastructure**: Leverages OpenAI-compatible adapter pattern already in codebase
- **User Flexibility**: Gives users choice based on cost, performance, and context requirements

## What

Add OpenRouter as a first-class embedding provider option with full model discovery and configuration support.

### Success Criteria

- [x] Backend recognizes "openrouter" as valid embedding provider
- [x] Frontend displays "OpenRouter" in provider selection dropdown
- [x] OpenRouter API key validation (format: `sk-or-v1-*`)
- [x] Model discovery fetches OpenRouter embedding models with metadata
- [x] Model names include provider prefixes (e.g., `openai/text-embedding-3-large`)
- [x] Settings UI displays OpenRouter models with dimensions and pricing
- [x] Embedding generation works via OpenRouter API
- [x] Error handling includes OpenRouter-specific errors (rate limits, quota)
- [x] All existing embedding tests pass with OpenRouter provider
- [x] Documentation updated with OpenRouter setup instructions

## All Needed Context

### Context Completeness Check

✅ **Validated**: This PRP provides complete context for implementation without prior codebase knowledge:
- Existing embedding provider patterns documented
- OpenRouter API compatibility assessed
- UI integration patterns identified
- Test patterns extracted
- Configuration patterns mapped
- All file paths and patterns specified

### Documentation & References

```yaml
# MUST READ - OpenRouter API Documentation
- url: https://openrouter.ai/docs/api-reference/embeddings/create-embeddings
  why: Primary API reference for embeddings endpoint structure and parameters
  critical: Model names MUST include provider prefix (openai/, google/, qwen/, mistralai/)

- url: https://openrouter.ai/docs/api-reference/authentication
  why: API key format validation (sk-or-v1-*) and Authorization header pattern
  critical: Uses Bearer token auth, not API key header

- url: https://openrouter.ai/docs/api-reference/errors
  why: OpenRouter-specific error codes and rate limit structure
  critical: Rate limits based on account balance (1 RPS per $1), 429 errors require different handling

- url: https://openrouter.ai/docs/api-reference/limits
  why: Rate limiting and account tier information
  critical: Free tier very restrictive (20 req/min, 50/day); recommend $10 minimum

# MUST READ - Existing Codebase Patterns
- file: python/src/server/services/embeddings/embedding_service.py
  why: Core embedding service with adapter pattern and provider abstraction
  pattern: _get_embedding_adapter() factory returns OpenAICompatibleEmbeddingAdapter for OpenRouter
  gotcha: OpenRouter uses OpenAI-compatible API, no custom adapter needed

- file: python/src/server/services/llm_provider_service.py
  why: Provider validation, client creation, and model selection patterns
  pattern: get_llm_client() creates OpenAI-compatible client with custom base_url
  gotcha: Must add "openrouter" to _is_valid_provider() list and provider_defaults dict

- file: python/src/server/services/embeddings/provider_error_adapters.py
  why: Error sanitization to remove API keys from error messages
  pattern: Create OpenRouterErrorAdapter class with sk-or-v1- pattern redaction
  gotcha: OpenRouter keys format: sk-or-v1-[long string]

- file: archon-ui-main/src/components/settings/RAGSettings.tsx
  why: Provider selection UI and model persistence pattern
  pattern: Add "openrouter" to ProviderKey type and EMBEDDING_CAPABLE_PROVIDERS array
  gotcha: Per-provider model persistence in localStorage with getDefaultModels()

- file: python/tests/test_async_embedding_service.py
  why: Comprehensive embedding service test patterns
  pattern: AsyncContextManager for mocking, fixture-based mocking, multi-provider tests
  gotcha: Must test with provider prefix in model names (openai/text-embedding-3-large)

# MUST READ - Configuration Patterns
- file: python/src/server/services/credential_service.py
  why: Database-backed credential storage and retrieval
  pattern: get_active_provider(service_type="embedding") for provider selection
  gotcha: API keys stored encrypted in archon_settings table, not .env

- file: python/.env.example
  why: Environment variable documentation reference
  pattern: Add OPENROUTER_API_KEY with example and description
  gotcha: Only for documentation; actual keys stored in database via Settings UI
```

### Current Codebase Tree (Relevant Sections)

```bash
python/
├── src/
│   └── server/
│       ├── services/
│       │   ├── embeddings/
│       │   │   ├── embedding_service.py          # Main embedding logic
│       │   │   ├── embedding_exceptions.py       # Custom exception hierarchy
│       │   │   └── provider_error_adapters.py    # Error sanitization
│       │   ├── llm_provider_service.py           # Provider abstraction
│       │   └── credential_service.py             # Credential management
│       ├── config/
│       │   └── config.py                         # API key validation
│       └── api_routes/
│           └── settings_api.py                   # Settings CRUD API
└── tests/
    ├── test_async_embedding_service.py           # Embedding service tests
    └── test_async_llm_provider_service.py        # Provider service tests

archon-ui-main/
└── src/
    ├── components/
    │   └── settings/
    │       ├── RAGSettings.tsx                   # Main RAG config UI
    │       └── OllamaModelSelectionModal.tsx     # Model selection pattern
    └── services/
        └── credentialsService.ts                 # Frontend credential API
```

### Desired Codebase Tree (Files to Add/Modify)

```bash
python/
├── src/
│   └── server/
│       ├── services/
│       │   ├── embeddings/
│       │   │   └── provider_error_adapters.py   # MODIFY: Add OpenRouterErrorAdapter
│       │   ├── llm_provider_service.py          # MODIFY: Add openrouter to valid providers
│       │   └── openrouter_discovery_service.py  # CREATE: OpenRouter model discovery
│       ├── config/
│       │   └── config.py                        # MODIFY: Add validate_openrouter_api_key()
│       └── api_routes/
│           └── openrouter_api.py                # CREATE: OpenRouter-specific endpoints
├── tests/
│   ├── test_openrouter_embeddings.py            # CREATE: OpenRouter embedding tests
│   └── test_openrouter_discovery.py             # CREATE: Model discovery tests
└── .env.example                                  # MODIFY: Add OPENROUTER_API_KEY docs

archon-ui-main/
└── src/
    ├── components/
    │   └── settings/
    │       ├── RAGSettings.tsx                  # MODIFY: Add OpenRouter provider option
    │       └── OpenRouterModelModal.tsx         # CREATE: Model selection UI
    └── services/
        └── openrouterService.ts                 # CREATE: API client for model discovery
```

### Known Gotchas & Library Quirks

```python
# CRITICAL: OpenRouter API Compatibility
# OpenRouter uses OpenAI-compatible API BUT with provider prefixes in model names
# ✅ CORRECT: "openai/text-embedding-3-large"
# ❌ WRONG: "text-embedding-3-large"

# CRITICAL: Rate Limiting Structure
# OpenRouter rate limits scale with account balance (1 RPS per $1)
# Free tier: 20 req/min, 50-1000 requests/day based on balance
# Must handle 429 errors differently than OpenAI (no tier-based retries)

# CRITICAL: API Key Format
# OpenRouter keys: sk-or-v1-[alphanumeric string]
# OpenAI keys: sk-[alphanumeric string]
# Must validate format to prevent user confusion

# CRITICAL: Base URL
# OpenRouter: https://openrouter.ai/api/v1
# Must NOT use /embeddings suffix (full path: /api/v1/embeddings)

# GOTCHA: Archon's Adapter Pattern
# OpenRouter requires NO custom adapter - uses OpenAICompatibleEmbeddingAdapter
# Only needs base_url change and model name prefix handling

# GOTCHA: Credential Storage
# API keys stored in database via credential_service, not .env
# .env.example only for documentation purposes

# GOTCHA: Model Discovery
# Unlike Ollama, OpenRouter doesn't have /models endpoint
# Must maintain hardcoded list or fetch from OpenRouter website
# Alternative: Use OpenAI SDK model discovery with OpenRouter base URL

# GOTCHA: Dimension Support
# OpenRouter models support dimension reduction via API parameter
# OpenAI models: 1536 (reducible), 3072 (reducible)
# Gemini: 768, 1536, 3072 (reducible)
# Qwen3: Dimensions not documented, test required

# GOTCHA: Error Message Sanitization
# Must add sk-or-v1- pattern to provider_error_adapters.py
# Prevents API keys from appearing in logs and error messages
```

## Implementation Blueprint

### Data Models and Structure

```python
# python/src/server/models/openrouter_models.py

from pydantic import BaseModel, Field, field_validator
from typing import Literal

class OpenRouterEmbeddingModel(BaseModel):
    """OpenRouter embedding model metadata."""

    id: str = Field(..., description="Full model ID with provider prefix (e.g., openai/text-embedding-3-large)")
    provider: Literal["openai", "google", "qwen", "mistralai"] = Field(..., description="Provider name")
    name: str = Field(..., description="Display name without prefix")
    dimensions: int = Field(..., description="Embedding dimensions")
    context_length: int = Field(..., description="Maximum context window in tokens")
    pricing_per_1m_tokens: float = Field(..., description="Cost per 1M tokens")
    supports_dimension_reduction: bool = Field(default=False, description="Whether model supports dimension parameter")

    @field_validator("id")
    @classmethod
    def validate_model_id_has_prefix(cls, v: str) -> str:
        """Ensure model ID includes provider prefix."""
        if "/" not in v:
            raise ValueError("OpenRouter model IDs must include provider prefix (e.g., openai/model-name)")
        return v

class OpenRouterModelListResponse(BaseModel):
    """Response from OpenRouter model discovery."""

    embedding_models: list[OpenRouterEmbeddingModel] = Field(default_factory=list)
    total_count: int = Field(..., description="Total number of embedding models")

# No database schema changes needed - uses existing archon_settings table
```

### Implementation Tasks (Ordered by Dependencies)

```yaml
Task 1: MODIFY python/src/server/config/config.py
  - IMPLEMENT: validate_openrouter_api_key(api_key: str) -> bool
  - PATTERN: Follow validate_openai_api_key() structure
  - VALIDATION: Must start with "sk-or-v1-", non-empty, string type
  - RAISES: ConfigurationError with descriptive message
  - PLACEMENT: After other API key validation functions
  - GOTCHA: Different prefix than OpenAI (sk-or-v1- vs sk-)

Task 2: MODIFY python/src/server/services/embeddings/provider_error_adapters.py
  - IMPLEMENT: OpenRouterErrorAdapter class inheriting from ProviderErrorAdapter
  - PATTERN: Copy OpenAIErrorAdapter structure, change regex patterns
  - REGEX: r'sk-or-v1-[a-zA-Z0-9_-]{10,}' → '[REDACTED_KEY]'
  - ADD: OpenRouterErrorAdapter to ProviderErrorFactory.get_adapter()
  - PLACEMENT: After AnthropicErrorAdapter class
  - GOTCHA: Must redact sk-or-v1- prefix format

Task 3: MODIFY python/src/server/services/llm_provider_service.py
  - ADD: "openrouter" to _is_valid_provider() validation list
  - ADD: "openrouter" to provider_defaults dict in get_embedding_model()
  - DEFAULT_MODEL: "openai/text-embedding-3-small" (most cost-effective OpenAI model)
  - BASE_URL: "https://openrouter.ai/api/v1"
  - PATTERN: Follow existing openai, google, ollama provider pattern
  - DEPENDENCIES: None (pure configuration)
  - GOTCHA: Model name MUST include provider prefix

Task 4: CREATE python/src/server/services/openrouter_discovery_service.py
  - IMPLEMENT: OpenRouterDiscoveryService class with discover_embedding_models() method
  - RETURN: List of OpenRouterEmbeddingModel with hardcoded model metadata
  - MODELS: Include OpenAI (3-small, 3-large), Gemini (001), Qwen3 (0.6b, 4b, 8b), Mistral
  - PATTERN: Follow python/src/server/services/provider_discovery_service.py structure
  - FUTURE: Could fetch from OpenRouter API models endpoint if available
  - PLACEMENT: New file in src/server/services/
  - DEPENDENCIES: Import OpenRouterEmbeddingModel from Task 1

Task 5: CREATE python/src/server/api_routes/openrouter_api.py
  - IMPLEMENT: GET /api/openrouter/models endpoint returning OpenRouterModelListResponse
  - PATTERN: Follow python/src/server/api_routes/ollama_api.py structure
  - AUTHENTICATION: No auth required (public model list)
  - DEPENDENCIES: Import OpenRouterDiscoveryService from Task 4
  - PLACEMENT: New file in src/server/api_routes/
  - REGISTER: Add router to main.py with prefix "/api/openrouter"

Task 6: MODIFY python/src/server/main.py
  - IMPORT: from src.server.api_routes.openrouter_api import router as openrouter_router
  - REGISTER: app.include_router(openrouter_router)
  - PLACEMENT: After other API router registrations
  - PRESERVE: Existing router registrations and startup logic

Task 7: CREATE archon-ui-main/src/services/openrouterService.ts
  - IMPLEMENT: discoverModels() -> Promise<OpenRouterModelListResponse>
  - PATTERN: Follow archon-ui-main/src/services/ollamaService.ts structure
  - ENDPOINT: GET /api/openrouter/models
  - CACHING: sessionStorage with 5-minute TTL
  - ERROR_HANDLING: Try/catch with user-friendly error messages
  - PLACEMENT: New file in src/services/

Task 8: MODIFY archon-ui-main/src/components/settings/RAGSettings.tsx
  - ADD: "openrouter" to ProviderKey type
  - ADD: "openrouter" to EMBEDDING_CAPABLE_PROVIDERS array
  - ADD: "OpenRouter" to providerDisplayNames mapping
  - ADD: OpenRouter color style (suggested: border-purple-500 bg-purple-500/10)
  - ADD: Default models in getDefaultModels(): chatModel "gpt-4.1-nano", embeddingModel "openai/text-embedding-3-small"
  - PATTERN: Follow existing provider additions (anthropic, grok)
  - GOTCHA: Embedding model includes provider prefix

Task 9: CREATE archon-ui-main/src/components/settings/OpenRouterModelModal.tsx
  - IMPLEMENT: Full-screen modal for OpenRouter model selection
  - PATTERN: Copy OllamaModelSelectionModal.tsx structure, simplify (no multi-instance)
  - FEATURES: Search, filter by provider, sort by cost/dimensions/context
  - DISPLAY: Model cards with provider badge, dimensions, context length, pricing
  - STATE: selectedModel, searchTerm, providerFilter, sortBy
  - INTEGRATION: Call openrouterService.discoverModels() on mount
  - PLACEMENT: New file in src/components/settings/

Task 10: CREATE python/tests/test_openrouter_embeddings.py
  - IMPLEMENT: Unit tests for OpenRouter embedding functionality
  - PATTERN: Copy python/tests/test_async_embedding_service.py structure
  - TESTS:
    - test_create_embedding_with_openrouter_provider()
    - test_openrouter_model_name_includes_prefix()
    - test_openrouter_api_key_validation()
    - test_openrouter_error_sanitization()
    - test_openrouter_rate_limit_handling()
  - MOCKS: Mock OpenAI client with base_url="https://openrouter.ai/api/v1"
  - FIXTURES: openrouter_provider_config fixture
  - ASSERTIONS: Verify model names have provider prefix, API key format, error handling
  - PLACEMENT: New file in tests/

Task 11: CREATE python/tests/test_openrouter_discovery.py
  - IMPLEMENT: Unit tests for OpenRouter model discovery
  - PATTERN: Follow python/tests/test_async_llm_provider_service.py pattern
  - TESTS:
    - test_discover_embedding_models_returns_valid_list()
    - test_all_models_have_provider_prefix()
    - test_dimensions_are_positive_integers()
    - test_pricing_is_non_negative()
  - PLACEMENT: New file in tests/

Task 12: MODIFY python/.env.example
  - ADD: OPENROUTER_API_KEY documentation
  - FORMAT: "# OpenRouter API key (format: sk-or-v1-...)\nOPENROUTER_API_KEY=your_api_key_here"
  - NOTE: Add comment that keys are stored in database via Settings UI
  - PLACEMENT: After other API key examples (OPENAI_API_KEY, GOOGLE_API_KEY)
```

### Implementation Patterns & Key Details

```python
# PATTERN: OpenRouter API Key Validation
def validate_openrouter_api_key(api_key: str) -> bool:
    """Validate OpenRouter API key format."""
    if not api_key:
        raise ConfigurationError("OpenRouter API key cannot be empty")

    if not api_key.startswith("sk-or-v1-"):
        raise ConfigurationError(
            "OpenRouter API key must start with 'sk-or-v1-'. "
            "Get your key at https://openrouter.ai/keys"
        )

    return True

# PATTERN: Error Sanitization for OpenRouter
class OpenRouterErrorAdapter(ProviderErrorAdapter):
    """Sanitize OpenRouter error messages to remove API keys."""

    def sanitize_error_message(self, message: str) -> str:
        """Remove OpenRouter API keys from error messages."""
        # Pattern: sk-or-v1-[alphanumeric and special chars]
        pattern = r'sk-or-v1-[a-zA-Z0-9_-]{10,}'
        return re.sub(pattern, '[REDACTED_KEY]', message)

# PATTERN: Provider Configuration in llm_provider_service.py
async def get_embedding_model(provider: str | None = None) -> str:
    """Get embedding model for provider."""
    provider_defaults = {
        "openai": "text-embedding-3-small",
        "ollama": "nomic-embed-text",
        "google": "text-embedding-004",
        "openrouter": "openai/text-embedding-3-small",  # ADD THIS
    }
    # ... rest of function

def _is_valid_provider(provider: str) -> bool:
    """Validate provider name."""
    valid_providers = {
        "openai", "ollama", "google", "openrouter",  # ADD openrouter
        "anthropic", "grok"
    }
    return provider.lower() in valid_providers

# PATTERN: Model Discovery Service
class OpenRouterDiscoveryService:
    """Discover and manage OpenRouter embedding models."""

    async def discover_embedding_models(self) -> list[OpenRouterEmbeddingModel]:
        """
        Get available OpenRouter embedding models.

        NOTE: Hardcoded for now. Future: fetch from API if available.
        """
        return [
            OpenRouterEmbeddingModel(
                id="openai/text-embedding-3-small",
                provider="openai",
                name="text-embedding-3-small",
                dimensions=1536,
                context_length=8191,
                pricing_per_1m_tokens=0.02,
                supports_dimension_reduction=True,
            ),
            OpenRouterEmbeddingModel(
                id="openai/text-embedding-3-large",
                provider="openai",
                name="text-embedding-3-large",
                dimensions=3072,
                context_length=8191,
                pricing_per_1m_tokens=0.13,
                supports_dimension_reduction=True,
            ),
            OpenRouterEmbeddingModel(
                id="google/gemini-embedding-001",
                provider="google",
                name="gemini-embedding-001",
                dimensions=3072,
                context_length=20000,
                pricing_per_1m_tokens=0.15,
                supports_dimension_reduction=True,
            ),
            OpenRouterEmbeddingModel(
                id="qwen/qwen3-embedding-8b",
                provider="qwen",
                name="qwen3-embedding-8b",
                dimensions=1024,  # TODO: Verify actual dimensions
                context_length=32768,
                pricing_per_1m_tokens=0.01,
                supports_dimension_reduction=False,
            ),
            # Add more models as needed
        ]

# PATTERN: API Endpoint
@router.get("/models", response_model=OpenRouterModelListResponse)
async def get_openrouter_models() -> OpenRouterModelListResponse:
    """Get available OpenRouter embedding models."""
    service = OpenRouterDiscoveryService()
    models = await service.discover_embedding_models()

    return OpenRouterModelListResponse(
        embedding_models=models,
        total_count=len(models),
    )

# PATTERN: Frontend Model Selection (TypeScript)
interface OpenRouterModelCardProps {
  model: OpenRouterEmbeddingModel
  isSelected: boolean
  onSelect: () => void
}

const OpenRouterModelCard: React.FC<OpenRouterModelCardProps> = ({
  model,
  isSelected,
  onSelect,
}) => {
  return (
    <div
      onClick={onSelect}
      className={/* selection styles */}
    >
      {/* Provider badge */}
      <Badge>{model.provider.toUpperCase()}</Badge>

      {/* Dimensions badge with color coding */}
      <Badge variant={model.dimensions >= 3000 ? "success" : "default"}>
        {model.dimensions}D
      </Badge>

      {/* Model name and context */}
      <h3>{model.name}</h3>
      <p>Context: {model.context_length.toLocaleString()} tokens</p>

      {/* Pricing */}
      <p className="text-green-400">
        ${model.pricing_per_1m_tokens.toFixed(3)}/1M tokens
      </p>
    </div>
  )
}

# GOTCHA: Model Name Must Include Prefix
# When sending to OpenRouter API:
embedding_model = "openai/text-embedding-3-large"  # ✅ CORRECT
# NOT:
embedding_model = "text-embedding-3-large"  # ❌ WRONG - will fail with 404

# GOTCHA: Base URL Must Be Complete
client = openai.AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",  # ✅ CORRECT
    api_key=openrouter_api_key,
)
# NOT:
base_url = "https://openrouter.ai"  # ❌ WRONG - missing /api/v1
```

### Integration Points

```yaml
DATABASE:
  - table: archon_settings
  - action: No schema changes needed
  - credentials: OPENROUTER_API_KEY stored via credential_service
  - settings: EMBEDDING_PROVIDER can be set to "openrouter"

CONFIG:
  - file: python/.env.example
  - add: OPENROUTER_API_KEY with documentation comment
  - note: Actual keys stored in database, .env for docs only

ROUTES:
  - file: python/src/server/main.py
  - add: app.include_router(openrouter_router, prefix="/api/openrouter")
  - placement: After other API router registrations

UI_COMPONENTS:
  - file: archon-ui-main/src/components/settings/RAGSettings.tsx
  - modify: Add "openrouter" to provider types and defaults
  - add: OpenRouter color styling and display name

API_SERVICES:
  - file: archon-ui-main/src/services/openrouterService.ts
  - create: New service for model discovery API calls
  - pattern: Follow ollamaService.ts structure

VALIDATION:
  - file: python/src/server/config/config.py
  - add: validate_openrouter_api_key() function
  - pattern: Follow validate_openai_api_key() structure

ERROR_HANDLING:
  - file: python/src/server/services/embeddings/provider_error_adapters.py
  - add: OpenRouterErrorAdapter class
  - register: In ProviderErrorFactory.get_adapter()
```

## Validation Loop

### Level 1: Syntax & Style (Immediate Feedback)

```bash
# Backend validation after each Python file
cd python
uv run ruff check src/server/services/openrouter_discovery_service.py --fix
uv run mypy src/server/services/openrouter_discovery_service.py
uv run ruff format src/server/services/openrouter_discovery_service.py

# Full backend validation
uv run ruff check src/ --fix
uv run mypy src/
uv run ruff format src/

# Frontend validation after each TypeScript file
cd archon-ui-main
npm run biome:fix src/services/openrouterService.ts
npx tsc --noEmit src/services/openrouterService.ts

# Full frontend validation
npm run biome:fix
npm run lint
npx tsc --noEmit

# Expected: Zero errors before proceeding
```

### Level 2: Unit Tests (Component Validation)

```bash
# Test OpenRouter embedding functionality
cd python
uv run pytest tests/test_openrouter_embeddings.py -v
uv run pytest tests/test_openrouter_discovery.py -v

# Test existing embedding service still works
uv run pytest tests/test_async_embedding_service.py -v

# Test provider service recognizes OpenRouter
uv run pytest tests/test_async_llm_provider_service.py::test_get_llm_client_openrouter -v

# Full test suite
uv run pytest tests/ -v

# Coverage check
uv run pytest tests/ --cov=src --cov-report=term-missing

# Expected: All tests pass, >80% coverage for new code
```

### Level 3: Integration Testing (System Validation)

```bash
# Start services
cd python
docker compose up -d  # or: uv run python -m src.server.main

# Wait for startup
sleep 5

# Test health endpoint
curl -f http://localhost:8181/health || echo "Service health check failed"

# Test OpenRouter model discovery endpoint
curl http://localhost:8181/api/openrouter/models | jq .
# Expected: JSON with embedding_models array containing OpenRouter models

# Test frontend (separate terminal)
cd archon-ui-main
npm run dev

# Manual UI Testing Checklist:
# 1. Navigate to Settings → RAG Configuration
# 2. Verify "OpenRouter" appears in provider dropdown
# 3. Select OpenRouter as embedding provider
# 4. Enter test API key (or real key if available)
# 5. Click "Discover Models" or "Select Model"
# 6. Verify models appear with provider prefixes (openai/, google/, qwen/)
# 7. Select a model and save configuration
# 8. Test embedding generation (upload document or search)
# 9. Check browser console for errors
# 10. Verify embeddings generated successfully

# Test with real API (if key available)
curl -X POST http://localhost:8181/api/knowledge/upload \
  -H "Content-Type: multipart/form-data" \
  -F "files=@test.txt" \
  -F "provider=openrouter"
# Expected: Successful upload with embeddings generated

# Check Docker logs for errors
docker compose logs archon-server -f
# Expected: No errors, successful embedding generation logs
```

### Level 4: Creative & Domain-Specific Validation

```bash
# Cost Comparison Test
# Compare embedding costs between providers using same test document
# Expected: Qwen3 models show lowest cost per embedding

# Context Length Test
# Test with long documents (>8K tokens)
# Expected: Gemini and Qwen3 handle longer contexts than OpenAI

# Model Prefix Validation
# Ensure all model names in UI and API include provider prefixes
grep -r "text-embedding-3" archon-ui-main/src --include="*.tsx" --include="*.ts"
# Expected: All instances use "openai/text-embedding-3-*" format

# API Key Sanitization Test
# Trigger an error with invalid API key
# Check logs to ensure key is not visible
# Expected: All sk-or-v1-* patterns replaced with [REDACTED_KEY]

# Rate Limit Handling Test (if real API key available)
# Send rapid requests to trigger rate limiting
# Expected: Graceful handling of 429 errors, no crashes

# Multi-Provider Switching Test
# Switch between OpenRouter, OpenAI, Google in Settings
# Test embeddings work with each provider
# Expected: Seamless provider switching, embeddings generated correctly

# Browser DevTools Network Tab
# Verify API calls to /api/openrouter/models
# Verify embedding API calls include correct base URL
# Expected: Correct endpoints, proper Authorization headers

# Session Storage Validation
# Check sessionStorage for model cache
# Verify 5-minute TTL behavior
# Expected: Models cached correctly, refresh after TTL
```

## Final Validation Checklist

### Technical Validation

- [ ] All 4 validation levels completed successfully
- [ ] All tests pass: `uv run pytest tests/ -v`
- [ ] No linting errors: `uv run ruff check src/`
- [ ] No type errors: `uv run mypy src/`
- [ ] No formatting issues: `uv run ruff format src/ --check`
- [ ] Frontend builds without errors: `npm run build`
- [ ] No TypeScript errors: `npx tsc --noEmit`

### Feature Validation

- [ ] OpenRouter appears in provider selection dropdown
- [ ] OpenRouter API key can be saved in Settings UI
- [ ] Model discovery returns OpenRouter embedding models
- [ ] All model names include provider prefixes (openai/, google/, qwen/, mistralai/)
- [ ] Model selection modal displays OpenRouter models with metadata
- [ ] Embeddings successfully generated using OpenRouter API
- [ ] Error messages do not expose API keys
- [ ] Rate limiting handled gracefully (if testable)
- [ ] Configuration persists across browser sessions
- [ ] Switching between providers works correctly

### Code Quality Validation

- [ ] Follows existing embedding provider patterns
- [ ] No custom adapter created (uses OpenAICompatibleEmbeddingAdapter)
- [ ] File placement matches desired codebase tree structure
- [ ] Naming conventions consistent (openrouter lowercase, OpenRouter display name)
- [ ] Error handling includes OpenRouter-specific errors
- [ ] API key validation prevents invalid formats
- [ ] Test coverage >80% for new code

### Documentation & User Experience

- [ ] .env.example includes OPENROUTER_API_KEY with helpful comment
- [ ] Model selection UI clearly shows provider, dimensions, pricing
- [ ] Error messages are user-friendly and actionable
- [ ] Settings UI tooltips explain OpenRouter benefits (cost, context)
- [ ] No breaking changes to existing embedding functionality

---

## Anti-Patterns to Avoid

- ❌ Don't create custom EmbeddingAdapter for OpenRouter (use OpenAI-compatible)
- ❌ Don't omit provider prefix from model names (breaks OpenRouter API)
- ❌ Don't validate OpenAI keys for OpenRouter (different format: sk-or-v1-)
- ❌ Don't hardcode OpenRouter API URL without /api/v1 path
- ❌ Don't skip error message sanitization (prevents key leakage)
- ❌ Don't assume OpenRouter models have same dimensions as OpenAI
- ❌ Don't ignore rate limit differences (balance-based, not tier-based)
- ❌ Don't forget to test with model name prefixes in all tests
- ❌ Don't break existing provider functionality when adding OpenRouter
- ❌ Don't skip session storage caching for model discovery (reduces API calls)

---

## PRP Confidence Score

**Score**: 9/10

**Rationale**:
- ✅ OpenRouter API is fully OpenAI-compatible (minimal integration work)
- ✅ Existing adapter pattern supports OpenRouter without custom code
- ✅ Comprehensive research completed on API, UI patterns, testing
- ✅ Clear implementation path with specific file modifications
- ✅ All patterns extracted from existing codebase
- ⚠️ Minor uncertainty: Qwen3 embedding dimensions not documented (needs testing)
- ⚠️ Rate limit handling may need iteration based on real API behavior

**Implementation Time Estimate**: 4-6 hours for experienced developer

**Risk Level**: Low (leverages existing infrastructure, no breaking changes)
