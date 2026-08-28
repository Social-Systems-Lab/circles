type InternalPreviewCandidate = {
    type: string;
    id: string;
    url: string;
};

type ExternalPreviewCandidate = {
    url: string;
    title?: string;
    description?: string;
    image?: string;
};

const appendInternalPreviewRemoval = (formData: FormData) => {
    formData.append("internalPreviewType", "");
    formData.append("internalPreviewId", "");
    formData.append("internalPreviewUrl", "");
};

export function appendPreviewFormData(input: {
    formData: FormData;
    initialInternalPreview: boolean;
    internalPreview: InternalPreviewCandidate | null;
    linkPreview: ExternalPreviewCandidate | null;
    previewRemovedManually: boolean;
}) {
    const { formData, initialInternalPreview, internalPreview, linkPreview, previewRemovedManually } = input;
    if (linkPreview) {
        formData.append("linkPreviewUrl", linkPreview.url);
        if (linkPreview.title) formData.append("linkPreviewTitle", linkPreview.title);
        if (linkPreview.description) formData.append("linkPreviewDescription", linkPreview.description);
        if (linkPreview.image) formData.append("linkPreviewImageUrl", linkPreview.image);
        if (initialInternalPreview) appendInternalPreviewRemoval(formData);
    } else if (internalPreview) {
        formData.append("internalPreviewType", internalPreview.type);
        formData.append("internalPreviewId", internalPreview.id);
        formData.append("internalPreviewUrl", internalPreview.url);
    } else if (initialInternalPreview && previewRemovedManually) {
        appendInternalPreviewRemoval(formData);
    }
}
