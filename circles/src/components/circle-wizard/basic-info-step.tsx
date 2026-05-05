"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CircleSelector from "@/components/global-create/circle-selector"; // Added
import { Circle } from "@/models/models"; // Added
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CircleWizardStepProps } from "./circle-wizard";
import { Loader2 } from "lucide-react";
import { saveBasicInfoAction } from "./actions";
import { generateSlug } from "@/lib/utils";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms"; // Corrected path
import {
    CreatableItemDetail, // Added
    creatableItemsList, // Added
    CreatableItemKey, // Added
} from "@/components/global-create/global-create-dialog-content"; // Added

const CIRCLE_LEVEL_OPTIONS = [
    {
        value: "profile_child" as const,
        title: "Profile circle",
        description: "A circle connected to your profile. This is the standard option.",
    },
    {
        value: "top_level" as const,
        title: "Independent circle",
        description: "A standalone circle not attached to your profile.",
    },
];

export default function BasicInfoStep({
    circleData,
    setCircleData,
    nextStep,
    prevStep,
    initialParentCircleId,
}: CircleWizardStepProps) {
    const [isPending, startTransition] = useTransition();
    const [nameError, setNameError] = useState("");
    const [handleError, setHandleError] = useState("");
    const [parentCircleId, setParentCircleId] = useState<string | undefined>(initialParentCircleId);
    const [circleLevelError, setCircleLevelError] = useState("");
    const [organizationNameError, setOrganizationNameError] = useState("");
    const [websiteUrlError, setWebsiteUrlError] = useState("");
    const [officialEmailError, setOfficialEmailError] = useState("");
    // selectedParentCircle state is managed by CircleSelector's onCircleSelected callback
    // const [selectedParentCircle, setSelectedParentCircle] = useState<Circle | null>(null);
    const [user] = useAtom(userAtom);
    const canCreateIndependentCircle = Boolean(user?.isMember);
    const circleLevelOptions = canCreateIndependentCircle
        ? CIRCLE_LEVEL_OPTIONS
        : CIRCLE_LEVEL_OPTIONS.filter((option) => option.value === "profile_child");
    const shouldShowCircleLevelChoice = circleData.circleType === "circle" && !initialParentCircleId;
    const effectiveCircleLevel = shouldShowCircleLevelChoice ? circleData.circleLevel || "profile_child" : "profile_child";
    const entityLabel = circleData.circleType === "project" ? "Project" : "Circle";
    const entityLabelLower = entityLabel.toLowerCase();
    const handlePlaceholder = circleData.circleType === "project" ? "project-handle" : "community-handle";
    const selectorItemType = useMemo(() => {
        const typeToFind = circleData.circleType === "circle" ? "community" : circleData.circleType;
        return creatableItemsList.find((item) => item.key === (typeToFind as CreatableItemKey)) as CreatableItemDetail;
    }, [circleData.circleType]);

    // This effect is now handled by onCircleSelected callback
    // useEffect(() => {
    //     // Initialize parentCircleId in circleData if a parent is selected
    //     if (selectedParentCircle) {
    //         setCircleData((prev) => ({
    //             ...prev,
    //             parentCircleId: selectedParentCircle._id,
    //         }));
    //     } else {
    //         // If no parent is selected (e.g. "Create under Your User")
    //         // ensure parentCircleId is undefined or handled as per your logic for user-level creation
    //         setCircleData((prev) => ({
    //             ...prev,
    //             parentCircleId: undefined, // Or user?._id if creating under user directly without a "user circle"
    //         }));
    //     }
    // }, [selectedParentCircle, setCircleData, user]);

    const handleParentCircleSelected = useCallback((circle: Circle | null) => {
        console.log("Setting parent circle id:", circle ? circle._id : undefined);
        setCircleLevelError("");
        setParentCircleId(circle ? circle._id : undefined);
        setCircleData((prev) => ({
            ...prev,
            parentCircleId: circle ? circle._id : undefined,
        }));
    }, [setCircleData]);

    const handleCircleLevelChange = (value: "profile_child" | "top_level") => {
        if (value === "top_level" && !canCreateIndependentCircle) {
            return;
        }

        setCircleLevelError("");
        setCircleData((prev) => ({
            ...prev,
            circleLevel: value,
            parentCircleId: value === "profile_child" ? prev.parentCircleId : undefined,
            representsOrganization: value === "top_level" ? prev.representsOrganization : false,
            organizationName: value === "top_level" ? prev.organizationName : "",
            websiteUrl: value === "top_level" ? prev.websiteUrl : "",
            officialEmail: value === "top_level" ? prev.officialEmail : "",
        }));

        if (value === "top_level") {
            setParentCircleId(undefined);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        // Clear any previous errors
        if (name === "name") setNameError("");
        if (name === "handle") setHandleError("");
        if (name === "organizationName") setOrganizationNameError("");
        if (name === "websiteUrl") setWebsiteUrlError("");
        if (name === "officialEmail") setOfficialEmailError("");

        // Update the circle data
        setCircleData((prev) => ({ ...prev, [name]: value }));

        // If name is changed, auto-generate handle if handle is empty or was auto-generated
        if (name === "name" && (!circleData.handle || circleData.handle === generateSlug(circleData.name))) {
            setCircleData((prev) => ({ ...prev, handle: generateSlug(value) }));
        }
    };

    const handleSwitchChange = (checked: boolean) => {
        setCircleData((prev) => ({ ...prev, isPublic: checked }));
    };

    const handleOrganizationClaimChange = (checked: boolean) => {
        setOrganizationNameError("");
        setWebsiteUrlError("");
        setOfficialEmailError("");
        setCircleData((prev) => ({
            ...prev,
            representsOrganization: checked,
            organizationName: checked ? prev.organizationName || "" : "",
            websiteUrl: checked ? prev.websiteUrl || "" : "",
            officialEmail: checked ? prev.officialEmail || "" : "",
        }));
    };

    const validateForm = (): boolean => {
        let isValid = true;

        // Validate name
        if (!circleData.name.trim()) {
            setNameError(`${entityLabel} name is required`);
            isValid = false;
        }

        // Validate handle
        if (!circleData.handle.trim()) {
            setHandleError(`${entityLabel} handle is required`);
            isValid = false;
        } else if (!/^[a-zA-Z0-9\-]*$/.test(circleData.handle)) {
            setHandleError("Handle can only contain letters, numbers and hyphens (-)");
            isValid = false;
        }

        if (shouldShowCircleLevelChoice && effectiveCircleLevel === "profile_child" && !parentCircleId) {
            setCircleLevelError("Choose the profile this circle should be created under");
            isValid = false;
        }

        if (effectiveCircleLevel === "top_level" && circleData.circleType === "circle" && circleData.representsOrganization) {
            if (!circleData.organizationName?.trim()) {
                setOrganizationNameError("Official organization name is required");
                isValid = false;
            }

            if (!circleData.websiteUrl?.trim()) {
                setWebsiteUrlError("Official website is required");
                isValid = false;
            }

            if (!circleData.officialEmail?.trim()) {
                setOfficialEmailError("Official email is required");
                isValid = false;
            }
        }

        return isValid;
    };

    const handleNext = () => {
        if (!validateForm()) return;

        startTransition(async () => {
            console.log("Saving basic info with parentCircleId:", parentCircleId);
            // Save the basic info and create the circle
            const result = await saveBasicInfoAction(
                circleData.name,
                circleData.handle,
                circleData.isPublic,
                circleData._id,
                parentCircleId, // parentCircleId is now set by handleParentCircleSelected
                circleData.circleType,
                effectiveCircleLevel,
                circleData.websiteUrl,
                circleData.representsOrganization,
                circleData.organizationName,
                circleData.officialEmail,
            );

            if (result.success) {
                // If we created a new circle, store its ID
                if (result.data && result.data.circle) {
                    const circle = result.data.circle;
                    setCircleData((prev) => ({
                        ...prev,
                        _id: circle._id,
                        images:
                            circle.images?.map((media: { fileInfo: { url: string } }) => ({
                                id: media.fileInfo.url,
                                preview: media.fileInfo.url,
                                existingMediaUrl: media.fileInfo.url,
                            })) || prev.images,
                        parentCircleId: circle.parentCircleId,
                        circleLevel: circle.circleLevel || effectiveCircleLevel,
                    }));
                }
                nextStep();
            } else {
                // Handle error
                if (result.message === "handle") {
                    setHandleError("This handle is already in use. Please choose another one.");
                } else if (result.message) {
                    setHandleError(result.message);
                } else {
                    console.error("An unknown error occurred.");
                }
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">{`Create a New ${entityLabel}`}</h2>
                <p className="text-gray-500">{`Let's start with the basic information for your ${entityLabelLower}.`}</p>
            </div>

            <div className="space-y-4">
                {shouldShowCircleLevelChoice && (
                    <div className="space-y-3">
                        <div>
                            <Label>Circle Type</Label>
                            <p className="text-sm text-gray-500">Choose how this circle should be created.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            {circleLevelOptions.map((option) => {
                                const isDisabled = option.value === "top_level" && !canCreateIndependentCircle;
                                const isSelected = effectiveCircleLevel === option.value;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => handleCircleLevelChange(option.value)}
                                        disabled={isDisabled}
                                        className={`rounded-xl border p-4 text-left transition ${
                                            isSelected
                                                ? "border-gray-900 bg-gray-900 text-white"
                                                : "border-gray-200 bg-white text-gray-900"
                                        } ${isDisabled ? "cursor-not-allowed opacity-60" : "hover:border-gray-400"}`}
                                    >
                                        <div className="font-semibold">{option.title}</div>
                                        <div
                                            className={`mt-1 text-sm ${
                                                isSelected ? "text-gray-100" : "text-gray-500"
                                            }`}
                                        >
                                            {option.description}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {!canCreateIndependentCircle && (
                            <div className="text-xs text-amber-700">
                                Independent circles are currently limited to verified members.
                            </div>
                        )}
                    </div>
                )}

                {(effectiveCircleLevel === "profile_child" || circleData.circleType === "project") && (
                    <div>
                        <CircleSelector
                            itemType={selectorItemType}
                            onCircleSelected={handleParentCircleSelected}
                            initialSelectedCircleId={initialParentCircleId}
                        />
                        <p className="text-xs text-gray-500">
                            {`Select where this ${entityLabelLower} will be created. Defaults to your profile.`}
                        </p>
                        {circleLevelError && <p className="text-sm text-red-500">{circleLevelError}</p>}
                    </div>
                )}

                {effectiveCircleLevel === "top_level" && circleData.circleType === "circle" && (
                    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="text-sm text-gray-600">
                            This will create a standalone top-level circle. Its URL structure stays the same for now.
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="representsOrganization">Organization Claim</Label>
                            <p className="text-sm text-gray-500">
                                If this circle represents an existing organization, add the official name, website, and
                                email here so verification review starts with the right evidence.
                            </p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="representsOrganization"
                                checked={circleData.representsOrganization === true}
                                onCheckedChange={handleOrganizationClaimChange}
                            />
                            <Label htmlFor="representsOrganization">
                                This circle represents an existing organization
                            </Label>
                        </div>
                        {circleData.representsOrganization ? (
                            <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
                                <div className="space-y-2">
                                    <Label htmlFor="organizationName">Official Organization Name</Label>
                                    <Input
                                        id="organizationName"
                                        name="organizationName"
                                        value={circleData.organizationName || ""}
                                        onChange={handleInputChange}
                                        placeholder="Official organization name"
                                    />
                                    {organizationNameError ? (
                                        <p className="text-sm text-red-500">{organizationNameError}</p>
                                    ) : (
                                        <p className="text-xs text-gray-500">
                                            Use the formal name admins should verify against.
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="websiteUrl">Official Website</Label>
                                    <Input
                                        id="websiteUrl"
                                        name="websiteUrl"
                                        value={circleData.websiteUrl || ""}
                                        onChange={handleInputChange}
                                        placeholder="https://organization.org"
                                    />
                                    {websiteUrlError ? (
                                        <p className="text-sm text-red-500">{websiteUrlError}</p>
                                    ) : (
                                        <p className="text-xs text-gray-500">
                                            This saves to the circle website field and will be shown in verification
                                            review.
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="officialEmail">Official Email</Label>
                                    <Input
                                        id="officialEmail"
                                        name="officialEmail"
                                        value={circleData.officialEmail || ""}
                                        onChange={handleInputChange}
                                        placeholder="name@organization.org"
                                    />
                                    {officialEmailError ? (
                                        <p className="text-sm text-red-500">{officialEmailError}</p>
                                    ) : (
                                        <p className="text-xs text-gray-500">
                                            Use an address connected to the organization when possible.
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="name">{entityLabel} Name</Label>
                    <Input
                        id="name"
                        name="name"
                        value={circleData.name}
                        onChange={handleInputChange}
                        placeholder={`Enter ${entityLabelLower} name`}
                    />
                    {nameError && <p className="text-sm text-red-500">{nameError}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="handle">{entityLabel} Handle</Label>
                    <div className="flex items-center">
                        <span className="mr-1 text-gray-500">@</span>
                        <Input
                            id="handle"
                            name="handle"
                            value={circleData.handle}
                            onChange={handleInputChange}
                            placeholder={handlePlaceholder}
                        />
                    </div>
                    <p className="text-xs text-gray-500">
                        {`This will be used in the URL for your ${entityLabelLower}: circles/${handlePlaceholder}`}
                    </p>
                    {handleError && <p className="text-sm text-red-500">{handleError}</p>}
                </div>

                <div className="flex items-center space-x-2">
                    <Switch id="isPublic" checked={circleData.isPublic} onCheckedChange={handleSwitchChange} />
                    <Label htmlFor="isPublic">{`Public ${entityLabel}`}</Label>
                    <p className="text-xs text-gray-500">
                        {circleData.isPublic
                            ? `Anyone can follow this ${entityLabelLower} without approval`
                            : `New followers will need approval`}
                    </p>
                </div>

                {!user?.isMember && (
                    <div className="space-y-2 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
                        <h3 className="font-semibold text-yellow-800">Become a Member!</h3>
                        <p className="text-sm text-yellow-700">
                            Support the platform and get a verified badge by becoming a member.
                        </p>
                        <Button
                            variant="link"
                            className="p-0 text-yellow-800"
                            onClick={() => {
                                // Assuming the user settings page is at /circles/handle/settings
                                // and the subscription tab is available there.
                                // This might need to be adjusted based on the actual routing.
                                if (user) {
                                    window.open(`/circles/${user.handle}/settings/subscription`, "_blank");
                                }
                            }}
                        >
                            Learn more about membership
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <Button onClick={handleNext} disabled={isPending} className="w-[150px]">
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>Create {entityLabel}</>
                    )}
                </Button>
            </div>
        </div>
    );
}
