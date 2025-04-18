/* eslint-disable no-bitwise */
// @/hooks/useBle.ts
import { useMemo, useState } from "react";
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
}

function useBLE(): BluetoothLowEnergyApi {
    const bleManager = useMemo(() => new BleManager(), []);
    const [allDevices, setAllDevices] = useState<Device[]>([]);
    const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
    const [value, setValue] = useState<string | null>(null); // State for read value

    // Subscription reference for cleanup
    const [notificationSubscription, setNotificationSubscription] = useState<Subscription | null>(null);

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
            startStreamingData(connected);
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

    // --- Function to handle reading data (notifications/indications) ---
    const startStreamingData = (device: Device) => {
        if (device) {
            console.log("Setting up notifications for:", DATA_READ_CHARACTERISTIC_UUID);
            const subscription = device.monitorCharacteristicForService(
                SERVICE_UUID,
                DATA_READ_CHARACTERISTIC_UUID,
                (error, characteristic) => {
                    if (error) {
                        console.error("Notification Error:", error.message, "Reason:", error.reason);
                        // Consider disconnecting or handling the error
                        if (error.errorCode === 201) { // Device disconnected
                            disconnectFromDevice();
                        }
                        return;
                    }
                    if (characteristic?.value) {
                        const rawValue = base64.decode(characteristic.value);
                        console.log("Received data:", rawValue);
                        setValue(rawValue); // Update state with decoded value
                    }
                }
            );
            setNotificationSubscription(subscription); // Store subscription for cleanup
        } else {
            console.error("Cannot start streaming, device not connected.");
        }
    };
    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---

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

    return {
        requestPermissions,
        scanForPeripherals,
        connectToDevice,
        disconnectFromDevice, // Export disconnect
        sendData,             // Export sendData
        allDevices,
        connectedDevice,
        value,
    };
}

export default useBLE;
