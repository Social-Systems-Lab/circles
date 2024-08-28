import React from "react";

interface MapMarkerProps {
    picture?: string;
}

const MapMarker: React.FC<MapMarkerProps> = ({ picture }) => {
    return (
        <div className="group cursor-pointer">
            <div
                className="h-8 w-8 rounded-full border-2 border-white bg-cover bg-center shadow-md transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundImage: picture ? `url(${picture})` : "none" }}
            />
            <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 transform rounded-full bg-white shadow-md" />
        </div>
    );
};

export default MapMarker;
