-- =====================================================================
-- device_types seed data
-- This did NOT previously exist as a version-controlled file - the 16
-- original rows were only ever inserted live in Postgres (via Adminer
-- or similar), with no matching migration/seed script in this repo.
-- Captured here on 2026-08-05 so the lookup table is reproducible.
-- Includes the 17th row ("Storage") added the same day per confirmed
-- decision: Ext. HDD (56 rows in stg_assets_sheet) gets its own
-- category rather than falling into "Other"; every other previously
-- flagged item (HikVision NVR, IP Camera, Access Control ZKT Eco,
-- Paper Shreeder, TV, Projector, SMPS, Ext. SSD, HardDisk) stays in
-- "Other" - explicit decision, not an oversight.
-- Idempotent - safe to re-run.
-- =====================================================================

INSERT INTO device_types (name) VALUES
    ('Laptop'),
    ('Desktop'),
    ('Monitor'),
    ('Mobile'),
    ('Camera'),
    ('Mic'),
    ('Headset'),
    ('Keyboard'),
    ('Mouse'),
    ('Printer'),
    ('Router'),
    ('Switch'),
    ('Firewall'),
    ('Access Point'),
    ('UPS'),
    ('Other'),
    ('Storage')
ON CONFLICT (name) DO NOTHING;
