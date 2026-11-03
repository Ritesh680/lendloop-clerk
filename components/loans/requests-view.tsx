"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { Button, buttonClasses } from "../ui/button";
import { EmptyState } from "../ui/empty";
import { LoanListSkeleton } from "../ui/skeletons";
import { LoanCard } from "./loan-card";

export function RequestsView() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">My requests</h1>
      {loans === undefined ? (
        <LoanListSkeleton />
      ) : loans.length === 0 ? (
        <EmptyState
          title="You haven't asked to borrow anything"
          action={
            <Link href="/browse" className={buttonClasses("primary")}>
              See all tools
            </Link>
          }
        >
          Find something on the board and pick your dates. The owner gets an email
          straight away.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {loans.map((loan) => (
            <li key={loan._id}>
              <LoanCard
                loan={loan}
                counterpartyLabel="Lent by"
                actions={
                  loan.status === "pending" && (
                    <Button
                      onClick={() =>
                        cancel({ loanId: loan._id })
                          .then(() => toast.success("Request cancelled"))
                          .catch((error) => toast.error(errorMessage(error)))
                      }
                    >
                      Cancel request
                    </Button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
