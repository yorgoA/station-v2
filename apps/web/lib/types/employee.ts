export type EmployeeBillingType = "metered" | "fixed-monthly";
export type EmployeeRegion = "mrah" | "printania";
export type EmployeeStatus = "active" | "paused";
export type EmployeeMonthlyPaymentStatus = "paid" | "unpaid";

export type EmployeeMonthlyBillingRow = {
  monthKey: string;
  billingType: EmployeeBillingType;
  kwh: number;
  amount: number;
  paid: boolean;
};

export type EmployeeCustomer = {
  id: string;
  customerNumber: string;
  fullName: string;
  region: EmployeeRegion;
  billingType: EmployeeBillingType;
  phone: string;
  boxNumber: string;
  building: string;
  status: EmployeeStatus;
  monthlyPaymentStatus: Record<string, EmployeeMonthlyPaymentStatus>;
  ongoingBalanceByMonth: Record<string, number>;
  monthlyBilling: EmployeeMonthlyBillingRow[];
};

export type EmployeePayment = {
  id: string;
  customerName: string;
  region: EmployeeRegion;
  amount: number;
  date: string;
  receipt: string;
};
