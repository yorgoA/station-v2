"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { type BillingEntryRow } from "../../../../lib/types/billing";

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
  const [initialReviewStates, setInitialReviewStates] = useState<Record<string, "approved" | "changes_needed">>({});
  const [pendingModificationRows, setPendingModificationRows] = useState<Record<string, boolean>>({});
  const [modificationStartNotes, setModificationStartNotes] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [sentToEmployee, setSentToEmployee] = useState(false);
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

  useEffect(() => {
    if (!batchId) return;
    fetch(`/api/billing/batches/${batchId}`)
      .then(async (response) => {
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
            previousCounter: number;
            newCounter: number;
            counterImageName: string;
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
            billingType: "metered",
            isFreeCustomer: false,
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
      })
      .catch(() => {
        setServerBatch(null);
        setServerItems(null);
        setEmployeeChangeSummaryByRowId({});
        setInitialReviewStates({});
        setBanner("Failed to load server batch details.");
      });
  }, [batchId]);

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
            <div className="card-actions-right" style={{ marginTop: 0 }}>
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
          <p className="muted">Previous counter: {row.previousCounter}</p>
          <p className="muted">Current counter: {row.newCounter ?? "-"}</p>
          {employeeChangeSummaryByRowId[row.id] ? (
            <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
              Employee modifications: {employeeChangeSummaryByRowId[row.id]}
            </p>
          ) : selectedBatch.status === "pending_review" && initialReviewStates[row.id] === "changes_needed" ? (
            <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
              Employee modifications: re-submitted after previous manager note (legacy details unavailable for this cycle).
            </p>
          ) : null}
          <p className="muted" style={{ marginBottom: 6 }}>
            Counter image:
          </p>
          {row.counterImageName ? (
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
          <button type="button" className="success-btn" onClick={finalizeReview} disabled={!allRowsDecided}>
            Send to Employee
          </button>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            This batch was already sent to employee. Review is read-only.
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
