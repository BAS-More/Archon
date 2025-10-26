/**
 * Agent Work Orders View
 *
 * Main view for agent work orders with repository management and layout switching.
 * Supports horizontal and sidebar layout modes.
 */

import { ChevronLeft, ChevronRight, GitBranch, LayoutGrid, List, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/features/ui/primitives/button";
import { Input } from "@/features/ui/primitives/input";
import { PillNavigation, type PillNavigationItem } from "@/features/ui/primitives/pill-navigation";
import { cn } from "@/features/ui/primitives/styles";
import { AddRepositoryModal } from "../components/AddRepositoryModal";
import { CreateWorkOrderModal } from "../components/CreateWorkOrderModal";
import { EditRepositoryModal } from "../components/EditRepositoryModal";
import { RepositoryCard } from "../components/RepositoryCard";
import { SidebarRepositoryCard } from "../components/SidebarRepositoryCard";
import { WorkOrderTable } from "../components/WorkOrderTable";
import { useStartWorkOrder, useWorkOrders } from "../hooks/useAgentWorkOrderQueries";
import { useDeleteRepository, useRepositories } from "../hooks/useRepositoryQueries";
import type { ConfiguredRepository } from "../types/repository";

/**
 * Layout mode type
 */
type LayoutMode = "horizontal" | "sidebar";

/**
 * Local storage key for layout preference
 */
const LAYOUT_MODE_KEY = "agent-work-orders-layout-mode";

/**
 * Get initial layout mode from localStorage
 */
function getInitialLayoutMode(): LayoutMode {
  const stored = localStorage.getItem(LAYOUT_MODE_KEY);
  return stored === "horizontal" || stored === "sidebar" ? stored : "sidebar";
}

/**
 * Save layout mode to localStorage
 */
function saveLayoutMode(mode: LayoutMode): void {
  localStorage.setItem(LAYOUT_MODE_KEY, mode);
}

export function AgentWorkOrdersView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(getInitialLayoutMode);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [showEditRepoModal, setShowEditRepoModal] = useState(false);
  const [editingRepository, setEditingRepository] = useState<ConfiguredRepository | null>(null);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Get selected repository ID from URL query param
  const selectedRepositoryId = searchParams.get("repo") || undefined;

  // Fetch data
  const { data: repositories = [], isLoading: isLoadingRepos } = useRepositories();
  const { data: workOrders = [], isLoading: isLoadingWorkOrders } = useWorkOrders();
  const startWorkOrder = useStartWorkOrder();
  const deleteRepository = useDeleteRepository();

  /**
   * Update layout mode and persist preference
   */
  const updateLayoutMode = (mode: LayoutMode) => {
    setLayoutMode(mode);
    saveLayoutMode(mode);
  };

  /**
   * Update selected repository in URL
   */
  const selectRepository = (id: string | undefined) => {
    if (id) {
      setSearchParams({ repo: id });
    } else {
      setSearchParams({});
    }
  };

  /**
   * Handle opening edit modal for a repository
   */
  const handleEditRepository = (repository: ConfiguredRepository) => {
    setEditingRepository(repository);
    setShowEditRepoModal(true);
  };

  /**
   * Handle repository deletion
   */
  const handleDeleteRepository = async (id: string) => {
    if (confirm("Are you sure you want to delete this repository configuration?")) {
      await deleteRepository.mutateAsync(id);
      // If this was the selected repository, clear selection
      if (selectedRepositoryId === id) {
        selectRepository(undefined);
      }
    }
  };

  /**
   * Calculate work order stats for a repository
   */
  const getRepositoryStats = (repositoryId: string) => {
    const repoWorkOrders = workOrders.filter((wo) => {
      const repo = repositories.find((r) => r.id === repositoryId);
      return repo && wo.repository_url === repo.repository_url;
    });

    return {
      total: repoWorkOrders.length,
      active: repoWorkOrders.filter((wo) => wo.status === "running" || wo.status === "pending").length,
      done: repoWorkOrders.filter((wo) => wo.status === "completed").length,
    };
  };

  /**
   * Build tab items for PillNavigation
   */
  const tabItems: PillNavigationItem[] = [
    { id: "all", label: "All Work Orders", icon: <GitBranch className="w-4 h-4" aria-hidden="true" /> },
  ];

  if (selectedRepositoryId) {
    const selectedRepo = repositories.find((r) => r.id === selectedRepositoryId);
    if (selectedRepo) {
      tabItems.push({
        id: selectedRepositoryId,
        label: selectedRepo.display_name || selectedRepo.repository_url,
        icon: <GitBranch className="w-4 h-4" aria-hidden="true" />,
      });
    }
  }

  // Filter repositories by search query
  const filteredRepositories = repositories.filter((repo) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      repo.display_name?.toLowerCase().includes(searchLower) ||
      repo.repository_url.toLowerCase().includes(searchLower) ||
      repo.owner?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agent Work Orders</h1>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search repositories"
          />
        </div>

        {/* Layout Toggle */}
        <div className="flex gap-1 p-1 bg-black/30 dark:bg-white/10 rounded-lg border border-white/10 dark:border-gray-700">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateLayoutMode("sidebar")}
            className={cn(
              "px-3",
              layoutMode === "sidebar" && "bg-purple-500/20 dark:bg-purple-500/30 text-purple-400 dark:text-purple-300",
            )}
            aria-label="Switch to sidebar layout"
            aria-pressed={layoutMode === "sidebar"}
          >
            <List className="w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateLayoutMode("horizontal")}
            className={cn(
              "px-3",
              layoutMode === "horizontal" &&
                "bg-purple-500/20 dark:bg-purple-500/30 text-purple-400 dark:text-purple-300",
            )}
            aria-label="Switch to horizontal layout"
            aria-pressed={layoutMode === "horizontal"}
          >
            <LayoutGrid className="w-4 h-4" aria-hidden="true" />
          </Button>
        </div>

        {/* New Repo Button */}
        <Button
          onClick={() => setShowAddRepoModal(true)}
          variant="cyan"
          aria-label="Add new repository"
        >
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          New Repo
        </Button>
      </div>

      {/* Modals */}
      <AddRepositoryModal open={showAddRepoModal} onOpenChange={setShowAddRepoModal} />
      <EditRepositoryModal
        open={showEditRepoModal}
        onOpenChange={setShowEditRepoModal}
        repository={editingRepository}
      />
      <CreateWorkOrderModal
        open={showNewWorkOrderModal}
        onOpenChange={setShowNewWorkOrderModal}
        selectedRepositoryId={selectedRepositoryId}
      />

      {/* Horizontal Layout */}
      {layoutMode === "horizontal" && (
        <>
          {/* Repository cards in horizontal scroll */}
          <div className="w-full max-w-full">
            <div className="overflow-x-auto overflow-y-visible py-8 -mx-6 px-6 scrollbar-hide">
              <div className="flex gap-4 min-w-max">
                {filteredRepositories.length === 0 ? (
                  <div className="w-full text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">
                      {searchQuery ? "No repositories match your search" : "No repositories configured"}
                    </p>
                  </div>
                ) : (
                  filteredRepositories.map((repository) => (
                    <RepositoryCard
                      key={repository.id}
                      repository={repository}
                      isSelected={selectedRepositoryId === repository.id}
                      showAuroraGlow={selectedRepositoryId === repository.id}
                      onSelect={() => selectRepository(repository.id)}
                      onEdit={() => handleEditRepository(repository)}
                      onDelete={() => handleDeleteRepository(repository.id)}
                      stats={getRepositoryStats(repository.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* PillNavigation centered */}
          <div className="flex items-center justify-center">
            <PillNavigation
              items={tabItems}
              activeSection={selectedRepositoryId || "all"}
              onSectionClick={(id) => {
                if (id === "all") {
                  selectRepository(undefined);
                } else {
                  selectRepository(id);
                }
              }}
            />
          </div>
        </>
      )}

      {/* Sidebar Layout */}
      {layoutMode === "sidebar" && (
        <div className="flex gap-4 min-w-0">
          {/* Collapsible Sidebar */}
          <div className={cn("shrink-0 transition-all duration-300 space-y-2", sidebarExpanded ? "w-56" : "w-12")}>
            {/* Collapse/Expand button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="w-full justify-center"
              aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={sidebarExpanded}
            >
              {sidebarExpanded ? (
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              )}
            </Button>

            {/* Sidebar content */}
            {sidebarExpanded && (
              <div className="space-y-2 px-1">
                {filteredRepositories.length === 0 ? (
                  <div className="text-center py-8 px-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {searchQuery ? "No repositories match" : "No repositories"}
                    </p>
                  </div>
                ) : (
                  filteredRepositories.map((repository) => (
                    <SidebarRepositoryCard
                      key={repository.id}
                      repository={repository}
                      isSelected={selectedRepositoryId === repository.id}
                      isPinned={false}
                      showAuroraGlow={selectedRepositoryId === repository.id}
                      onSelect={() => selectRepository(repository.id)}
                      onEdit={() => handleEditRepository(repository)}
                      onDelete={() => handleDeleteRepository(repository.id)}
                      stats={getRepositoryStats(repository.id)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Main content area */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* PillNavigation centered */}
            <div className="flex items-center justify-center">
              <PillNavigation
                items={tabItems}
                activeSection={selectedRepositoryId || "all"}
                onSectionClick={(id) => {
                  if (id === "all") {
                    selectRepository(undefined);
                  } else {
                    selectRepository(id);
                  }
                }}
              />
            </div>

            {/* Work Orders Table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Work Orders</h3>
                <Button
                  onClick={() => setShowNewWorkOrderModal(true)}
                  variant="cyan"
                  aria-label="Create new work order"
                >
                  <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                  New Work Order
                </Button>
              </div>

              <WorkOrderTable
                workOrders={workOrders}
                selectedRepositoryId={selectedRepositoryId}
                onStartWorkOrder={(id) => startWorkOrder.mutate(id)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Horizontal layout work orders table (below repository cards) */}
      {layoutMode === "horizontal" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Work Orders</h3>
            <Button
              onClick={() => setShowNewWorkOrderModal(true)}
              variant="cyan"
              aria-label="Create new work order"
            >
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              New Work Order
            </Button>
          </div>

          <WorkOrderTable
            workOrders={workOrders}
            selectedRepositoryId={selectedRepositoryId}
            onStartWorkOrder={(id) => startWorkOrder.mutate(id)}
          />
        </div>
      )}

      {/* Loading state */}
      {(isLoadingRepos || isLoadingWorkOrders) && (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      )}
    </div>
  );
}
