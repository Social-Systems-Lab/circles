import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Location } from "@/models/models";
import { preparePersonalLocationForSave, projectPublicLocation } from "@/lib/location-privacy";

const privateLocation: Location = {
    precision: 2,
    country: "Country",
    region: "Region",
    city: "Town",
    street: "PRIVATE STREET 42",
    lngLat: { lng: 12.34567, lat: 45.67891 },
};

assert.deepEqual(projectPublicLocation(privateLocation), {
    precision: 2,
    country: "Country",
    region: "Region",
    city: "Town",
});
assert.equal(JSON.stringify(projectPublicLocation(privateLocation)).includes("12.34567"), false);
assert.equal(JSON.stringify(projectPublicLocation(privateLocation)).includes("PRIVATE STREET 42"), false);
assert.deepEqual(projectPublicLocation({ ...privateLocation, precision: 4 })?.lngLat, privateLocation.lngLat);
assert.equal(projectPublicLocation({ ...privateLocation, precision: 8 }), undefined);

const unchanged = preparePersonalLocationForSave(privateLocation, privateLocation);
assert.equal(unchanged.valid, true);
if (unchanged.valid) assert.equal(unchanged.location?.precision, 2, "unchanged legacy precision stays intact");

const newlySelected = preparePersonalLocationForSave(
    { ...privateLocation, city: "Another Town", lngLat: { lng: 13, lat: 46 } },
    privateLocation,
);
assert.equal(newlySelected.valid, true);
if (newlySelected.valid) {
    assert.equal(newlySelected.location?.precision, 4, "a newly selected personal pin is publicly mappable");
    assert.deepEqual(newlySelected.location?.lngLat, { lng: 13, lat: 46 });
}

const initialPin = preparePersonalLocationForSave({ city: "Town", lngLat: { lng: 12, lat: 45 }, precision: 2 });
assert.equal(initialPin.valid, true);
if (initialPin.valid) assert.equal(initialPin.location?.precision, 4);
assert.equal(
    preparePersonalLocationForSave({ precision: 2, lngLat: { lng: 181, lat: 0 } }, privateLocation).valid,
    false,
    "out-of-range selected coordinates are rejected",
);

const bookmarksRoute = readFileSync("src/app/api/bookmarks/route.ts", "utf8");
const bookmarksPage = readFileSync("src/app/bookmarks/page.tsx", "utf8");
const bookmarksAction = readFileSync("src/components/modules/home/actions.ts", "utf8");
const aboutAction = readFileSync("src/app/circles/[handle]/settings/about/actions.ts", "utf8");
const onboardingCardAction = readFileSync("src/app/onboarding/card-actions.ts", "utf8");
const legacyOnboardingAction = readFileSync("src/components/onboarding/actions.ts", "utf8");
const locationPicker = readFileSync("src/components/forms/location-picker.tsx", "utf8");
const profileLocationStep = readFileSync("src/components/onboarding/profile-location-step.tsx", "utf8");
const locationField = readFileSync("src/components/forms/dynamic-field.tsx", "utf8");
const aboutForm = readFileSync("src/components/forms/circle-settings/about-settings-form.tsx", "utf8");
const circlesPage = readFileSync("src/app/circles/page.tsx", "utf8");
const pinnedRoute = readFileSync("src/app/api/pins/route.ts", "utf8");
const adminActions = readFileSync("src/components/modules/admin/actions.ts", "utf8");

assert.match(bookmarksRoute, /getAuthenticatedUserDid\(\)/, "bookmark API remains authenticated");
assert.match(bookmarksRoute, /circles\.map\(buildPinnedCircleDto\)/, "bookmark API uses the privacy-aware DTO");
assert.match(bookmarksPage, /map\(buildPinnedCircleDto\)/, "bookmark server page uses the location-aware client DTO");
assert.match(
    bookmarksAction,
    /location: buildClientLocation\(circle\.location\)/,
    "bookmark server action returns the precision-aware location projection",
);
assert.match(
    bookmarksAction,
    /export type BookmarkedCircleActionDto/,
    "bookmark action uses an explicit client payload",
);
assert.doesNotMatch(
    bookmarksAction.slice(bookmarksAction.indexOf("export const getBookmarkedCirclesAction")),
    /return circles;|\.\.\.circle/,
);
assert.match(aboutAction, /existingCircle\.did !== userDid/, "personal settings writes verify profile ownership");
assert.match(
    aboutAction,
    /preparePersonalLocationForSave\(values\.location, existingCircle\.location\)/,
    "settings preserves untouched locations",
);
assert.match(
    onboardingCardAction,
    /profile\.circleType !== "user" \|\| profile\.did !== did/,
    "new onboarding writes remain owner-scoped",
);
assert.match(
    legacyOnboardingAction,
    /String\(user\._id\) !== String\(circleId\)/,
    "legacy onboarding location writes are owner-scoped",
);
assert.match(
    locationPicker,
    /if \(personalProfile\)[\s\S]*?map\.current\.flyTo/,
    "personal geolocation only centers the map",
);
const geolocationHandler = locationPicker.slice(
    locationPicker.indexOf("const handleUseCurrentLocation"),
    locationPicker.indexOf("const getDisplayLocation"),
);
const personalGeolocation = geolocationHandler.slice(
    geolocationHandler.indexOf("if (personalProfile)"),
    geolocationHandler.indexOf(
        "updateLocation({ lng: longitude, lat: latitude }, true)",
        geolocationHandler.indexOf("if (personalProfile)"),
    ),
);
assert.match(personalGeolocation, /map\.current\.flyTo\(\{ center: \[longitude, latitude\], zoom: 13\.5 \}\)/);
assert.doesNotMatch(personalGeolocation, /mapMarker\.current\?\.remove\(\)/);
assert.doesNotMatch(personalGeolocation, /setAutoCompleteValue\(\{ value: "", label: "" \}\)/);
assert.doesNotMatch(personalGeolocation, /setIsLocationConfirmed\(false\)/);
assert.doesNotMatch(
    personalGeolocation,
    /updateLocation\(/,
    "device coordinates never replace the selected personal pin",
);
assert.match(geolocationHandler, /We couldn’t access your location/, "permission denial has visible feedback");
const autocomplete = readFileSync("src/components/ui/autocomplete.tsx", "utf8");
assert.match(autocomplete, /min-w-0 flex-1 [\s\S]*?text-ellipsis whitespace-nowrap/);
assert.match(autocomplete, /aria-label="Clear selected location"/);
assert.match(autocomplete, /View full selected location[\s\S]*?break-words/);
assert.match(locationPicker, /personalProfile \? "Find My Current Area" : "Use Current Location"/);
assert.match(
    locationPicker,
    /!compact && !personalProfile/,
    "precision UI is retained only for non-personal picker use",
);
assert.match(locationPicker, /personalProfile \? 4 : \(\(value\?\.precision as PrecisionLevel\) \?\? 4\)/);
assert.match(
    locationPicker,
    /!personalProfile && value\.precision !== precision/,
    "hidden defaults preserve stored precision",
);
assert.match(profileLocationStep, /personalProfile/, "legacy profile onboarding uses personal location behavior");
assert.match(profileLocationStep, /Choose where people can find you/, "legacy onboarding has public-pin guidance");
assert.match(
    locationField,
    /LocationPicker value=\{formField\.value\} onChange=\{formField\.onChange\} personalProfile=\{isUser\}/,
);
assert.match(locationField, /Your selected[\s\S]*visible to other Kamooni members/);
assert.match(aboutForm, /isUser=\{isUserProfile\}/, "the regular personal-profile editor selects personal mode");
assert.match(circlesPage, /circles = circles\.map\(\(circle\) => \(\{ \.\.\.circle, location: buildClientLocation/);
assert.match(pinnedRoute, /ordered\.map\(buildPinnedCircleDto\)/, "pinned API already uses the precision-aware DTO");
const adminCircleReadAction = adminActions.slice(adminActions.indexOf("export async function getCircleByIdAction"));
assert.match(adminCircleReadAction, /getAuthenticatedUserDid\(\)/, "admin circle reads require an authenticated user");
assert.match(
    adminCircleReadAction,
    /if \(!user\?\.isAdmin\) throw new Error\("Unauthorized"\)/,
    "admin circle reads enforce admin authorization",
);

console.log("personal location privacy tests passed");
