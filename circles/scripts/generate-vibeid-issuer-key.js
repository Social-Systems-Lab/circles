const crypto = require("crypto");

const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateJwk = privateKey.export({ format: "jwk" });
const publicJwk = crypto.createPublicKey(privateKey).export({ format: "jwk" });
const encodedPrivateJwk = Buffer.from(JSON.stringify(privateJwk), "utf8").toString("base64url");
const x = Buffer.from(publicJwk.x, "base64url");
const y = Buffer.from(publicJwk.y, "base64url");
const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
const issuerDid = `did:vibe:p256:${Buffer.concat([Buffer.from([prefix]), x]).toString("base64url")}`;

console.log("VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK=" + encodedPrivateJwk);
console.log("VIBE_ID_CREDENTIAL_ISSUER_DID=" + issuerDid);
console.log("VIBE_ID_CREDENTIAL_ISSUER_NAME=Kamooni");
console.log("VIBE_ID_CREDENTIAL_ISSUER_TAGLINE=Building a thriving future together");
