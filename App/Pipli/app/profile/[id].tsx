// app/profile/[id].tsx

import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    ScrollView,
    Keyboard,
    Text, // Import standard Text for simple buttons
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Import the date picker library
import DatePicker from 'react-native-date-picker';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MedicationTimeStatus, Profile, Medication, RelationToFood, PROFILES_STORAGE_KEY } from '@/types/pipli';
import { useBleContext } from '@/context/BleContext';
import { prepareScheduleForDevice } from '@/utils/scheduleUtils';

const calculateTimestampForTime = (timeStr: string, referenceDate: Date): number | null => {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) {
        console.warn(`[calculateTimestampForTime] Invalid time format: ${timeStr}`);
        return null;
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
        console.warn(`[calculateTimestampForTime] Invalid time values (12-hour format): ${timeStr}`);
        return null;
    }
    if (period === 'PM' && hours !== 12) hours += 12;
    else if (period === 'AM' && hours === 12) hours = 0;
    if (hours < 0 || hours > 23) {
        console.warn(`[calculateTimestampForTime] Hour calculation error: ${timeStr}`);
        return null;
    }
    const specificTimeDate = new Date(referenceDate);
    specificTimeDate.setHours(hours, minutes, 0, 0);
    return Math.floor(specificTimeDate.getTime() / 1000);
};

// Helper to format Date object to HH:MM AM/PM string
const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric', // Use 'numeric' or '2-digit'
        minute: '2-digit',
        hour12: true, // Force AM/PM
    }).toUpperCase(); // Match the previous format expectation
};

// Helper to ensure medication has all fields (for loading old data)
const ensureMedicationDefaults = (med: Partial<Medication>): Medication => {
    const defaultTimes = Array.isArray(med.times) ? med.times : [];
    // Initialize timeStatuses based on times, defaulting responded to false
    const defaultTimeStatuses = defaultTimes.map(t => ({
        time: t,
        responded: false, // Default status
    }));

    return {
        id: med.id || Date.now().toString() + Math.random().toString(36).substring(2, 7),
        name: med.name || 'Unknown',
        dose: med.dose || '',
        times: defaultTimes,
        // Initialize timeStatuses, merging with existing if present (for future flexibility)
        timeStatuses: Array.isArray(med.timeStatuses)
            ? defaultTimes.map(t => {
                const existing = med.timeStatuses?.find(ts => ts.time === t);
                return existing || { time: t, responded: false };
            })
            : defaultTimeStatuses,
        durationDays: typeof med.durationDays === 'number' && med.durationDays > 0 ? med.durationDays : 1,
        relationToFood: med.relationToFood || 'any',
        notes: med.notes || '',
    };
};

export default function ProfileDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    // Get BLE functions/state from context
    // Assuming BleContext provides receivedData and clearReceivedData for status updates
    const { connectedDevice, sendData, receivedData, clearReceivedData } = useBleContext();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSendingSchedule, setIsSendingSchedule] = useState(false); // Loading state for sending schedule
    const [isRequestingUpdate, setIsRequestingUpdate] = useState(false);

    // --- State for NEW medication inputs ---
    const [newMedName, setNewMedName] = useState('');
    const [newMedDose, setNewMedDose] = useState('');
    const [newMedTimes, setNewMedTimes] = useState<string[]>([]); // Array to hold multiple times
    // REMOVED: const [currentTimeInput, setCurrentTimeInput] = useState('');
    const [newMedDurationDays, setNewMedDurationDays] = useState<string>('1');
    const [newMedRelationToFood, setNewMedRelationToFood] = useState<RelationToFood>('any');
    const [newMedNotes, setNewMedNotes] = useState('');
    // --- NEW State for Time Picker ---
    const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
    const [pickerDate, setPickerDate] = useState(new Date()); // Holds the date for the picker modal
    // ---

    // --- Load ALL profiles and find the current one ---
    useEffect(() => {
        const loadProfileData = async () => {
            if (!id) {
                console.error("Profile ID is missing");
                Alert.alert("Error", "Could not load profile details.");
                setIsLoading(false);
                router.back(); // Go back if ID is missing
                return;
            }
            setIsLoading(true);
            try {
                const storedProfiles = await AsyncStorage.getItem(PROFILES_STORAGE_KEY);
                if (storedProfiles !== null) {
                    const parsedProfiles: Profile[] = JSON.parse(storedProfiles);
                    const validatedProfiles = parsedProfiles.map(p => ({
                        ...p,
                        // Ensure defaults are applied, including initializing timeStatuses
                        currentMedications: (p.currentMedications || []).map(ensureMedicationDefaults),
                        pastMedications: (p.pastMedications || []).map(ensureMedicationDefaults),
                    }));
                    setAllProfiles(validatedProfiles);
                    const foundProfile = validatedProfiles.find(p => p.id === id);
                    if (foundProfile) {
                        setProfile(foundProfile);
                    } else {
                        console.error(`Profile with ID ${id} not found.`);
                        Alert.alert("Error", "Profile not found.");
                        router.back(); // Go back if profile not found
                    }
                } else {
                    console.error(`No profiles found in storage.`);
                    Alert.alert("Error", "Profile data not found.");
                    router.back(); // Go back if no data
                }
            } catch (error) {
                console.error('Failed to load profile data from storage', error);
                Alert.alert('Error', 'Could not load profile details.');
                router.back(); // Go back on error
            } finally {
                setIsLoading(false);
            }
        };
        loadProfileData();
    }, [id, router]); // Add router to dependency array

    // --- Save ALL profiles ---
    const saveAllProfiles = async (updatedProfiles: Profile[]) => {
        try {
            await AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
            console.log('All profiles saved:', updatedProfiles);
            setAllProfiles(updatedProfiles); // Keep local state in sync
            // Update the specific profile being viewed
            const updatedCurrentProfile = updatedProfiles.find(p => p.id === id);
            setProfile(updatedCurrentProfile || null);
        } catch (error) {
            console.error('Failed to save all profiles to storage', error);
            Alert.alert('Error', 'Could not save changes.');
        }
    };

    // --- Effect to process received data from BLE ---
    useEffect(() => {
        // Ensure receivedData is not null/undefined AND is not an empty/whitespace string
        if (receivedData && receivedData.trim() && profile && id) {
            console.log("[ProfileDetailScreen] Received data (length:", receivedData.length, "):", receivedData);
            try {
                // 1. UPDATE TYPE DEFINITION for the new structure
                const parsedData: { // Expect an object now
                    schedule: Array<{ // The array is under the 'schedule' key
                        med_id: string;
                        // ref_time seems gone based on example, remove if confirmed
                        times: Array<{ time: string; responded: boolean | null }>;
                    }>;
                    originalReceiveTime?: number; // Keep if needed, otherwise remove
                } = JSON.parse(receivedData);

                // 3. VALIDATE STRUCTURE: Check for the object and the schedule array
                if (typeof parsedData !== 'object' || parsedData === null || !Array.isArray(parsedData.schedule)) {
                    throw new Error("Invalid data structure received: 'schedule' array not found or invalid.");
                }
                // --- END VALIDATION ---

                // 2. EXTRACT SCHEDULE ARRAY
                const scheduleArray = parsedData.schedule;
                // --- END EXTRACTION ---

                // We still need today's midnight reference for offset calculation
                const refTimeDate = new Date();
                refTimeDate.setHours(0, 0, 0, 0);
                const refTimeSeconds = Math.floor(refTimeDate.getTime() / 1000);

                let profileWasUpdated = false;
                const updatedMedications = profile.currentMedications.map((med, medIndex) => {
                    const expectedDeviceMedId = String.fromCharCode(65 + medIndex);

                    // 4. UPDATE ITERATION: Find data within the scheduleArray
                    const deviceDataForMed = scheduleArray.find(d => d.med_id === expectedDeviceMedId);
                    // --- END UPDATE ---

                    if (deviceDataForMed) {
                        console.log(`[ProfileDetailScreen] Found matching device data for med_id: ${expectedDeviceMedId} (App Med: ${med.name})`);
                        let medicationUpdated = false;

                        // The rest of this inner logic remains the same as it operates on deviceDataForMed
                        const currentTimeStatuses = med.timeStatuses && med.timeStatuses.length === med.times.length
                            ? med.timeStatuses
                            : med.times.map(t => ({ time: t, responded: false }));

                        const newTimeStatuses = currentTimeStatuses.map(status => {
                            const absoluteTimestamp = calculateTimestampForTime(status.time, refTimeDate);
                            if (absoluteTimestamp === null) {
                                console.warn(`[ProfileDetailScreen] Could not calculate timestamp for app time: ${status.time} on med ${med.name}. Skipping.`);
                                return status;
                            }
                            const expectedOffsetSeconds = absoluteTimestamp - refTimeSeconds;
                            const expectedOffsetString = expectedOffsetSeconds.toString();

                            const deviceTimeUpdate = deviceDataForMed.times.find(t => t.time === expectedOffsetString);

                            if (deviceTimeUpdate) {
                                const newRespondedState = deviceTimeUpdate.responded === true;
                                if (status.responded !== newRespondedState) {
                                    console.log(`[ProfileDetailScreen] Updating status for med ${med.name}, time ${status.time} (offset ${expectedOffsetString}s) to ${newRespondedState}`);
                                    medicationUpdated = true;
                                    return { ...status, responded: newRespondedState };
                                }
                            }
                            return status;
                        });

                        if (medicationUpdated) {
                            profileWasUpdated = true;
                            return { ...med, timeStatuses: newTimeStatuses };
                        }
                    } else {
                        console.log(`[ProfileDetailScreen] No matching device data found in schedule array for expected med_id: ${expectedDeviceMedId} (App Med: ${med.name})`);
                    }
                    return med;
                });

                // ... (rest of the saving logic remains the same) ...
                if (profileWasUpdated) {
                    console.log("[ProfileDetailScreen] Profile updated with device status.");
                    const updatedProfile = { ...profile, currentMedications: updatedMedications };
                    const updatedAllProfiles = allProfiles.map(p => p.id === id ? updatedProfile : p);
                    saveAllProfiles(updatedAllProfiles);
                } else {
                    console.log("[ProfileDetailScreen] Received data did not result in profile updates.");
                }

            } catch (error: any) {
                // ... (error handling remains the same) ...
                console.error("[ProfileDetailScreen] Failed to parse or process received BLE data.", "Error:", error.message, "Received Data:", receivedData);
                Alert.alert("Data Error", `Received invalid data from the device: ${error.message}`);
            } finally {
                // ... (clearing data remains the same) ...
                console.log("[ProfileDetailScreen] Clearing received data.");
                clearReceivedData?.();
            }
        }
        // No 'else' needed if receivedData is null/undefined, the main 'if' handles that
    }, [receivedData, profile, allProfiles, id, saveAllProfiles, clearReceivedData]); // Dependencies


    // --- Reset New Medication Form ---
    const resetNewMedForm = () => {
        setNewMedName('');
        setNewMedDose('');
        setNewMedTimes([]); // Reset times array

        setNewMedDurationDays('1');
        setNewMedRelationToFood('any');
        setNewMedNotes('');
        setIsTimePickerVisible(false); // Ensure picker is closed on reset
    };

    // --- Add Time using the Picker ---
    const handleConfirmTime = (selectedDate: Date) => {
        setIsTimePickerVisible(false); // Close the picker first
        const timeToAdd = formatTime(selectedDate); // Format the selected time

        if (newMedTimes.includes(timeToAdd)) {
            Alert.alert("Duplicate Time", "This time has already been added.");
            return;
        }
        setNewMedTimes(prevTimes => [...prevTimes, timeToAdd].sort()); // Add and sort
    };

    // --- Remove Time from the list for the new medication ---
    const handleRemoveTimeFromList = (timeToRemove: string) => {
        setNewMedTimes(newMedTimes.filter(time => time !== timeToRemove));
    };

    // --- Add Medication Handler (Updated) ---
    const handleAddMedication = () => {
        const medName = newMedName.trim();
        const medDose = newMedDose.trim();
        const durationString = newMedDurationDays.trim();

        // Validate required fields
        if (!medName || !medDose || newMedTimes.length === 0 || !durationString || !profile) {
            Alert.alert('Missing Information', 'Please enter name, dose, at least one time (HH:MM AM/PM), and duration.');
            return;
        }

        // Validate and parse duration
        const durationNum = parseInt(durationString, 10);
        if (isNaN(durationNum) || durationNum <= 0) {
            Alert.alert('Invalid Duration', 'Please enter a valid number of days (greater than 0).');
            return;
        }

        if (profile.currentMedications.some(m => m.name.toLowerCase() === medName.toLowerCase())) {
            Alert.alert('Duplicate Medication', 'This medication name is already in the current list.');
            return;
        }

        // Initialize timeStatuses when adding
        const newMedTimeStatuses = newMedTimes.map(time => ({ time: time, responded: false }));

        const newMed: Medication = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            name: medName,
            dose: medDose,
            times: newMedTimes, // Use the array of times
            timeStatuses: newMedTimeStatuses, // Initialize statuses
            durationDays: durationNum, // Use the parsed number
            relationToFood: newMedRelationToFood,
            notes: newMedNotes.trim() || undefined,
        };

        const updatedProfile = {
            ...profile,
            // Ensure ensureMedicationDefaults is applied to the new med as well for consistency
            currentMedications: [...profile.currentMedications, ensureMedicationDefaults(newMed)],
        };

        const updatedAllProfiles = allProfiles.map(p => p.id === id ? updatedProfile : p);
        saveAllProfiles(updatedAllProfiles);
        resetNewMedForm();
        Keyboard.dismiss();
    };

    // --- Move Medication to Past ---
    const handleMoveMedicationToPast = (medicationId: string) => {
        // ... (logic remains the same)
        if (!profile) return;

        const medToMove = profile.currentMedications.find(m => m.id === medicationId);
        if (!medToMove) return;

        // Ensure defaults are applied when moving to past as well
        const medToMoveWithDefaults = ensureMedicationDefaults(medToMove);

        const alreadyInPast = profile.pastMedications.some(m => m.name.toLowerCase() === medToMoveWithDefaults.name.toLowerCase());

        const updatedProfile = {
            ...profile,
            currentMedications: profile.currentMedications.filter(m => m.id !== medicationId),
            // Add to past only if not already there by name (or use ID if names aren't unique)
            pastMedications: alreadyInPast
                ? profile.pastMedications // Keep existing past list if name matches
                : [...profile.pastMedications, medToMoveWithDefaults], // Add the ensured med
        };

        const updatedAllProfiles = allProfiles.map(p => p.id === id ? updatedProfile : p);
        saveAllProfiles(updatedAllProfiles);
    };

    // --- Delete Medication ---
    const handleDeleteMedication = (medicationId: string, listType: 'current' | 'past') => {
        // ... (logic remains the same)
        if (!profile) return;

        Alert.alert(
            'Confirm Deletion', 'Are you sure you want to delete this medication entry?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: () => {
                        let updatedProfile: Profile;
                        if (listType === 'current') {
                            updatedProfile = {
                                ...profile,
                                currentMedications: profile.currentMedications.filter(m => m.id !== medicationId),
                            };
                        } else {
                            updatedProfile = {
                                ...profile,
                                pastMedications: profile.pastMedications.filter(m => m.id !== medicationId),
                            };
                        }
                        const updatedAllProfiles = allProfiles.map(p => p.id === id ? updatedProfile : p);
                        saveAllProfiles(updatedAllProfiles);
                    },
                },
            ]
        );
    };


    // --- Render Helper for RelationToFood Buttons ---
    const renderRelationToFoodSelector = () => {
        // ... (logic remains the same)
        const options: RelationToFood[] = ['before', 'after', 'with', 'any'];
        return (
            <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Relation to Food:</ThemedText>
                <View style={styles.relationButtons}>
                    {options.map(option => (
                        <TouchableOpacity
                            key={option}
                            style={[
                                styles.relationButton,
                                newMedRelationToFood === option && styles.relationButtonSelected
                            ]}
                            onPress={() => setNewMedRelationToFood(option)}
                        >
                            <Text style={[
                                styles.relationButtonText,
                                newMedRelationToFood === option && styles.relationButtonTextSelected
                            ]}>
                                {option.charAt(0).toUpperCase() + option.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        );
    };

    // --- Render Helper for Medication Item Display (Updated with Status) ---
    const renderMedicationDetails = (med: Medication) => (
        <View style={styles.medDetailsContainer}>
            <ThemedText style={styles.medDetailText}>
                <ThemedText style={styles.medDetailLabel}>Dose:</ThemedText> {med.dose}
            </ThemedText>

            {/* Display multiple times WITH status */}
            <View style={styles.timesListContainer}>
                <ThemedText style={styles.medDetailLabel}>Times:</ThemedText>
                {/* Ensure we use timeStatuses, falling back to initializing from times if needed */}
                {(med.timeStatuses && med.timeStatuses.length > 0 ? med.timeStatuses : med.times.map(t => ({ time: t, responded: false }))).map((status, index) => (
                    <View key={index} style={styles.timeEntry}>
                        <Text style={styles.timeText}> - {status.time}</Text>
                        {/* Display status indicator */}
                        {status.responded ? (
                            <Text style={styles.statusIndicatorYes}> (Taken ✔)</Text>
                        ) : (
                            <Text style={styles.statusIndicatorNo}> (Missed ✖)</Text>
                        )}
                    </View>
                ))}
                {/* Fallback if only times exist (old data?) */}
                {(!med.timeStatuses || med.timeStatuses.length === 0) && med.times.length > 0 && (
                    <ThemedText style={styles.medDetailText}> {med.times.join(', ')} (Status unavailable)</ThemedText>
                )}
            </View>

            <ThemedText style={styles.medDetailText}>
                <ThemedText style={styles.medDetailLabel}>Duration:</ThemedText> {med.durationDays} day{med.durationDays !== 1 ? 's' : ''}
            </ThemedText>
            <ThemedText style={styles.medDetailText}>
                <ThemedText style={styles.medDetailLabel}>Food:</ThemedText> {med.relationToFood.charAt(0).toUpperCase() + med.relationToFood.slice(1)}
            </ThemedText>
            {med.notes && (
                <ThemedText style={styles.medDetailText}>
                    <ThemedText style={styles.medDetailLabel}>Notes:</ThemedText> {med.notes}
                </ThemedText>
            )}
        </View>
    );

    // --- Handler to Send Schedule (Updated to use prepareScheduleForDevice) ---
    const handleSendSchedule = async () => {
        if (!connectedDevice) {
            Alert.alert("Not Connected", "Please connect to the Pipli device first via the 'Connect' tab.");
            return;
        }
        if (!profile || !profile.currentMedications || profile.currentMedications.length === 0) {
            Alert.alert("No Schedule", "There are no current medications to send.");
            return;
        }

        setIsSendingSchedule(true);
        try {
            // Prepare the data using the utility function
            // Uses short IDs ('A', 'B', ...) and calculates second offsets by default
            const scheduleJsonString = prepareScheduleForDevice(profile.currentMedications);

            if (!scheduleJsonString || scheduleJsonString === '[]') {
                console.log("Could not generate schedule payload or no valid medications found.");
                Alert.alert("Schedule Error", "Could not prepare the schedule. Ensure medications have valid times (HH:MM AM/PM).");
                setIsSendingSchedule(false);
                return;
            }

            console.log(`[handleSendSchedule] Sending payload (${scheduleJsonString.length} bytes):`, scheduleJsonString);

            // Use the sendData function from the context
            await sendData(scheduleJsonString);
            Alert.alert("Success", "Medication schedule sent to the Pipli device.");

        } catch (error: any) {
            console.error("[handleSendSchedule] Failed to send schedule:", error);
            Alert.alert("Send Error", `Failed to send schedule: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSendingSchedule(false);
        }
    };


    // --- NEW Handler to Request Update ---
    const handleRequestUpdate = async () => {
        if (!connectedDevice) {
            Alert.alert("Not Connected", "Please connect to the Pipli device first via the 'Connect' tab.");
            return;
        }
        // Optional: Check if already sending schedule or requesting update
        if (isSendingSchedule || isRequestingUpdate) {
            console.log("[handleRequestUpdate] Ignoring request, already busy.");
            return;
        }

        setIsRequestingUpdate(true);
        console.log("[handleRequestUpdate] Sending command: SEND_UPDATE");
        try {
            await sendData("SEND_UPDATE");
            // Optional: Show a temporary confirmation that the request was sent
            // Alert.alert("Request Sent", "Requesting status update from device...");
            console.log("[handleRequestUpdate] 'SEND_UPDATE' command sent successfully.");
            // Note: The actual UI update happens when receivedData triggers the useEffect hook.
        } catch (error: any) {
            console.error("[handleRequestUpdate] Failed to send 'SEND_UPDATE' command:", error);
            Alert.alert("Request Error", `Failed to request update: ${error.message || 'Unknown error'}`);
        } finally {
            // Set loading state back to false after a short delay to allow BLE processing,
            // or rely on the useEffect hook to indicate completion implicitly.
            // For simplicity, let's just set it back here. The UI update will follow via useEffect.
            setIsRequestingUpdate(false);
        }
    };
    // ---

    // --- Main Render Logic ---

    if (isLoading) {
        return (
            <ThemedView style={styles.centered}>
                <ActivityIndicator size="large" />
                <ThemedText>Loading Profile...</ThemedText>
            </ThemedView>
        );
    }

    // Profile should be guaranteed to exist here due to checks in useEffect
    if (!profile) {
        return (
            <ThemedView style={styles.centered}>
                <ThemedText type="subtitle">Error</ThemedText>
                <ThemedText>Profile data could not be loaded.</ThemedText>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
                </TouchableOpacity>
            </ThemedView>
        );
    }

    // Determine if any sync operation is in progress
    const isSyncBusy = isSendingSchedule || isRequestingUpdate;

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: profile.name || 'Profile Details' }} />

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* --- Add Medication Section --- */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle" style={styles.sectionHeader}>Add New Medication</ThemedText>
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Name:</ThemedText>
                        <TextInput style={styles.textInput} placeholder="e.g., Paracetamol" value={newMedName} onChangeText={setNewMedName} placeholderTextColor="#aaa" />
                    </View>
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Dose:</ThemedText>
                        <TextInput style={styles.textInput} placeholder="e.g., 1 tablet, 500mg" value={newMedDose} onChangeText={setNewMedDose} placeholderTextColor="#aaa" />
                    </View>
                    {/* --- UPDATED Time Input Section --- */}
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Times to Take:</ThemedText>
                        {/* Button to open the time picker */}
                        <TouchableOpacity onPress={() => setIsTimePickerVisible(true)} style={styles.selectTimeButton}>
                            <Text style={styles.selectTimeButtonText}>+ Select Time</Text>
                        </TouchableOpacity>

                        {/* Display Added Times */}
                        {newMedTimes.length > 0 && (
                            <View style={styles.addedTimesContainer}>
                                {newMedTimes.map((time, index) => (
                                    <View key={index} style={styles.addedTimeChip}>
                                        <Text style={styles.addedTimeText}>{time}</Text>
                                        <TouchableOpacity onPress={() => handleRemoveTimeFromList(time)} style={styles.removeTimeButton}>
                                            <Text style={styles.removeTimeButtonText}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                    {/* --- End UPDATED Time Input Section --- */}
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Duration (Days):</ThemedText>
                        <TextInput
                            style={styles.textInput}
                            placeholder="e.g., 7"
                            value={newMedDurationDays}
                            onChangeText={setNewMedDurationDays}
                            placeholderTextColor="#aaa"
                            keyboardType="number-pad" // Use number pad
                        />
                    </View>
                    {renderRelationToFoodSelector()}
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Notes (Optional):</ThemedText>
                        <TextInput style={[styles.textInput, styles.notesInput]} placeholder="e.g., Take with plenty of water" value={newMedNotes} onChangeText={setNewMedNotes} placeholderTextColor="#aaa" multiline />
                    </View>
                    <TouchableOpacity onPress={handleAddMedication} style={styles.addMedButton}>
                        <ThemedText style={styles.addMedButtonText}>Add Medication</ThemedText>
                    </TouchableOpacity>
                </ThemedView>

                {/* --- Current Medications List --- */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle" style={styles.sectionHeader}>Current Medications</ThemedText>
                    {profile.currentMedications.length === 0 ? (<ThemedText style={styles.noMedsText}>None</ThemedText>) : (
                        profile.currentMedications.map((med, index) => (
                            <View key={med.id} style={[styles.medCard, index > 0 && styles.medCardMargin]}>
                                <ThemedText style={styles.medNameHeader}>{med.name}</ThemedText>
                                {/* Use the updated renderer */}
                                {renderMedicationDetails(med)}
                                <View style={styles.medActions}>
                                    <TouchableOpacity onPress={() => handleMoveMedicationToPast(med.id)} style={styles.medActionButton}>
                                        <ThemedText style={styles.medActionTextMarkPast}>Mark as Past</ThemedText>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDeleteMedication(med.id, 'current')} style={styles.medActionButton}>
                                        <ThemedText style={styles.medActionTextDelete}>Delete</ThemedText>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                </ThemedView>

                {/* --- Past Medications List --- */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle" style={styles.sectionHeader}>Past Medications</ThemedText>
                    {profile.pastMedications.length === 0 ? (<ThemedText style={styles.noMedsText}>None</ThemedText>)
                        : (
                            profile.pastMedications.map((med, index) => (
                                <View key={med.id} style={[styles.medCard, styles.pastMedCard, index > 0 && styles.medCardMargin]}>
                                    <ThemedText style={[styles.medNameHeader, styles.pastMedNameHeader]}>{med.name}</ThemedText>
                                    {/* Use the updated renderer (will show status if available, otherwise just times) */}
                                    {renderMedicationDetails(med)}
                                    <View style={styles.medActions}>
                                        <TouchableOpacity onPress={() => handleDeleteMedication(med.id, 'past')} style={styles.medActionButton}>
                                            <ThemedText style={styles.medActionTextDelete}>Delete</ThemedText>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                        )}
                </ThemedView>

                {/* --- Send Schedule Section (Uses updated handler) --- */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle" style={styles.sectionHeader}>Sync with Device</ThemedText>
                    <TouchableOpacity
                        onPress={handleSendSchedule} // Uses the updated handler
                        style={[
                            styles.syncButton,
                            (!connectedDevice || isSendingSchedule) && styles.syncButtonDisabled
                        ]}
                        disabled={!connectedDevice || isSendingSchedule}
                    >
                        {isSendingSchedule ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.syncButtonText}>
                                {connectedDevice ? "Send Schedule to Pipli" : "Connect Device First"}
                            </Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleRequestUpdate}
                        style={[
                            styles.updateButton, // Use a new style for distinction
                            (!connectedDevice || isSyncBusy) && styles.syncButtonDisabled // Disable if not connected OR busy
                        ]}
                        disabled={!connectedDevice || isSyncBusy} // Disable if not connected OR busy
                    >
                        {isRequestingUpdate ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.updateButtonText}>
                                {connectedDevice ? "Request Status Update" : "Connect Device First"}
                            </Text>
                        )}
                    </TouchableOpacity>
                    {!connectedDevice && (
                        <ThemedText style={styles.syncInfoText}>Go to the 'Connect' tab to connect your device.</ThemedText>
                    )}
                </ThemedView>

            </ScrollView>
            {/* --- Date Picker Modal --- */}
            <DatePicker
                modal
                open={isTimePickerVisible}
                date={pickerDate} // Use a state variable for the picker's current date
                mode="time" // Specify time picking mode
                onConfirm={(date) => {
                    setPickerDate(date); // Update the picker date state
                    handleConfirmTime(date); // Handle the confirmed time
                }}
                onCancel={() => {
                    setIsTimePickerVisible(false); // Just close the modal
                }}
                // Optional: Customize title, confirm/cancel text
                title="Select Medication Time"
                confirmText="Confirm Time"
                cancelText="Cancel"
            // Optional: Set minute interval if needed
            // minuteInterval={15}
            />
        </ThemedView>
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // Input Styles
    inputGroup: { marginBottom: 15, },
    inputLabel: { fontSize: 15, fontWeight: '500', color: '#444', marginBottom: 6, },
    textInput: {
        height: 44, borderColor: '#ccc', borderWidth: 1, borderRadius: 8,
        paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 16, color: '#333',
    },
    notesInput: { height: 80, textAlignVertical: 'top', paddingTop: 10, },
    scrollContent: {
        padding: 15, paddingBottom: 40,
    },
    centered: {
        flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    backButton: {
        marginTop: 20, backgroundColor: '#007AFF', paddingVertical: 10,
        paddingHorizontal: 20, borderRadius: 8,
    },
    backButtonText: {
        color: 'white', fontSize: 16, fontWeight: 'bold',
    },
    section: {
        marginBottom: 20, padding: 15, backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
    },
    sectionHeader: {
        marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8,
    },
    // Relation to Food Selector
    relationButtons: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    },
    relationButton: {
        paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1,
        borderColor: '#007AFF', borderRadius: 15, backgroundColor: '#fff',
    },
    relationButtonSelected: {
        backgroundColor: '#007AFF',
    },
    relationButtonText: {
        color: '#007AFF', fontSize: 14, fontWeight: '500',
    },
    relationButtonTextSelected: {
        color: '#fff',
    },
    // Add Medication Button
    addMedButton: {
        backgroundColor: '#34C759', paddingVertical: 12, paddingHorizontal: 20,
        borderRadius: 8, alignItems: 'center', marginTop: 10,
    },
    addMedButtonText: {
        color: 'white', fontSize: 16, fontWeight: 'bold',
    },
    // Medication List Styles
    noMedsText: {
        fontStyle: 'italic', color: '#888', fontSize: 14, textAlign: 'center', paddingVertical: 15,
    },
    medCard: {
        backgroundColor: '#fff', borderRadius: 6, padding: 12,
        borderWidth: 1, borderColor: '#e8e8e8',
    },
    medCardMargin: {
        marginTop: 10,
    },
    pastMedCard: {
        backgroundColor: '#f8f8f8', borderColor: '#ddd',
    },
    medNameHeader: {
        fontSize: 17, fontWeight: '600', marginBottom: 8, paddingBottom: 5,
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    pastMedNameHeader: {
        color: '#666', textDecorationLine: 'line-through',
    },
    medDetailsContainer: {
        marginBottom: 10, gap: 6, // Increased gap slightly
    },
    medDetailText: {
        fontSize: 15, color: '#333',
    },
    medDetailLabel: {
        fontWeight: '500', color: '#555',
    },
    // Styles for displaying times with status
    timesListContainer: {
        marginTop: 2, // Small space above times list
    },
    timeEntry: {
        flexDirection: 'row', alignItems: 'center', marginLeft: 10, // Indent time entries slightly
        marginBottom: 2, // Space between time entries
    },
    timeText: {
        fontSize: 15, color: '#333',
    },
    statusIndicatorYes: {
        fontSize: 14, color: 'green', fontWeight: 'bold', marginLeft: 5,
    },
    statusIndicatorNo: {
        fontSize: 14, color: '#FF3B30', // Red color for missed
        fontWeight: 'bold', marginLeft: 5,
    },
    // --- End Status Styles ---
    medActions: {
        flexDirection: 'row', justifyContent: 'flex-end', gap: 15,
        marginTop: 5, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0',
    },
    medActionButton: {
        paddingVertical: 4, paddingHorizontal: 6,
    },
    medActionTextMarkPast: {
        color: 'green', fontSize: 14, fontWeight: '500',
    },
    medActionTextDelete: {
        color: '#FF3B30', fontSize: 14, fontWeight: '500',
    },
    syncButton: {
        backgroundColor: '#FF9500', paddingVertical: 14, paddingHorizontal: 20,
        borderRadius: 8, alignItems: 'center', marginTop: 10,
    },
    syncButtonDisabled: {
        backgroundColor: '#aaa',
    },
    syncButtonText: {
        color: 'white', fontSize: 16, fontWeight: 'bold',
    },
    syncInfoText: {
        textAlign: 'center', marginTop: 10, fontSize: 14, color: '#666',
    },

    addedTimesContainer: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10,
    },
    addedTimeChip: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0e0e0',
        borderRadius: 15, paddingVertical: 5, paddingLeft: 10, paddingRight: 5,
    },
    addedTimeText: { fontSize: 14, color: '#333', marginRight: 5, },
    removeTimeButton: {
        backgroundColor: '#a0a0a0', borderRadius: 10, width: 20, height: 20,
        justifyContent: 'center', alignItems: 'center',
    },
    removeTimeButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12, lineHeight: 18, },
    selectTimeButton: {
        backgroundColor: '#5ac8fa', // Similar to old add button
        paddingVertical: 11,
        paddingHorizontal: 15,
        borderRadius: 8,
        alignSelf: 'flex-start', // Don't take full width
        marginBottom: 10, // Add space before added times list
    },
    selectTimeButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },

    updateButton: {
        backgroundColor: '#007AFF', // Blue color for distinction
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10, // Add space between buttons
    },
    updateButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },


});
