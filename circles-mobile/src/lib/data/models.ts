// models.ts
export type Identity = {
    did: string;
    name: string;
    encrypted_key: string;
    salt: string;
    iv: string;
    public_key_jwk: string;
};
