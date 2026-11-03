"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITIONS,
  CONDITION_LABELS,
  LIMITS,
  type Category,
  type Condition,
} from "@/convex/lib/constants";
import { errorMessage } from "@/lib/errors";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { SelectField, TextArea, TextField } from "../ui/field";

export type EditableTool = {
  _id: Id<"tools">;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
};

const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));
const CONDITION_OPTIONS = CONDITIONS.map((value) => ({
  value,
  label: CONDITION_LABELS[value],
}));

export default function ToolFormDialog({
  tool,
  onClose,
}: {
  tool?: EditableTool;
  onClose: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [name, setName] = useState(tool?.name ?? "");
  const [category, setCategory] = useState<Category>(
    tool?.category ?? "power_tools",
  );
  const [condition, setCondition] = useState<Condition>(
    tool?.condition ?? "good",
  );
  const [description, setDescription] = useState(tool?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fields = { name, category, condition, description };
      if (tool) {
        await update({ toolId: tool._id, ...fields });
        toast.success("Listing saved");
      } else {
        await create(fields);
        toast.success("Tool listed");
      }
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  }

  return (
    <Dialog title={tool ? "Edit listing" : "List a tool"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="Name"
          required
          maxLength={LIMITS.toolName}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Cordless drill"
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Category"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          />
          <SelectField
            label="Condition"
            options={CONDITION_OPTIONS}
            value={condition}
            onChange={(event) => setCondition(event.target.value as Condition)}
          />
        </div>
        <TextArea
          label="Short description"
          hint={`${description.length}/${LIMITS.toolDescription}`}
          required
          maxLength={LIMITS.toolDescription}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="18V, two batteries and a charger. Bits not included."
        />
        {error && (
          <p role="alert" className="text-sm text-stamp">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {tool ? "Save listing" : "List tool"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
