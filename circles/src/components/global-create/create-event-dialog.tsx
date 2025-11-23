"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventForm from "@/components/modules/events/event-form";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { creatableItemsList, CreatableItemDetail } from "./global-create-dialog-content";

type Props = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data: { id?: string; circleHandle?: string }) => void;
    itemKey: "event";
};

export function CreateEventDialog({ isOpen, onOpenChange, onSuccess }: Props) {
    const [user] = useAtom(userAtom);
    const itemDetail = creatableItemsList.find((item: CreatableItemDetail) => item.key === "event");

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-h-[90vh] overflow-y-auto sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"
                onInteractOutside={(e) => {
                    // Prevent closing on blur
                    e.preventDefault();
                }}
            >
                <DialogTitle className="hidden">Create New Event</DialogTitle>
                {!user && <p className="p-4 text-red-500">Please log in to create an event.</p>}
                {user && itemDetail && <EventForm showCirclePicker />}
            </DialogContent>
        </Dialog>
    );
}
