
import React, { useState } from "react";
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    TextInput, // Import TextInput
    Alert,     // Import Alert for feedback
    ActivityIndicator, // Optional: for loading state
    ScrollView, // Import ScrollView for better layout if content grows
} from "react-native";
import DeviceModal from "@/components/DeviceConnectionModal"; // Assuming path is correct
import { useBleContext } from "@/context/BleContext"; // Import the context hook

const ConnectScreen = () => {
    // Destructure all functions and state from the hook
    const {
        requestPermissions,
        scanForPeripherals,
        connectToDevice,
        disconnectFromDevice,
        sendData,
        allDevices,
        connectedDevice, // Watch this
        value,
    } = useBleContext();

    const [isModalVisible, setIsModalVisible] = useState<boolean>(false); // Watch this
    const [dataToSend, setDataToSend] = useState<string>("");
    const [isSending, setIsSending] = useState<boolean>(false);

    /**
     * Requests permissions and initiates scanning.
     * Returns true if permissions were granted, false otherwise.
     */
    const scanForDevices = async (): Promise<boolean> => {
        console.log("[scanForDevices] Requesting permissions...");
        let isPermissionsEnabled = false;
        try {
            isPermissionsEnabled = await requestPermissions();
            console.log("[scanForDevices] Permissions result:", isPermissionsEnabled);
        } catch (error) {
            console.error("[scanForDevices] Error requesting permissions:", error);
            Alert.alert("Permission Error", "Could not request permissions.");
            return false; // Indicate failure
        }

        if (isPermissionsEnabled) {
            console.log("[scanForDevices] Permissions granted, calling scanForPeripherals...");
            try {
                // Assuming scanForPeripherals handles its own errors internally
                // and starts the scan asynchronously.
                scanForPeripherals();
                return true; // Indicate success (permissions granted, scan likely started)
            } catch (error) {
                // This catch might not be necessary if useBLE handles errors, but good practice
                console.error("[scanForDevices] Error calling scanForPeripherals:", error);
                Alert.alert("Scan Error", "Could not start scanning.");
                return false; // Indicate failure
            }
        } else {
            console.log("[scanForDevices] Permissions denied.");
            Alert.alert(
                "Permission Denied",
                "Cannot scan for devices without required permissions."
            );
            return false; // Indicate failure
        }
    };

    /**
     * Explicitly hides the device selection modal.
     */
    const hideModal = () => {
        console.log("[hideModal] Hiding modal explicitly.");
        setIsModalVisible(false);
    };

    /**
     * Opens the device selection modal if not already connected.
     * Initiates scanning only if needed.
     */
    const openModal = async () => {
        console.log(`[openModal] Called. Current connectedDevice state:`, connectedDevice);

        if (!connectedDevice) {
            console.log("[openModal] Condition !connectedDevice is TRUE. Calling scanForDevices...");
            const permissionsGranted = await scanForDevices(); // Request permissions and scan

            if (permissionsGranted) {
                console.log("[openModal] scanForDevices reported success (permissions granted). Setting modal visible.");
                setIsModalVisible(true); // Open the modal ONLY if permissions were granted
            } else {
                console.log("[openModal] scanForDevices reported failure (permissions denied or error). Modal not opened.");
                // Alert is already shown in scanForDevices if permissions denied
            }
        } else {
            console.log("[openModal] Condition !connectedDevice is FALSE. Showing 'Already Connected' alert.");
            Alert.alert(
                "Already Connected",
                `Connected to ${connectedDevice.name ?? connectedDevice.localName ?? connectedDevice.id}`
            );
        }
    };

    // --- Handler for sending data ---
    const handleSendData = async () => {
        if (!dataToSend) {
            Alert.alert("Input Error", "Please enter data to send.");
            return;
        }
        if (!connectedDevice) {
            Alert.alert("Error", "No device connected.");
            return;
        }

        setIsSending(true); // Show loading indicator
        try {
            console.log(`[handleSendData] Attempting to send data: ${dataToSend}`);
            await sendData(dataToSend); // Call the hook's sendData function
            console.log("[handleSendData] Data send successful (from UI).");
            Alert.alert("Success", "Data sent!");
            setDataToSend(""); // Clear input after sending
        } catch (error: any) {
            console.error("[handleSendData] Send Data UI Error:", error);
            Alert.alert(
                "Send Error",
                `Failed to send data: ${error.message || "Unknown error"}`
            );
        } finally {
            setIsSending(false); // Hide loading indicator
        }
    };

    // --- Handler for disconnecting ---
    const handleDisconnect = async () => {
        if (connectedDevice) {
            console.log("[handleDisconnect] Attempting to disconnect...");
            try {
                await disconnectFromDevice(); // Call the hook's disconnect function
                console.log("[handleDisconnect] Disconnected successfully (from UI).");
                Alert.alert("Disconnected", "Device has been disconnected.");
                setDataToSend(""); // Reset send input as well
            } catch (error: any) {
                console.error("[handleDisconnect] Disconnect UI Error:", error);
                Alert.alert(
                    "Disconnect Error",
                    `Failed to disconnect: ${error.message || "Unknown error"}`
                );
            }
        } else {
            console.log("[handleDisconnect] No device connected to disconnect.");
            Alert.alert("Error", "No device is currently connected.");
        }
    };

    // --- Render Logic ---
    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                <View style={styles.contentWrapper}>
                    {connectedDevice ? (
                        // --- Connected State UI ---
                        <>
                            <Text style={styles.statusText}>Status: Connected</Text>
                            <Text style={styles.deviceNameText}>
                                Device: {connectedDevice.name ?? connectedDevice.localName ?? connectedDevice.id}
                            </Text>
                            <Text style={styles.dataText}>
                                Received Data: {value !== null ? `"${value}"` : "Listening..."}
                            </Text>

                            {/* --- Send Data Section --- */}
                            <View style={styles.actionSection}>
                                <Text style={styles.sectionTitle}>Send Data</Text>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Enter data to send"
                                    value={dataToSend}
                                    onChangeText={setDataToSend}
                                    editable={!isSending} // Disable input while sending
                                    placeholderTextColor="#999"
                                />
                                <TouchableOpacity
                                    onPress={handleSendData}
                                    style={[styles.ctaButton, styles.sendButton]}
                                    disabled={isSending} // Disable button while sending
                                >
                                    {isSending ? (
                                        <ActivityIndicator color="white" size="small" />
                                    ) : (
                                        <Text style={styles.ctaButtonText}>Send Data</Text>
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* --- Disconnect Button --- */}
                            <View style={styles.actionSection}>
                                <TouchableOpacity
                                    onPress={handleDisconnect}
                                    style={[styles.ctaButton, styles.disconnectButton]}
                                >
                                    <Text style={styles.ctaButtonText}>Disconnect</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        // --- Disconnected State UI ---
                        <>
                            <Text style={styles.statusText}>
                                Status: Disconnected
                            </Text>
                            <Text style={styles.promptText}>
                                Please connect the device to send/receive data.
                            </Text>
                            <TouchableOpacity onPress={openModal} style={[styles.ctaButton, styles.connectButton]}>
                                <Text style={styles.ctaButtonText}>Scan & Connect</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </ScrollView>

            {/* Device Selection Modal */}
            <DeviceModal
                closeModal={hideModal} // Pass the function to explicitly close
                // Show modal only if the state flag is true AND we are not connected
                visible={isModalVisible && !connectedDevice}
                connectToPeripheral={connectToDevice}
                devices={allDevices}
            />
        </SafeAreaView>
    );
};

// --- Styles ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f0f4f8", // Light background color
    },
    scrollContainer: {
        flexGrow: 1, // Allows content to scroll if it exceeds screen height
        justifyContent: 'center', // Center content vertically
    },
    contentWrapper: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    statusText: {
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        color: "#333",
        marginBottom: 10,
    },
    deviceNameText: {
        fontSize: 18,
        textAlign: "center",
        color: "#555",
        marginBottom: 15,
    },
    dataText: {
        fontSize: 18,
        textAlign: "center",
        color: "#0066cc", // Blue color for data
        marginBottom: 30,
        fontStyle: 'italic',
    },
    promptText: {
        fontSize: 18,
        textAlign: "center",
        color: "#555",
        marginBottom: 30,
    },
    actionSection: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 25, // Space between sections
        padding: 15,
        backgroundColor: '#ffffff', // White background for sections
        borderRadius: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#444',
        marginBottom: 15,
    },
    textInput: {
        height: 45,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        width: '100%',
        marginBottom: 15,
        paddingHorizontal: 15,
        backgroundColor: '#fff',
        fontSize: 16,
        color: '#333',
    },
    ctaButton: {
        justifyContent: "center",
        alignItems: "center",
        height: 50,
        borderRadius: 8,
        width: '100%', // Make buttons full width within section
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    ctaButtonText: {
        fontSize: 18,
        fontWeight: "bold",
        color: "white",
    },
    connectButton: {
        backgroundColor: "#007AFF", // Blue for connect
    },
    sendButton: {
        backgroundColor: '#34C759', // Green for send action
    },
    disconnectButton: {
        backgroundColor: '#FF3B30', // Red for disconnect
        marginTop: 0, // No extra margin needed within its own section
    },
});

export default ConnectScreen;
