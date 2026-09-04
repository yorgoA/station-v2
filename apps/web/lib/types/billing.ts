export type BillingEntryRow = {
  id: string;
  customerNumber: string;
  customerName: string;
  regionCode: string;
  previousCounter: number;
  newCounter?: number;
  billingType: string;
  subscribedAmpere?: number | null;
  /** Current standing amount for a fixed-monthly customer (LBP). */
  fixedMonthlyAmount?: number;
  /** Employee-proposed corrected amount for a fixed-monthly customer (LBP); undefined = no proposal. */
  proposedFixedMonthlyAmount?: number;
  proposedFixedMonthlyNote?: string;
  isFreeCustomer: boolean;
  isMonitor: boolean;
  obligatoryLinkedToCustomerNumber?: string;
  counterImageName?: string;
};

export type BillingBatchStatus = "draft" | "pending_review" | "changes_requested" | "approved_posted";

export type BillingApprovalBatch = {
  id: string;
  monthKey: string;
  regionCode: string;
  submittedBy: string;
  submittedAt: string;
  status: BillingBatchStatus;
  managerNote?: string;
  itemsCount: number;
  totalAmount: number;
};
