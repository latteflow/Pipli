// context/BleContext.tsx
import React, { createContext, useContext, ReactNode, useCallback } from 'react'; // Added useCallback
import { Device } from 'react-native-ble-plx';
import useBLE from '@/hooks/useBle'; // Assuming useBLE hook is in hooks directory

// Define the shape of the context data based on useBLE's return type
interface BleContextType {
    requestPermissions: () => Promise<boolean>;
    scanForPeripherals: () => void;
    connectToDevice: (device: Device) => Promise<void>;
    disconnectFromDevice: () => Promise<void>;
    sendData: (data: string) => Promise<void>;
    allDevices: Device[];
    connectedDevice: Device | null;

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
     * NOTE: This now uses the 'clearValue' function assumed to be returned by useBLE.
     */
    clearReceivedData: () => void;
    // --- END NEW & UPDATED ---

    // isLoading?: boolean; // Uncomment if useBLE provides these
    // error?: string | null;
}

// Create the context with a default value
const BleContext = createContext<BleContextType | undefined>(undefined);

// Create a provider component
interface BleProviderProps {
    children: ReactNode;
}

export const BleProvider: React.FC<BleProviderProps> = ({ children }) => {
    // Call the hook internally.
    // *** IMPORTANT ***: Assumes `useBLE` hook now returns an object containing
    // 'value' (for received data) and 'clearValue' (the function to clear 'value').
    const bleDataFromHook = useBLE();

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

        // Use the 'clearValue' function directly from the hook.
        // Provide a safe fallback if it's somehow still missing.
        clearReceivedData: typeof bleDataFromHook.clearValue === 'function'
            ? bleDataFromHook.clearValue
            : () => { console.error("BleContext Error: clearReceivedData called, but clearValue function is missing from useBLE hook."); },

        // Pass through other potential fields if needed
        // isLoading: bleDataFromHook.isLoading,
        // error: bleDataFromHook.error,
    };

    // Keep the warning check during development for clarity
    if (typeof bleDataFromHook.clearValue !== 'function') {
        // This warning should disappear after you fix useBLE.ts
        console.warn("BleContext Warning: `clearValue` function is missing from the value returned by `useBLE`. `clearReceivedData` will not work correctly until useBLE is updated.");
    }
    if (bleDataFromHook.value === undefined) {
        // Add check for value as well, just in case
        console.warn("BleContext Warning: `value` property is missing from the value returned by `useBLE`. Received data might not work.");
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