import { RRule } from "rrule";
import type { EventDisplay, EventOccurrence, Recurrence } from "@/models/models";

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
    occurrenceStatus?: EventOccurrence["status"];
    isOccurrenceCancelled?: boolean;
};

type RecurringSchedule = {
    startAt: Date | string;
    endAt: Date | string;
    recurrence: Recurrence;
};

type PersistedOccurrenceState = Pick<EventOccurrence, "seriesId" | "occurrenceKey" | "originalStartAt" | "status">;

function isValidSeriesId(seriesId: string): boolean {
    return MONGODB_OBJECT_ID_PATTERN.test(seriesId);
}

export function isValidEventOccurrenceKey(timestamp: number): boolean {
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
    if (!isValidEventOccurrenceKey(occurrenceTimestamp)) return null;

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
    if (!isValidSeriesId(seriesId) || !isValidEventOccurrenceKey(occurrenceTimestamp)) {
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
    if (!isValidEventOccurrenceKey(originalStartAt.getTime())) return false;
    const rule = buildRecurrenceRule(schedule);
    if (!rule) return false;
    const generated = rule.before(originalStartAt, true);
    return generated?.getTime() === originalStartAt.getTime();
}

export function isMatchingEventOccurrenceState(
    identity: EventOccurrenceIdentity,
    occurrence: PersistedOccurrenceState | null | undefined,
): occurrence is PersistedOccurrenceState {
    return Boolean(
        occurrence &&
            occurrence.seriesId === identity.seriesId &&
            occurrence.occurrenceKey === identity.occurrenceKey &&
            occurrence.originalStartAt instanceof Date &&
            !Number.isNaN(occurrence.originalStartAt.getTime()) &&
            occurrence.originalStartAt.getTime() === occurrence.occurrenceKey &&
            occurrence.status === "cancelled",
    );
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

export function resolveGeneratedEventOccurrence(
    seriesId: string,
    schedule: RecurringSchedule,
    originalStartAt: Date,
    occurrence?: PersistedOccurrenceState | null,
): ResolvedEventOccurrence | null {
    if (!isGeneratedEventOccurrence(schedule, originalStartAt)) return null;

    const resolved = resolveEventOccurrence(seriesId, schedule, originalStartAt);
    if (!isMatchingEventOccurrenceState(resolved, occurrence)) return resolved;

    return {
        ...resolved,
        occurrenceStatus: occurrence.status,
        isOccurrenceCancelled: true,
    };
}

export function buildRecurringOccurrenceDisplay<T extends { _id?: unknown; startAt: Date; endAt: Date }>(
    event: T,
    originalStartAt: Date,
    override?: { startAt?: Date; endAt?: Date },
    persistedOccurrence?: PersistedOccurrenceState | null,
): T & ResolvedEventOccurrence {
    const seriesId = String(event._id ?? "");
    const resolved = resolveEventOccurrence(seriesId, event, originalStartAt, override);
    const occurrenceState = isMatchingEventOccurrenceState(resolved, persistedOccurrence)
        ? { occurrenceStatus: persistedOccurrence.status, isOccurrenceCancelled: true as const }
        : {};
    return {
        ...event,
        ...resolved,
        ...occurrenceState,
        _id: resolved.occurrenceId,
    };
}

export function expandRecurringOccurrenceDisplays<
    T extends { _id?: unknown; startAt: Date; endAt: Date; recurrence: Recurrence },
>(
    event: T,
    range: { from: Date; to: Date },
    occurrences: PersistedOccurrenceState[] = [],
): Array<T & ResolvedEventOccurrence> {
    const occurrenceByKey = new Map(occurrences.map((occurrence) => [occurrence.occurrenceKey, occurrence]));
    return getRecurringOccurrenceStarts(event, range).map((originalStartAt) =>
        buildRecurringOccurrenceDisplay(
            event,
            originalStartAt,
            undefined,
            occurrenceByKey.get(originalStartAt.getTime()),
        ),
    );
}

export function shouldShowCancelEventOccurrence(
    event: Pick<EventDisplay, "seriesId" | "occurrenceKey" | "isRecurringInstance" | "isOccurrenceCancelled" | "stage">,
    canManageEvent: boolean,
): boolean {
    return Boolean(
        canManageEvent &&
            event.isRecurringInstance &&
            event.seriesId &&
            isValidEventOccurrenceKey(event.occurrenceKey ?? Number.NaN) &&
            event.stage !== "cancelled" &&
            !event.isOccurrenceCancelled,
    );
}

export function buildEventOccurrenceCancellationUpsert(seriesId: string, occurrenceKey: number, now: Date) {
    return {
        filter: { seriesId, occurrenceKey },
        update: {
            $set: {
                seriesId,
                occurrenceKey,
                originalStartAt: new Date(occurrenceKey),
                status: "cancelled" as const,
                updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
        },
        options: { upsert: true as const },
    };
}
