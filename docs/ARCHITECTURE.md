# V2 Architecture (Draft)

## Runtime
- Frontend/API: Next.js (App Router)
- Deployment: Vercel
- Database: Supabase Postgres
- File storage: existing blob storage path

## Main Domains
- Customers
- Bills
- Payments
- Billing batches (draft/review/approve)
- Generator monthly readings (per region)
- Reports and KPIs

## Role Model
- Manager
  - approves monthly billing batches
  - manages settings and reports
  - enters generator kWh per month/region
- Employee
  - records payments and receipts
  - enters monthly bills
  - submits batches for manager review
  - limited customer edits

## Billing Lifecycle
- `draft`
- `pending_review`
- `changes_requested`
- `approved_posted`
