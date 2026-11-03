"use client";

import clsx from "clsx";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CATEGORY_LABELS,
  LOAN_STATUSES,
  type LoanStatus,
} from "@/convex/lib/constants";
import { errorMessage } from "@/lib/errors";
import { formatRange, timeAgo } from "@/lib/format";
import { ActivityFeed } from "../loans/activity-feed";
import { LoanStatusBadge } from "../loans/status-badge";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty";
import { LoanListSkeleton } from "../ui/skeletons";

const PAGE_SIZE = 25;
const SWEEP_STALE_MS = 26 * 60 * 60 * 1000;

const SECTIONS = [
  ["automation", "Automation"],
  ["loans", "All loans"],
  ["listings", "Listings"],
  ["members", "Members"],
] as const;
type Section = (typeof SECTIONS)[number][0];

export function AdminView() {
  const me = useQuery(api.users.me);
  const [section, setSection] = useState<Section>("automation");

  if (me === undefined) return <LoanListSkeleton />;
  // A courtesy message: the functions below reject non-admins regardless.
  if (me?.role !== "admin") {
    return (
      <EmptyState title="Admins only">
        This area is for LendLoop admins. Your account doesn&apos;t have access.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Admin</h1>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {SECTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={section === value}
            onClick={() => setSection(value)}
            className={clsx(
              "cursor-pointer rounded-md border px-2.5 py-1 text-sm transition-colors",
              section === value
                ? "border-manila bg-manila text-ink"
                : "border-zinc-line text-steel hover:border-steel hover:text-chalk",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {section === "automation" && <AutomationPanel />}
      {section === "loans" && <LoansPanel />}
      {section === "listings" && <ListingsPanel />}
      {section === "members" && <MembersPanel />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-lg font-semibold tracking-tight">{children}</h2>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-enamel-700 bg-enamel-900 p-3">
      {children}
    </li>
  );
}

function AutomationPanel() {
  const health = useQuery(api.admin.automationHealth);
  const retry = useMutation(api.admin.retryNotification);
  const acknowledge = useMutation(api.admin.acknowledgeWorkflowFailure);
  // Captured once per mount: the panel doesn't need to tick to flag a stale run.
  const [now] = useState(() => Date.now());

  if (health === undefined) return <LoanListSkeleton count={3} />;

  const sweepStale =
    health.lastOverdueSweepAt === null ||
    now - health.lastOverdueSweepAt > SWEEP_STALE_MS;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-px overflow-hidden rounded-md border border-enamel-700 bg-enamel-700 sm:grid-cols-3">
        <div className="bg-enamel-900 p-4">
          <dt className="text-sm text-steel">Last overdue check</dt>
          <dd className="mt-1 flex items-center gap-2 font-mono text-sm tabular-nums">
            {health.lastOverdueSweepAt
              ? timeAgo(health.lastOverdueSweepAt, now)
              : "Never"}
            {sweepStale && <Badge tone="alert">Stale</Badge>}
          </dd>
        </div>
        <div className="bg-enamel-900 p-4">
          <dt className="text-sm text-steel">Emails waiting to send</dt>
          <dd className="mt-1 font-mono text-sm tabular-nums">
            {health.pendingNotifications}
          </dd>
        </div>
        <div className="bg-enamel-900 p-4">
          <dt className="text-sm text-steel">Emails that gave up</dt>
          <dd className="mt-1 font-mono text-sm tabular-nums">
            {health.failedNotifications.length}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <SectionTitle>Emails that gave up</SectionTitle>
        {health.failedNotifications.length === 0 ? (
          <p className="text-sm text-steel">
            None. Every request email has been delivered or is still retrying.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {health.failedNotifications.map((row) => (
              <Row key={row._id}>
                <div>
                  <p className="font-mono text-sm">{row.type}</p>
                  <p className="font-mono text-xs text-steel tabular-nums">
                    {row.lastError} · {row.attempts} attempts ·{" "}
                    {timeAgo(row.failedAt, now)}
                  </p>
                </div>
                <Button
                  onClick={() =>
                    retry({ outboxId: row._id }).catch((error) =>
                      toast.error(errorMessage(error)),
                    )
                  }
                >
                  Retry
                </Button>
              </Row>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Failed workflow runs</SectionTitle>
        {health.workflowFailures.length === 0 ? (
          <p className="text-sm text-steel">No failed runs to review.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {health.workflowFailures.map((row) => (
              <Row key={row._id}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {row.workflowName}{" "}
                    <span className="font-mono text-xs text-steel">
                      at {row.nodeName}
                    </span>
                  </p>
                  <p className="font-mono text-xs break-words text-stamp">
                    {row.message}
                  </p>
                  <p className="font-mono text-xs text-steel tabular-nums">
                    {timeAgo(row.occurredAt, now)}
                  </p>
                </div>
                <Button
                  onClick={() =>
                    acknowledge({ failureId: row._id }).catch((error) =>
                      toast.error(errorMessage(error)),
                    )
                  }
                >
                  Mark reviewed
                </Button>
              </Row>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LoansPanel() {
  const [status, setStatus] = useState<LoanStatus | undefined>();
  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.admin.listLoans,
    { status },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-steel">
        Status
        <select
          value={status ?? ""}
          onChange={(event) =>
            setStatus((event.target.value || undefined) as LoanStatus | undefined)
          }
          className="rounded-md border border-zinc-line bg-enamel-950 px-2 py-1 text-chalk"
        >
          <option value="">All</option>
          {LOAN_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </label>
      {pageStatus === "LoadingFirstPage" ? (
        <LoanListSkeleton />
      ) : results.length === 0 ? (
        <p className="text-sm text-steel">No loans match this filter.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((loan) => (
            <li
              key={loan._id}
              className="rounded-md border border-enamel-700 bg-enamel-900 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-semibold tracking-tight">
                  {loan.toolName}
                </span>
                <LoanStatusBadge status={loan.status} endDate={loan.endDate} />
                <span className="font-mono text-xs text-manila tabular-nums">
                  {formatRange(loan.startDate, loan.endDate)}
                </span>
              </div>
              <p className="mt-1 text-sm text-steel">
                {loan.lenderName} lending to {loan.borrowerName}
              </p>
              <ActivityFeed items={loan.activity} />
            </li>
          ))}
        </ul>
      )}
      {pageStatus === "CanLoadMore" && (
        <Button className="self-center" onClick={() => loadMore(PAGE_SIZE)}>
          Show more loans
        </Button>
      )}
    </div>
  );
}

function ListingsPanel() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.listListings,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const remove = useMutation(api.admin.removeListing);
  const [removing, setRemoving] = useState<Id<"tools"> | null>(null);
  const [reason, setReason] = useState("");

  async function confirmRemove(toolId: Id<"tools">) {
    try {
      await remove({ toolId, reason });
      toast.success("Listing removed");
      setRemoving(null);
      setReason("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (status === "LoadingFirstPage") return <LoanListSkeleton />;
  if (results.length === 0) {
    return <p className="text-sm text-steel">There are no listings.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {results.map((tool) => (
          <Row key={tool._id}>
            <div>
              <p className="font-display font-semibold tracking-tight">{tool.name}</p>
              <p className="text-sm text-steel">
                {CATEGORY_LABELS[tool.category]} · listed by {tool.ownerName}
              </p>
            </div>
            {removing === tool._id ? (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void confirmRemove(tool._id);
                }}
              >
                <input
                  required
                  autoFocus
                  aria-label="Reason for removal"
                  placeholder="Reason for removal"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="rounded-md border border-zinc-line bg-enamel-950 px-2 py-1 text-sm"
                />
                <Button type="submit" variant="danger">
                  Remove listing
                </Button>
                <Button variant="ghost" onClick={() => setRemoving(null)}>
                  Keep
                </Button>
              </form>
            ) : (
              <Button onClick={() => setRemoving(tool._id)}>Remove</Button>
            )}
          </Row>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <Button className="self-center" onClick={() => loadMore(PAGE_SIZE)}>
          Show more listings
        </Button>
      )}
    </div>
  );
}

function MembersPanel() {
  const members = useQuery(api.admin.listMembers);
  const setTrusted = useMutation(api.admin.setTrustedLender);

  if (members === undefined) return <LoanListSkeleton />;
  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <Row key={member._id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{member.firstName}</span>
            {member.maskedEmail && (
              <span className="font-mono text-xs text-steel">
                {member.maskedEmail}
              </span>
            )}
            {member.role === "admin" && <Badge>Admin</Badge>}
            {member.trustedLender && <Badge tone="brass">Trusted lender</Badge>}
          </div>
          <Button
            onClick={() =>
              setTrusted({
                userId: member._id,
                trusted: !member.trustedLender,
              }).catch((error) => toast.error(errorMessage(error)))
            }
          >
            {member.trustedLender ? "Remove Trusted Lender" : "Mark Trusted Lender"}
          </Button>
        </Row>
      ))}
    </ul>
  );
}
