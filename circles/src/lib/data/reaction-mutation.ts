export type ReactionMutationInput = {
    contentId: string;
    contentType: "post" | "comment";
    userDid: string;
    reactionType: string;
};

export type ReactionMutationDependencies = {
    findExisting: (input: ReactionMutationInput) => Promise<boolean>;
    insert: (input: ReactionMutationInput) => Promise<void>;
    remove: (input: ReactionMutationInput) => Promise<boolean>;
    incrementCounter: (input: ReactionMutationInput, amount: 1 | -1) => Promise<void>;
    refreshHighlightedComment: (input: ReactionMutationInput) => Promise<void>;
};

export async function applyLikeMutation(
    input: ReactionMutationInput,
    dependencies: ReactionMutationDependencies,
): Promise<boolean> {
    if (await dependencies.findExisting(input)) return false;
    await dependencies.insert(input);
    await dependencies.incrementCounter(input, 1);
    if (input.contentType === "comment") await dependencies.refreshHighlightedComment(input);
    return true;
}

export async function applyUnlikeMutation(
    input: ReactionMutationInput,
    dependencies: ReactionMutationDependencies,
): Promise<boolean> {
    if (!(await dependencies.remove(input))) return false;
    await dependencies.incrementCounter(input, -1);
    if (input.contentType === "comment") await dependencies.refreshHighlightedComment(input);
    return true;
}
