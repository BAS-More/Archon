/**
 * Edit Repository Modal Component
 *
 * Modal for editing configured repository settings.
 * Two-column layout: Left (2/3) for form fields, Right (1/3) for workflow steps.
 */

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/features/ui/primitives/button";
import { Checkbox } from "@/features/ui/primitives/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/features/ui/primitives/dialog";
import { Label } from "@/features/ui/primitives/label";
import { useUpdateRepository } from "../hooks/useRepositoryQueries";
import { useAgentWorkOrdersStore } from "../state/agentWorkOrdersStore";
import type { WorkflowStep } from "../types";

export interface EditRepositoryModalProps {
  /** Whether modal is open */
  open: boolean;

  /** Callback to change open state */
  onOpenChange: (open: boolean) => void;
}

/**
 * All available workflow steps
 */
const WORKFLOW_STEPS: { value: WorkflowStep; label: string; description: string; dependsOn?: WorkflowStep[] }[] = [
  { value: "create-branch", label: "Create Branch", description: "Create a new git branch for isolated work" },
  { value: "planning", label: "Planning", description: "Generate implementation plan" },
  { value: "execute", label: "Execute", description: "Implement the planned changes" },
  { value: "commit", label: "Commit", description: "Commit changes to git", dependsOn: ["execute"] },
  { value: "create-pr", label: "Create PR", description: "Create pull request", dependsOn: ["execute"] },
  { value: "prp-review", label: "PRP Review", description: "Review against PRP document" },
];

export function EditRepositoryModal({ open, onOpenChange }: EditRepositoryModalProps) {
  // Read editing repository from Zustand store
  const repository = useAgentWorkOrdersStore((s) => s.editingRepository);

  const [selectedSteps, setSelectedSteps] = useState<WorkflowStep[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const updateRepository = useUpdateRepository();

  /**
   * Pre-populate form when repository changes
   */
  useEffect(() => {
    if (repository) {
      setSelectedSteps(repository.default_commands);
    }
  }, [repository]);

  /**
   * Toggle workflow step selection
   */
  const toggleStep = (step: WorkflowStep) => {
    setSelectedSteps((prev) => {
      if (prev.includes(step)) {
        return prev.filter((s) => s !== step);
      }
      return [...prev, step];
    });
  };

  /**
   * Check if a step is disabled based on dependencies
   */
  const isStepDisabled = (step: (typeof WORKFLOW_STEPS)[number]): boolean => {
    if (!step.dependsOn) return false;
    return step.dependsOn.some((dep) => !selectedSteps.includes(dep));
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repository) return;

    setError("");

    // Validation
    if (selectedSteps.length === 0) {
      setError("At least one workflow step must be selected");
      return;
    }

    try {
      setIsSubmitting(true);
      await updateRepository.mutateAsync({
        id: repository.id,
        request: {
          default_sandbox_type: repository.default_sandbox_type,
          default_commands: selectedSteps,
        },
      });

      // Success - close modal
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update repository");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!repository) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Repository</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="pt-4">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column (2/3 width) - Repository Info */}
            <div className="col-span-2 space-y-4">
              {/* Repository Info Card */}
              <div className="p-4 bg-gray-500/10 border border-gray-500/20 rounded-lg space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Repository Information</h4>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">URL: </span>
                    <span className="text-gray-900 dark:text-white font-mono text-xs">{repository.repository_url}</span>
                  </div>

                  {repository.display_name && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Name: </span>
                      <span className="text-gray-900 dark:text-white">{repository.display_name}</span>
                    </div>
                  )}

                  {repository.owner && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Owner: </span>
                      <span className="text-gray-900 dark:text-white">{repository.owner}</span>
                    </div>
                  )}

                  {repository.default_branch && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Branch: </span>
                      <span className="text-gray-900 dark:text-white font-mono text-xs">
                        {repository.default_branch}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Repository metadata is auto-filled from GitHub and cannot be edited directly.
                </p>
              </div>
            </div>

            {/* Right Column (1/3 width) - Workflow Steps */}
            <div className="space-y-4">
              <Label>Default Workflow Steps</Label>
              <div className="space-y-2">
                {WORKFLOW_STEPS.map((step) => {
                  const isSelected = selectedSteps.includes(step.value);
                  const isDisabled = isStepDisabled(step);

                  return (
                    <div key={step.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`edit-step-${step.value}`}
                        checked={isSelected}
                        onCheckedChange={() => !isDisabled && toggleStep(step.value)}
                        disabled={isDisabled}
                        aria-label={step.label}
                      />
                      <Label htmlFor={`edit-step-${step.value}`} className={isDisabled ? "text-gray-400" : ""}>
                        {step.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Commit and PR require Execute</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded p-3">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} variant="cyan">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  Updating...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
