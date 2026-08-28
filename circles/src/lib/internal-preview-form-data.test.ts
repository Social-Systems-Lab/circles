import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { appendPreviewFormData } from "./internal-preview-form-data";

const internal = {
    type: "event",
    id: "0123456789abcdef01234567",
    url: "/circles/current/events/0123456789abcdef01234567",
};
const external = {
    url: "https://example.test/story",
    title: "External",
    description: "Description",
    image: "https://example.test/image.png",
};

function entries(input: Parameters<typeof appendPreviewFormData>[0]) {
    appendPreviewFormData(input);
    return Object.fromEntries(input.formData.entries());
}

const replacedWithExternal = entries({
    formData: new FormData(),
    initialInternalPreview: true,
    internalPreview: null,
    linkPreview: external,
    previewRemovedManually: false,
});
assert.deepEqual(replacedWithExternal, {
    linkPreviewUrl: external.url,
    linkPreviewTitle: external.title,
    linkPreviewDescription: external.description,
    linkPreviewImageUrl: external.image,
    internalPreviewType: "",
    internalPreviewId: "",
    internalPreviewUrl: "",
});

assert.deepEqual(
    entries({
        formData: new FormData(),
        initialInternalPreview: true,
        internalPreview: null,
        linkPreview: null,
        previewRemovedManually: false,
    }),
    {},
);

assert.deepEqual(
    entries({
        formData: new FormData(),
        initialInternalPreview: true,
        internalPreview: null,
        linkPreview: null,
        previewRemovedManually: true,
    }),
    { internalPreviewType: "", internalPreviewId: "", internalPreviewUrl: "" },
);

assert.deepEqual(
    entries({
        formData: new FormData(),
        initialInternalPreview: true,
        internalPreview: internal,
        linkPreview: null,
        previewRemovedManually: false,
    }),
    { internalPreviewType: internal.type, internalPreviewId: internal.id, internalPreviewUrl: internal.url },
);

async function main() {
    const root = fileURLToPath(new URL("..", import.meta.url));
    for (const form of [
        `${root}/components/modules/feeds/post-form.tsx`,
        `${root}/components/modules/discussions/discussion-form.tsx`,
    ]) {
        const source = await readFile(form, "utf8");
        assert.match(source, /appendPreviewFormData\(\{/);
    }

    console.log("PostForm and DiscussionForm preview FormData regression tests passed");
}

void main();
