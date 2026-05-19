const crypto = require("crypto");

const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateJwk = privateKey.export({ format: "jwk" });
const encodedPrivateJwk = Buffer.from(JSON.stringify(privateJwk), "utf8").toString("base64url");

console.log("VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK=" + encodedPrivateJwk);
console.log("VIBE_ID_CREDENTIAL_ISSUER_DID=did:web:kamooni.org");
console.log("VIBE_ID_CREDENTIAL_ISSUER_KID=kamooni-platform-v1");
