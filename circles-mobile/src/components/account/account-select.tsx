import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Profile = {
    id: string;
    name: string;
    image: string;
};

const profiles: Profile[] = [
    { id: "1", name: "Andrew Robinson", image: "/images/default-user-picture.png" },
    { id: "2", name: "Mary Kyles", image: "/images/default-user-picture.png" },
];

export const AccountSelect = () => {
    const navigate = useNavigate();

    const onClick = () => {
        // navigate to /matrix
        navigate("/matrix");
    };

    return (
        <div className="mx-auto max-w-3xl p-8">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">Who is using Circles?</h1>
                <p className="text-sm text-gray-600">Choose your self-sovereign digital identity</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {profiles.map((profile) => (
                    <div key={profile.id} className="relative bg-blue-50 rounded-3xl p-4 min-w-[180px] cursor-pointer" onClick={onClick}>
                        <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex flex-col items-center">
                                <Avatar className="h-20 w-20 mb-3">
                                    <AvatarImage src={profile.image} alt={`${profile.name}'s profile picture`} />
                                    <AvatarFallback>{profile.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium text-gray-900 truncate w-full text-center">{profile.name}</span>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="absolute top-6 right-6 h-8 w-8 text-gray-500 hover:text-gray-700">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">Open menu</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-red-600">
                                        <Trash className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                ))}
                <div className="flex items-center justify-center rounded-3xl p-4 min-w-[180px]">
                    <button className="flex flex-col items-center justify-center w-full bg-white rounded-2xl p-4">
                        <div className="rounded-full bg-gray-100 p-4 mb-3">
                            <Plus className="h-12 w-12 text-blue-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">Create New Profile</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
