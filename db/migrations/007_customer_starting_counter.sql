-- Lets a new customer's first bill start from their real physical meter
-- reading instead of always assuming 0. Needed for onboarding an
-- already-existing customer (meter already at, say, 45,000) without billing
-- their entire historical consumption as one month. Defaults to 0, which is
-- correct for a genuinely brand-new subscriber -- existing customers/bills
-- are untouched by this migration.
alter table customers add column if not exists starting_counter numeric(14,3) not null default 0;
