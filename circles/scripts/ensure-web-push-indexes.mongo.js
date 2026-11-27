// Idempotent additive index setup for Web Push subscriptions and delivery jobs.

db.getCollection("pushSubscriptions").createIndex({ endpointHash: 1 }, { unique: true });
db.getCollection("pushSubscriptions").createIndex({ userDid: 1, revokedAt: 1 });
db.getCollection("pushSubscriptions").createIndex(
    { revokedAt: 1 },
    { expireAfterSeconds: 30 * 86400, partialFilterExpression: { revokedAt: { $type: "date" } } },
);

db.getCollection("pushDeliveryJobs").createIndex({ deliveryKey: 1 }, { unique: true });
db.getCollection("pushDeliveryJobs").createIndex({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
db.getCollection("pushDeliveryJobs").createIndex({ subscriptionId: 1, status: 1 });
db.getCollection("pushDeliveryJobs").createIndex(
    { completedAt: 1 },
    { expireAfterSeconds: 14 * 86400, partialFilterExpression: { completedAt: { $type: "date" } } },
);

printjson({ migration: "web-push-indexes", status: "complete" });
