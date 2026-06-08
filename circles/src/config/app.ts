export const appConfig = {
    name: "Peerify",
    legalName: "Peerify",
    tagline: "The Next Stage of Music",
    description: "A community-powered platform for discovering, supporting and hosting real musicians.",
    publicUrl: process.env.NEXT_PUBLIC_APP_URL || "http://65.21.91.96:3000",

    brand: {
        mode: "peerify",
        logoAlt: "Peerify",
        icon: "/peerify/favicon.ico",
    },

    stats: {
        artists: 0,
        fans: 0,
        venues: 0,
    },

    features: {
        genericCircles: false,
        musicProfiles: true,
        artists: true,
        fans: true,
        hosts: true,
        events: true,
        mapDiscovery: true,
        donations: false,
        memberships: false,
        vibeId: false,
    },
} as const;
