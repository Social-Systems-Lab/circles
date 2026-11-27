import { generateVAPIDKeys } from "web-push";

const keys = generateVAPIDKeys();

console.log("# Add these to your environment-specific .env / secret store (never share across staging & production):");
console.log("WEB_PUSH_VAPID_SUBJECT=mailto:hello@socialsystems.io");
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`);
