"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { formatRange, todayIso } from "@/lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { TextField } from "../ui/field";

export default function BorrowDialog({
  tool,
  onClose,
}: {
  tool: { _id: Id<"tools">; name: string };
  onClose: () => void;
}) {
  const request = useMutation(api.loans.request);
  const booked = useQuery(api.tools.bookedRanges, { toolId: tool._id });
  const today = todayIso();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await request({ toolId: tool._id, startDate, endDate });
      toast.success("Request sent");
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  }

  return (
    <Dialog title={`Borrow ${tool.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="From"
            type="date"
            required
            min={today}
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              if (endDate < event.target.value) setEndDate(event.target.value);
            }}
          />
          <TextField
            label="Until"
            type="date"
            required
            min={startDate}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <div className="text-sm text-steel" aria-live="polite">
          {booked === undefined ? (
            <div aria-hidden className="skeleton h-4 w-1/2 rounded" />
          ) : booked.length === 0 ? (
            "No other bookings for this tool."
          ) : (
            <>
              Already booked:{" "}
              <span className="font-mono text-xs text-manila tabular-nums">
                {booked
                  .map((range) => formatRange(range.startDate, range.endDate))
                  .join(", ")}
              </span>
            </>
          )}
        </div>

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
            Send request
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
