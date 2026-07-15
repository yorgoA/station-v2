import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth/require-role";
import { inferReceiptImageMime } from "../../../../lib/receipts/receipt-image";
import { uploadReceiptImage } from "../../../../lib/receipts/receipt-upload";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee", "collector"]);
    if ("response" in auth) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = inferReceiptImageMime(file);
    const result = await uploadReceiptImage(buffer, mimeType);

    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
