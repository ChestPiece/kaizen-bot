-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE agent_role AS ENUM ('agent', 'manager', 'admin');
CREATE TYPE property_type AS ENUM ('residential', 'commercial');
CREATE TYPE lead_intent AS ENUM ('buy', 'rent', 'invest');
CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'negotiating',
  'closed_won',
  'closed_lost'
);

-- ─── agents ───────────────────────────────────────────────────────────────────

CREATE TABLE agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_user_id    TEXT NOT NULL UNIQUE,
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  role             agent_role NOT NULL DEFAULT 'agent',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_slack_user_id ON agents (slack_user_id);

-- ─── leads ────────────────────────────────────────────────────────────────────

CREATE TABLE leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT,
  nationality         TEXT NOT NULL,
  property_type       property_type NOT NULL,
  intent              lead_intent NOT NULL,
  budget_aed          NUMERIC NOT NULL,
  preferred_areas     TEXT[] NOT NULL DEFAULT '{}',
  status              lead_status NOT NULL DEFAULT 'new',
  assigned_to         UUID NOT NULL REFERENCES agents (id) ON DELETE RESTRICT,
  source              TEXT,
  last_contacted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_assigned_to        ON leads (assigned_to);
CREATE INDEX idx_leads_status             ON leads (status);
CREATE INDEX idx_leads_last_contacted_at  ON leads (last_contacted_at);

-- ─── lead_notes ───────────────────────────────────────────────────────────────

CREATE TABLE lead_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_by   UUID NOT NULL REFERENCES agents (id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_notes_lead_id ON lead_notes (lead_id);

-- ─── thread_state ─────────────────────────────────────────────────────────────

CREATE TABLE thread_state (
  thread_id        TEXT PRIMARY KEY,
  lead_id          UUID REFERENCES leads (id) ON DELETE SET NULL,
  agent_id         UUID NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  message_history  JSONB NOT NULL DEFAULT '[]',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
