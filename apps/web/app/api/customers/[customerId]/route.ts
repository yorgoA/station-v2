import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

const EMPLOYEE_EDITABLE_CUSTOMER_FIELDS = new Set(["phone", "boxNumber", "building", "status"]);

type PatchBody =
  | {
      section: "customer";
      fullName?: string;
      customerNumber?: string;
      phone?: string;
      boxNumber?: string;
      building?: string;
      status?: string;
      linkedCustomerId?: string;
      /** Metering plan + free flag; only managers should send this from UI. */
      billingPlan?: "free" | "metered" | "fixed-monthly";
    }
  | {
      section: "bill";
      billId: string;
      previousCounter?: number;
      newCounter?: number;
      amount?: number;
      remainingAmount?: number;
      status?: string;
    }
  | {
      section: "payment";
      paymentId: string;
      amount?: number;
      paymentDate?: string;
      receiptRef?: string;
    };

export async function GET(
  _request: Request,
  { params }: { params: { customerId: string } }
) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const supabase = createSupabaseAdminClient();
    const customerId = params.customerId;

    const [customerRes, billsRes, paymentsRes] = await Promise.all([
      supabase
        .from("customers")
        .select(
          "id, customer_number, full_name, phone, box_number, building, status, is_free_customer, monitor_id, regions!inner(code), billing_types(key)"
        )
        .eq("id", customerId)
        .single(),
      supabase
        .from("bills")
        .select("id, month_key, previous_counter, new_counter, consumption_kwh, amount, remaining_amount, status")
        .eq("customer_id", customerId)
        .order("month_key", { ascending: false }),
      supabase
        .from("payments")
        .select("id, amount, payment_date, receipt_image_url")
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false }),
    ]);

    if (customerRes.error) {
      return NextResponse.json({ error: customerRes.error.message }, { status: 500 });
    }
    if (!customerRes.data) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (billsRes.error) {
      return NextResponse.json({ error: billsRes.error.message }, { status: 500 });
    }
    if (paymentsRes.error) {
      return NextResponse.json({ error: paymentsRes.error.message }, { status: 500 });
    }

    const c = customerRes.data as Record<string, unknown>;
    const regionNode = c.regions as { code?: string } | Array<{ code?: string }> | null;
    const regionCode = Array.isArray(regionNode)
      ? String(regionNode[0]?.code ?? "")
      : String(regionNode?.code ?? "");
    const btNode = c.billing_types as { key?: string } | Array<{ key?: string }> | null;
    const btKey = Array.isArray(btNode) ? String(btNode[0]?.key ?? "") : String(btNode?.key ?? "");
    const monitorId = String(c.monitor_id ?? "");
    const isMonitor = String(c.customer_number ?? "").startsWith("M-");

    let linkedCustomerId = "";
    let linkedCustomerName = "";
    if (isMonitor && monitorId) {
      const { data: linkedRow } = await supabase
        .from("customers")
        .select("id, full_name, customer_number")
        .eq("monitor_id", monitorId)
        .neq("id", customerId)
        .not("customer_number", "like", "M-%")
        .limit(1)
        .maybeSingle();
      if (linkedRow) {
        linkedCustomerId = String(linkedRow.id ?? "");
        linkedCustomerName = `${String(linkedRow.full_name ?? "")} (${String(linkedRow.customer_number ?? "")})`;
      }
    }

    return NextResponse.json({
      customer: {
        id: String(c.id ?? ""),
        customerNumber: String(c.customer_number ?? ""),
        fullName: String(c.full_name ?? ""),
        phone: String(c.phone ?? ""),
        boxNumber: String(c.box_number ?? ""),
        building: String(c.building ?? ""),
        status: String(c.status ?? "active"),
        region: regionCode || "mrah",
        billingType: Boolean(c.is_free_customer) ? "free" : btKey || "metered",
        isMonitor,
        linkedCustomerId,
        linkedCustomerName,
      },
      bills:
        (billsRes.data ?? []).map((b) => ({
          id: b.id,
          monthKey: b.month_key,
          previousCounter: Number(b.previous_counter ?? 0),
          newCounter: Number(b.new_counter ?? 0),
          consumptionKwh: Number(b.consumption_kwh ?? 0),
          amount: Number(b.amount ?? 0),
          remainingAmount: Number(b.remaining_amount ?? 0),
          status: String(b.status ?? "unpaid"),
        })) ?? [],
      payments:
        (paymentsRes.data ?? []).map((p) => ({
          id: p.id,
          amount: Number(p.amount ?? 0),
          paymentDate: String(p.payment_date ?? ""),
          receiptRef: String(p.receipt_image_url ?? ""),
        })) ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { customerId: string } }
) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as PatchBody;

    if (body.section === "bill" || body.section === "payment") {
      if (auth.actor.role !== "manager") {
        return NextResponse.json(
          { error: "Only a manager can edit bill or payment records directly." },
          { status: 403 }
        );
      }
    }

    if (body.section === "customer" && auth.actor.role === "employee") {
      const requestedFields = Object.keys(body).filter((key) => key !== "section");
      const disallowed = requestedFields.filter((key) => !EMPLOYEE_EDITABLE_CUSTOMER_FIELDS.has(key));
      if (disallowed.length > 0) {
        return NextResponse.json(
          { error: `Employees can only edit phone, boxNumber, building, and status. Not allowed: ${disallowed.join(", ")}.` },
          { status: 403 }
        );
      }
    }

    const supabase = createSupabaseAdminClient();
    const customerId = params.customerId;

    if (body.section === "customer") {
      const payload: Record<string, unknown> = {};
      if (body.fullName !== undefined) payload.full_name = body.fullName;
      if (body.customerNumber !== undefined) payload.customer_number = body.customerNumber;
      if (body.phone !== undefined) payload.phone = body.phone;
      if (body.boxNumber !== undefined) payload.box_number = body.boxNumber;
      if (body.building !== undefined) payload.building = body.building;
      if (body.status !== undefined) payload.status = body.status;
      if (body.billingPlan !== undefined) {
        if (body.billingPlan === "free") {
          payload.is_free_customer = true;
        } else {
          payload.is_free_customer = false;
          const billingKey = body.billingPlan === "fixed-monthly" ? "fixed-monthly" : "metered";
          const { data: billingTypeRow, error: billingTypeLookupError } = await supabase
            .from("billing_types")
            .select("id")
            .eq("key", billingKey)
            .maybeSingle();
          if (billingTypeLookupError) {
            return NextResponse.json({ error: billingTypeLookupError.message }, { status: 500 });
          }
          if (billingTypeRow?.id) payload.billing_type_id = billingTypeRow.id as string;
        }
      }
      if (body.linkedCustomerId !== undefined) {
        const linkedId = body.linkedCustomerId.trim();
        if (!linkedId) {
          payload.monitor_id = null;
        } else {
          const { data: linkedCustomer, error: linkedError } = await supabase
            .from("customers")
            .select("id, full_name, region_id, monitor_id")
            .eq("id", linkedId)
            .single();
          if (linkedError || !linkedCustomer) {
            return NextResponse.json({ error: "Linked customer not found." }, { status: 400 });
          }
          let nextMonitorId = linkedCustomer.monitor_id ? String(linkedCustomer.monitor_id) : "";
          if (!nextMonitorId) {
            const { data: createdMonitor, error: createMonitorError } = await supabase
              .from("monitors")
              .insert({
                region_id: linkedCustomer.region_id,
                name: `${String(linkedCustomer.full_name ?? "Linked Customer")} Monitor`,
                is_active: true,
              })
              .select("id")
              .single();
            if (createMonitorError || !createdMonitor) {
              return NextResponse.json(
                { error: createMonitorError?.message ?? "Failed to create monitor for linked customer." },
                { status: 500 }
              );
            }
            nextMonitorId = String(createdMonitor.id);
            const { error: updateLinkedError } = await supabase
              .from("customers")
              .update({ monitor_id: nextMonitorId })
              .eq("id", linkedId);
            if (updateLinkedError) {
              return NextResponse.json({ error: updateLinkedError.message }, { status: 500 });
            }
          }
          payload.monitor_id = nextMonitorId;
        }
      }
      const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.section === "bill") {
      const payload: Record<string, unknown> = {};
      if (body.previousCounter !== undefined) payload.previous_counter = body.previousCounter;
      if (body.newCounter !== undefined) payload.new_counter = body.newCounter;
      if (body.previousCounter !== undefined || body.newCounter !== undefined) {
        const prev = Number(body.previousCounter ?? 0);
        const next = Number(body.newCounter ?? prev);
        payload.consumption_kwh = Math.max(0, next - prev);
      }
      if (body.amount !== undefined) payload.amount = body.amount;
      if (body.remainingAmount !== undefined) payload.remaining_amount = body.remainingAmount;
      if (body.status !== undefined) payload.status = body.status;
      const { error } = await supabase.from("bills").update(payload).eq("id", body.billId).eq("customer_id", customerId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.section === "payment") {
      const payload: Record<string, unknown> = {};
      if (body.amount !== undefined) payload.amount = body.amount;
      if (body.paymentDate !== undefined) payload.payment_date = body.paymentDate;
      if (body.receiptRef !== undefined) payload.receipt_image_url = body.receiptRef;
      const { error } = await supabase.from("payments").update(payload).eq("id", body.paymentId).eq("customer_id", customerId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid patch request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
