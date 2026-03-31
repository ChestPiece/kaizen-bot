// ─── Enums ────────────────────────────────────────────────────────────────────

export type AgentRole = "agent" | "manager" | "admin";

export type PropertyType = "residential" | "commercial";

export type LeadIntent = "buy" | "rent" | "invest";

export const LEAD_STATUS_VALUES = [
  "new",
  "contacted",
  "qualified",
  "negotiating",
  "closed_won",
  "closed_lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUS_VALUES)[number];

// ─── Database row types ────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  slack_user_id: string;
  full_name: string;
  email: string;
  role: AgentRole;
  created_at: string;
}

export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  nationality: string;
  property_type: PropertyType;
  intent: LeadIntent;
  budget_aed: number;
  preferred_areas: string[];
  status: LeadStatus;
  assigned_to: string;
  source: string | null;
  last_contacted_at: string;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  content: string;
  created_by: string;
  created_at: string;
}

export interface ThreadState {
  thread_id: string;
  lead_id: string | null;
  agent_id: string;
  message_history: CoreMessage[];
  updated_at: string;
}

// ─── Composite types ───────────────────────────────────────────────────────────

export interface LeadWithNotes extends Lead {
  notes: LeadNote[];
  assigned_agent: Agent;
}

// CoreMessage type (mirrors Vercel AI SDK's CoreMessage)
export interface CoreMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | unknown[];
}

export interface Property {
  id: string;
  title: string;
  description: string | null;
  property_type: PropertyType;
  intent: LeadIntent;
  area: string;
  bedrooms: number | null;
  bathrooms: number | null;
  size_sqft: number | null;
  price_aed: number;
  amenities: string[];
  status: "available" | "reserved" | "sold" | "rented";
  listed_by: string | null;
  created_at: string;
}

// ─── Tool argument interfaces ──────────────────────────────────────────────────

export interface GetMyLeadsArgs {
  status?: LeadStatus;
  assigned_only?: boolean;
}

export interface SearchLeadsArgs {
  query?: string;
  status?: LeadStatus;
  property_type?: PropertyType;
  area?: string;
  assigned_only?: boolean;
}

export interface GetLeadDetailArgs {
  lead_id: string;
}

export interface UpdateLeadStatusArgs {
  lead_id: string;
  new_status: LeadStatus;
  reason?: string;
}

export interface AddNoteArgs {
  lead_id: string;
  content: string;
}

export interface CreateLeadArgs {
  full_name: string;
  phone: string;
  email?: string;
  nationality: string;
  property_type: PropertyType;
  intent: LeadIntent;
  budget_aed: number;
  preferred_areas?: string[];
  source?: string;
}
