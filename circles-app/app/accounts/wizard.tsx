// wizard.tsx - Account creation wizard
import React from "react";
import { useState } from "react";
import { View, Button, Text } from "react-native";
import { useRouter } from "expo-router";

export default function Wizard() {
    const router = useRouter();
    const [step, setStep] = useState(0);

    const handleNext = () => {
        if (step === 2) {
            router.replace("/main");
        } else {
            setStep((prev) => prev + 1);
        }
    };

    return (
        <View>
            <Text>Wizard Step {step + 1}</Text>
            <Button title="Next" onPress={handleNext} />
        </View>
    );
}
