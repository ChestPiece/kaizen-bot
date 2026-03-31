-- Migration 003: pgvector + properties table + semantic search RPCs

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Properties table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS properties (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  property_type property_type NOT NULL,
  intent        lead_intent   NOT NULL,
  area          TEXT        NOT NULL,
  bedrooms      INTEGER,                         -- NULL = studio or commercial
  bathrooms     INTEGER,
  size_sqft     INTEGER,
  price_aed     NUMERIC     NOT NULL,
  amenities     TEXT[]      NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'reserved', 'sold', 'rented')),
  listed_by     UUID        REFERENCES agents(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embedding     vector(1536)
);

CREATE INDEX ON properties USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX ON properties (status);
CREATE INDEX ON properties (area);
CREATE INDEX ON properties (property_type);

-- ─── Lead embeddings table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_embeddings (
  lead_id    UUID        PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  embedding  vector(1536) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Semantic search RPC: match_properties ─────────────────────────────────────

CREATE OR REPLACE FUNCTION match_properties(
  query_embedding  vector(1536),
  match_count      INT         DEFAULT 5,
  filter_status    TEXT        DEFAULT 'available',
  filter_intent    lead_intent DEFAULT NULL
)
RETURNS TABLE (
  id            UUID,
  title         TEXT,
  property_type TEXT,
  intent        TEXT,
  area          TEXT,
  bedrooms      INT,
  bathrooms     INT,
  size_sqft     INT,
  price_aed     NUMERIC,
  amenities     TEXT[],
  status        TEXT,
  similarity    FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.title,
    p.property_type::TEXT,
    p.intent::TEXT,
    p.area,
    p.bedrooms,
    p.bathrooms,
    p.size_sqft,
    p.price_aed,
    p.amenities,
    p.status,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM properties p
  WHERE
    (filter_status IS NULL OR p.status = filter_status)
    AND (filter_intent IS NULL OR p.intent = filter_intent)
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── Semantic search RPC: match_leads ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_leads(
  query_embedding vector(1536),
  match_count     INT DEFAULT 5
)
RETURNS TABLE (
  lead_id        UUID,
  full_name      TEXT,
  intent         TEXT,
  preferred_areas TEXT,
  budget_aed     NUMERIC,
  similarity     FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    l.id,
    l.full_name,
    l.intent::TEXT,
    array_to_string(l.preferred_areas, ', '),
    l.budget_aed,
    1 - (le.embedding <=> query_embedding) AS similarity
  FROM lead_embeddings le
  JOIN leads l ON l.id = le.lead_id
  ORDER BY le.embedding <=> query_embedding
  LIMIT match_count;
$$;
