"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventForm from "@/components/modules/events/event-form";
import CirclePicker from "./circle-picker";
import { Circle } from "@/models/models";

type Props = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void;
    itemKey: "event";
};

export function CreateEventDialog({ isOpen, onOpenChange, onSuccess }: Props) {
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="z-[201]">
                <DialogHeader>
                    <DialogTitle>Create Event</DialogTitle>
                </DialogHeader>
                {!selectedCircle ? (
                    <CirclePicker onCircleSelected={setSelectedCircle} itemTitle="event" action="create" />
                ) : (
                    <EventForm circleHandle={selectedCircle.handle!} />
                )}
            </DialogContent>
        </Dialog>
    );
}
