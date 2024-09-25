// HomeModule.tsx
import React from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import { FaUsers } from "react-icons/fa";
import EditableImage from "./editable-image";
import EditableField from "./editable-field";
import InviteButton from "./invite-button";
import JoinButton from "./join-button";

type HomeContentProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    authorizedToEdit: boolean;
};

export default function HomeContent({ circle, isDefaultCircle, authorizedToEdit }: HomeContentProps) {
    const isUser = circle?.circleType === "user";
    const memberCount = circle?.members ? (isUser ? circle.members - 1 : circle.members) : 0;

    return (
        <div className="flex flex-1 flex-col">
            <div className="relative flex justify-center">
                <div className="absolute top-[-75px]">
                    <div className="h-[150px] w-[150px]">
                        {authorizedToEdit ? (
                            <EditableImage
                                id="picture"
                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                alt="Picture"
                                className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                fill
                                circleId={circle._id!}
                            />
                        ) : (
                            <Image
                                className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                alt="Picture"
                                fill
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="mb-8 mt-[65px] flex flex-col items-center justify-center">
                <h4 className="text-4xl font-bold text-gray-800">
                    {authorizedToEdit ? (
                        <EditableField id="name" value={circle.name ?? ""} circleId={circle._id!} />
                    ) : (
                        circle.name
                    )}
                </h4>
                {circle.description && (
                    <div className="pl-4 pr-4 text-center text-gray-600">
                        {authorizedToEdit ? (
                            <EditableField
                                id="description"
                                value={circle.description}
                                circleId={circle._id!}
                                multiline
                            />
                        ) : (
                            circle.description
                        )}
                    </div>
                )}
                {memberCount > 0 && (
                    <div className="flex flex-row items-center justify-center pt-4 text-gray-600">
                        <FaUsers />
                        <p className="m-0 ml-2">
                            {memberCount}{" "}
                            {memberCount !== 1 ? (isUser ? "Friends" : "Members") : isUser ? "Friend" : "Member"}
                        </p>
                    </div>
                )}
            </div>

            {circle.handle === "default" && (
                <div className="flex flex-col items-center justify-center">
                    <div className="mb-8 flex max-w-[700px] flex-col">
                        <div className="text-[20px] text-lg font-bold">Welcome</div>
                        <div className="card pt-2 text-[18px]">
                            Circles is an open-source social media platform for change makers, for co-creators, for
                            problem solvers, for people that want to make a real difference in the world. For people
                            that care. For people that dream of a better world for everyone. Welcome!
                            <br />
                            <br />
                            We receive contributions from a number of different people and networks. We will never allow
                            any form of funding that will influence the platform in any direction the community does not
                            approve of. We will not mine or sell personal data and we will not host any ads.
                            <br />
                            <br />
                            This is an early version of the platform, we have a lot of ideas about where we want to take
                            this next. If you’d like to join our team and volunteer network or contribute in any other
                            way, please get in touch.
                            <br />
                            <br />
                        </div>
                    </div>
                </div>
            )}

            {circle.handle === "grabogro" && (
                <div className="flex flex-col items-center justify-center">
                    <div className="mb-8 flex max-w-[700px] flex-col">
                        <div className="text-[20px] text-lg font-bold">Om oss</div>
                        <div className="card pt-2 text-[18px]">
                            Vi arbetar för att främja hållbar odling och grönska i Gråbo. Vi vill hjälpa, aktivera och
                            inspirera människor till att skapa en frodande grön miljö i Gråbo. Vi vill att det ska vara
                            lätt att välja hållbara livsmönster och livnära sig på närodlat. Vi vill bereda plats för
                            möten över kulturgränser och generationsmöten kring odling – ”Odling är för alla”.
                        </div>
                        <div className="pt-8 text-[20px] text-lg font-bold">Medskaparparken</div>
                        <div className="card pt-2 text-[18px]">
                            Projektets mål är att etablera en odlingspark, anlagd och upprätthållen enligt
                            permakultur-principer. Med permakultur-principer avses både social permakultur, dvs att alla
                            berörda bidrar på det sätt som passar dem och gynnas därefter, och biologisk permakultur.
                            Platsen skulle förse lokalbefolkningen med närodlad mat och öppna, naturliga mötes- och
                            aktivitetsplatser. Den skulle dessutom användas till att, med stöd från lärare, bedriva
                            workshops med grundskolornas elever för att öka förståelsen för vår närmiljö och konsumtion
                            – från matjord till matbord. Syftet är att gynna lokal matproduktion, praktisk utbildning,
                            naturliga möten i samhället, gemenskap, medborgardelaktighet och citizen science.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
