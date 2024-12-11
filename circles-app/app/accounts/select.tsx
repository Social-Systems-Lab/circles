import React from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useRouter } from "expo-router";
import { View, Text, Button } from "react-native";

export default function AccountSelect() {
    const { accounts, switchAccount } = useAuth();
    const router = useRouter();

    return (
        <View>
            {accounts.map((account) => (
                <Button
                    key={account.did}
                    title={account.name}
                    onPress={() => {
                        switchAccount(account.did);
                        router.replace("/main");
                    }}
                />
            ))}
            <Button title="Create New Account" onPress={() => router.push("/accounts/wizard")} />
        </View>
    );
}
