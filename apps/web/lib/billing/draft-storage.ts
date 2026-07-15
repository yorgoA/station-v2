import type { BillingEntryRow } from "../types/billing";

const DB_NAME = "station_v2_billing_drafts";
const DB_VERSION = 1;
const IMAGE_STORE = "draft_images";
const LOCAL_DRAFT_IMAGE_MARKER = "__local_draft__";

function draftRowsKey(monthKey: string, region: string) {
  return `billing_draft:${monthKey}|${region}`;
}

function draftImagesKey(monthKey: string, region: string) {
  return `${monthKey}|${region}`;
}

function openImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser."));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open draft image database."));
  });
}

/** Keep filenames / short server paths only — never base64 in localStorage. */
export function normalizeCounterImageNameForDraft(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  if (value === LOCAL_DRAFT_IMAGE_MARKER) return value;
  if (value.startsWith("data:image/") || value.includes("data:image/")) return undefined;
  if (value.length > 256) return undefined;
  return value;
}

export function toStorableDraftRows(rows: BillingEntryRow[]): BillingEntryRow[] {
  return rows.map((row) => ({
    ...row,
    counterImageName: normalizeCounterImageNameForDraft(row.counterImageName),
  }));
}

export function applyDraftImagesToRows(
  rows: BillingEntryRow[],
  images: Record<string, string>
): BillingEntryRow[] {
  return rows.map((row) => {
    if (!images[row.id]) return row;
    if (normalizeCounterImageNameForDraft(row.counterImageName)) return row;
    return { ...row, counterImageName: LOCAL_DRAFT_IMAGE_MARKER };
  });
}

export function readBillingDraftRows(monthKey: string, region: string): BillingEntryRow[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(draftRowsKey(monthKey, region));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BillingEntryRow[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    window.localStorage.removeItem(draftRowsKey(monthKey, region));
    return null;
  }
}

export function writeBillingDraftRows(monthKey: string, region: string, rows: BillingEntryRow[]): boolean {
  if (typeof window === "undefined") return false;
  const key = draftRowsKey(monthKey, region);
  const storable = toStorableDraftRows(rows);
  try {
    window.localStorage.setItem(key, JSON.stringify(storable));
    return true;
  } catch {
    const minimal = storable.map((row) => ({
      id: row.id,
      customerNumber: row.customerNumber,
      customerName: row.customerName,
      regionCode: row.regionCode,
      previousCounter: row.previousCounter,
      newCounter: row.newCounter,
      billingType: row.billingType,
      isFreeCustomer: row.isFreeCustomer,
      isMonitor: row.isMonitor,
      obligatoryLinkedToCustomerNumber: row.obligatoryLinkedToCustomerNumber,
    }));
    try {
      window.localStorage.setItem(key, JSON.stringify(minimal));
      return true;
    } catch {
      return false;
    }
  }
}

export async function readBillingDraftImages(
  monthKey: string,
  region: string
): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const db = await openImageDb();
    return await new Promise<Record<string, string>>((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE, "readonly");
      const request = tx.objectStore(IMAGE_STORE).get(draftImagesKey(monthKey, region));
      request.onsuccess = () => {
        const value = request.result;
        resolve(value && typeof value === "object" ? (value as Record<string, string>) : {});
      };
      request.onerror = () => reject(request.error ?? new Error("Failed to read draft images."));
    });
  } catch {
    return {};
  }
}

export async function writeBillingDraftImages(
  monthKey: string,
  region: string,
  images: Record<string, string>
): Promise<void> {
  if (typeof window === "undefined") return;
  const keys = Object.keys(images);
  if (keys.length === 0) {
    await clearBillingDraftImages(monthKey, region);
    return;
  }
  const db = await openImageDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, "readwrite");
    const request = tx.objectStore(IMAGE_STORE).put(images, draftImagesKey(monthKey, region));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to save draft images."));
  });
}

export async function clearBillingDraftImages(monthKey: string, region: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openImageDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE, "readwrite");
      const request = tx.objectStore(IMAGE_STORE).delete(draftImagesKey(monthKey, region));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Failed to clear draft images."));
    });
  } catch {
    // ignore
  }
}

export async function clearBillingDraft(monthKey: string, region: string): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftRowsKey(monthKey, region));
  await clearBillingDraftImages(monthKey, region);
}

/** Remove legacy drafts that embedded base64 images in localStorage. */
export function pruneOversizedBillingDrafts(maxChars = 400_000): void {
  if (typeof window === "undefined") return;
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith("billing_draft:")) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    if (raw.length > maxChars || raw.includes("data:image/")) {
      window.localStorage.removeItem(key);
    }
  }
}
