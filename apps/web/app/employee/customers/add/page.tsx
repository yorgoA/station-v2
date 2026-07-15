"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../_components/app-shell";
import { employeeNavItems } from "../../../_components/role-nav";

export default function EmployeeAddCustomerPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [region, setRegion] = useState<"mrah" | "printania">("mrah");
  const [billingType, setBillingType] = useState<"fixed-monthly" | "metered" | "amp-only" | "both" | "free">(
    "both"
  );
  const [subscribedAmpere, setSubscribedAmpere] = useState("");
  const [fixedMonthlyAmount, setFixedMonthlyAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [boxNumber, setBoxNumber] = useState("");
  const [building, setBuilding] = useState("");
  const [allCustomers, setAllCustomers] = useState<Array<{ boxNumber?: string; building?: string }>>([]);
  const [boxMode, setBoxMode] = useState<"existing" | "new">("existing");
  const [buildingMode, setBuildingMode] = useState<"existing" | "new">("existing");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/customers?region=all")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load existing box/building values.");
        const payload = (await response.json()) as {
          customers: Array<{ boxNumber?: string; building?: string }>;
        };
        setAllCustomers(payload.customers ?? []);
      })
      .catch(() => setAllCustomers([]));
  }, []);

  const boxOptions = useMemo(
    () => Array.from(new Set(allCustomers.map((c) => String(c.boxNumber ?? "").trim()).filter(Boolean))),
    [allCustomers]
  );
  const buildingOptions = useMemo(
    () => Array.from(new Set(allCustomers.map((c) => String(c.building ?? "").trim()).filter(Boolean))),
    [allCustomers]
  );

  async function onSubmit() {
    if (!fullName.trim()) {
      setMessage("Full name is required.");
      return;
    }
    if ((billingType === "amp-only" || billingType === "both") && !(Number(subscribedAmpere) > 0)) {
      setMessage("Subscribed ampere must be a positive number for amp-only/both billing.");
      return;
    }
    if (billingType === "fixed-monthly" && !(Number(fixedMonthlyAmount) > 0)) {
      setMessage("Fixed monthly amount must be a positive number for fixed-monthly billing.");
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          region,
          billingType,
          phone,
          boxNumber,
          building,
          status: "active",
          mode: "customer",
          subscribedAmpere:
            billingType === "amp-only" || billingType === "both" ? Number(subscribedAmpere) : undefined,
          fixedMonthlyAmount: billingType === "fixed-monthly" ? Number(fixedMonthlyAmount) : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to create customer.");
        return;
      }
      router.push("/employee/customers");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell title="Add Customer" subtitle="Create a new customer record" navItems={employeeNavItems}>
      <Link href="/employee/dashboard" className="back-link">
        ← Back to Dashboard
      </Link>
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label>
            Full Name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Test" />
          </label>
          <label>
            Region
            <select value={region} onChange={(e) => setRegion(e.target.value as "mrah" | "printania")}>
              <option value="mrah">mrah</option>
              <option value="printania">printania</option>
            </select>
          </label>
          <label>
            Billing Type
            <select
              value={billingType}
              onChange={(e) =>
                setBillingType(e.target.value as "fixed-monthly" | "metered" | "amp-only" | "both" | "free")
              }
            >
              <option value="both">both</option>
              <option value="fixed-monthly">fixed-monthly</option>
              <option value="free">free</option>
            </select>
          </label>
          {billingType === "amp-only" || billingType === "both" ? (
            <label>
              Subscribed Ampere (A)
              <input
                type="number"
                value={subscribedAmpere}
                onChange={(e) => setSubscribedAmpere(e.target.value)}
                placeholder="e.g. 10"
              />
            </label>
          ) : null}
          {billingType === "fixed-monthly" ? (
            <label>
              Fixed Monthly Amount (LBP)
              <input
                type="number"
                value={fixedMonthlyAmount}
                onChange={(e) => setFixedMonthlyAmount(e.target.value)}
                placeholder="e.g. 500000"
              />
            </label>
          ) : null}
          <label>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961..." />
          </label>
          <label>
            Box
            {boxMode === "existing" ? (
              <select value={boxNumber} onChange={(e) => setBoxNumber(e.target.value)}>
                <option value="">Select existing box</option>
                {boxOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input value={boxNumber} onChange={(e) => setBoxNumber(e.target.value)} placeholder="New box value" />
            )}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setBoxMode((m) => (m === "existing" ? "new" : "existing"));
                setBoxNumber("");
              }}
            >
              {boxMode === "existing" ? "Add New Box" : "Use Existing Box"}
            </button>
          </label>
          <label>
            Building
            {buildingMode === "existing" ? (
              <select value={building} onChange={(e) => setBuilding(e.target.value)}>
                <option value="">Select existing building</option>
                {buildingOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="New building value" />
            )}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setBuildingMode((m) => (m === "existing" ? "new" : "existing"));
                setBuilding("");
              }}
            >
              {buildingMode === "existing" ? "Add New Building" : "Use Existing Building"}
            </button>
          </label>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Customer number is auto-generated by the system (`C-XXXX`).
        </p>
        {message ? <p className="muted">{message}</p> : null}
        <div className="card-actions-right">
          <button type="button" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Customer"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
