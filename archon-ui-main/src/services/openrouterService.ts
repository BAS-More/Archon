/**
 * OpenRouter Service Client
 *
 * Provides frontend API client for OpenRouter model discovery.
 */

import { getApiUrl } from "../config/api";

// Type definitions for OpenRouter API responses
export interface OpenRouterEmbeddingModel {
	id: string;
	provider: string;
	name: string;
	dimensions: number;
	context_length: number;
	pricing_per_1m_tokens: number;
	supports_dimension_reduction: boolean;
}

export interface OpenRouterModelListResponse {
	embedding_models: OpenRouterEmbeddingModel[];
	total_count: number;
}

class OpenRouterService {
	private baseUrl = getApiUrl();
	private cacheKey = "openrouter_models_cache";
	private cacheTTL = 5 * 60 * 1000; // 5 minutes

	private handleApiError(error: unknown, context: string): Error {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Check for network errors
		if (
			errorMessage.toLowerCase().includes("network") ||
			errorMessage.includes("fetch") ||
			errorMessage.includes("Failed to fetch")
		) {
			return new Error(
				`Network error while ${context.toLowerCase()}: ${errorMessage}. ` +
					"Please check your connection.",
			);
		}

		// Check for timeout errors
		if (errorMessage.includes("timeout") || errorMessage.includes("AbortError")) {
			return new Error(
				`Timeout error while ${context.toLowerCase()}: The server may be slow to respond.`,
			);
		}

		// Return original error with context
		return new Error(`${context} failed: ${errorMessage}`);
	}

	/**
	 * Get cached models if available and not expired
	 */
	private getCachedModels(): OpenRouterModelListResponse | null {
		try {
			const cached = sessionStorage.getItem(this.cacheKey);
			if (!cached) return null;

			const { data, timestamp } = JSON.parse(cached);
			const now = Date.now();

			if (now - timestamp > this.cacheTTL) {
				sessionStorage.removeItem(this.cacheKey);
				return null;
			}

			return data;
		} catch {
			return null;
		}
	}

	/**
	 * Cache models for the TTL duration
	 */
	private cacheModels(data: OpenRouterModelListResponse): void {
		try {
			const cacheData = {
				data,
				timestamp: Date.now(),
			};
			sessionStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
		} catch {
			// Ignore cache errors
		}
	}

	/**
	 * Discover available OpenRouter embedding models
	 */
	async discoverModels(): Promise<OpenRouterModelListResponse> {
		try {
			// Check cache first
			const cached = this.getCachedModels();
			if (cached) {
				return cached;
			}

			const response = await fetch(`${this.baseUrl}/api/openrouter/models`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP ${response.status}: ${errorText}`);
			}

			const data = await response.json();

			// Cache the successful response
			this.cacheModels(data);

			return data;
		} catch (error) {
			throw this.handleApiError(error, "Model discovery");
		}
	}

	/**
	 * Clear the models cache
	 */
	clearCache(): void {
		try {
			sessionStorage.removeItem(this.cacheKey);
		} catch {
			// Ignore cache clearing errors
		}
	}
}

// Export singleton instance
export const openrouterService = new OpenRouterService();
