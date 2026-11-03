import type { LoanStatus } from "@/convex/lib/constants";
import { todayIso } from "@/lib/format";
import { Badge, type BadgeTone } from "../ui/badge";

const TONES: Record<LoanStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: "pending", label: "Pending" },
  approved: { tone: "go", label: "Approved" },
  declined: { tone: "muted", label: "Declined" },
  cancelled: { tone: "muted", label: "Cancelled" },
  returned: { tone: "neutral", label: "Returned" },
};

export const isOverdue = (loan: { status: LoanStatus; endDate: string }) =>
  loan.status === "approved" && loan.endDate < todayIso();

export function LoanStatusBadge({
  status,
  endDate,
}: {
  status: LoanStatus;
  endDate: string;
}) {
  if (isOverdue({ status, endDate })) return <Badge tone="alert">Overdue</Badge>;
  const { tone, label } = TONES[status];
  return <Badge tone={tone}>{label}</Badge>;
}
