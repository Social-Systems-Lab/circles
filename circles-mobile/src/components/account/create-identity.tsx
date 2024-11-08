// create-identity.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { invoke } from "@tauri-apps/api/core";
import { db } from "../../lib/data/db";
import { Identity } from "../../lib/data/models";
import { createIdentity } from "@/lib/auth/auth";

const CreateIdentity: React.FC = () => {
    const [name, setName] = useState("");
    const [pin, setPin] = useState("");
    const [loading, setLoading] = useState<boolean>(false);
    const navigate = useNavigate();

    const createNewIdentity = async () => {
        if (!name || !pin) {
            alert("Please provide both a name and a PIN");
            return;
        }
        setLoading(true);
        try {
            let identity = await createIdentity(name, pin);

            console.log("Identity successfully created:", identity);

            // // Invoke the backend command to create a new identity
            // console.log("Requesting backend to create new identity with name:", name);
            // const identityData = await invoke<Identity>("create_identity", { name, password: pin });

            // console.log("Received identity data from backend:");
            // console.log("DID:", identityData.did);
            // console.log("Encrypted Key:", identityData.encryptedPrivateKey);
            // console.log("Encrypted Key Length:", identityData.encryptedPrivateKey.length);
            // console.log("Salt:", identityData.salt);
            // console.log("IV:", identityData.iv);

            // Add the new identity to Dexie
            await db.identities.add(identity);
            console.log("Identity successfully saved to Dexie database.");

            // Navigate back to the account selection page
            navigate("/");
        } catch (error) {
            console.error("Failed to create identity:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">Create New Identity</h1>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" />
            </div>
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">PIN</label>
                <InputOTP maxLength={6} value={pin} onChange={setPin}>
                    <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                    </InputOTPGroup>
                </InputOTP>
            </div>
            <Button onClick={createNewIdentity} disabled={loading} className="w-full bg-blue-500 text-white px-4 py-2 rounded">
                {loading ? "Creating..." : "Create Identity"}
            </Button>
        </div>
    );
};

export default CreateIdentity;
