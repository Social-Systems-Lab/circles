import { RRule } from "rrule";
import type { Recurrence } from "@/models/models";

const OCCURRENCE_ROUTE_ID_PATTERN = /^([a-f\d]{24})_(\d+)$/i;
const MONGODB_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export type EventOccurrenceKey = number;

export type EventOccurrenceIdentity = {
    seriesId: string;
    occurrenceId: string;
    occurrenceTimestamp: number;
    occurrenceKey: EventOccurrenceKey;
    originalStartAt: Date;
};

export type ResolvedEventOccurrence = EventOccurrenceIdentity & {
    startAt: Date;
    endAt: Date;
    isRecurringInstance: true;
};

type RecurringSchedule = {
    startAt: Date | string;
    endAt: Date | string;
    recurrence: Recurrence;
};

function isValidSeriesId(seriesId: string): boolean {
    return MONGODB_OBJECT_ID_PATTERN.test(seriesId);
}

function isValidOccurrenceTimestamp(timestamp: number): boolean {
    return Number.isSafeInteger(timestamp) && timestamp >= 0 && !Number.isNaN(new Date(timestamp).getTime());
}

function normalizeRecurringUntil(endDate?: Date | string): Date | undefined {
    if (!endDate) return undefined;
    const parsed = new Date(endDate);
    if (Number.isNaN(parsed.getTime())) return undefined;
    if (
        parsed.getUTCHours() === 0 &&
        parsed.getUTCMinutes() === 0 &&
        parsed.getUTCSeconds() === 0 &&
        parsed.getUTCMilliseconds() === 0
    ) {
        parsed.setUTCHours(23, 59, 59, 999);
    }
    return parsed;
}

function buildRecurrenceRule(schedule: Pick<RecurringSchedule, "startAt" | "recurrence">): RRule | null {
    const startAt = new Date(schedule.startAt);
    if (Number.isNaN(startAt.getTime())) return null;

    const { frequency, interval, endDate, count } = schedule.recurrence;
    const frequencyMap = {
        daily: RRule.DAILY,
        weekly: RRule.WEEKLY,
        monthly: RRule.MONTHLY,
        yearly: RRule.YEARLY,
    } as const;

    return new RRule({
        freq: frequencyMap[frequency],
        interval,
        dtstart: startAt,
        until: normalizeRecurringUntil(endDate),
        count,
    });
}

export function parseEventOccurrenceId(value: string): EventOccurrenceIdentity | null {
    const match = OCCURRENCE_ROUTE_ID_PATTERN.exec(value);
    if (!match || !isValidSeriesId(match[1])) return null;

    const occurrenceTimestamp = Number(match[2]);
    if (!isValidOccurrenceTimestamp(occurrenceTimestamp)) return null;

    const originalStartAt = new Date(occurrenceTimestamp);
    return {
        seriesId: match[1],
        occurrenceId: value,
        occurrenceTimestamp,
        occurrenceKey: occurrenceTimestamp,
        originalStartAt,
    };
}

export function formatEventOccurrenceId(seriesId: string, originalStartAt: Date): string {
    const occurrenceTimestamp = originalStartAt.getTime();
    if (!isValidSeriesId(seriesId) || !isValidOccurrenceTimestamp(occurrenceTimestamp)) {
        throw new Error("Invalid event occurrence identity");
    }
    return `${seriesId}_${occurrenceTimestamp}`;
}

export function isEventOccurrenceId(value: string): boolean {
    return parseEventOccurrenceId(value) !== null;
}

export function getRecurringOccurrenceStarts(
    schedule: Pick<RecurringSchedule, "startAt" | "recurrence">,
    range: { from: Date; to: Date },
): Date[] {
    const rule = buildRecurrenceRule(schedule);
    if (!rule || Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime())) return [];
    return rule.between(range.from, range.to, true);
}

export function isGeneratedEventOccurrence(
    schedule: Pick<RecurringSchedule, "startAt" | "recurrence">,
    originalStartAt: Date,
): boolean {
    if (!isValidOccurrenceTimestamp(originalStartAt.getTime())) return false;
    const rule = buildRecurrenceRule(schedule);
    if (!rule) return false;
    const generated = rule.before(originalStartAt, true);
    return generated?.getTime() === originalStartAt.getTime();
}

export function resolveEventOccurrence(
    seriesId: string,
    schedule: Pick<RecurringSchedule, "startAt" | "endAt">,
    originalStartAt: Date,
    override?: { startAt?: Date; endAt?: Date },
): ResolvedEventOccurrence {
    const occurrenceId = formatEventOccurrenceId(seriesId, originalStartAt);
    const seriesStart = new Date(schedule.startAt);
    const seriesEnd = new Date(schedule.endAt);
    const duration = seriesEnd.getTime() - seriesStart.getTime();
    const effectiveStart = override?.startAt ? new Date(override.startAt) : new Date(originalStartAt);
    const effectiveEnd = override?.endAt ? new Date(override.endAt) : new Date(effectiveStart.getTime() + duration);

    if (
        Number.isNaN(seriesStart.getTime()) ||
        Number.isNaN(seriesEnd.getTime()) ||
        Number.isNaN(effectiveStart.getTime()) ||
        Number.isNaN(effectiveEnd.getTime())
    ) {
        throw new Error("Invalid event occurrence schedule");
    }

    return {
        seriesId,
        occurrenceId,
        occurrenceTimestamp: originalStartAt.getTime(),
        occurrenceKey: originalStartAt.getTime(),
        originalStartAt: new Date(originalStartAt),
        startAt: effectiveStart,
        endAt: effectiveEnd,
        isRecurringInstance: true,
    };
}

export function buildRecurringOccurrenceDisplay<T extends { _id?: unknown; startAt: Date; endAt: Date }>(
    event: T,
    originalStartAt: Date,
    override?: { startAt?: Date; endAt?: Date },
): T & ResolvedEventOccurrence {
    const seriesId = String(event._id ?? "");
    const occurrence = resolveEventOccurrence(seriesId, event, originalStartAt, override);
    return {
        ...event,
        ...occurrence,
        _id: occurrence.occurrenceId,
    };
}
