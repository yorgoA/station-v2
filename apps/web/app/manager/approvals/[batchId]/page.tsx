"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { type BillingEntryRow } from "../../../../lib/types/billing";
import { billingTypeNeedsMeterReading } from "../../../../lib/billing/billing-types";

export default function ManagerApprovalBatchPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params?.batchId ?? "";
  const [serverBatch, setServerBatch] = useState<{
    id: string;
    monthKey: string;
    regionCode: string;
    status: "pending_review" | "changes_requested" | "approved_posted";
    managerNote?: string;
    submittedAt?: string;
  } | null>(null);
  const [serverItems, setServerItems] = useState<BillingEntryRow[] | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, "approved" | "changes_needed">>({});
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const [employeeChangeSummaryByRowId, setEmployeeChangeSummaryByRowId] = useState<Record<string, string>>({});
  const [fixProposalByRowId, setFixProposalByRowId] = useState<
    Record<
      string,
      {
        currentAmount: number;
        proposedAmount: number;
        note?: string;
        decision?: "approved" | "rejected";
      }
    >
  >({});
  const [fixProposalBusyRowId, setFixProposalBusyRowId] = useState<string | null>(null);
  const [initialReviewStates, setInitialReviewStates] = useState<Record<string, "approved" | "changes_needed">>({});
  const [pendingModificationRows, setPendingModificationRows] = useState<Record<string, boolean>>({});
  const [modificationStartNotes, setModificationStartNotes] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [sentToEmployee, setSentToEmployee] = useState(false);
  const [posting, setPosting] = useState(false);
  const [imageModalSrc, setImageModalSrc] = useState<string>("");

  const selectedBatch = useMemo(
    () =>
      serverBatch
        ? {
            ...serverBatch,
            submittedBy: "System",
            itemsCount: serverItems?.length ?? 0,
            totalAmount: 0,
          }
        : null,
    [serverBatch, serverItems]
  );
  const activeRows = useMemo(() => {
    if (serverItems && serverItems.length > 0) return serverItems;
    return [];
  }, [serverItems]);
  const allRowsDecided = activeRows.length > 0 && activeRows.every((row) => Boolean(rowStates[row.id]));
  const hasChangesNeeded = activeRows.some((row) => rowStates[row.id] === "changes_needed");
  const allApproved = activeRows.length > 0 && activeRows.every((row) => rowStates[row.id] === "approved");
  const hasUndecidedFixProposal = Object.values(fixProposalByRowId).some((p) => !p.decision);
  const zeroAmountFixedRows = activeRows.filter(
    (row) =>
      row.billingType === "fixed-monthly" &&
      !row.isFreeCustomer &&
      (row.fixedMonthlyAmount ?? 0) <= 0
  );
  const toImageHref = (value?: string) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (raw.startsWith("uploads/data:image/")) return raw.slice("uploads/".length);
    if (raw.startsWith("data:image/")) return raw;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (raw.startsWith("/")) return raw;
    if (raw.startsWith("uploads/")) return "";
    return "";
  };

  const loadBatch = useCallback(
    async (opts?: { preserveReviewState?: boolean }) => {
      if (!batchId) return;
      try {
        const response = await fetch(`/api/billing/batches/${batchId}`);
        if (!response.ok) throw new Error("Failed to load batch from server.");
        const payload = (await response.json()) as {
          batch: {
            id: string;
            monthKey: string;
            regionCode: string;
            status: "pending_review" | "changes_requested" | "approved_posted";
            managerNote?: string;
            submittedAt?: string;
          };
          items: Array<{
            id: string;
            customerNumber: string;
            customerName: string;
            billingType?: string;
            isFreeCustomer?: boolean;
            previousCounter: number;
            newCounter: number;
            counterImageName: string;
            currentFixedMonthlyAmount?: number;
            proposedFixedMonthlyAmount?: number;
            proposedFixedMonthlyNote?: string;
            proposedFixedMonthlyDecision?: "approved" | "rejected";
            reviewState?: "approved" | "changes_needed";
            reviewNote?: string;
            employeeChangeSummary?: string;
          }>;
        };
        setServerBatch(payload.batch);
        setServerItems(
          payload.items.map((item) => ({
            id: item.id,
            customerNumber: item.customerNumber,
            customerName: item.customerName,
            regionCode: payload.batch.regionCode as "mrah" | "printania",
            previousCounter: Number(item.previousCounter),
            newCounter: Number(item.newCounter),
            counterImageName: item.counterImageName,
            billingType: item.billingType ?? "metered",
            isFreeCustomer: Boolean(item.isFreeCustomer),
            fixedMonthlyAmount: Number(item.currentFixedMonthlyAmount ?? 0),
            isMonitor: false,
          }))
        );
        setEmployeeChangeSummaryByRowId(
          Object.fromEntries(
            payload.items
              .filter((item) => Boolean(item.employeeChangeSummary))
              .map((item) => [item.id, String(item.employeeChangeSummary)])
          )
        );
        setFixProposalByRowId(
          Object.fromEntries(
            payload.items
              .filter((item) => item.proposedFixedMonthlyAmount != null)
              .map((item) => [
                item.id,
                {
                  currentAmount: Number(item.currentFixedMonthlyAmount ?? 0),
                  proposedAmount: Number(item.proposedFixedMonthlyAmount),
                  note: item.proposedFixedMonthlyNote,
                  decision: item.proposedFixedMonthlyDecision,
                },
              ])
          )
        );
        if (!opts?.preserveReviewState) {
          const nextStates: Record<string, "approved" | "changes_needed"> = {};
          const nextNotes: Record<string, string> = {};
          const nextInitialStates: Record<string, "approved" | "changes_needed"> = {};
          for (const item of payload.items) {
            if (item.reviewState) {
              nextStates[item.id] = item.reviewState;
              nextInitialStates[item.id] = item.reviewState;
            } else if (payload.batch.status !== "pending_review") {
              // Sent/posted batches are treated as finalized for display.
              nextStates[item.id] = "approved";
            }
            if (item.reviewNote) nextNotes[item.id] = item.reviewNote;
          }
          setRowStates(nextStates);
          setRowNotes(nextNotes);
          setInitialReviewStates(nextInitialStates);
        }
      } catch {
        setServerBatch(null);
        setServerItems(null);
        setEmployeeChangeSummaryByRowId({});
        setFixProposalByRowId({});
        setInitialReviewStates({});
        setBanner("Failed to load server batch details.");
      }
    },
    [batchId]
  );

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  async function decideFixProposal(rowId: string, decision: "approved" | "rejected") {
    setFixProposalBusyRowId(rowId);
    setBanner("");
    try {
      const response = await fetch(`/api/billing/batches/${batchId}/fixed-amount-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: rowId, decision }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setBanner(data.error ?? "Failed to record decision on the proposed amount.");
        return;
      }
      await loadBatch({ preserveReviewState: true });
      setBanner(
        decision === "approved"
          ? "Proposed fixed-monthly amount approved and applied to the customer."
          : "Proposed fixed-monthly amount rejected; the customer's amount is unchanged."
      );
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Failed to record decision.");
    } finally {
      setFixProposalBusyRowId(null);
    }
  }

  function startModification(rowId: string) {
    setPendingModificationRows((prev) => ({ ...prev, [rowId]: true }));
    setModificationStartNotes((prev) => ({ ...prev, [rowId]: rowNotes[rowId] ?? "" }));
  }

  function validateModification(rowId: string) {
    const note = rowNotes[rowId]?.trim();
    if (!note) {
      setBanner("Manager note is required before validating modification.");
      return;
    }
    setRowStates((prev) => ({ ...prev, [rowId]: "changes_needed" }));
    setPendingModificationRows((prev) => ({ ...prev, [rowId]: false }));
    setBanner("");
  }

  function cancelModification(rowId: string) {
    setPendingModificationRows((prev) => ({ ...prev, [rowId]: false }));
  }

  function cancelNoteAndValidate(rowId: string) {
    setRowNotes((prev) => ({ ...prev, [rowId]: "" }));
    setRowStates((prev) => ({ ...prev, [rowId]: "approved" }));
    setPendingModificationRows((prev) => ({ ...prev, [rowId]: false }));
    setBanner("");
  }

  function reopenDecision(rowId: string) {
    setRowStates((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setPendingModificationRows((prev) => ({ ...prev, [rowId]: false }));
  }

  async function approveAndPost() {
    if (!selectedBatch) return;
    if (!allApproved) {
      setBanner("Every row must be marked Approved before posting the batch.");
      return;
    }
    if (hasUndecidedFixProposal) {
      setBanner("Decide every proposed fixed-monthly correction (Approve / Reject) before posting.");
      return;
    }
    if (zeroAmountFixedRows.length > 0) {
      setBanner(
        `These fixed-monthly customers have no amount set (bill would be 0): ${zeroAmountFixedRows
          .map((row) => row.customerNumber)
          .join(", ")}. Set it on the customer profile, or approve a proposed correction, before posting.`
      );
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm("Approve and post this batch? This writes the final bills and cannot be undone.")
    ) {
      return;
    }
    setPosting(true);
    setBanner("");
    try {
      const response = await fetch(`/api/billing/batches/${batchId}/approve`, { method: "POST" });
      const payload = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        setBanner(payload.error ?? "Failed to approve and post the batch.");
        return;
      }
      setBanner("Batch approved and posted — the final bills have been written.");
      await loadBatch();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Failed to approve and post the batch.");
    } finally {
      setPosting(false);
    }
  }

  async function finalizeReview() {
    if (!selectedBatch) return;
    if (!allRowsDecided) {
      setBanner("Please decide all entries before sending to employee.");
      return;
    }
    const hasChanges = activeRows.some((row) => rowStates[row.id] === "changes_needed");
    const missingNotes = activeRows.some(
      (row) => rowStates[row.id] === "changes_needed" && !rowNotes[row.id]?.trim()
    );
    if (missingNotes) {
      setBanner("Every row marked 'Fix needed' must include a manager note.");
      return;
    }
    try {
      const decisions = activeRows.map((row) => ({
        rowId: row.id,
        state: rowStates[row.id] ?? "approved",
        note: rowNotes[row.id]?.trim() || undefined,
      }));
      const response = await fetch(`/api/billing/batches/${batchId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setBanner(payload.error ?? "Failed to submit review.");
        return;
      }
      setSentToEmployee(true);
      setBanner(hasChanges ? "Review sent to employee with required fixes." : "Review sent to employee.");
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Unknown finalize error.");
    }
  }

  if (!selectedBatch) {
    return (
      <AppShell title="Batch Not Found" subtitle="No approval batch matches this id" navItems={managerNavItems}>
        <Link href="/manager/approvals" className="back-link">
          ← Back to Approvals
        </Link>
      </AppShell>
    );
  }
  const canEdit = selectedBatch.status === "pending_review" && !sentToEmployee;

  return (
    <AppShell
      title={`Review ${selectedBatch.monthKey} - ${selectedBatch.regionCode}`}
      subtitle="Row-by-row manager validation"
      navItems={managerNavItems}
    >
      <Link href="/manager/approvals" className="back-link">
        ← Back to Approvals
      </Link>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Submitted by {selectedBatch.submittedBy} at {selectedBatch.submittedAt}
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Entries decided: {activeRows.filter((row) => Boolean(rowStates[row.id])).length}/{activeRows.length}
        </p>
      </div>
      {sentToEmployee ? (
        <div className="card row-approved">
          <p style={{ marginTop: 0, marginBottom: 0, color: "var(--success)" }}>
            Review was sent to employee successfully.
          </p>
        </div>
      ) : (
        activeRows.map((row) => (
        <div
          className={`card ${rowStates[row.id] === "approved" ? "row-approved" : ""} ${rowStates[row.id] === "changes_needed" ? "row-needs-change" : ""}`}
          key={row.id}
          style={
            rowStates[row.id] === "changes_needed"
              ? { background: "#fff7ed", borderColor: "#fdba74" }
              : undefined
          }
        >
          {canEdit && rowStates[row.id] === "approved" && initialReviewStates[row.id] !== "approved" && (
            <div className="card-actions-right" style={{ marginTop: 0 }}>
              <button type="button" className="warning-btn" onClick={() => startModification(row.id)}>
                Modify
              </button>
            </div>
          )}
          {canEdit && rowStates[row.id] === "changes_needed" && !pendingModificationRows[row.id] && initialReviewStates[row.id] !== "approved" && (
            <div className="card-actions-right" style={{ marginTop: 0, display: "flex", gap: 8 }}>
              <button
                type="button"
                className="success-btn"
                onClick={() => {
                  setRowStates((prev) => ({ ...prev, [row.id]: "approved" }));
                  setBanner("");
                }}
                title="Accept the employee's fix for this row"
              >
                Approve
              </button>
              <button
                type="button"
                className="warning-btn"
                onClick={() => startModification(row.id)}
              >
                Modify
              </button>
            </div>
          )}
          <p style={{ marginTop: 0 }}>
            <strong>
              {row.customerName} ({row.customerNumber})
            </strong>
          </p>
          {billingTypeNeedsMeterReading(row.billingType) ? (
            <>
              <p className="muted">Previous counter: {row.previousCounter}</p>
              <p className="muted">Current counter: {row.newCounter ?? "-"}</p>
            </>
          ) : row.billingType === "fixed-monthly" ? (
            <p className="muted">
              Flat monthly charge — billed the customer&apos;s set amount:{" "}
              <strong>
                {(fixProposalByRowId[row.id]?.currentAmount ?? row.fixedMonthlyAmount ?? 0).toLocaleString()} LBP
              </strong>
            </p>
          ) : (
            <p className="muted">
              Flat monthly charge ({row.billingType}) — no meter reading; billed the customer&apos;s
              set monthly amount.
            </p>
          )}
          {fixProposalByRowId[row.id] ? (
            <div
              className="card"
              style={{ marginTop: 6, marginBottom: 6, background: "#fff7ed", borderColor: "#fdba74" }}
            >
              <p style={{ marginTop: 0, marginBottom: 4 }}>
                <strong>Employee proposes a fixed-monthly correction</strong>
              </p>
              <p className="muted" style={{ margin: "0 0 4px" }}>
                {fixProposalByRowId[row.id].currentAmount.toLocaleString()} LBP →{" "}
                {fixProposalByRowId[row.id].proposedAmount.toLocaleString()} LBP
              </p>
              {fixProposalByRowId[row.id].note ? (
                <p className="muted" style={{ margin: "0 0 4px" }}>
                  Reason: {fixProposalByRowId[row.id].note}
                </p>
              ) : null}
              {fixProposalByRowId[row.id].decision === "approved" ? (
                <p style={{ margin: 0, color: "var(--success)" }}>
                  Approved — customer&apos;s amount updated to{" "}
                  {fixProposalByRowId[row.id].proposedAmount.toLocaleString()} LBP. This bill will use it.
                </p>
              ) : fixProposalByRowId[row.id].decision === "rejected" ? (
                <p style={{ margin: 0, color: "var(--danger)" }}>
                  Rejected — customer&apos;s amount stays at{" "}
                  {fixProposalByRowId[row.id].currentAmount.toLocaleString()} LBP.
                </p>
              ) : selectedBatch.status === "pending_review" || selectedBatch.status === "changes_requested" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <button
                    type="button"
                    className="success-btn"
                    disabled={fixProposalBusyRowId === row.id}
                    onClick={() => decideFixProposal(row.id, "approved")}
                  >
                    Approve change
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={fixProposalBusyRowId === row.id}
                    onClick={() => decideFixProposal(row.id, "rejected")}
                  >
                    Reject change
                  </button>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Not decided.</p>
              )}
            </div>
          ) : null}
          {employeeChangeSummaryByRowId[row.id] ? (
            <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
              Employee modifications: {employeeChangeSummaryByRowId[row.id]}
            </p>
          ) : selectedBatch.status === "pending_review" && initialReviewStates[row.id] === "changes_needed" ? (
            <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
              Employee modifications: re-submitted after previous manager note (legacy details unavailable for this cycle).
            </p>
          ) : null}
          {billingTypeNeedsMeterReading(row.billingType) && (
          <p className="muted" style={{ marginBottom: 6 }}>
            Counter image:
          </p>
          )}
          {billingTypeNeedsMeterReading(row.billingType) && row.counterImageName ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              {toImageHref(row.counterImageName) ? (
                <>
                  <img
                    src={toImageHref(row.counterImageName)}
                    alt={`Counter ${row.customerNumber}`}
                    title="Click to preview"
                    onClick={() => setImageModalSrc(toImageHref(row.counterImageName))}
                    style={{
                      width: 160,
                      height: "auto",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      cursor: "pointer",
                    }}
                  />
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Image unavailable in this batch row.
                </p>
              )}
            </div>
          ) : null}
          {canEdit && !rowStates[row.id] && !pendingModificationRows[row.id] ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="success-btn"
                type="button"
                onClick={() => setRowStates((prev) => ({ ...prev, [row.id]: "approved" }))}
              >
                Approve
              </button>
              <button
                className="warning-btn"
                type="button"
                onClick={() => startModification(row.id)}
              >
                Modify
              </button>
            </div>
          ) : null}
          {canEdit && pendingModificationRows[row.id] && (
            <div className="card" style={{ marginTop: 8 }}>
              <label style={{ display: "block", marginTop: 0 }}>
                Manager note
                <input
                  value={rowNotes[row.id] ?? ""}
                  onChange={(e) => setRowNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  placeholder="Required: describe what needs to be fixed"
                />
              </label>
              <div className="card-actions-right" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => cancelModification(row.id)}>
                  Cancel
                </button>{" "}
                {((rowNotes[row.id] ?? "").trim() !== (modificationStartNotes[row.id] ?? "").trim()) ? (
                  <button
                    type="button"
                    className="warning-btn"
                    onClick={() => validateModification(row.id)}
                  >
                    Validate Modification
                  </button>
                ) : (
                  <button
                    type="button"
                    className="success-btn"
                    onClick={() => cancelNoteAndValidate(row.id)}
                  >
                    Cancel Note and Validate
                  </button>
                )}
              </div>
            </div>
          )}
          {rowStates[row.id] === "changes_needed" && !pendingModificationRows[row.id] && (
            <div className="card" style={{ marginTop: 8 }}>
              <p className="muted" style={{ marginTop: 0, marginBottom: 4 }}>
                Previous manager note
              </p>
              <p style={{ marginTop: 0 }}>{rowNotes[row.id] ?? "-"}</p>
            </div>
          )}
          {rowStates[row.id] === "approved" && (
            <div className="card" style={{ marginTop: 8 }}>
              <span className="notify-chip">Approved ✓</span>
            </div>
          )}
        </div>
      ))
      )}
      <div className="card">
        {canEdit ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="success-btn"
              onClick={approveAndPost}
              disabled={!allApproved || hasUndecidedFixProposal || zeroAmountFixedRows.length > 0 || posting}
              title={
                !allApproved
                  ? "Mark every row Approved first"
                  : hasUndecidedFixProposal
                    ? "Decide every proposed fixed-monthly correction first"
                    : zeroAmountFixedRows.length > 0
                      ? "Some fixed-monthly customers have no amount set"
                      : "Write the final bills for this batch"
              }
            >
              {posting ? "Posting…" : "Approve & Post Batch"}
            </button>
            <button
              type="button"
              onClick={finalizeReview}
              disabled={!allRowsDecided || !hasChangesNeeded || posting}
              title={
                !allRowsDecided
                  ? "Decide every row first"
                  : !hasChangesNeeded
                    ? "No rows are marked for changes — use Approve & Post instead"
                    : "Send the flagged rows back to the employee to fix"
              }
            >
              Send to Employee
            </button>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {selectedBatch.status === "approved_posted"
              ? "This batch is approved and posted. The final bills have been written."
              : "This batch was already sent to the employee. Review is read-only."}
          </p>
        )}
        {banner && <p>{banner}</p>}
      </div>
      {imageModalSrc ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Counter image preview">
          <div className="modal-card">
            <div className="row-between">
              <h3 style={{ margin: 0 }}>Counter image</h3>
              <button type="button" onClick={() => setImageModalSrc("")}>
                X
              </button>
            </div>
            <img src={imageModalSrc} alt="Counter full preview" style={{ width: "100%", height: "auto" }} />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
