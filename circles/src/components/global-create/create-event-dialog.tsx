"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventForm from "@/components/modules/events/event-form";
import { Circle } from "@/models/models";

type Props = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void;
    itemKey: "event";
};

export function CreateEventDialog({ isOpen, onOpenChange, onSuccess }: Props) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="z-[201] max-h-[90vh] overflow-y-auto sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    // Prevent closing on blur
                    e.preventDefault();
                }}
            >
                <DialogTitle className="hidden">Create New Event</DialogTitle>
                <EventForm showCirclePicker />
            </DialogContent>
        </Dialog>
    );
}
