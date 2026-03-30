import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { bot } from "@/lib/bot";
import type { Lead, Agent } from "@/types";
import { LEAD_STATUS_VALUES } from "@/types";

export const dynamic = "force-dynamic";

export const runtime = "nodejs";
const DM_TIMEOUT_MS = 5000;

function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out during ${label}`)), ms);
  });
}

export async function GET(request: Request) {
  console.info("cron:stale-leads:start");

  // Verify cron secret — fail closed if CRON_SECRET is not configured
  if (!process.env.CRON_SECRET) {
    console.error("cron:stale-leads:error CRON_SECRET is not set");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const authHeader = request.headers.get("Authorization");
  const expectedAuthHeader = `Bearer ${process.env.CRON_SECRET}`;
  const providedBuffer = Buffer.from(authHeader ?? "");
  const expectedBuffer = Buffer.from(expectedAuthHeader);
  const isAuthorized =
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);

  if (!isAuthorized) {
    console.warn("cron:stale-leads:unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find leads not contacted in 7+ days, excluding closed leads
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: rawLeads, error } = await supabase
    .from("leads")
    .select("*, assigned_agent:agents(*)")
    .lt("last_contacted_at", sevenDaysAgoIso)
    .not(
      "status",
      "in",
      `(${LEAD_STATUS_VALUES.filter(
        (s) => s === "closed_won" || s === "closed_lost",
      )
        .map((s) => `"${s}"`)
        .join(",")})`,
    )
    .order("last_contacted_at", { ascending: true });
  const staleLeads = rawLeads as
    | (Lead & { assigned_agent: Agent | null })[]
    | null;

  if (error) {
    console.error("cron:stale-leads:error", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staleLeads || staleLeads.length === 0) {
    console.info("cron:stale-leads:success", { notified: 0, staleLeads: 0 });
    return NextResponse.json({ ok: true, notified: 0 });
  }

  // Group by assigned agent
  const byAgent = new Map<string, { agent: Agent; leads: Lead[] }>();
  for (const lead of staleLeads) {
    const agent = lead.assigned_agent as Agent;
    if (!agent?.slack_user_id) continue;
    if (!byAgent.has(agent.id)) {
      byAgent.set(agent.id, { agent, leads: [] });
    }
    byAgent.get(agent.id)!.leads.push(lead as Lead);
  }

  const now = new Date();

  const results = await Promise.allSettled(
    Array.from(byAgent.values()).map(async ({ agent, leads }) => {
      const lines = leads.map((lead) => {
        const lastContacted = new Date(lead.last_contacted_at);
        const daysAgo = Math.floor(
          (now.getTime() - lastContacted.getTime()) / (1000 * 60 * 60 * 24),
        );
        const budgetFormatted =
          lead.budget_aed >= 1_000_000
            ? `AED ${(lead.budget_aed / 1_000_000).toFixed(1)}M`
            : `AED ${lead.budget_aed.toLocaleString()}`;
        return `• ${lead.full_name} — ${budgetFormatted}, ${lead.status} (last contact ${daysAgo} days ago)`;
      });

      const message = [
        `Good morning ${agent.full_name}! You have ${leads.length} lead${leads.length === 1 ? "" : "s"} with no contact in 7+ days:`,
        ...lines,
        "",
        "Reply here or mention @Kaizen in any channel to take action.",
      ].join("\n");

      const dmThread = await Promise.race([
        bot.openDM(agent.slack_user_id),
        timeoutAfter(DM_TIMEOUT_MS, `openDM for ${agent.slack_user_id}`),
      ]);

      await Promise.race([
        dmThread.post(message),
        timeoutAfter(DM_TIMEOUT_MS, `post DM for ${agent.slack_user_id}`),
      ]);
    }),
  );

  let notified = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      notified++;
    } else {
      const agent = Array.from(byAgent.values())[i].agent;
      console.error("cron:stale-leads:dm-failed", {
        slackUserId: agent.slack_user_id,
        reason: String(result.reason),
      });
    }
  }

  console.info("cron:stale-leads:success", {
    notified,
    staleLeads: staleLeads.length,
  });
  return NextResponse.json({ ok: true, notified });
}
