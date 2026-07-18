"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type BillingEntryRow } from "../../../lib/types/billing";
import {
  applyDraftImagesToRows,
  clearBillingDraft,
  readBillingDraftImages,
  pruneOversizedBillingDrafts,
  readBillingDraftRows,
  writeBillingDraftImages,
  writeBillingDraftRows,
} from "../../../lib/billing/draft-storage";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { useAvailableMonths } from "../../../lib/hooks/use-available-months";
import { AppShell } from "../../_components/app-shell";

type RowErrors = {
  newCounter?: string;
  counterImageName?: string;
  obligatoryLinkedToCustomerNumber?: string;
};

type ReviewRowFeedback = {
  state: "approved" | "changes_needed";
  note?: string;
};

type SubmittedRowBaseline = {
  previousCounter: number;
  newCounter?: number;
  counterImageName?: string;
  billingType: BillingEntryRow["billingType"];
  isMonitor: boolean;
  obligatoryLinkedToCustomerNumber?: string;
};

type BatchReviewItem = {
  customerNumber: string;
  reviewState?: "approved" | "changes_needed";
  reviewNote?: string;
};

function BillingEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const months = useAvailableMonths();
  const [regionFilter, setRegionFilter] = useState<"all" | "mrah" | "printania">("all");
  const [rows, setRows] = useState<BillingEntryRow[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [banner, setBanner] = useState<string>("");
  const [isHydrated, setIsHydrated] = useState(false);
  const skipNextSaveRef = useRef(false);
  const [serverCurrentStatus, setServerCurrentStatus] = useState<string | null>(null);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [batchReviewItems, setBatchReviewItems] = useState<BatchReviewItem[] | null>(null);
  const [batchManagerNote, setBatchManagerNote] = useState<string>("");
  const [reviewFeedback, setReviewFeedback] = useState<Record<string, ReviewRowFeedback>>({});
  const [counterImageDataByRowId, setCounterImageDataByRowId] = useState<Record<string, string>>({});
  const [imageModalSrc, setImageModalSrc] = useState<string>("");
  const [submittedBaselineByRowId, setSubmittedBaselineByRowId] = useState<
    Record<string, SubmittedRowBaseline>
  >({});
  const [validatedFixRows, setValidatedFixRows] = useState<Record<string, boolean>>({});

  const periodKey = `${monthKey}|${regionFilter}`;
  const [entryWindowOpen, setEntryWindowOpen] = useState(false);
  const [unlockDateLabel, setUnlockDateLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/billing-lock?month=${encodeURIComponent(monthKey)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to check entry lock.");
        const payload = (await response.json()) as { isOpen?: boolean; unlockDateLabel?: string };
        if (cancelled) return;
        setEntryWindowOpen(Boolean(payload.isOpen));
        setUnlockDateLabel(payload.unlockDateLabel ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setEntryWindowOpen(false);
        setUnlockDateLabel("");
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  const isChangesRequested = serverCurrentStatus === "changes_requested";
  const derivedStatus = serverCurrentStatus;
  const isCurrentPeriodSubmitted =
    regionFilter !== "all" &&
    !isChangesRequested &&
    (derivedStatus === "pending_review" || derivedStatus === "approved_posted");

  const visibleRows = useMemo(
    () => rows.filter((row) => regionFilter === "all" || row.regionCode === regionFilter),
    [rows, regionFilter]
  );

  const rowErrors = useMemo(() => {
    const result: Record<string, RowErrors> = {};
    for (const row of visibleRows) {
      if (row.isFreeCustomer) {
        continue;
      }
      const errors: RowErrors = {};
      if (row.newCounter === undefined || Number.isNaN(row.newCounter)) {
        errors.newCounter = "New counter is required.";
      } else if (row.newCounter < row.previousCounter) {
        errors.newCounter = "New counter must be greater than or equal to previous counter.";
      }
      if (!row.counterImageName) {
        errors.counterImageName = "Exactly one counter image is required.";
      }
      if (row.isMonitor && !row.obligatoryLinkedToCustomerNumber) {
        errors.obligatoryLinkedToCustomerNumber =
          "Monitor customers must be linked to one obligatory customer.";
      }
      if (errors.newCounter || errors.counterImageName || errors.obligatoryLinkedToCustomerNumber) {
        result[row.id] = errors;
      }
    }
    return result;
  }, [visibleRows]);

  const hasErrors = Object.keys(rowErrors).length > 0;
  const completedRows = visibleRows.filter((row) => {
    if (row.isFreeCustomer) return true;
    const countersOk =
      row.newCounter !== undefined &&
      row.newCounter >= row.previousCounter &&
      Boolean(row.counterImageName);
    if (!countersOk) return false;
    if (row.isMonitor && !row.obligatoryLinkedToCustomerNumber) return false;
    return true;
  }).length;

  function normalizeCustomerNumber(value?: string) {
    return String(value ?? "").trim().toLowerCase();
  }

  function toImageHref(value?: string) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (raw.startsWith("data:image/")) return raw;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (raw.startsWith("/")) return raw;
    if (raw.startsWith("uploads/")) return "";
    return "";
  }

  function getRowPreviewImage(rowId: string, counterImageName?: string) {
    const uploadedDataUrl = counterImageDataByRowId[rowId];
    if (uploadedDataUrl && uploadedDataUrl.startsWith("data:image/")) {
      return uploadedDataUrl;
    }
    return toImageHref(counterImageName);
  }

  useEffect(() => {
    const qMonth = searchParams.get("month");
    const qRegion = searchParams.get("region");
    if (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) {
      setMonthKey(qMonth);
    }
    if (qRegion === "mrah" || qRegion === "printania" || qRegion === "all") {
      setRegionFilter(qRegion);
    }
    pruneOversizedBillingDrafts();
    setIsHydrated(true);
  }, [searchParams]);

  useEffect(() => {
    if (!isHydrated || regionFilter === "all") {
      setServerCurrentStatus(null);
      setCurrentBatchId(null);
      return;
    }
    fetch(`/api/billing/batches?month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load server workflow status.");
        const payload = (await response.json()) as { batches: Array<{ id: string; status: string }> };
        const first = payload.batches?.[0];
        setServerCurrentStatus(first?.status ?? null);
        setCurrentBatchId(first?.id ?? null);
      })
      .catch(() => {
        setServerCurrentStatus(null);
        setCurrentBatchId(null);
      });
  }, [isHydrated, monthKey, regionFilter]);

  useEffect(() => {
    if (!isHydrated || regionFilter === "all") {
      setBatchReviewItems(null);
      setBatchManagerNote("");
      setReviewFeedback({});
      return;
    }
    if (serverCurrentStatus !== "changes_requested" || !currentBatchId) {
      setBatchReviewItems(null);
      setBatchManagerNote("");
      setReviewFeedback({});
      return;
    }
    let cancelled = false;
    fetch(`/api/billing/batches/${currentBatchId}?includeImages=0`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load manager review.");
        return response.json() as Promise<{
          batch?: { managerNote?: string };
          items: Array<{
            customerNumber: string;
            reviewState?: "approved" | "changes_needed";
            reviewNote?: string;
          }>;
        }>;
      })
      .then((payload) => {
        if (cancelled) return;
        setBatchManagerNote(payload.batch?.managerNote ?? "");
        const items = (payload.items ?? []).map((item) => ({
          customerNumber: item.customerNumber,
          reviewState: item.reviewState,
          reviewNote: item.reviewNote,
        }));
        setBatchReviewItems(items);
      })
      .catch(() => {
        if (!cancelled) {
          setBatchReviewItems(null);
          setBatchManagerNote("");
          setReviewFeedback({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isHydrated, regionFilter, serverCurrentStatus, currentBatchId]);

  useEffect(() => {
    if (!batchReviewItems?.length) {
      setReviewFeedback({});
      return;
    }
    const map: Record<string, ReviewRowFeedback> = {};
    for (const item of batchReviewItems) {
      if (!item.reviewState) continue;
      const customerKey = normalizeCustomerNumber(item.customerNumber);
      if (!customerKey) continue;
      map[customerKey] = {
        state: item.reviewState,
        note: item.reviewNote,
      };
    }
    setReviewFeedback(map);
  }, [rows, batchReviewItems]);

  useEffect(() => {
    if (!isHydrated) return;
    if (regionFilter === "all") {
      setRows([]);
      setCounterImageDataByRowId({});
      setSubmittedBaselineByRowId({});
      setValidatedFixRows({});
      return;
    }
    if (!entryWindowOpen) {
      skipNextSaveRef.current = true;
      setRows([]);
      setCounterImageDataByRowId({});
      setSubmittedBaselineByRowId({});
      setValidatedFixRows({});
      setSubmitAttempted(false);
      setBanner(`Entry for ${monthKey} is locked by calendar. Opens on ${unlockDateLabel}.`);
      return;
    }

    const parsedDraftRows = readBillingDraftRows(monthKey, regionFilter) ?? [];

    Promise.all([
      fetch(`/api/billing/entry-rows?month=${monthKey}&region=${regionFilter}`),
      serverCurrentStatus === "changes_requested"
        ? fetch(`/api/billing/submissions?month=${monthKey}&region=${regionFilter}`)
        : Promise.resolve(null),
    ])
      .then(async ([entryRowsResponse, submissionResponse]) => {
        if (!entryRowsResponse.ok) throw new Error("Failed to load starter rows.");
        const payload = (await entryRowsResponse.json()) as { rows: BillingEntryRow[] };
        const starterRows = (payload.rows ?? []).map((r) => ({
          ...r,
          newCounter: undefined,
          counterImageName: undefined,
        }));
        let submittedByCustomerNumber = new Map<
          string,
          { previousCounter: number; newCounter: number; counterImageName?: string }
        >();
        if (submissionResponse && submissionResponse.ok) {
          const submittedPayload = (await submissionResponse.json()) as {
            rows?: Array<{
              customerNumber: string;
              previousCounter: number;
              newCounter: number;
              counterImageName?: string;
            }>;
          };
          submittedByCustomerNumber = new Map(
            (submittedPayload.rows ?? []).map((r) => [
              r.customerNumber,
              {
                previousCounter: Number(r.previousCounter),
                newCounter: Number(r.newCounter),
                counterImageName: r.counterImageName,
              },
            ])
          );
        }
        const draftById = new Map(parsedDraftRows.map((row) => [row.id, row]));
        const mergedRows = starterRows.map((starter) => {
          const fromSubmitted = submittedByCustomerNumber.get(starter.customerNumber);
          const draft = draftById.get(starter.id);
          const base =
            fromSubmitted && serverCurrentStatus === "changes_requested"
              ? {
                  ...starter,
                  previousCounter: fromSubmitted.previousCounter,
                  newCounter: fromSubmitted.newCounter,
                  counterImageName: fromSubmitted.counterImageName,
                }
              : starter;
          if (!draft) return base;
          return {
            ...base,
            customerName: draft.customerName,
            customerNumber: draft.customerNumber,
            previousCounter: draft.previousCounter,
            billingType: draft.billingType,
            isFreeCustomer: draft.isFreeCustomer,
            isMonitor: draft.isMonitor,
            obligatoryLinkedToCustomerNumber: draft.obligatoryLinkedToCustomerNumber,
            newCounter: draft.newCounter,
            counterImageName: draft.counterImageName,
          };
        });
        const draftOnlyRows = parsedDraftRows.filter((draft) => !starterRows.some((s) => s.id === draft.id));
        const mapped = [...mergedRows, ...draftOnlyRows];
        const nextBaselineByRowId: Record<string, SubmittedRowBaseline> = {};
        if (serverCurrentStatus === "changes_requested") {
          for (const row of mapped) {
            nextBaselineByRowId[row.id] = {
              previousCounter: row.previousCounter,
              newCounter: row.newCounter,
              counterImageName: row.counterImageName,
              billingType: row.billingType,
              isMonitor: row.isMonitor,
              obligatoryLinkedToCustomerNumber: row.obligatoryLinkedToCustomerNumber,
            };
          }
        }
        const draftImages = await readBillingDraftImages(monthKey, regionFilter);
        const mappedWithDraftImages = applyDraftImagesToRows(mapped, draftImages);
        skipNextSaveRef.current = true;
        setRows(mappedWithDraftImages);
        setCounterImageDataByRowId(draftImages);
        setSubmittedBaselineByRowId(nextBaselineByRowId);
        setValidatedFixRows({});
        setSubmitAttempted(false);
        if (mapped.length === 0) {
          setBanner(`No customers found for ${monthKey} / ${regionFilter}.`);
        } else if (parsedDraftRows.length > 0) {
          setBanner(
            `Loaded saved draft for ${monthKey} / ${regionFilter} and refreshed latest customer rows.`
          );
        } else {
          setBanner(
            `Previous counters auto-loaded for ${monthKey} / ${regionFilter}. Enter current month counters.`
          );
        }
      })
      .catch((error) => {
        skipNextSaveRef.current = true;
        setRows([]);
        setCounterImageDataByRowId({});
        setSubmittedBaselineByRowId({});
        setValidatedFixRows({});
        setBanner(error instanceof Error ? error.message : "Failed to load starter rows.");
      });
  }, [entryWindowOpen, isHydrated, monthKey, regionFilter, unlockDateLabel, serverCurrentStatus]);

  useEffect(() => {
    if (!isHydrated || regionFilter === "all") return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const saved = writeBillingDraftRows(monthKey, regionFilter, rows);
    if (!saved) {
      setBanner(
        "Could not save draft counters locally (browser storage full). Submit when ready or clear old drafts."
      );
    }
    void writeBillingDraftImages(monthKey, regionFilter, counterImageDataByRowId);
  }, [isHydrated, monthKey, regionFilter, rows, counterImageDataByRowId]);

  function updateRow(id: string, patch: Partial<BillingEntryRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setBanner("");
  }

  async function handleImageChange(id: string, file?: File) {
    updateRow(id, { counterImageName: file?.name });
    if (!file) {
      setCounterImageDataByRowId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.readAsDataURL(file);
    });
    setCounterImageDataByRowId((prev) => ({ ...prev, [id]: dataUrl }));
  }

  function saveDraftLocal() {
    if (regionFilter === "all") {
      setBanner("Choose a specific region before saving draft.");
      return;
    }
    if (isCurrentPeriodSubmitted) {
      setBanner("This month/region is already submitted for review and is locked.");
      return;
    }
    if (!entryWindowOpen) {
      setBanner(`Entry for ${monthKey} is locked by calendar. Opens on ${unlockDateLabel}.`);
      return;
    }
    if (hasErrors) {
      setSubmitAttempted(true);
      setBanner("Cannot save draft. Fix validation errors first.");
      return;
    }
    setBanner("Draft saved locally.");
  }

  async function submitForReview() {
    if (regionFilter === "all") {
      setBanner("Choose a specific region before submitting for review.");
      return;
    }
    if (isCurrentPeriodSubmitted) {
      setBanner("This month/region is already submitted for review.");
      return;
    }
    if (!entryWindowOpen) {
      setBanner(`Entry for ${monthKey} is locked by calendar. Opens on ${unlockDateLabel}.`);
      return;
    }
    if (hasErrors) {
      setSubmitAttempted(true);
      setBanner("Cannot submit. Complete required counters and one image per row.");
      return;
    }
    const rowsToSubmit = visibleRows.filter((row) => !row.isFreeCustomer);
    if (rowsToSubmit.length === 0) {
      setBanner("Nothing to submit — all in-scope rows are free customers.");
      return;
    }
    try {
      const response = await fetch("/api/billing/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthKey,
          regionCode: regionFilter,
          rows: rowsToSubmit.map((row) => ({
            ...row,
            counterImageDataUrl: counterImageDataByRowId[row.id],
            previousSubmittedNewCounter: submittedBaselineByRowId[row.id]?.newCounter,
            previousSubmittedCounterImageName: submittedBaselineByRowId[row.id]?.counterImageName,
          })),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setBanner(payload.error ?? "Submit failed.");
        return;
      }

      setServerCurrentStatus("pending_review");
      await clearBillingDraft(monthKey, regionFilter);
      setBanner("Submitted to server. Opening preview...");
      router.push(`/employee/billing/preview?month=${monthKey}&region=${regionFilter}`);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Unknown submit error.");
    }
  }

  return (
    <AppShell
      title="Billing Entry"
      subtitle="Design-first prototype with strict validation and one required counter image"
    >
      <div className="card">
        <div className="filters-grid">
          <label htmlFor="monthKey">
            Month
            <select
              id="monthKey"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="regionFilter">
            Region
            <select
              id="regionFilter"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
            >
              <option value="all">All regions</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
        </div>
      </div>

      {isCurrentPeriodSubmitted && (
        <div className="card">
          <p style={{ color: "var(--warning)", margin: 0 }}>
            This month is already submitted for the selected region and cannot be edited again.
          </p>
        </div>
      )}

      {!isCurrentPeriodSubmitted && (
        <>
          {!entryWindowOpen && (
            <div className="card">
              <p style={{ color: "var(--warning)", margin: 0 }}>
                Entry for {monthKey} is locked by calendar and opens on {unlockDateLabel}.
              </p>
            </div>
          )}
          {isChangesRequested && (
            <div className="card">
              <p style={{ color: "var(--warning)", marginTop: 0 }}>
                Manager requested fixes.
              </p>
              <div className="status-legend status-legend-page" aria-label="status color pattern explanation">
                <span className="status-legend-item success">Green: approved</span>
                <span className="status-legend-item warning">Yellow: pending review</span>
                <span className="status-legend-item changes">Orange: changes needed</span>
                <span className="status-legend-item danger">Red: draft / missing data</span>
              </div>
            </div>
          )}
          {entryWindowOpen ? (
            <>
              <div className="card">
                <div className="kpi-grid">
                  <div>
                    <p className="muted">Rows in scope</p>
                    <p className="kpi-value">{visibleRows.length}</p>
                  </div>
                  <div>
                    <p className="muted">Completed</p>
                    <p className="kpi-value">{completedRows}</p>
                  </div>
                  <div>
                    <p className="muted">Needs review</p>
                    <p className="kpi-value">{visibleRows.length - completedRows}</p>
                  </div>
                </div>
              </div>

              {visibleRows.map((row) => {
            const errors = rowErrors[row.id];
            const rowFeedback = reviewFeedback[normalizeCustomerNumber(row.customerNumber)];
            const rowWasChangesRequested = rowFeedback?.state === "changes_needed";
            const baseline = submittedBaselineByRowId[row.id];
            const rowHasModificationSinceSubmit = baseline
              ? row.previousCounter !== baseline.previousCounter ||
                row.newCounter !== baseline.newCounter ||
                row.counterImageName !== baseline.counterImageName ||
                row.billingType !== baseline.billingType ||
                row.isMonitor !== baseline.isMonitor ||
                row.obligatoryLinkedToCustomerNumber !== baseline.obligatoryLinkedToCustomerNumber ||
                Boolean(counterImageDataByRowId[row.id])
              : false;
            const rowIsApprovedByFix = rowWasChangesRequested && Boolean(validatedFixRows[row.id]);
            const rowIsApproved = rowFeedback?.state === "approved" || rowIsApprovedByFix;
            const rowNeedsChange = rowWasChangesRequested && !rowIsApprovedByFix;
            const rowLocked = isChangesRequested && (rowFeedback?.state === "approved" || rowIsApprovedByFix);
            const rowReadOnly = rowLocked || row.isFreeCustomer || !entryWindowOpen;
            const consumption =
              row.newCounter !== undefined && row.newCounter >= row.previousCounter
                ? row.newCounter - row.previousCounter
                : undefined;
            return (
              <div
                className={`card ${rowIsApproved ? "row-approved" : ""} ${rowNeedsChange ? "row-needs-change" : ""}`}
                key={row.id}
                style={row.isFreeCustomer ? { background: "#f1f5f9", borderColor: "#cbd5e1" } : undefined}
              >
                <strong>
                  {row.customerName || "New customer row"}{" "}
                  {row.customerNumber ? `(${row.customerNumber})` : ""}
                </strong>
                <p className="muted">
                  Region: {row.regionCode} | Billing type: {row.billingType} | Free:{" "}
                  {row.isFreeCustomer ? "yes" : "no"} | Monitor: {row.isMonitor ? "yes" : "no"}
                  {row.billingType === "amp-only" || row.billingType === "both" ? (
                    <>
                      {" "}
                      | Subscribed ampere:{" "}
                      {row.subscribedAmpere ? (
                        `${row.subscribedAmpere}A`
                      ) : (
                        <strong style={{ color: "var(--danger)" }}>
                          not set — approval will fail until set on the customer profile
                        </strong>
                      )}
                    </>
                  ) : null}
                </p>
                <label>
                  Customer name:{" "}
                  <input
                    value={row.customerName}
                    disabled={rowReadOnly}
                    onChange={(e) => updateRow(row.id, { customerName: e.target.value })}
                  />
                </label>
                <br />
                <label>
                  Customer number:{" "}
                  <input
                    value={row.customerNumber}
                    disabled={rowReadOnly}
                    onChange={(e) => updateRow(row.id, { customerNumber: e.target.value })}
                  />
                </label>
                <br />
                <label>
                  Previous counter:{" "}
                  <input
                    type="number"
                    value={row.previousCounter}
                    disabled={rowReadOnly}
                    onChange={(e) =>
                      updateRow(row.id, {
                        previousCounter: Number(e.target.value || "0")
                      })
                    }
                  />
                </label>
                <br />
                <label>
                  Billing type:{" "}
                  <select
                    value={row.billingType}
                    disabled={rowReadOnly}
                    onChange={(e) =>
                      updateRow(row.id, { billingType: e.target.value as BillingEntryRow["billingType"] })
                    }
                  >
                    <option value="both">both</option>
                    <option value="fixed-monthly">fixed-monthly</option>
                  </select>
                </label>{" "}
                <label>
                  <input type="checkbox" checked={row.isFreeCustomer} disabled /> Free customer
                </label>
                {!row.isFreeCustomer && (
                  <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
                    Free status is manager-only — edit under Manager → Customers (customer profile).
                  </p>
                )}
                {" "}
                <label>
                  <input
                    type="checkbox"
                    checked={row.isMonitor}
                    disabled={rowReadOnly}
                    onChange={(e) =>
                      updateRow(row.id, {
                        isMonitor: e.target.checked,
                        obligatoryLinkedToCustomerNumber: e.target.checked
                          ? row.obligatoryLinkedToCustomerNumber
                          : undefined
                      })
                    }
                  />{" "}
                  Monitor customer
                </label>
                {row.isMonitor && (
                  <>
                    <br />
                    <label>
                      Linked obligatory customer:{" "}
                      <select
                        value={row.obligatoryLinkedToCustomerNumber ?? ""}
                        disabled={rowReadOnly}
                        onChange={(e) =>
                          updateRow(row.id, {
                            obligatoryLinkedToCustomerNumber: e.target.value || undefined
                          })
                        }
                      >
                        <option value="">Select obligatory customer</option>
                        {visibleRows
                          .filter(
                            (candidate) =>
                              candidate.id !== row.id &&
                              !candidate.isMonitor &&
                              Boolean(candidate.customerNumber)
                          )
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.customerNumber}>
                              {candidate.customerName || "Unnamed"} ({candidate.customerNumber})
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
                <br />
                <label>
                  New counter:{" "}
                  <input
                    type="number"
                    value={row.newCounter ?? ""}
                    disabled={rowReadOnly}
                    onChange={(e) =>
                      updateRow(row.id, {
                        newCounter:
                          e.target.value === "" ? undefined : Number(e.target.value)
                      })
                    }
                  />
                </label>
                <br />
                <label>
                  {row.counterImageName
                    ? "Counter image (click preview, choose file to replace): "
                    : "Counter image (exactly 1): "}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={rowReadOnly}
                    onChange={(e) => handleImageChange(row.id, e.target.files?.[0])}
                  />
                </label>
                {getRowPreviewImage(row.id, row.counterImageName) ? (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={getRowPreviewImage(row.id, row.counterImageName)}
                      alt={`Counter ${row.customerNumber}`}
                      title="Click to preview"
                      onClick={() => setImageModalSrc(getRowPreviewImage(row.id, row.counterImageName))}
                      style={{
                        width: 140,
                        height: "auto",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                ) : null}
                {row.isFreeCustomer && (
                  <p className="muted">
                    Free customer — excluded from meter entry. Managers change free status on the customer
                    profile (Manager → Customers).
                  </p>
                )}
                {rowFeedback?.note && (
                  <p style={{ color: rowNeedsChange ? "var(--danger)" : "var(--success)" }}>
                    Manager note: {rowFeedback.note}
                  </p>
                )}
                {consumption !== undefined && <p>Consumption (kWh): {consumption}</p>}
                {submitAttempted && errors?.newCounter && (
                  <p style={{ color: "#b91c1c" }}>{errors.newCounter}</p>
                )}
                {submitAttempted && errors?.counterImageName && (
                  <p style={{ color: "#b91c1c" }}>{errors.counterImageName}</p>
                )}
                {submitAttempted && errors?.obligatoryLinkedToCustomerNumber && (
                  <p style={{ color: "#b91c1c" }}>{errors.obligatoryLinkedToCustomerNumber}</p>
                )}
                {rowNeedsChange && (
                  <div className="card-actions-right" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="warning-btn"
                      disabled={!rowHasModificationSinceSubmit}
                      onClick={() => setValidatedFixRows((prev) => ({ ...prev, [row.id]: true }))}
                      title={
                        rowHasModificationSinceSubmit
                          ? "Mark this corrected row as validated."
                          : "Modify this row first, then validate fix."
                      }
                    >
                      Validate Fix
                    </button>
                  </div>
                )}
              </div>
            );
              })}

              <div className="card">
                {visibleRows.length > 0 && (
                  <>
                    <button onClick={saveDraftLocal}>Save Draft</button>{" "}
                    <button onClick={submitForReview}>Submit For Review</button>{" "}
                  </>
                )}
                {banner && <p>{banner}</p>}
              </div>
            </>
          ) : (
            <div className="card">
              {banner && <p>{banner}</p>}
            </div>
          )}
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
        </>
      )}
    </AppShell>
  );
}

export default function BillingEntryPage() {
  return (
    <Suspense fallback={<div className="card">Loading entry...</div>}>
      <BillingEntryContent />
    </Suspense>
  );
}
