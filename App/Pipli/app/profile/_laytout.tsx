// app/profile/_layout.tsx

import { Stack } from 'expo-router';
import React from 'react';

export default function ProfileStackLayout() {
    return (
        <Stack>
            {/* The detail screen will automatically be used */}
            <Stack.Screen name="[id]" options={{ title: 'Loading Profile...' }} />
            {/* Add other screens within the profile stack here if needed later */}
        </Stack>
    );
}
