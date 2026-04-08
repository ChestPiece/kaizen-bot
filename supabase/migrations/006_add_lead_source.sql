-- Migration 006: add source column to leads
-- Tracks bot-originated leads vs. other channels
-- Required by design doc as pre-deployment success measurement
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source TEXT;
