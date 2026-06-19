"use client";

import React, { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { generateSlug } from "@/lib/utils";
import { createPeerifyManagedVenueIdentityAction } from "@/components/circle-wizard/actions";
import { getUserPrivateAction } from "@/components/modules/home/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreatePeerifyVenueDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data?: { id?: string; circleHandle?: string }) => void;
}

type FormState = {
    name: string;
    handle: string;
    description: string;
    baseCity: string;
};

const EMPTY_FORM: FormState = {
    name: "",
    handle: "",
    description: "",
    baseCity: "",
};

export function CreatePeerifyVenueDialog({
    isOpen,
    onOpenChange,
    onSuccess,
}: CreatePeerifyVenueDialogProps) {
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setErrors({});
    };

    const validate = () => {
        const nextErrors: Partial<Record<keyof FormState, string>> = {};

        if (!form.name.trim()) {
            nextErrors.name = "Venue name is required";
        }

        if (!form.handle.trim()) {
            nextErrors.handle = "Handle is required";
        } else if (
            form.handle.trim().length < 3 ||
            form.handle.trim().length > 20 ||
            !/^[a-z0-9-]*$/.test(form.handle.trim())
        ) {
            nextErrors.handle = "Use 3-20 lowercase letters, numbers, and hyphens.";
        }

        if (!form.description.trim()) {
            nextErrors.description = "Short description is required";
        }

        if (!form.baseCity.trim()) {
            nextErrors.baseCity = "Venue location is required";
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const updateField = (key: keyof FormState, value: string) => {
        setErrors((current) => ({ ...current, [key]: undefined }));
        setForm((current) => {
            const next = { ...current, [key]: value };
            if (key === "name" && (!current.handle || current.handle === generateSlug(current.name))) {
                next.handle = generateSlug(value);
            }
            return next;
        });
    };

    const handleSubmit = () => {
        if (!validate()) {
            return;
        }

        startTransition(async () => {
            const result = await createPeerifyManagedVenueIdentityAction(form);

            if (!result.success) {
                if (result.message === "handle") {
                    setErrors((current) => ({
                        ...current,
                        handle: "This handle is already in use. Please choose another one.",
                    }));
                    return;
                }

                if (result.message === "handle-invalid") {
                    setErrors((current) => ({
                        ...current,
                        handle: "Use 3-20 lowercase letters, numbers, and hyphens.",
                    }));
                    return;
                }

                if (result.message === "Venue name is required") {
                    setErrors((current) => ({ ...current, name: result.message }));
                    return;
                }

                if (result.message === "Short description is required") {
                    setErrors((current) => ({ ...current, description: result.message }));
                    return;
                }

                if (result.message === "Venue location is required") {
                    setErrors((current) => ({ ...current, baseCity: result.message }));
                    return;
                }

                toast({
                    title: "Could not create venue identity",
                    description: result.message || "Please try again.",
                    variant: "destructive",
                });
                return;
            }

            const userData = await getUserPrivateAction();
            setUser(userData);
            toast({
                title: "Venue identity created",
                description: "Venue profile created successfully.",
            });
            onSuccess({
                id: result.data?.circleId,
                circleHandle: result.data?.handle,
            });
            resetForm();
            onOpenChange(false);
        });
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    resetForm();
                }
                onOpenChange(open);
            }}
        >
            <DialogContent className="sm:max-w-[680px]">
                <DialogHeader>
                    <DialogTitle>Create Venue Identity</DialogTitle>
                    <DialogDescription>
                        Create a public Peerify venue or host profile that stays separate from your private account.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="peerify-venue-name">Venue / place name</Label>
                            <Input
                                id="peerify-venue-name"
                                value={form.name}
                                onChange={(event) => updateField("name", event.target.value)}
                                placeholder="The Listening Room"
                            />
                            {errors.name ? <p className="text-sm text-red-500">{errors.name}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="peerify-venue-handle">Handle</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">@</span>
                                <Input
                                    id="peerify-venue-handle"
                                    value={form.handle}
                                    onChange={(event) => updateField("handle", event.target.value)}
                                    placeholder="the-listening-room"
                                />
                            </div>
                            {errors.handle ? <p className="text-sm text-red-500">{errors.handle}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="peerify-venue-location">City / location</Label>
                            <Input
                                id="peerify-venue-location"
                                value={form.baseCity}
                                onChange={(event) => updateField("baseCity", event.target.value)}
                                placeholder="Copenhagen"
                            />
                            {errors.baseCity ? <p className="text-sm text-red-500">{errors.baseCity}</p> : null}
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="peerify-venue-description">Short description</Label>
                            <Textarea
                                id="peerify-venue-description"
                                rows={4}
                                value={form.description}
                                onChange={(event) => updateField("description", event.target.value)}
                                placeholder="A short public intro for this venue or host space."
                            />
                            {errors.description ? <p className="text-sm text-red-500">{errors.description}</p> : null}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            The creator becomes the first admin using the existing circle admin flow.
                        </p>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleSubmit} disabled={isPending}>
                                {isPending ? "Creating..." : "Create Venue Identity"}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default CreatePeerifyVenueDialog;
