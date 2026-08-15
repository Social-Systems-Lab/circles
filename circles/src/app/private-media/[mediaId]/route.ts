import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circles, Members, PrivateMediaCollection } from "@/lib/data/db";
import { privateMediaMinioClient } from "@/lib/data/private-media";
import { createPrivateMediaGetHandler } from "./handler";

export const runtime = "nodejs";

const productionHandler = createPrivateMediaGetHandler({
    authenticate: getAuthenticatedUserDid,
    findRecord: (_id) => PrivateMediaCollection.findOne({ _id }),
    findCircle: (circleId) => Circles.findOne({ _id: new ObjectId(circleId) }),
    isMember: async (userDid, circleId) => Boolean(await Members.findOne({ userDid, circleId })),
    statObject: async (record) => {
        await privateMediaMinioClient.statObject(record.bucket, record.objectKey);
    },
    getObject: (record) => privateMediaMinioClient.getObject(record.bucket, record.objectKey),
});

export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }) {
    return productionHandler(request, context);
}
