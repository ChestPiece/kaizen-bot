import { tool } from "ai";
import { z } from "zod";
import { executeGetMyLeads } from "./get-my-leads";
import { executeSearchLeads } from "./search-leads";
import { executeGetLeadDetail } from "./get-lead-detail";
import { executeUpdateLeadStatus } from "./update-lead-status";
import { executeAddNote } from "./add-note";
import { executeCreateLead } from "./create-lead";
import { executeSearchProperties } from "./search-properties";
import { LEAD_STATUS_VALUES } from "@/types";

function getAgentIdFromContext(
  context: unknown,
): { agentId: string } | { error: string } {
  const parsedContext = z
    .object({
      agentId: z.string().uuid(),
    })
    .safeParse(context);

  if (!parsedContext.success) {
    return {
      error:
        "Missing or invalid tool context. Please retry the request in the same Slack thread.",
    };
  }

  return { agentId: parsedContext.data.agentId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withContext(fn: (args: any, agentId: string) => Promise<unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (args: any, options: { experimental_context?: unknown }) => {
    const contextResult = getAgentIdFromContext(options.experimental_context);
    if ("error" in contextResult) return contextResult;
    return fn(args, contextResult.agentId);
  };
}

const getMyLeads = tool({
  description:
    "Use when the agent asks to view leads, pipeline, follow-ups, or client count. By default this returns team leads. Set assigned_only=true only when the user explicitly asks for leads assigned to themselves.",
  inputSchema: z.object({
    status: z
      .enum(LEAD_STATUS_VALUES)
      .optional()
      .describe(
        "Filter by lead status only when the user explicitly asks for a status.",
      ),
    assigned_only: z
      .boolean()
      .optional()
      .describe(
        "Set true only when user asks for only their assigned leads. Default false (team-wide).",
      ),
  }),
  execute: withContext((args, agentId) => executeGetMyLeads(args, agentId)),
});

const searchLeads = tool({
  description:
    "Use when searching for leads by name, phone, status, property type, or area. By default this searches team leads. Set assigned_only=true only if user explicitly asks for only their assigned leads.",
  inputSchema: z.object({
    query: z
      .string()
      .max(120)
      .optional()
      .describe(
        "Name or phone number to search for (case-insensitive partial match).",
      ),
    status: z
      .enum(LEAD_STATUS_VALUES)
      .optional()
      .describe("Filter by lead status."),
    property_type: z
      .enum(["residential", "commercial"])
      .optional()
      .describe("Filter by property type."),
    area: z
      .string()
      .max(120)
      .optional()
      .describe('Filter by preferred area (e.g. "Downtown", "JBR").'),
    assigned_only: z
      .boolean()
      .optional()
      .describe(
        "Set true only when user asks for only their assigned leads. Default false (team-wide).",
      ),
  }),
  execute: withContext((args, agentId) => executeSearchLeads(args, agentId)),
});

const getLeadDetail = tool({
  description:
    "Use when the agent wants full details about a specific lead — budget, nationality, notes history, or status. Requires a lead_id UUID. Call searchLeads first if you only have a name.",
  inputSchema: z.object({
    lead_id: z.string().uuid().describe("UUID of the lead to retrieve."),
  }),
  execute: withContext((args, agentId) => executeGetLeadDetail(args, agentId)),
});

const updateLeadStatus = tool({
  description:
    'Use when the agent wants to change the status of a lead — e.g. "mark as qualified", "close as won", "they dropped out". Optionally accepts a reason which gets logged as a note.',
  inputSchema: z.object({
    lead_id: z.string().uuid().describe("UUID of the lead to update."),
    new_status: z
      .enum(LEAD_STATUS_VALUES)
      .describe("The new status to set on the lead."),
    reason: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "Optional reason for the status change. Will be saved as a note on the lead.",
      ),
  }),
  execute: withContext((args, agentId) => executeUpdateLeadStatus(args, agentId)),
});

const addNote = tool({
  description:
    'Use when the agent wants to log a conversation, update, or any information about a lead — e.g. "I spoke with Ahmed", "he wants a 2BR in Downtown", "follow up next week". Also updates last_contacted_at.',
  inputSchema: z.object({
    lead_id: z.string().uuid().describe("UUID of the lead to add the note to."),
    content: z.string().min(1).max(2000).describe("The note content to save."),
  }),
  execute: withContext((args, agentId) => executeAddNote(args, agentId)),
});

const createLead = tool({
  description:
    "Use when the agent wants to add a new lead or client to the CRM. Requires name, phone, nationality, property type, intent, and budget. The lead will be assigned to the calling agent.",
  inputSchema: z.object({
    full_name: z.string().min(1).max(200).describe("Full name of the lead."),
    phone: z
      .string()
      .min(1)
      .max(30)
      .describe("Phone number including country code."),
    email: z.string().email().optional().describe("Email address (optional)."),
    nationality: z
      .string()
      .min(1)
      .max(100)
      .describe('Nationality of the lead (e.g. "UAE", "British", "Indian").'),
    property_type: z
      .enum(["residential", "commercial"])
      .describe("Type of property the lead is interested in."),
    intent: z
      .enum(["buy", "rent", "invest"])
      .describe("Lead's intent — buying, renting, or investing."),
    budget_aed: z
      .number()
      .positive()
      .describe("Budget in AED (e.g. 3000000 for 3M AED)."),
    preferred_areas: z
      .array(z.string().max(120))
      .optional()
      .describe('List of preferred areas (e.g. ["Downtown", "JBR"]).'),
    source: z
      .string()
      .max(120)
      .optional()
      .describe(
        'How the lead was acquired (e.g. "referral", "website", "Instagram").',
      ),
  }),
  execute: withContext((args, agentId) => executeCreateLead(args, agentId)),
});

const searchProperties = tool({
  description:
    "Use when an agent wants to find available property listings that match a client's requirements — e.g. '2 bedroom apartment in Dubai Marina', 'villa on Palm Jumeirah under 20M', 'commercial unit for investment in Business Bay'. Performs semantic similarity search across all listings.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(300)
      .describe(
        "Natural-language description of what the client is looking for (location, bedrooms, budget, property type, etc.).",
      ),
    intent: z
      .enum(["buy", "rent", "invest"])
      .optional()
      .describe("Filter by intent. Omit to search across all intents."),
    match_count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Number of results to return (default 5)."),
  }),
  // Intentionally omits experimental_context: properties are global CRM
  // inventory, not scoped to the calling agent. Any agent may search listings.
  execute: async (args) => {
    return executeSearchProperties(args);
  },
});

export const tools = {
  getMyLeads,
  searchLeads,
  getLeadDetail,
  updateLeadStatus,
  addNote,
  createLead,
  searchProperties,
};
