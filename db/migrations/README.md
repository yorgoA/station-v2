# Migrations

`001_init_schema.sql` is a thin wrapper that includes `../schema.sql`.

## Run manually with psql

From this folder:

```bash
psql "$DATABASE_URL" -f 001_init_schema.sql
```

## Verify parity checks

```bash
psql "$DATABASE_URL" -v month_key="'2026-04'" -v region_code="'north'" -f ../verify_calculation_parity.sql
```

If you want all months/regions, omit `-v` variables.
