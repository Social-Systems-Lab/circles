export type CachedMessageFollowUpStatus = { followUpId: string; completed: boolean; note?: string };

export type MessageFollowUpHydrationToken = { mutationVersion: number; requestGeneration: number };
export type KeyedMessageFollowUpStatus = { cacheKey: string; status: CachedMessageFollowUpStatus | null };

export class MessageFollowUpStatusCache {
    private readonly statuses = new Map<string, CachedMessageFollowUpStatus>();
    private readonly mutationVersions = new Map<string, number>();
    private readonly requestGenerations = new Map<string, number>();

    get(cacheKey: string): CachedMessageFollowUpStatus | null {
        return this.statuses.get(cacheKey) || null;
    }

    beginHydration(cacheKey: string): MessageFollowUpHydrationToken {
        const requestGeneration = (this.requestGenerations.get(cacheKey) || 0) + 1;
        this.requestGenerations.set(cacheKey, requestGeneration);
        return { mutationVersion: this.mutationVersions.get(cacheKey) || 0, requestGeneration };
    }

    applyHydration(
        cacheKey: string,
        token: MessageFollowUpHydrationToken,
        status: CachedMessageFollowUpStatus | null,
    ): boolean {
        if (
            token.mutationVersion !== (this.mutationVersions.get(cacheKey) || 0) ||
            token.requestGeneration !== this.requestGenerations.get(cacheKey)
        ) {
            return false;
        }
        this.set(cacheKey, status);
        return true;
    }

    applyMutation(cacheKey: string, status: CachedMessageFollowUpStatus | null): void {
        this.mutationVersions.set(cacheKey, (this.mutationVersions.get(cacheKey) || 0) + 1);
        this.set(cacheKey, status);
    }

    updateFollowUp(
        followUpId: string,
        update: (status: CachedMessageFollowUpStatus) => CachedMessageFollowUpStatus,
    ): Array<{ cacheKey: string; status: CachedMessageFollowUpStatus }> {
        const updated: Array<{ cacheKey: string; status: CachedMessageFollowUpStatus }> = [];
        for (const [cacheKey, status] of this.statuses) {
            if (status.followUpId !== followUpId) continue;
            const next = update(status);
            this.applyMutation(cacheKey, next);
            updated.push({ cacheKey, status: next });
        }
        return updated;
    }

    private set(cacheKey: string, status: CachedMessageFollowUpStatus | null): void {
        if (status) this.statuses.set(cacheKey, status);
        else this.statuses.delete(cacheKey);
    }
}

export const readCurrentMessageFollowUpStatus = (
    cache: MessageFollowUpStatusCache,
    cachedState: KeyedMessageFollowUpStatus,
    cacheKey: string,
): CachedMessageFollowUpStatus | null => (cachedState.cacheKey === cacheKey ? cachedState.status : cache.get(cacheKey));

export const isNoteEditorForViewer = (
    editor: { viewerDid: string; followUpId: string } | null,
    viewerDid: string,
): boolean => editor?.viewerDid === viewerDid;
