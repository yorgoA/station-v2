 "use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type BillingEntryRow } from "../../../lib/types/billing";
import { formatEntryUnlockDate, isEntryWindowOpen } from "../../../lib/billing/entry-window";
import { CURRENT_MONTH_KEY, MONTH_OPTIONS } from "../../../lib/constants/months";
import { AppShell } from "../../_components/app-shell";

function BillingPreviewContent() {
  const searchParams = useSearchParams();
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const [regionFilter, setRegionFilter] = useState<"all" | "mrah" | "printania">("all");
  const [filteredRows, setFilteredRows] = useState<BillingEntryRow[]>([]);
  const [workflowStatusByPeriod, setWorkflowStatusByPeriod] = useState<Map<string, string>>(
    () => new Map()
  );
  const [rowsToCorrectByPeriod, setRowsToCorrectByPeriod] = useState<Record<string, number>>({});
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    title: string;
    rows: BillingEntryRow[];
  }>({ open: false, title: "", rows: [] });
  const regionOptions: Array<"mrah" | "printania"> = ["mrah", "printania"];
  const periodKey = `${monthKey}|${regionFilter}`;
  const entryWindowOpen = isEntryWindowOpen(monthKey);
  const unlockDateLabel = formatEntryUnlockDate(monthKey);
  const isCurrentPeriodSubmitted =
    regionFilter !== "all" &&
    ["pending_review", "approved_posted"].includes(workflowStatusByPeriod.get(periodKey) ?? "");
  useEffect(() => {
    const qMonth = searchParams.get("month");
    const qRegion = searchParams.get("region");
    if (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) {
      setMonthKey(qMonth);
    }
    if (qRegion === "all" || qRegion === "mrah" || qRegion === "printania") {
      setRegionFilter(qRegion);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch(`/api/billing/batches?month=${monthKey}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load workflow statuses.");
        const payload = (await response.json()) as {
          batches: Array<{ monthKey: string; regionCode: string; status: string }>;
        };
        const next = new Map<string, string>();
        for (const batch of payload.batches ?? []) {
          next.set(`${batch.monthKey}|${batch.regionCode}`, batch.status);
        }
        setWorkflowStatusByPeriod(next);
      })
      .catch(() => setWorkflowStatusByPeriod(new Map()));
  }, [monthKey]);

  useEffect(() => {
    fetch(`/api/billing/review-feedback?month=${monthKey}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load review feedback.");
        const payload = (await response.json()) as { rowsToCorrectByPeriod: Record<string, number> };
        setRowsToCorrectByPeriod(payload.rowsToCorrectByPeriod ?? {});
      })
      .catch(() => setRowsToCorrectByPeriod({}));
  }, [monthKey]);

  useEffect(() => {
    if (regionFilter === "all") {
      setFilteredRows([]);
      return;
    }
    const draftKey = `billing_draft:${monthKey}|${regionFilter}`;
    const savedDraft = window.localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        setFilteredRows(JSON.parse(savedDraft) as BillingEntryRow[]);
        return;
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }
    fetch(`/api/billing/entry-rows?month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load entry rows.");
        const payload = (await response.json()) as { rows: BillingEntryRow[] };
        const rows = (payload.rows ?? []).map((row) => ({
          ...row,
          newCounter: undefined,
          counterImageName: undefined,
        }));
        setFilteredRows(rows);
      })
      .catch(() => setFilteredRows([]));
  }, [monthKey, regionFilter]);
  const completedRows = filteredRows.length;
  const estimatedConsumption = filteredRows.reduce(
    (acc, row) => acc + (row.previousCounter + 120 - row.previousCounter),
    0
  );
  const readyRows = filteredRows.filter(
    (row) =>
      row.newCounter !== undefined &&
      row.newCounter >= row.previousCounter &&
      Boolean(row.counterImageName)
  ).length;
  const previewStatus =
    completedRows === 0
      ? "empty"
      : readyRows === 0
        ? "draft_incomplete"
      : readyRows < completedRows
      ? "in_progress"
      : "ready_to_submit";
  const persistedWorkflowStatus =
    regionFilter === "all" ? undefined : workflowStatusByPeriod.get(periodKey);

  const statusTone =
    persistedWorkflowStatus === "approved_posted"
      ? "success"
      : persistedWorkflowStatus === "changes_requested"
        ? "changes"
        : persistedWorkflowStatus === "pending_review" || isCurrentPeriodSubmitted
        ? "warning"
        : previewStatus === "draft_incomplete" ||
          previewStatus === "in_progress" ||
            previewStatus === "empty" ||
            previewStatus === "ready_to_submit"
        ? "danger"
        : "neutral";

  const statusTitle =
    persistedWorkflowStatus === "approved_posted"
      ? "Approved and posted"
      : persistedWorkflowStatus === "pending_review" || isCurrentPeriodSubmitted
        ? "Waiting for manager confirmation"
        : persistedWorkflowStatus === "changes_requested"
          ? "Changes requested"
          : previewStatus === "ready_to_submit"
            ? "Ready to submit"
            : "Draft in progress";

  const statusDescription =
    persistedWorkflowStatus === "approved_posted"
      ? "This batch is accepted by manager. Printing can proceed."
      : persistedWorkflowStatus === "pending_review" || isCurrentPeriodSubmitted
        ? "This month/region is locked while manager review is pending."
        : persistedWorkflowStatus === "changes_requested"
          ? "Manager requested corrections before resubmission."
          : previewStatus === "ready_to_submit"
            ? "All rows are complete. Submit this batch for manager review."
            : "Some required data is missing. Complete rows before submission.";

  function readRowsToCorrectCount(targetPeriodKey: string): number {
    return rowsToCorrectByPeriod[targetPeriodKey] ?? 0;
  }

  function getRegionStatus(region: "mrah" | "printania") {
    const regionPeriodKey = `${monthKey}|${region}`;
    const regionRows = (() => {
      if (typeof window === "undefined") return [];
      const draftKey = `billing_draft:${regionPeriodKey}`;
      const savedDraft = window.localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          return JSON.parse(savedDraft) as BillingEntryRow[];
        } catch {
          window.localStorage.removeItem(draftKey);
        }
      }
      return [];
    })();
    const regionCompletedRows = regionRows.length;
    const regionReadyRows = regionRows.filter(
      (row) =>
        row.newCounter !== undefined &&
        row.newCounter >= row.previousCounter &&
        Boolean(row.counterImageName)
    ).length;
    const regionEstimatedConsumption = regionRows.reduce(
      (acc, row) => acc + (row.previousCounter + 120 - row.previousCounter),
      0
    );
    const regionPreviewStatus =
      regionCompletedRows === 0
        ? "empty"
        : regionReadyRows === 0
          ? "draft_incomplete"
          : regionReadyRows < regionCompletedRows
            ? "in_progress"
            : "ready_to_submit";
    const regionWorkflowStatus = workflowStatusByPeriod.get(regionPeriodKey);
    const regionEntryWindowOpen = isEntryWindowOpen(monthKey);
    const regionIsCalendarLocked = !regionEntryWindowOpen && !regionWorkflowStatus;
    const regionTone =
      regionWorkflowStatus === "approved_posted"
        ? "success"
        : regionWorkflowStatus === "changes_requested"
          ? "changes"
          : regionWorkflowStatus === "pending_review"
            ? "warning"
            : regionIsCalendarLocked
              ? "danger"
            : "danger";
    const regionTitle =
      regionWorkflowStatus === "approved_posted"
        ? "Approved and posted"
        : regionWorkflowStatus === "pending_review"
          ? "Waiting for manager confirmation"
          : regionWorkflowStatus === "changes_requested"
            ? "Changes requested"
            : regionIsCalendarLocked
              ? "Locked by billing calendar until 27"
            : regionPreviewStatus === "ready_to_submit"
              ? "Ready to submit"
              : "Draft in progress";

    return {
      region,
      regionPeriodKey,
      regionTone,
      regionTitle,
      regionWorkflowStatus,
      regionIsCalendarLocked,
      regionCompletedRows,
      regionReadyRows,
      regionEstimatedConsumption
    };
  }

  function openSubmissionPreview(title: string, targetPeriodKey: string) {
    const [targetMonth, targetRegion] = targetPeriodKey.split("|");
    fetch(`/api/billing/submissions?month=${targetMonth}&region=${targetRegion}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load submitted rows.");
        const payload = (await response.json()) as {
          rows: Array<{
            id: string;
            customerNumber: string;
            customerName: string;
            previousCounter: number;
            newCounter: number;
            counterImageName: string;
          }>;
        };
        const rows = (payload.rows ?? []).map((row) => ({
          id: row.id,
          customerNumber: row.customerNumber,
          customerName: row.customerName,
          regionCode: targetRegion,
          previousCounter: Number(row.previousCounter),
          newCounter: Number(row.newCounter),
          counterImageName: row.counterImageName,
          billingType: "metered",
          isFreeCustomer: false,
          isMonitor: false,
        }));
        setPreviewModal({ open: true, title, rows });
      })
      .catch(() => setPreviewModal({ open: true, title, rows: [] }));
  }

  function closeSubmissionPreview() {
    setPreviewModal({ open: false, title: "", rows: [] });
  }

  return (
    <AppShell
      title="Billing Preview"
      subtitle="Review totals before sending the batch to manager"
    >
      <div className="status-legend status-legend-page" aria-label="status color pattern explanation">
        <span className="status-legend-item success">Green: approved</span>
        <span className="status-legend-item warning">Yellow: pending review</span>
        <span className="status-legend-item changes">Orange: changes needed</span>
        <span className="status-legend-item danger">Red: draft / missing data</span>
      </div>
      <div className="card">
        <label htmlFor="preview-month-filter">
          Month:{" "}
          <select
            id="preview-month-filter"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
          >
            {MONTH_OPTIONS.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>{" "}
        <label htmlFor="preview-region-filter">
          Region:{" "}
          <select
            id="preview-region-filter"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
          >
            <option value="all">All regions</option>
            <option value="mrah">Mrah</option>
            <option value="printania">Printania</option>
          </select>
        </label>
      </div>
      {regionFilter === "all" ? (
        regionOptions.map((region) => {
          const info = getRegionStatus(region);
          const rowsToCorrectCount =
            info.regionTone === "changes" ? readRowsToCorrectCount(info.regionPeriodKey) : 0;
          return (
            <div className={`card batch-status-card tone-${info.regionTone}`} key={region}>
              <div className="row-between">
                <div>
                  <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
                    {region === "mrah" ? "Mrah" : "Printania"} status
                  </p>
                  <h3 style={{ margin: 0 }}>{info.regionTitle}</h3>
                </div>
                <div className="notify-chip" aria-label="status badge">
                  {info.regionWorkflowStatus === "approved_posted"
                    ? "Approved"
                    : info.regionWorkflowStatus === "pending_review"
                      ? "Pending"
                      : info.regionTone === "changes"
                        ? "Changes"
                        : "Attention"}
                </div>
              </div>
              <div className="kpi-grid" style={{ marginTop: 14 }}>
                <div>
                  <p className="muted">Batch month</p>
                  <p className="kpi-value">{monthKey}</p>
                </div>
                <div>
                  <p className="muted">Rows in batch</p>
                  <p className="kpi-value">{info.regionCompletedRows}</p>
                </div>
                <div>
                  <p className="muted">Rows ready</p>
                  <p className="kpi-value">{info.regionReadyRows}</p>
                </div>
                <div>
                  <p className="muted">Estimated kWh</p>
                  <p className="kpi-value">{info.regionEstimatedConsumption}</p>
                </div>
                {info.regionTone === "changes" && (
                  <div>
                    <p className="muted">Rows to correct</p>
                    <p className="kpi-value">{rowsToCorrectCount}</p>
                  </div>
                )}
              </div>
              {(info.regionWorkflowStatus === "pending_review" ||
                info.regionWorkflowStatus === "approved_posted") && (
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() =>
                      openSubmissionPreview(
                        `Submitted bills - ${region === "mrah" ? "Mrah" : "Printania"} (${monthKey})`,
                        info.regionPeriodKey
                      )
                    }
                  >
                    Preview Submission
                  </button>
                </div>
              )}
              {(info.regionTone === "changes" || info.regionTone === "danger") && entryWindowOpen && (
                <div className="card-actions-right" style={{ marginTop: 14 }}>
                  <Link
                    href={`/employee/billing/entry?month=${monthKey}&region=${info.region}`}
                    className="action-link-btn"
                  >
                    {info.regionTone === "changes" ? "Correct Entries" : "Continue Entry"}
                  </Link>
                </div>
              )}
            </div>
          );
        })
      ) : (
      <div className={`card batch-status-card tone-${statusTone}`}>
        <div className="row-between">
          <div>
            <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
              Batch status
            </p>
            <h3 style={{ margin: 0 }}>{statusTitle}</h3>
            <p style={{ marginTop: 8, marginBottom: 0 }}>
              {!entryWindowOpen && !persistedWorkflowStatus
                ? `Locked by billing calendar until 27 (${unlockDateLabel}).`
                : statusDescription}
            </p>
          </div>
          <div className="notify-chip" aria-label="status badge">
            {statusTone === "success"
              ? "Approved"
              : statusTone === "warning"
                ? "Pending"
                : statusTone === "danger"
                  ? "Attention"
                  : "Info"}
          </div>
        </div>
        <div className="kpi-grid" style={{ marginTop: 14 }}>
          <div>
            <p className="muted">Batch month</p>
            <p className="kpi-value">{monthKey}</p>
          </div>
          <div>
            <p className="muted">Rows in batch</p>
            <p className="kpi-value">{completedRows}</p>
          </div>
          <div>
            <p className="muted">Rows ready</p>
            <p className="kpi-value">{readyRows}</p>
          </div>
          <div>
            <p className="muted">Estimated kWh</p>
            <p className="kpi-value">{estimatedConsumption}</p>
          </div>
          {statusTone === "changes" && (
            <div>
              <p className="muted">Rows to correct</p>
              <p className="kpi-value">{readRowsToCorrectCount(periodKey)}</p>
            </div>
          )}
        </div>
        {(statusTone === "warning" || statusTone === "success") && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() =>
                openSubmissionPreview(
                  `Submitted bills - ${regionFilter === "mrah" ? "Mrah" : "Printania"} (${monthKey})`,
                  periodKey
                )
              }
            >
              Preview Submission
            </button>
          </div>
        )}
        {(statusTone === "changes" || statusTone === "danger") && entryWindowOpen && (
          <div className="card-actions-right">
            <Link
              href={`/employee/billing/entry?month=${monthKey}&region=${regionFilter}`}
              className="action-link-btn"
            >
              {statusTone === "changes" ? "Correct Entries" : "Continue Entry"}
            </Link>
          </div>
        )}
      </div>
      )}
      {previewModal.open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Submitted bills preview">
          <div className="modal-card">
            <div className="row-between">
              <h3 style={{ margin: 0 }}>{previewModal.title}</h3>
              <button type="button" onClick={closeSubmissionPreview}>
                Close
              </button>
            </div>
            {previewModal.rows.length === 0 ? (
              <p className="muted">No values found in submitted snapshot.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Number</th>
                    <th>Previous</th>
                    <th>New</th>
                    <th>kWh</th>
                  </tr>
                </thead>
                <tbody>
                  {previewModal.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.customerName || "-"}</td>
                      <td>{row.customerNumber || "-"}</td>
                      <td>{row.previousCounter}</td>
                      <td>{row.newCounter ?? "-"}</td>
                      <td>
                        {row.newCounter !== undefined && row.newCounter >= row.previousCounter
                          ? row.newCounter - row.previousCounter
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function BillingPreviewPage() {
  return (
    <Suspense fallback={<div className="card">Loading preview...</div>}>
      <BillingPreviewContent />
    </Suspense>
  );
}
