import React, { FC, useCallback } from "react";
import {
    FlatList,
    ListRenderItemInfo,
    Modal,
    SafeAreaView,
    Text,
    StyleSheet,
    TouchableOpacity,
    View,
    Platform, // Import View
} from "react-native";
import { Device } from "react-native-ble-plx";

// --- DeviceModalListItemProps remains the same ---
type DeviceModalListItemProps = {
    item: ListRenderItemInfo<Device>;
    connectToPeripheral: (device: Device) => void;
    closeModal: () => void;
};

// --- DeviceModalProps remains the same ---
type DeviceModalProps = {
    devices: Device[];
    visible: boolean;
    connectToPeripheral: (device: Device) => void;
    closeModal: () => void;
};

// --- DeviceModalListItem remains the same ---
const DeviceModalListItem: FC<DeviceModalListItemProps> = (props) => {
    const { item, connectToPeripheral, closeModal } = props;

    const connectAndCloseModal = useCallback(() => {
        console.log("[DeviceModal] Connecting to:", item.item.id); // Add log
        connectToPeripheral(item.item);
        // closeModal(); // Let's remove closing from here, handle in parent if needed? Or keep it? Let's keep it for now.
        // If connection fails, the modal might reopen if visible depends on !connectedDevice
        closeModal();
    }, [closeModal, connectToPeripheral, item.item]);

    return (
        <TouchableOpacity
            onPress={connectAndCloseModal}
            style={modalStyle.ctaButton}
        >
            <Text style={modalStyle.ctaButtonText}>
                {item.item.name ?? item.item.localName ?? item.item.id} {/* Show ID if no name */}
            </Text>
        </TouchableOpacity>
    );
};


// --- Modify DeviceModal ---
const DeviceModal: FC<DeviceModalProps> = (props) => {
    const { devices, visible, connectToPeripheral, closeModal } = props;

    const renderDeviceModalListItem = useCallback(
        (item: ListRenderItemInfo<Device>) => {
            return (
                <DeviceModalListItem
                    item={item}
                    connectToPeripheral={connectToPeripheral}
                    closeModal={closeModal} // Pass closeModal down
                />
            );
        },
        // Include connectToPeripheral and closeModal in dependency array
        [connectToPeripheral, closeModal]
    );

    return (
        <Modal
            // style={modalStyle.modalContainer} // Style prop on Modal might not work as expected, apply to inner views
            animationType="slide"
            transparent={false}
            visible={visible}
            onRequestClose={closeModal} // Add onRequestClose for Android back button handling
        >
            {/* Apply background color to SafeAreaView */}
            <SafeAreaView style={modalStyle.modalSafeArea}>
                <View style={modalStyle.modalHeader}>
                    <Text style={modalStyle.modalTitleText}>
                        Tap on a device to connect
                    </Text>
                    {/* Add Cancel Button */}
                    <TouchableOpacity onPress={closeModal} style={modalStyle.cancelButton}>
                        <Text style={modalStyle.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
                {/* Check if devices array is empty */}
                {devices.length === 0 ? (
                    <View style={modalStyle.noDevicesContainer}>
                        <Text style={modalStyle.noDevicesText}>Scanning for devices...</Text>
                        {/* Optional: Add an ActivityIndicator here */}
                    </View>
                ) : (
                    <FlatList
                        contentContainerStyle={modalStyle.modalFlatlistContainer}
                        data={devices}
                        renderItem={renderDeviceModalListItem}
                        keyExtractor={(item) => item.id} // Add keyExtractor
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
};

// --- Modify Styles ---
const modalStyle = StyleSheet.create({
    modalSafeArea: { // Apply flex and background here
        flex: 1,
        backgroundColor: "#f2f2f2",
    },
    modalHeader: { // Container for title and cancel button
        marginTop: Platform.OS === 'android' ? 20 : 40, // Adjust top margin for platform
        paddingHorizontal: 20,
        paddingBottom: 10, // Add some padding below header
        borderBottomWidth: 1, // Optional separator
        borderBottomColor: '#e0e0e0', // Optional separator color
        flexDirection: 'row', // Arrange title and button side-by-side
        justifyContent: 'space-between', // Space them out
        alignItems: 'center', // Align vertically
    },
    modalTitleText: {
        fontSize: 22, // Slightly smaller title
        fontWeight: "bold",
        textAlign: "left", // Align left now
        flex: 1, // Allow title to take available space
    },
    cancelButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        // backgroundColor: '#e0e0e0', // Optional background
        borderRadius: 5,
    },
    cancelButtonText: {
        fontSize: 16,
        color: "#007AFF", // Standard blue color for actions
        fontWeight: '600',
    },
    modalFlatlistContainer: {
        paddingTop: 10, // Add padding above the list
        paddingHorizontal: 20, // Add horizontal padding to list container
        paddingBottom: 20, // Add padding at the bottom
    },
    ctaButton: { // Style for device items
        backgroundColor: "#007AFF", // Changed color to blue
        justifyContent: "center",
        alignItems: "center",
        height: 50,
        // marginHorizontal: 20, // Remove horizontal margin, use FlatList container padding
        marginBottom: 10, // Increased spacing between items
        borderRadius: 8,
        paddingHorizontal: 10, // Add padding inside button
    },
    ctaButtonText: {
        fontSize: 17, // Slightly smaller text
        fontWeight: "500", // Medium weight
        color: "white",
        textAlign: 'center',
    },
    noDevicesContainer: { // Style for the "Scanning..." message
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noDevicesText: {
        fontSize: 18,
        color: '#888',
    },
});

export default DeviceModal;
