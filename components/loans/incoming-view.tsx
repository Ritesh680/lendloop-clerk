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

function run(action: Promise<unknown>, success: string) {
  action
    .then(() => toast.success(success))
    .catch((error) => toast.error(errorMessage(error)));
}

export function IncomingView() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Incoming requests
      </h1>
      {loans === undefined ? (
        <LoanListSkeleton />
      ) : loans.length === 0 ? (
        <EmptyState
          title="No one has asked to borrow from you yet"
          action={
            <Link href="/listings" className={buttonClasses("primary")}>
              Go to my listings
            </Link>
          }
        >
          Requests for your tools appear here, and you&apos;ll get an email for
          each one.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {loans.map((loan) => (
            <li key={loan._id}>
              <LoanCard
                loan={loan}
                counterpartyLabel="Requested by"
                actions={
                  loan.status === "pending" ? (
                    <>
                      <Button
                        onClick={() =>
                          run(decline({ loanId: loan._id }), "Request declined")
                        }
                      >
                        Decline
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() =>
                          run(approve({ loanId: loan._id }), "Request approved")
                        }
                      >
                        Approve
                      </Button>
                    </>
                  ) : loan.status === "approved" ? (
                    <Button
                      variant="primary"
                      onClick={() =>
                        run(markReturned({ loanId: loan._id }), "Marked as returned")
                      }
                    >
                      Mark as returned
                    </Button>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
