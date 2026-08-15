import { Readable } from "stream";
import type { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import type { Circle, PrivateMedia } from "@/models/models";
import {
    canReadPrivateMediaRecord,
    getPrivateMediaResponseHeaders,
    resolvePrivateMediaRequest,
} from "@/lib/data/private-media";

type PrivateMediaRouteDependencies = {
    authenticate: () => Promise<string | undefined>;
    findRecord: (id: ObjectId) => Promise<PrivateMedia | null>;
    findCircle: (circleId: string) => Promise<Circle | null>;
    isMember: (userDid: string, circleId: string) => Promise<boolean>;
    statObject: (record: PrivateMedia) => Promise<void>;
    getObject: (record: PrivateMedia) => Promise<Readable>;
};

const notFound = () => new NextResponse("Not found", { status: 404 });

export const createPrivateMediaGetHandler = (dependencies: PrivateMediaRouteDependencies) =>
    async function privateMediaGetHandler(
        _request: Request,
        { params }: { params: Promise<{ mediaId: string }> },
    ): Promise<Response> {
        try {
            const { mediaId } = await params;
            const userDid = await dependencies.authenticate();
            const record = await resolvePrivateMediaRequest(mediaId, userDid, {
                findRecord: dependencies.findRecord,
                canRead: (viewerDid, media) =>
                    canReadPrivateMediaRecord(viewerDid, media, {
                        findCircle: dependencies.findCircle,
                        isMember: dependencies.isMember,
                    }),
                objectExists: async (media) => {
                    try {
                        await dependencies.statObject(media);
                        return true;
                    } catch {
                        return false;
                    }
                },
            });
            if (!record) return notFound();

            const objectStream = await dependencies.getObject(record);
            return new Response(Readable.toWeb(objectStream) as ReadableStream, {
                status: 200,
                headers: getPrivateMediaResponseHeaders(record),
            });
        } catch {
            return notFound();
        }
    };
