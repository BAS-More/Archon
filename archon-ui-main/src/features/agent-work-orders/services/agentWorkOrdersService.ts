/**
 * Agent Work Orders API Service
 *
 * This service handles all API communication for agent work orders.
 * It follows the pattern established in projectService.ts
 */

import { callAPIWithETag } from "@/features/shared/api/apiClient";
import type { AgentWorkOrder, AgentWorkOrderStatus, CreateAgentWorkOrderRequest, StepHistory } from "../types";

export const agentWorkOrdersService = {
  /**
   * Create a new agent work order
   *
   * @param request - The work order creation request
   * @returns Promise resolving to the created work order
   * @throws Error if creation fails
   */
  async createWorkOrder(request: CreateAgentWorkOrderRequest): Promise<AgentWorkOrder> {
    return await callAPIWithETag<AgentWorkOrder>("/api/agent-work-orders/", {
      method: "POST",
      body: JSON.stringify(request),
    });
  },

  /**
   * List all agent work orders, optionally filtered by status
   *
   * @param statusFilter - Optional status to filter by
   * @returns Promise resolving to array of work orders
   * @throws Error if request fails
   */
  async listWorkOrders(statusFilter?: AgentWorkOrderStatus): Promise<AgentWorkOrder[]> {
    const params = statusFilter ? `?status=${statusFilter}` : "";
    return await callAPIWithETag<AgentWorkOrder[]>(`/api/agent-work-orders/${params}`);
  },

  /**
   * Get a single agent work order by ID
   *
   * @param id - The work order ID
   * @returns Promise resolving to the work order
   * @throws Error if work order not found or request fails
   */
  async getWorkOrder(id: string): Promise<AgentWorkOrder> {
    return await callAPIWithETag<AgentWorkOrder>(`/api/agent-work-orders/${id}`);
  },

  /**
   * Get the complete step execution history for a work order
   *
   * @param id - The work order ID
   * @returns Promise resolving to the step history
   * @throws Error if work order not found or request fails
   */
  async getStepHistory(id: string): Promise<StepHistory> {
    return await callAPIWithETag<StepHistory>(`/api/agent-work-orders/${id}/steps`);
  },
};
