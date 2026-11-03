"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty";
import { DialogFormSkeleton, TagGridSkeleton } from "../ui/skeletons";
import type { EditableTool } from "./tool-form-dialog";
import { tagGhostButtonClasses, ToolTag } from "./tool-tag";

const ToolFormDialog = dynamic(() => import("./tool-form-dialog"), {
  loading: () => <DialogFormSkeleton />,
  ssr: false,
});

type FormState = { mode: "closed" } | { mode: "new" } | { mode: "edit"; tool: EditableTool };

export function ListingsView() {
  const tools = useQuery(api.tools.mine);
  const remove = useMutation(api.tools.remove);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [confirming, setConfirming] = useState<Id<"tools"> | null>(null);

  async function handleRemove(toolId: Id<"tools">) {
    try {
      await remove({ toolId });
      toast.success("Listing removed");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">My listings</h1>
        <Button variant="primary" onClick={() => setForm({ mode: "new" })}>
          <Plus className="size-4" aria-hidden />
          List a tool
        </Button>
      </div>

      {tools === undefined ? (
        <TagGridSkeleton count={4} />
      ) : tools.length === 0 ? (
        <EmptyState
          title="You haven't listed anything yet"
          action={
            <Button variant="primary" onClick={() => setForm({ mode: "new" })}>
              List your first tool
            </Button>
          }
        >
          Think of the ladder in the garage or the tent you use once a year. Your
          neighbors can ask to borrow it, and you decide each time.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <li key={tool._id}>
              <ToolTag
                tool={tool}
                actions={
                  <div className="flex gap-2">
                    {confirming === tool._id ? (
                      <>
                        <button
                          type="button"
                          className={tagGhostButtonClasses}
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </button>
                        <Button variant="danger" onClick={() => handleRemove(tool._id)}>
                          Remove
                        </Button>
                      </>
                    ) : tool.availability === "on_loan" ? (
                      <Button onClick={() => setForm({ mode: "edit", tool })}>
                        Edit
                      </Button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={tagGhostButtonClasses}
                          onClick={() => setForm({ mode: "edit", tool })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={tagGhostButtonClasses}
                          onClick={() => setConfirming(tool._id)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}

      {form.mode !== "closed" && (
        <ToolFormDialog
          tool={form.mode === "edit" ? form.tool : undefined}
          onClose={() => setForm({ mode: "closed" })}
        />
      )}
    </div>
  );
}
