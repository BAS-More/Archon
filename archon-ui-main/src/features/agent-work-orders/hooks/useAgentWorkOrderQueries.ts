/**
 * TanStack Query Hooks for Agent Work Orders
 *
 * This module provides React hooks for fetching and mutating agent work orders.
 * Follows the pattern established in useProjectQueries.ts
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DISABLED_QUERY_KEY, STALE_TIMES } from "@/features/shared/config/queryPatterns";
import { useSmartPolling } from "@/features/shared/hooks/useSmartPolling";
import { agentWorkOrdersService } from "../services/agentWorkOrdersService";
import type { AgentWorkOrder, AgentWorkOrderStatus, CreateAgentWorkOrderRequest, StepHistory } from "../types";

/**
 * Query key factory for agent work orders
 * Provides consistent query keys for cache management
 */
export const agentWorkOrderKeys = {
  all: ["agent-work-orders"] as const,
  lists: () => [...agentWorkOrderKeys.all, "list"] as const,
  list: (filter: AgentWorkOrderStatus | undefined) => [...agentWorkOrderKeys.lists(), filter] as const,
  details: () => [...agentWorkOrderKeys.all, "detail"] as const,
  detail: (id: string) => [...agentWorkOrderKeys.details(), id] as const,
  stepHistory: (id: string) => [...agentWorkOrderKeys.detail(id), "steps"] as const,
};

/**
 * Hook to fetch list of agent work orders with smart polling
 * Automatically polls when any work order is pending or running
 *
 * @param statusFilter - Optional status to filter work orders
 * @returns Query result with work orders array
 */
export function useWorkOrders(statusFilter?: AgentWorkOrderStatus) {
  const polling = useSmartPolling(3000);

  return useQuery<AgentWorkOrder[], Error>({
    queryKey: agentWorkOrderKeys.list(statusFilter),
    queryFn: () => agentWorkOrdersService.listWorkOrders(statusFilter),
    staleTime: STALE_TIMES.instant,
    refetchInterval: (query) => {
      const data = query.state.data as AgentWorkOrder[] | undefined;
      const hasActiveWorkOrders = data?.some((wo) => wo.status === "running" || wo.status === "pending");
      return hasActiveWorkOrders ? polling.refetchInterval : false;
    },
  });
}

/**
 * Hook to fetch a single agent work order with smart polling
 * Automatically polls while work order is pending or running
 *
 * @param id - Work order ID (undefined disables query)
 * @returns Query result with work order data
 */
export function useWorkOrder(id: string | undefined) {
  const polling = useSmartPolling(3000);

  return useQuery<AgentWorkOrder, Error>({
    queryKey: id ? agentWorkOrderKeys.detail(id) : DISABLED_QUERY_KEY,
    queryFn: () => (id ? agentWorkOrdersService.getWorkOrder(id) : Promise.reject(new Error("No ID provided"))),
    enabled: !!id,
    staleTime: STALE_TIMES.instant,
    refetchInterval: (query) => {
      const data = query.state.data as AgentWorkOrder | undefined;
      if (data?.status === "running" || data?.status === "pending") {
        return polling.refetchInterval;
      }
      return false;
    },
  });
}

/**
 * Hook to fetch step execution history for a work order with smart polling
 * Automatically polls until workflow completes
 *
 * @param workOrderId - Work order ID (undefined disables query)
 * @returns Query result with step history
 */
export function useStepHistory(workOrderId: string | undefined) {
  const polling = useSmartPolling(3000);

  return useQuery<StepHistory, Error>({
    queryKey: workOrderId ? agentWorkOrderKeys.stepHistory(workOrderId) : DISABLED_QUERY_KEY,
    queryFn: () =>
      workOrderId ? agentWorkOrdersService.getStepHistory(workOrderId) : Promise.reject(new Error("No ID provided")),
    enabled: !!workOrderId,
    staleTime: STALE_TIMES.instant,
    refetchInterval: (query) => {
      const history = query.state.data as StepHistory | undefined;
      const lastStep = history?.steps[history.steps.length - 1];
      if (lastStep?.step === "create-pr" && lastStep?.success) {
        return false;
      }
      return polling.refetchInterval;
    },
  });
}

/**
 * Hook to create a new agent work order
 * Automatically invalidates work order lists on success
 *
 * @returns Mutation object with mutate function
 */
export function useCreateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateAgentWorkOrderRequest) => agentWorkOrdersService.createWorkOrder(request),

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentWorkOrderKeys.lists() });
      queryClient.setQueryData(agentWorkOrderKeys.detail(data.agent_work_order_id), data);
    },

    onError: (error) => {
      console.error("Failed to create work order:", error);
    },
  });
}

/**
 * Hook to start a pending work order (transition from pending to running)
 * Implements optimistic update to immediately show running state in UI
 * Triggers backend execution by updating status to "running"
 *
 * @returns Mutation object with mutate function
 */
export function useStartWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    AgentWorkOrder,
    Error,
    string,
    { previousWorkOrder?: AgentWorkOrder; previousList?: AgentWorkOrder[] }
  >({
    mutationFn: (id: string) => agentWorkOrdersService.startWorkOrder(id),

    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: agentWorkOrderKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: agentWorkOrderKeys.lists() });

      // Snapshot the previous values
      const previousWorkOrder = queryClient.getQueryData<AgentWorkOrder>(agentWorkOrderKeys.detail(id));
      const previousList = queryClient.getQueryData<AgentWorkOrder[]>(agentWorkOrderKeys.lists());

      // Optimistically update the work order status to "running"
      if (previousWorkOrder) {
        const optimisticWorkOrder = {
          ...previousWorkOrder,
          status: "running" as AgentWorkOrderStatus,
          updated_at: new Date().toISOString(),
        };

        queryClient.setQueryData(agentWorkOrderKeys.detail(id), optimisticWorkOrder);

        // Update in list as well if present
        queryClient.setQueryData<AgentWorkOrder[]>(agentWorkOrderKeys.lists(), (old) => {
          if (!old) return old;
          return old.map((wo) => (wo.agent_work_order_id === id ? optimisticWorkOrder : wo));
        });
      }

      return { previousWorkOrder, previousList };
    },

    onError: (error, id, context) => {
      console.error("Failed to start work order:", error);

      // Rollback on error
      if (context?.previousWorkOrder) {
        queryClient.setQueryData(agentWorkOrderKeys.detail(id), context.previousWorkOrder);
      }
      if (context?.previousList) {
        queryClient.setQueryData(agentWorkOrderKeys.lists(), context.previousList);
      }
    },

    onSuccess: (data, id) => {
      // Replace optimistic update with server response
      queryClient.setQueryData(agentWorkOrderKeys.detail(id), data);
      queryClient.setQueryData<AgentWorkOrder[]>(agentWorkOrderKeys.lists(), (old) => {
        if (!old) return [data];
        return old.map((wo) => (wo.agent_work_order_id === id ? data : wo));
      });
    },
  });
}
