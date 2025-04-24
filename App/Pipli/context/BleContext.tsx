// context/BleContext.tsx
import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
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

    // --- NEW & UPDATED ---
    /**
     * Holds the most recently received data string from the BLE device.
     * Will be null if no data has been received or after clearReceivedData is called.
     * NOTE: Assumes useBLE hook provides this value (likely as 'value').
     */
    receivedData: string | null;
    /**
     * Function to clear the receivedData state back to null.
     * Useful after processing the received data to prevent reprocessing.
     * NOTE: This now uses the 'setValue' function assumed to be returned by useBLE.
     */
    clearReceivedData: () => void;
    // --- END NEW & UPDATED ---

    // Add isLoading, errors, etc. if your useBLE hook provides them and you need them globally
    // Example:
    // isLoading: boolean;
    // error: string | null;
}

// Create the context with a default value (can be undefined or null initially)
const BleContext = createContext<BleContextType | undefined>(undefined);

// Create a provider component
interface BleProviderProps {
    children: ReactNode;
}

export const BleProvider: React.FC<BleProviderProps> = ({ children }) => {
    // Call the hook internally.
    // *** IMPORTANT ***: This assumes `useBLE` hook returns an object containing
    // 'value' (for received data) and 'setValue' (the state setter for 'value').
    const bleDataFromHook = useBLE();

    // Define the clear function using the hook's setValue
    // This assumes bleDataFromHook has a 'setValue' method corresponding to its 'value' state.
    const handleClearReceivedData = useCallback(() => {
        // Check if setValue exists before calling it
        if (typeof bleDataFromHook.setValue === 'function') {
            bleDataFromHook.setValue(null); // Set the state in useBLE back to null
        } else {
            console.error("BleContext: Cannot clear received data because `setValue` function is missing from `useBLE` hook's return value.");
        }
    }, [bleDataFromHook.setValue]); // Dependency on the setValue function itself

    // Construct the context value based on what useBLE provides.
    const contextValue: BleContextType = {
        // Pass through existing functions/state from the hook
        requestPermissions: bleDataFromHook.requestPermissions,
        scanForPeripherals: bleDataFromHook.scanForPeripherals,
        connectToDevice: bleDataFromHook.connectToDevice,
        disconnectFromDevice: bleDataFromHook.disconnectFromDevice,
        sendData: bleDataFromHook.sendData,
        allDevices: bleDataFromHook.allDevices,
        connectedDevice: bleDataFromHook.connectedDevice,

        // --- NEW & UPDATED ---
        // Map the relevant fields from the hook's return value
        receivedData: bleDataFromHook.value, // Map `value` from hook to `receivedData`

        // Use the handler function defined above which calls the hook's setValue
        clearReceivedData: handleClearReceivedData,

        // Pass through other potential fields if needed
        // isLoading: bleDataFromHook.isLoading,
        // error: bleDataFromHook.error,
    };

    // Optional: Add a check during development if 'value' or 'setValue' are missing
    if (bleDataFromHook.value === undefined) {
        console.warn("BleContext: `value` property is missing from the value returned by `useBLE`. Received data might not work.");
    }
    if (typeof bleDataFromHook.setValue !== 'function') {
        console.warn("BleContext: `setValue` function is missing from the value returned by `useBLE`. `clearReceivedData` will not work.");
    }


    return (
        <BleContext.Provider value={contextValue}>
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
