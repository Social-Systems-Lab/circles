// identity-manager.tsx

import { db } from "../../lib/data/db";
import { Identity } from "../../lib/data/models";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import OTPLogin from "./otp-login";

interface IdentityManagerProps {}

const identitiesTable = db.identities;

const IdentityManager: React.FC<IdentityManagerProps> = () => {
    const [identities, setIdentities] = useState<Identity[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedIdentity, setSelectedIdentity] = useState<Identity | null>(null);
    const [isOTPModalOpen, setIsOTPModalOpen] = useState<boolean>(false);
    const navigate = useNavigate();

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
    const loginAsIdentity = (identity: Identity) => {
        setSelectedIdentity(identity);
        setIsOTPModalOpen(true);
    };

    const handleLoginSuccess = () => {
        console.log(`Logged in as identity: ${selectedIdentity?.did}`);
        setIsOTPModalOpen(false);
    };

    const handleLoginFailure = () => {
        console.error("Failed to authenticate identity");
    };

    return (
        <div className="mx-auto max-w-3xl p-8">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">Who is using Circles?</h1>
                <p className="text-sm text-gray-600">Choose your self-sovereign digital identity</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {identities.length > 0 ? (
                    identities.map((identity) => (
                        <div
                            key={identity.did}
                            className="relative bg-blue-50 rounded-3xl p-4 min-w-[180px] cursor-pointer"
                            onClick={() => loginAsIdentity(identity)}
                        >
                            <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex flex-col items-center">
                                    <Avatar className="h-20 w-20 mb-3">
                                        <AvatarImage src="/images/default-user-picture.png" alt={`${identity.name}'s profile picture`} />
                                        <AvatarFallback>{identity.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium text-gray-900 truncate w-full text-center">{identity.name}</span>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="absolute top-6 right-6 h-8 w-8 text-gray-500 hover:text-gray-700">
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">Open menu</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => selectIdentity(identity.did)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => deleteIdentity(identity.did)} className="text-red-600">
                                            <Trash className="mr-2 h-4 w-4" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))
                ) : (
                    <li>No identities found.</li>
                )}
                <div className="flex items-center justify-center rounded-3xl p-4 min-w-[180px]">
                    <button onClick={() => navigate("/create-identity")} className="flex flex-col items-center justify-center w-full bg-white rounded-2xl p-4">
                        <div className="rounded-full bg-gray-100 p-4 mb-3">
                            <Plus className="h-12 w-12 text-blue-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">Create New Profile</span>
                    </button>
                </div>
            </div>
            {isOTPModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-lg shadow-lg w-96 relative">
                        <button onClick={() => setIsOTPModalOpen(false)} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700">
                            &#x2715;
                        </button>
                        {selectedIdentity && (
                            <OTPLogin
                                identity={selectedIdentity}
                                isOpen={isOTPModalOpen}
                                onClose={() => setIsOTPModalOpen(false)}
                                onSuccess={handleLoginSuccess}
                                onFailure={handleLoginFailure}
                            />
                        )}
                    </div>
                </div>
            )}
            {selectedIdentity && (
                <div className="mt-6 p-4 bg-white shadow rounded w-full">
                    <pre className="whitespace-pre-wrap break-all">{JSON.stringify(selectedIdentity, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

export default IdentityManager;
