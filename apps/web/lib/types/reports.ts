export type ReportRegion = "mrah" | "printania";
export type ReportRegionFilter = "all" | ReportRegion;
export type ReportMonthKey = string;

export type ReportKpiTone = "money" | "kwh" | "neutral";
export type ReportKpiRow = {
  label: string;
  value: string | number;
  tone?: ReportKpiTone;
  href?: string;
  ctaLabel?: string;
};

export type BillStatus = "paid" | "unpaid";
export type ReportCurrency = "USD" | "LBP";
export type ReportBillingType = "metered" | "fixed-monthly";

export type BillReportRow = {
  customer: string;
  region: ReportRegion;
  monthKey: ReportMonthKey;
  amount: number;
  currency: ReportCurrency;
  status: BillStatus;
  billingType: ReportBillingType;
};
