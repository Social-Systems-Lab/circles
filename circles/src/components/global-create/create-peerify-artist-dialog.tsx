"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { generateSlug } from "@/lib/utils";
import {
    PEERIFY_MANAGED_IDENTITY_TYPE_OPTIONS,
    type PeerifyIdentityType,
} from "@/lib/peerify/artist-profile";
import { createPeerifyManagedArtistIdentityAction } from "@/components/circle-wizard/actions";
import { getUserPrivateAction } from "@/components/modules/home/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface CreatePeerifyArtistDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (data?: { id?: string; circleHandle?: string }) => void;
}

type FormState = {
    name: string;
    handle: string;
    identityType: PeerifyIdentityType;
    description: string;
    baseCity: string;
};

const EMPTY_FORM: FormState = {
    name: "",
    handle: "",
    identityType: "artist",
    description: "",
    baseCity: "",
};

export function CreatePeerifyArtistDialog({
    isOpen,
    onOpenChange,
    onSuccess,
}: CreatePeerifyArtistDialogProps) {
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

    const selectedIdentity = useMemo(
        () => PEERIFY_MANAGED_IDENTITY_TYPE_OPTIONS.find((option) => option.value === form.identityType),
        [form.identityType],
    );

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setErrors({});
    };

    const validate = () => {
        const nextErrors: Partial<Record<keyof FormState, string>> = {};

        if (!form.name.trim()) {
            nextErrors.name = "Artist or project name is required";
        }

        if (!form.handle.trim()) {
            nextErrors.handle = "Handle is required";
        } else if (
            form.handle.trim().length < 3 ||
            form.handle.trim().length > 20 ||
            !/^[a-z0-9-]*$/.test(form.handle.trim())
        ) {
            nextErrors.handle = "Use 3–20 lowercase letters, numbers, and hyphens.";
        }

        if (!form.description.trim()) {
            nextErrors.description = "Short bio is required";
        }

        if (!form.baseCity.trim()) {
            nextErrors.baseCity = "Base city is required";
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
            const result = await createPeerifyManagedArtistIdentityAction(form);

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
                        handle: "Use 3–20 lowercase letters, numbers, and hyphens.",
                    }));
                    return;
                }

                if (result.message === "Artist or project name is required") {
                    setErrors((current) => ({ ...current, name: result.message }));
                    return;
                }

                if (result.message === "Short bio is required") {
                    setErrors((current) => ({ ...current, description: result.message }));
                    return;
                }

                if (result.message === "Base city is required") {
                    setErrors((current) => ({ ...current, baseCity: result.message }));
                    return;
                }

                toast({
                    title: "Could not create artist identity",
                    description: result.message || "Please try again.",
                    variant: "destructive",
                });
                return;
            }

            const userData = await getUserPrivateAction();
            setUser(userData);
            toast({
                title: "Artist identity created",
                description: selectedIdentity
                    ? `${selectedIdentity.label} created successfully.`
                    : "Artist identity created successfully.",
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
                    <DialogTitle>Create Artist Identity</DialogTitle>
                    <DialogDescription>
                        Create a public Peerify identity that stays separate from your private account.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="space-y-3">
                        <div>
                            <Label>Identity type</Label>
                            <p className="mt-1 text-sm text-muted-foreground">
                                This decides the initial Peerify identity metadata for the new public profile.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {PEERIFY_MANAGED_IDENTITY_TYPE_OPTIONS.map((option) => {
                                const selected = form.identityType === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setErrors((current) => ({ ...current, identityType: undefined }));
                                            setForm((current) => ({ ...current, identityType: option.value }));
                                        }}
                                        className={`rounded-xl border p-4 text-left transition ${
                                            selected
                                                ? "border-[#231f1a] bg-[#231f1a] text-white"
                                                : "border-[#e4dacc] bg-[#fcfbf8] text-[#2f2923]"
                                        }`}
                                    >
                                        <div className="font-semibold">{option.label}</div>
                                        <div className={`mt-1 text-sm ${selected ? "text-[#efe8de]" : "text-[#6f6559]"}`}>
                                            {option.description}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="peerify-name">Artist / project name</Label>
                            <Input
                                id="peerify-name"
                                value={form.name}
                                onChange={(event) => updateField("name", event.target.value)}
                                placeholder="Moonlit Choir"
                            />
                            {errors.name ? <p className="text-sm text-red-500">{errors.name}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="peerify-handle">Handle</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">@</span>
                                <Input
                                    id="peerify-handle"
                                    value={form.handle}
                                    onChange={(event) => updateField("handle", event.target.value)}
                                    placeholder="moonlit-choir"
                                />
                            </div>
                            {errors.handle ? <p className="text-sm text-red-500">{errors.handle}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="peerify-base-city">Base city / location</Label>
                            <Input
                                id="peerify-base-city"
                                value={form.baseCity}
                                onChange={(event) => updateField("baseCity", event.target.value)}
                                placeholder="Berlin"
                            />
                            {errors.baseCity ? <p className="text-sm text-red-500">{errors.baseCity}</p> : null}
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="peerify-description">Short bio</Label>
                            <Textarea
                                id="peerify-description"
                                rows={4}
                                value={form.description}
                                onChange={(event) => updateField("description", event.target.value)}
                                placeholder="A short public intro for this artist identity."
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
                                {isPending ? "Creating..." : "Create Artist Identity"}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default CreatePeerifyArtistDialog;
