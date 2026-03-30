import { tool } from "ai";
import { z } from "zod";
import { executeGetMyLeads } from "./get-my-leads";
import { executeSearchLeads } from "./search-leads";
import { executeGetLeadDetail } from "./get-lead-detail";
import { executeUpdateLeadStatus } from "./update-lead-status";
import { executeAddNote } from "./add-note";
import { executeCreateLead } from "./create-lead";
import { LEAD_STATUS_VALUES } from "@/types";

const getMyLeads = tool({
  description:
    "Use when the agent asks about their own leads, pipeline, follow-ups, or how many clients they have. Returns leads assigned to the calling agent, sorted by least recently contacted first.",
  inputSchema: z.object({
    status: z
      .enum(LEAD_STATUS_VALUES)
      .optional()
      .describe("Filter by lead status. Omit to get all statuses."),
  }),
  execute: async (args, { experimental_context }) => {
    const { agentId } = experimental_context as { agentId: string };
    return executeGetMyLeads(args, agentId);
  },
});

const searchLeads = tool({
  description:
    "Use when searching for a specific lead by name or phone number, or filtering your own leads by status, property type, or area. Use this when the agent mentions a specific person or wants to find leads matching criteria.",
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
  }),
  execute: async (args, { experimental_context }) => {
    const { agentId } = experimental_context as { agentId: string };
    return executeSearchLeads(args, agentId);
  },
});

const getLeadDetail = tool({
  description:
    "Use when the agent wants full details about a specific lead — budget, nationality, notes history, or status. Requires a lead_id UUID. Call searchLeads first if you only have a name.",
  inputSchema: z.object({
    lead_id: z.string().uuid().describe("UUID of the lead to retrieve."),
  }),
  execute: async (args, { experimental_context }) => {
    const { agentId } = experimental_context as { agentId: string };
    return executeGetLeadDetail(args, agentId);
  },
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
  execute: async (args, { experimental_context }) => {
    const { agentId } = experimental_context as { agentId: string };
    return executeUpdateLeadStatus(args, agentId);
  },
});

const addNote = tool({
  description:
    'Use when the agent wants to log a conversation, update, or any information about a lead — e.g. "I spoke with Ahmed", "he wants a 2BR in Downtown", "follow up next week". Also updates last_contacted_at.',
  inputSchema: z.object({
    lead_id: z.string().uuid().describe("UUID of the lead to add the note to."),
    content: z.string().min(1).max(2000).describe("The note content to save."),
  }),
  execute: async (args, { experimental_context }) => {
    const { agentId } = experimental_context as { agentId: string };
    return executeAddNote(args, agentId);
  },
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
  execute: async (args, { experimental_context }) => {
    const { agentId } = experimental_context as { agentId: string };
    return executeCreateLead(args, agentId);
  },
});

export const tools = {
  getMyLeads,
  searchLeads,
  getLeadDetail,
  updateLeadStatus,
  addNote,
  createLead,
};
