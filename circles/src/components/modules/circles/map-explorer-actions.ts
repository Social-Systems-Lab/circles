"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getOpenEventsForMap, getOpenEventsForList } from "@/lib/data/event";
import { EventDisplay } from "@/models/models";

type RangeInput = { from?: string; to?: string };

/**
 * Fetch open events for map display.
 * - Only includes events with a geocoded location (lngLat) and stage === "open"
 * - If no range provided, defaults to upcoming events (endAt >= now)
 * - If range provided, returns events overlapping the window
 */
export async function getOpenEventsForMapAction(range?: RangeInput): Promise<EventDisplay[]> {
    try {
        const userDid = (await getAuthenticatedUserDid()) || "";
        const parsedRange =
            range && (range.from || range.to)
                ? {
                      from: range.from ? new Date(range.from) : undefined,
                      to: range.to ? new Date(range.to) : undefined,
                  }
                : undefined;

        const events = await getOpenEventsForMap(userDid, parsedRange as any);
        return events || [];
    } catch (err) {
        console.error("getOpenEventsForMapAction error:", err);
        return [];
    }
}

/**
 * Fetch open events for list display (includes virtual and non-geocoded events).
 * - Includes stage === "open"
 * - If no range provided, defaults to upcoming events (endAt >= now)
 * - If range provided, returns events overlapping the window
 * - Applies visibility gating and returns enriched EventDisplay
 */
export async function getOpenEventsForListAction(range?: RangeInput): Promise<EventDisplay[]> {
    try {
        const userDid = (await getAuthenticatedUserDid()) || "";
        const parsedRange =
            range && (range.from || range.to)
                ? {
                      from: range.from ? new Date(range.from) : undefined,
                      to: range.to ? new Date(range.to) : undefined,
                  }
                : undefined;

        const events = await getOpenEventsForList(userDid, parsedRange as any);
        return events || [];
    } catch (err) {
        console.error("getOpenEventsForListAction error:", err);
        return [];
    }
}
