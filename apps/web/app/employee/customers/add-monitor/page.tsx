"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../_components/app-shell";
import { employeeNavItems } from "../../../_components/role-nav";
import { SimilarValueGuard } from "../../../_components/similar-value-guard";
import { MultiSelect } from "../../../_components/multi-select";

export default function EmployeeAddMonitorPage() {
  const router = useRouter();
  const [monitorName, setMonitorName] = useState("");
  const [nameBlocking, setNameBlocking] = useState(false);
  const [monitorCategory, setMonitorCategory] = useState<"theft-controller" | "elevator">("elevator");
  const [startingCounter, setStartingCounter] = useState("0");
  const [linkedCustomerIds, setLinkedCustomerIds] = useState<string[]>([]);
  const [customerOptions, setCustomerOptions] = useState<
    Array<{ id: string; fullName: string; customerNumber: string; region: string; boxNumber: string }>
  >([]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/customers?region=all&status=active&view=customers")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load customers.");
        const payload = (await response.json()) as {
          customers?: Array<{
            id: string;
            fullName: string;
            customerNumber: string;
            region?: string;
            boxNumber?: string;
          }>;
        };
        setCustomerOptions(
          (payload.customers ?? []).map((customer) => ({
            id: customer.id,
            fullName: customer.fullName,
            customerNumber: customer.customerNumber,
            region: customer.region ?? "-",
            boxNumber: customer.boxNumber ?? "-",
          }))
        );
      })
      .catch(() => setCustomerOptions([]));
  }, []);

  const linkedCustomers = customerOptions.filter((customer) => linkedCustomerIds.includes(customer.id));

  async function onSubmit() {
    if (!monitorName.trim() || linkedCustomerIds.length === 0) {
      setMessage("Monitor name and at least one linked customer are required.");
      return;
    }
    if (nameBlocking) {
      setMessage("Confirm the monitor name above before creating.");
      return;
    }
    if (startingCounter.trim() !== "" && Number(startingCounter) < 0) {
      setMessage("Starting counter can't be negative.");
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: monitorName,
          region: "mrah",
          billingType: "metered",
          status: "active",
          mode: "monitor",
          monitorName,
          monitorCategory,
          linkedCustomerIds,
          startingCounter: Number(startingCounter || "0"),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to create monitor customer.");
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
    <AppShell title="Add Monitor" subtitle="Create a monitor-linked customer" navItems={employeeNavItems}>
      <Link href="/employee/dashboard" className="back-link">
        ← Back to Dashboard
      </Link>
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label>
            Monitor Name
            <input value={monitorName} onChange={(e) => setMonitorName(e.target.value)} placeholder="Building Elevator Monitor" />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Linked Customers
            <MultiSelect
              options={customerOptions.map((customer) => ({
                id: customer.id,
                label: customer.fullName,
                sublabel: customer.customerNumber,
              }))}
              selectedIds={linkedCustomerIds}
              onChange={setLinkedCustomerIds}
              searchPlaceholder="Search by name or customer number..."
              emptyMessage="No customers available to link."
            />
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Check every customer this monitor covers (e.g. all apartments sharing an elevator meter).
            </p>
          </label>
          <label>
            Category
            <select
              value={monitorCategory}
              onChange={(e) => setMonitorCategory(e.target.value as "theft-controller" | "elevator")}
            >
              <option value="elevator">elevator</option>
              <option value="theft-controller">theft-controller</option>
            </select>
          </label>
          <label>
            Region
            <input value={linkedCustomers[0]?.region ?? "-"} readOnly disabled />
          </label>
          <label>
            Box
            <input
              value={linkedCustomers.length ? linkedCustomers.map((c) => c.boxNumber).join(", ") : "-"}
              readOnly
              disabled
            />
          </label>
          <label>
            Starting Counter (kWh)
            <input
              type="number"
              value={startingCounter}
              onChange={(e) => setStartingCounter(e.target.value)}
              placeholder="0"
            />
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Leave at 0 for a brand-new monitor. Set to its real current meter reading if it&apos;s already running.
            </p>
          </label>
        </div>
        <SimilarValueGuard
          label="customer/monitor name"
          value={monitorName}
          candidates={customerOptions.map((c) => c.fullName)}
          onUseExisting={(existing) => setMonitorName(existing)}
          onBlockingChange={setNameBlocking}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          Monitor customer number is auto-generated by the system (`M-XXXX`).
        </p>
        {message ? <p className="muted">{message}</p> : null}
        <div className="card-actions-right">
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || nameBlocking}
            title={nameBlocking ? "Confirm the monitor name above first" : undefined}
          >
            {isSubmitting ? "Creating..." : "Create Monitor"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
