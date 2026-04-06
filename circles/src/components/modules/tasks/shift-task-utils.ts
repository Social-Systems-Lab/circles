import { addMinutes } from "date-fns";
import { Circle, Task, TaskDisplay, TaskParticipant } from "@/models/models";

type ShiftTaskLike = Pick<
    Task,
    "participants" | "shiftDurationMinutes" | "shiftStartTime" | "slots" | "stage" | "targetDate" | "taskType"
>;

export const SHIFT_DURATION_OPTIONS = [
    { value: 30, label: "30 minutes" },
    { value: 60, label: "1 hour" },
    { value: 120, label: "2 hours" },
    { value: 180, label: "3 hours" },
    { value: 240, label: "4 hours" },
] as const;

export type ShiftDisplayStatus = "review" | "upcoming" | "inProgress" | "completed";

export const isShiftTask = (task: Pick<Task, "taskType">) => (task.taskType ?? "outcome") === "shift";

const getShiftStartAt = (task: Pick<Task, "targetDate" | "shiftStartTime">) => {
    if (!task.targetDate || !task.shiftStartTime) {
        return null;
    }

    const [hours, minutes] = task.shiftStartTime.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return null;
    }

    const shiftDate = new Date(task.targetDate);
    if (Number.isNaN(shiftDate.getTime())) {
        return null;
    }

    shiftDate.setHours(hours, minutes, 0, 0);
    return shiftDate;
};

export const getShiftDisplayStatus = (task: ShiftTaskLike, now = new Date()): ShiftDisplayStatus => {
    if (task.stage === "review") {
        return "review";
    }

    if (task.stage === "resolved") {
        return "completed";
    }

    const shiftStartAt = getShiftStartAt(task);
    if (!shiftStartAt || !task.shiftDurationMinutes) {
        return task.stage === "inProgress" ? "inProgress" : "upcoming";
    }

    const shiftEndAt = addMinutes(shiftStartAt, task.shiftDurationMinutes);
    if (now < shiftStartAt) {
        return "upcoming";
    }

    if (now >= shiftEndAt) {
        return "completed";
    }

    return "inProgress";
};

export const getShiftSignupSummary = (task: Pick<Task, "participants" | "slots">) => {
    const signedUpCount = task.participants?.length ?? 0;
    return `${signedUpCount} / ${task.slots ?? "?"} signed up`;
};

export const getShiftSignedUpCount = (task: Pick<Task, "participants">) => task.participants?.length ?? 0;

export const getShiftConfirmedCount = (task: Pick<Task, "participants">) =>
    task.participants?.filter((participant) => participant.verifiedAt).length ?? 0;

export const getShiftPendingCount = (task: Pick<Task, "participants">) =>
    task.participants?.filter((participant) => !participant.verifiedAt).length ?? 0;

export const getShiftConfirmedSummary = (task: Pick<Task, "participants" | "slots">) =>
    `${getShiftConfirmedCount(task)} / ${task.slots ?? "?"} confirmed`;

export const getShiftPendingSummary = (task: Pick<Task, "participants">) => {
    const pendingCount = getShiftPendingCount(task);
    if (!pendingCount) {
        return null;
    }

    return pendingCount === 1 ? "1 pending" : `${pendingCount} pending`;
};

export type ShiftParticipantEntry = {
    participant: TaskParticipant;
    profile?: Circle;
};

const mapShiftParticipantEntries = (
    task: Pick<TaskDisplay, "participants" | "participantProfiles">,
    predicate: (participant: TaskParticipant) => boolean,
): ShiftParticipantEntry[] =>
    (task.participants ?? [])
        .filter(predicate)
        .map((participant) => ({
            participant,
            profile: task.participantProfiles?.find((profile) => profile.did === participant.userDid),
        }));

export const getShiftConfirmedParticipants = (
    task: Pick<TaskDisplay, "participants" | "participantProfiles">,
): ShiftParticipantEntry[] => mapShiftParticipantEntries(task, (participant) => Boolean(participant.verifiedAt));

export const getShiftPendingParticipants = (
    task: Pick<TaskDisplay, "participants" | "participantProfiles">,
): ShiftParticipantEntry[] => mapShiftParticipantEntries(task, (participant) => !participant.verifiedAt);
