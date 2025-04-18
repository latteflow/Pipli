// context/BleContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { Device } from 'react-native-ble-plx';
import useBLE from '@/hooks/useBle'; // Assuming useBLE hook is in hooks directory

// Define the shape of the context data based on useBLE's return type
// Add other properties from useBLE if needed elsewhere via context
interface BleContextType {
    requestPermissions: () => Promise<boolean>;
    scanForPeripherals: () => void;
    connectToDevice: (device: Device) => Promise<void>;
    disconnectFromDevice: () => Promise<void>;
    sendData: (data: string) => Promise<void>; // Crucial for sending data
    allDevices: Device[];
    connectedDevice: Device | null; // Crucial for checking connection status
    value: string | null; // Received value
    // Add isLoading, errors, etc. if your useBLE hook provides them and you need them globally
}

// Create the context with a default value (can be undefined or null initially)
const BleContext = createContext<BleContextType | undefined>(undefined);

// Create a provider component
interface BleProviderProps {
    children: ReactNode;
}

export const BleProvider: React.FC<BleProviderProps> = ({ children }) => {
    const bleData = useBLE(); // Call the hook internally

    return (
        <BleContext.Provider value={bleData}>
            {children}
        </BleContext.Provider>
    );
};

// Create a custom hook for easy consumption
export const useBleContext = (): BleContextType => {
    const context = useContext(BleContext);
    if (context === undefined) {
        throw new Error('useBleContext must be used within a BleProvider');
    }
    return context;
};