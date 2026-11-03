"use client";

import clsx from "clsx";
import { usePaginatedQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
} from "@/convex/lib/constants";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty";
import { DialogFormSkeleton, TagGridSkeleton } from "../ui/skeletons";
import { tagButtonClasses, ToolTag } from "./tool-tag";

const BorrowDialog = dynamic(() => import("./borrow-dialog"), {
  loading: () => <DialogFormSkeleton />,
  ssr: false,
});

const PAGE_SIZE = 24;

export function BrowseView() {
  const [category, setCategory] = useState<Category | undefined>();
  const [borrowing, setBorrowing] = useState<{
    _id: Id<"tools">;
    name: string;
  } | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.tools.list,
    { category },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">All tools</h1>

      <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
        <FilterChip active={!category} onClick={() => setCategory(undefined)}>
          All
        </FilterChip>
        {CATEGORIES.map((value) => (
          <FilterChip
            key={value}
            active={category === value}
            onClick={() => setCategory(value)}
          >
            {CATEGORY_LABELS[value]}
          </FilterChip>
        ))}
      </div>

      {status === "LoadingFirstPage" ? (
        <TagGridSkeleton />
      ) : results.length === 0 ? (
        <EmptyState title={category ? `Nothing in ${CATEGORY_LABELS[category]} yet` : "The board is empty"}>
          {category
            ? "Try another category, or list a tool of your own from My listings."
            : "List a tool from My listings and yours will be the first on the board."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((tool) => (
            <li key={tool._id}>
              <ToolTag
                tool={tool}
                actions={
                  tool.isMine ? null : tool.availability === "available" ? (
                    <button
                      type="button"
                      className={tagButtonClasses}
                      onClick={() => setBorrowing(tool)}
                    >
                      Request to borrow
                    </button>
                  ) : (
                    <Button onClick={() => setBorrowing(tool)}>
                      Request later dates
                    </Button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {status === "LoadingMore" && <TagGridSkeleton count={4} />}
      {status === "CanLoadMore" && (
        <Button className="self-center" onClick={() => loadMore(PAGE_SIZE)}>
          Show more tools
        </Button>
      )}

      {borrowing && (
        <BorrowDialog tool={borrowing} onClose={() => setBorrowing(null)} />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "cursor-pointer rounded-md border px-2.5 py-1 text-sm transition-colors",
        active
          ? "border-manila bg-manila text-ink"
          : "border-zinc-line text-steel hover:border-steel hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}
