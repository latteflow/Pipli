/* eslint-disable no-bitwise */
// @/hooks/useBle.ts
import { useRef, useCallback, useMemo, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
    BleManager,
    Device,
    Subscription,
    Characteristic,
    BleError, // Import BleError
} from "react-native-ble-plx";
import { PERMISSIONS, requestMultiple, RESULTS } from "react-native-permissions";
import base64 from 'react-native-base64'; // Import base64 library

// --- IMPORTANT: Replace with YOUR peripheral's specific UUIDs ---
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"; // The service you scan for
const DATA_READ_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"; // Characteristic to read from (you already have this logic)
const DATA_WRITE_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"; // Characteristic to write to
// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

interface BluetoothLowEnergyApi {
    requestPermissions(): Promise<boolean>;
    scanForPeripherals(): void;
    connectToDevice(device: Device): Promise<void>;
    disconnectFromDevice(): Promise<void>; // Added disconnect function
    sendData(data: string): Promise<void>; // Added send data function
    allDevices: Device[];
    connectedDevice: Device | null;
    value: string | null; // Assuming 'value' holds the read data
    clearValue: () => void; // Function to clear the read value
}

function useBLE(): BluetoothLowEnergyApi {
    const bleManager = useMemo(() => new BleManager(), []);
    const [allDevices, setAllDevices] = useState<Device[]>([]);
    const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
    const [value, setValue] = useState<string | null>(null); // State for read value

    // Subscription reference for cleanup
    const [notificationSubscription, setNotificationSubscription] = useState<Subscription | null>(null);

    const [dataBuffer, setDataBuffer] = useState<string>('');
    const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const MESSAGE_TIMEOUT_MS = 400; // Adjust timeout (e.g., 100-250ms)

    const requestPermissions = async (): Promise<boolean> => {
        if (Platform.OS === 'android') {
            // --- Corrected Check ---
            if (Platform.Version >= 31) { // Android 12 (API 31) +
                // --- --- --- --- --- ---
                console.log("Requesting Android 12+ permissions...");
                const result = await requestMultiple([
                    PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
                    PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
                    PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION, // Still recommended for reliable scanning
                ]);
                const granted =
                    result[PERMISSIONS.ANDROID.BLUETOOTH_CONNECT] === RESULTS.GRANTED &&
                    result[PERMISSIONS.ANDROID.BLUETOOTH_SCAN] === RESULTS.GRANTED &&
                    result[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === RESULTS.GRANTED; // Check fine location too

                console.log("Android 12+ Permissions Granted:", granted, result);
                return granted;

            } else { // Older Android (API < 31)
                console.log("Requesting legacy Android permissions...");
                const result = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    {
                        title: "Location Permission",
                        message: "Bluetooth Low Energy requires Location",
                        buttonNeutral: "Ask Me Later",
                        buttonNegative: "Cancel",
                        buttonPositive: "OK",
                    }
                );
                const granted = result === PermissionsAndroid.RESULTS.GRANTED;
                console.log("Legacy Android Permissions Granted:", granted);
                return granted;
            }
        } else {
            // iOS permissions are typically handled implicitly or via Info.plist
            console.log("iOS platform detected, assuming permissions are handled.");
            return true;
        }
    };


    const isDuplicateDevice = (devices: Device[], nextDevice: Device) =>
        devices.findIndex((device) => device.id === nextDevice.id) > -1;

    const scanForPeripherals = () => {
        bleManager.stopDeviceScan(); // Stop previous scan first
        setAllDevices([]); // Clear previous list
        console.log("Scanning for peripherals with service:", SERVICE_UUID);

        bleManager.startDeviceScan(
            [SERVICE_UUID], // Filter by your specific service UUID
            null,
            (error, device) => {
                if (error) {
                    console.error("Scan Error:", error.message);
                    // Consider stopping scan or showing user feedback
                    // bleManager.stopDeviceScan();
                    return;
                }
                if (device && (device.name || device.localName)) {
                    setAllDevices((prevState) => {
                        if (!isDuplicateDevice(prevState, device)) {
                            console.log("Found device:", device.name || device.localName, device.id);
                            return [...prevState, device];
                        }
                        return prevState;
                    });
                }
            }
        );
        // Optional: Stop scan after timeout
        // setTimeout(() => {
        //     bleManager.stopDeviceScan();
        //     console.log("Scan stopped by timeout.");
        // }, 15000); // e.g., 15 seconds
    };

    const connectToDevice = async (device: Device) => {
        try {
            console.log("Stopping scan and connecting to:", device.id);
            bleManager.stopDeviceScan(); // Stop scanning before connecting
            const connected = await device.connect();
            console.log("Connected to:", connected.id);
            setConnectedDevice(connected);

            // --- Discover services and characteristics ---
            console.log("Discovering services and characteristics...");
            await connected.discoverAllServicesAndCharacteristics();
            console.log("Discovery complete.");
            // --- --- --- --- --- --- --- --- --- --- ---

            // --- Start listening for notifications (your existing read logic) ---
            monitorDataCharacteristic(connected);
            // --- --- --- --- --- --- --- --- --- --- ---

        } catch (e) {
            const err = e as BleError; // Type assertion
            console.error("Failed to connect or discover:", err.message, "Reason:", err.reason);
            setConnectedDevice(null); // Ensure state is reset on failure
        }
    };

    const disconnectFromDevice = async () => {
        if (!connectedDevice) {
            console.log("No device connected.");
            return;
        }
        console.log("Disconnecting from:", connectedDevice.id);
        try {
            // Cancel any active notification subscription first
            if (notificationSubscription) {
                console.log("Removing notification subscription");
                notificationSubscription.remove();
                setNotificationSubscription(null);
            }

            await bleManager.cancelDeviceConnection(connectedDevice.id);
            console.log("Disconnected successfully.");
            setConnectedDevice(null);
            setValue(null); // Reset read value
        } catch (e) {
            const err = e as BleError;
            console.error("Failed to disconnect:", err.message, "Reason:", err.reason);
            // Even if disconnect fails, reset state as connection is likely lost
            setConnectedDevice(null);
            setValue(null);
        }
    };

    // --- Function to send data (write characteristic) ---
    const sendData = async (data: string) => {
        if (!connectedDevice) {
            console.error("Cannot send data, no device connected.");
            throw new Error("Device not connected"); // Or return false/handle differently
        }

        try {
            // Encode the string data to Base64
            const base64Data = base64.encode(data);
            console.log(`Sending data "${data}" (Base64: ${base64Data}) to ${DATA_WRITE_CHARACTERISTIC_UUID}`);

            // Use writeCharacteristicWithResponse for acknowledged writes
            // Use writeCharacteristicWithoutResponse for unacknowledged writes
            await connectedDevice.writeCharacteristicWithResponseForService( // Corrected method name
                SERVICE_UUID,
                DATA_WRITE_CHARACTERISTIC_UUID,
                base64Data
            );
            console.log("Data sent successfully.");

        } catch (e) {
            const err = e as BleError;
            console.error("Failed to send data:", err.message, "Reason:", err.reason);
            // Handle specific errors, e.g., characteristic not found, device disconnected
            if (err.errorCode === 201) { // Device disconnected
                disconnectFromDevice();
            }
            throw err; // Re-throw error for the UI to potentially handle
        }
    };
    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

    const monitorDataCharacteristic = (device: Device) => {
        // --- Add this line ---
        console.log("Setting up buffered notifications for:", DATA_READ_CHARACTERISTIC_UUID);
        // --- --- --- --- ---
        const subscription = device.monitorCharacteristicForService( // Store the result
            SERVICE_UUID,
            DATA_READ_CHARACTERISTIC_UUID,
            (error, characteristic) => {
                if (error) {
                    console.error("Buffered Notification Error:", error.message, "Reason:", error.reason); // Log specific error
                    if (error.errorCode === 201) { disconnectFromDevice(); }
                    return;
                }
                if (characteristic?.value) {
                    // --- Ensure consistent decoding ---
                    let newDataChunk = '';
                    try {
                        // Use the imported base64 library to decode
                        newDataChunk = base64.decode(characteristic.value);
                    } catch (decodeError) {
                        console.error("Error decoding base64 chunk:", decodeError);
                        return; // Skip this chunk if decoding fails
                    }
                    // --- --- --- --- --- --- --- --- ---

                    console.log(`[useBLE - Buffer] Received chunk: ${newDataChunk}`); // Add identifier

                    // Append new chunk
                    setDataBuffer(prevBuffer => prevBuffer + newDataChunk);

                    // Clear any existing timeout
                    if (messageTimeoutRef.current) {
                        clearTimeout(messageTimeoutRef.current);
                    }

                    // Set a new timeout to process the buffer after a short delay
                    messageTimeoutRef.current = setTimeout(() => {
                        // Use a temporary variable to hold the buffer content at the time timeout fires
                        // Read the state directly within the timeout to get the most up-to-date buffer
                        setDataBuffer(currentBuffer => {
                            if (currentBuffer) { // Check if the current buffer has data
                                console.log(`[useBLE - Buffer] Timeout fired. Processing buffer: ${currentBuffer}`);
                                setValue(currentBuffer); // Update state with the accumulated buffer
                                // Return empty string to clear the buffer state AFTER processing
                                return '';
                            } else {
                                console.log(`[useBLE - Buffer] Timeout fired, but buffer was empty.`);
                                return ''; // Still clear if somehow empty
                            }
                        });
                        messageTimeoutRef.current = null; // Clear the ref
                    }, MESSAGE_TIMEOUT_MS);
                }
            }
        );
        // --- Add this line ---
        setNotificationSubscription(subscription); // Store subscription for cleanup
        // --- --- --- --- ---
    };

    // Ensure 'clearValue' also clears the buffer and any pending timeout
    const clearValue = useCallback(() => {
        setValue(null);
        setDataBuffer('');
        if (messageTimeoutRef.current) {
            clearTimeout(messageTimeoutRef.current);
            messageTimeoutRef.current = null;
        }
    }, []);

    return {
        requestPermissions,
        scanForPeripherals,
        connectToDevice,
        disconnectFromDevice, // Export disconnect
        sendData,             // Export sendData
        allDevices,
        connectedDevice,
        value,
        clearValue
    };
}

export default useBLE;
