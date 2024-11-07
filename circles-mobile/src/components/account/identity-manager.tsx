// identity-manager.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { db } from "../../lib/data/db";
import { Identity } from "../../lib/data/models";
import { Button } from "../ui/button";

interface IdentityManagerProps {}

const identitiesTable = db.identities;

const IdentityManager: React.FC<IdentityManagerProps> = () => {
    const [identities, setIdentities] = useState<Identity[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedIdentity, setSelectedIdentity] = useState<Identity | null>(null);

    // Fetch identities on component mount
    useEffect(() => {
        fetchIdentities();
    }, []);

    // Function to fetch identities (DIDs) from Dexie
    const fetchIdentities = async () => {
        setLoading(true);
        try {
            const allIdentities = await identitiesTable.toArray();
            setIdentities(allIdentities);
        } catch (error) {
            console.error("Failed to fetch identities:", error);
        } finally {
            setLoading(false);
        }
    };

    // Function to create a new identity
    const createIdentity = async (name: string, password: string) => {
        setLoading(true);
        try {
            const identityData = await invoke<Identity>("create_identity", { name, password });
            await identitiesTable.add(identityData);
            setIdentities((prev) => [...prev, identityData]);
        } catch (error) {
            console.error("Failed to create identity:", error);
        } finally {
            setLoading(false);
        }
    };

    // Function to delete an identity by DID
    const deleteIdentity = async (did: string) => {
        try {
            await identitiesTable.delete(did);
            setIdentities((prev) => prev.filter((identity) => identity.did !== did));
        } catch (error) {
            console.error("Failed to delete identity:", error);
        }
    };

    // Function to handle selecting an identity to show its details
    const selectIdentity = (did: string) => {
        const identity = identities.find((identity) => identity.did === did);
        setSelectedIdentity(identity || null);
    };

    // Function to handle logging in as an identity (setting active identity)
    const loginAsIdentity = (did: string) => {
        // For now, we're just setting it in the state
        console.log(`Logged in as identity: ${did}`);
        // You could also store the active DID in local storage or similar for persistence
    };

    return (
        <div className="p-6 bg-gray-100">
            <h1 className="text-lg font-semibold">Manage Identities</h1>

            <Button onClick={() => createIdentity("New Identity", "")} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded" disabled={loading}>
                {loading ? "Loading..." : "Create New Identity"}
            </Button>

            <ul className="mt-6">
                {identities.length > 0 ? (
                    identities.map((identity) => (
                        <li key={identity.did} className="flex items-center justify-between p-2 bg-white shadow rounded mb-2 cursor-pointer">
                            <span onClick={() => selectIdentity(identity.did)}>{identity.name}</span>
                            <div>
                                <Button onClick={() => loginAsIdentity(identity.did)} className="mr-4 text-green-500">
                                    Login
                                </Button>
                                <Button onClick={() => deleteIdentity(identity.did)} className="text-red-500">
                                    Delete
                                </Button>
                            </div>
                        </li>
                    ))
                ) : (
                    <li>No identities found.</li>
                )}
            </ul>

            {selectedIdentity && (
                <div className="mt-6 p-4 bg-white shadow rounded">
                    <h2 className="text-md font-semibold">Identity Details</h2>
                    <p>
                        <strong>DID:</strong> {selectedIdentity.did}
                    </p>
                    <p>
                        <strong>Name:</strong> {selectedIdentity.name}
                    </p>
                    <p>
                        <strong>Encrypted Key:</strong> {selectedIdentity.encrypted_key}
                    </p>
                    <p>
                        <strong>Salt:</strong> {selectedIdentity.salt}
                    </p>
                    <p>
                        <strong>IV:</strong> {selectedIdentity.iv}
                    </p>
                    <p>
                        <strong>Public Key (JWK):</strong> {selectedIdentity.public_key_jwk}
                    </p>
                </div>
            )}
        </div>
    );
};

export default IdentityManager;
