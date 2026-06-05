export const interestOptions = [
    { label: "Climate", value: "climate" },
    { label: "Community building", value: "community-building" },
    { label: "Democracy", value: "democracy" },
    { label: "Education", value: "education" },
    { label: "Health", value: "health" },
    { label: "Local economy", value: "local-economy" },
    { label: "Open source", value: "open-source" },
    { label: "Mutual aid", value: "mutual-aid" },
    { label: "Housing", value: "housing" },
    { label: "Food systems", value: "food-systems" },
    { label: "Governance", value: "governance" },
    { label: "Arts / culture", value: "arts-culture" },
    { label: "Regenerative living", value: "regenerative-living" },
    { label: "Civic tech", value: "civic-tech" },
    { label: "Youth", value: "youth" },
    { label: "Elder care", value: "elder-care" },
    { label: "Cooperative business", value: "cooperative-business" },
    { label: "Social innovation", value: "social-innovation" },
] as const;

const interestLabelMap = new Map<string, string>(interestOptions.map((interest) => [interest.value, interest.label]));

export function getInterestLabel(value: string): string {
    return (
        interestLabelMap.get(value) ||
        value
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ")
    );
}
