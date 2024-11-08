// models.ts
export type Identity = {
    did: string;
    name: string;
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
    iv: string;
    //public_key_jwk: string;
};
