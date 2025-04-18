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

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Profile, Medication, RelationToFood, PROFILES_STORAGE_KEY } from '@/types/pipli'; // Updated import
// Assuming IconSymbol is correctly set up for these icons
// import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBleContext } from '@/context/BleContext'; // Import the context hook


// Helper to ensure medication has all fields (for loading old data)
const ensureMedicationDefaults = (med: Partial<Medication>): Medication => ({
    id: med.id || Date.now().toString() + Math.random().toString(36).substring(2, 7),
    name: med.name || 'Unknown',
    dose: med.dose || '',
    // Ensure 'times' is an array, default to empty if missing or not array
    times: Array.isArray(med.times) ? med.times : [],
    // Ensure 'durationDays' is a positive number, default to 1
    durationDays: typeof med.durationDays === 'number' && med.durationDays > 0 ? med.durationDays : 1,
    relationToFood: med.relationToFood || 'any',
    notes: med.notes || '',
});



export default function ProfileDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { connectedDevice, sendData } = useBleContext(); // Get BLE functions/state from context

    const [profile, setProfile] = useState<Profile | null>(null);
    const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSendingSchedule, setIsSendingSchedule] = useState(false); // Loading state for sending schedule

    // --- State for NEW medication inputs ---
    const [newMedName, setNewMedName] = useState('');
    const [newMedDose, setNewMedDose] = useState('');
    // REMOVED: const [newMedTimeOfDay, setNewMedTimeOfDay] = useState('');
    const [newMedTimes, setNewMedTimes] = useState<string[]>([]); // Array to hold multiple times
    const [currentTimeInput, setCurrentTimeInput] = useState(''); // Input for adding a single time
    const [newMedDurationDays, setNewMedDurationDays] = useState<string>('1'); // Duration input (string)
    const [newMedRelationToFood, setNewMedRelationToFood] = useState<RelationToFood>('any');
    const [newMedNotes, setNewMedNotes] = useState('');
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

    // --- Reset New Medication Form ---
    const resetNewMedForm = () => {
        setNewMedName('');
        setNewMedDose('');
        setNewMedTimes([]); // Reset times array
        setCurrentTimeInput(''); // Reset current time input
        setNewMedDurationDays('1'); // Reset duration
        setNewMedRelationToFood('any');
        setNewMedNotes('');
    };

    const handleAddTimeToList = () => {
        const timeToAdd = currentTimeInput.trim();
        if (!timeToAdd) {
            Alert.alert("Invalid Time", "Please enter a time to add.");
            return;
        }
        // Optional: Basic format check or prevent duplicates
        if (newMedTimes.includes(timeToAdd)) {
            Alert.alert("Duplicate Time", "This time has already been added.");
            return;
        }
        setNewMedTimes([...newMedTimes, timeToAdd]);
        setCurrentTimeInput(''); // Clear the input field
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
            Alert.alert('Missing Information', 'Please enter name, dose, at least one time, and duration.');
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

        const newMed: Medication = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            name: medName,
            dose: medDose,
            times: newMedTimes, // Use the array of times
            durationDays: durationNum, // Use the parsed number
            relationToFood: newMedRelationToFood,
            notes: newMedNotes.trim() || undefined,
        };

        const updatedProfile = {
            ...profile,
            currentMedications: [...profile.currentMedications, newMed],
        };

        const updatedAllProfiles = allProfiles.map(p => p.id === id ? updatedProfile : p);
        saveAllProfiles(updatedAllProfiles);
        resetNewMedForm();
        Keyboard.dismiss();
    };

    // --- Move Medication to Past ---
    const handleMoveMedicationToPast = (medicationId: string) => {
        if (!profile) return;

        const medToMove = profile.currentMedications.find(m => m.id === medicationId);
        if (!medToMove) return;

        const alreadyInPast = profile.pastMedications.some(m => m.name.toLowerCase() === medToMove.name.toLowerCase());

        const updatedProfile = {
            ...profile,
            currentMedications: profile.currentMedications.filter(m => m.id !== medicationId),
            pastMedications: alreadyInPast ? profile.pastMedications : [...profile.pastMedications, medToMove],
        };

        const updatedAllProfiles = allProfiles.map(p => p.id === id ? updatedProfile : p);
        saveAllProfiles(updatedAllProfiles);
    };

    // --- Delete Medication ---
    const handleDeleteMedication = (medicationId: string, listType: 'current' | 'past') => {
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

    // --- Render Helper for Medication Item Display (Updated) ---
    const renderMedicationDetails = (med: Medication) => (
        <View style={styles.medDetailsContainer}>
            <ThemedText style={styles.medDetailText}>
                <ThemedText style={styles.medDetailLabel}>Dose:</ThemedText> {med.dose}
            </ThemedText>
            {/* Display multiple times */}
            <ThemedText style={styles.medDetailText}>
                <ThemedText style={styles.medDetailLabel}>Times:</ThemedText> {med.times.join(', ')}
            </ThemedText>
            {/* Display duration */}
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

    // --- NEW: Handler to Send Schedule ---
    const handleSendSchedule = async () => {
        if (!connectedDevice) {
            Alert.alert("Not Connected", "Please connect to the Pipli device first via the 'Connect' tab.");
            return;
        }
        if (!profile || !profile.currentMedications) {
            Alert.alert("Error", "Profile data or medication list is not available.");
            return;
        }

        // Prepare the data payload with new structure
        const scheduleData = profile.currentMedications.map(med => ({
            name: med.name,
            dose: med.dose,
            times: med.times, // Send the array
            durationDays: med.durationDays, // Send the number
            relationToFood: med.relationToFood,
            notes: med.notes || "",
        }));

        // Convert to JSON string
        const jsonPayload = JSON.stringify(scheduleData);

        console.log(`[handleSendSchedule] Sending payload (${jsonPayload.length} bytes):`, jsonPayload);
        setIsSendingSchedule(true);
        try {
            // Use the sendData function from the context
            await sendData(jsonPayload);
            Alert.alert("Success", "Medication schedule sent to the Pipli device.");
        } catch (error: any) {
            console.error("[handleSendSchedule] Failed to send schedule:", error);
            Alert.alert("Send Error", `Failed to send schedule: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSendingSchedule(false);
        }
    };

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
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Times to Take (add one by one):</ThemedText>
                        <View style={styles.addTimeContainer}>
                            <TextInput
                                style={styles.timeInput}
                                placeholder="e.g., 8:00 AM"
                                value={currentTimeInput}
                                onChangeText={setCurrentTimeInput}
                                placeholderTextColor="#aaa"
                            />
                            <TouchableOpacity onPress={handleAddTimeToList} style={styles.addTimeButton}>
                                <Text style={styles.addTimeButtonText}>Add Time</Text>
                            </TouchableOpacity>
                        </View>
                        {/* Display Added Times */}
                        {newMedTimes.length > 0 && (
                            <View style={styles.addedTimesContainer}>
                                {newMedTimes.map((time, index) => (
                                    <View key={index} style={styles.addedTimeChip}>
                                        <Text style={styles.addedTimeText}>{time}</Text>
                                        <TouchableOpacity onPress={() => handleRemoveTimeFromList(time)} style={styles.removeTimeButton}>
                                            {/* Use IconSymbol if available */}
                                            <Text style={styles.removeTimeButtonText}>✕</Text>
                                            {/* <IconSymbol name="xmark.circle.fill" size={16} color="#fff" /> */}
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
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
                                {renderMedicationDetails(med)}
                                <View style={styles.medActions}>
                                    <TouchableOpacity onPress={() => handleMoveMedicationToPast(med.id)} style={styles.medActionButton}>
                                        {/* <IconSymbol name="checkmark.circle.fill" size={20} color="green" /> */}
                                        <ThemedText style={styles.medActionTextMarkPast}>Mark as Past</ThemedText>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDeleteMedication(med.id, 'current')} style={styles.medActionButton}>
                                        {/* <IconSymbol name="trash.fill" size={20} color="#FF3B30" /> */}
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
                                    {renderMedicationDetails(med)}
                                    <View style={styles.medActions}>
                                        <TouchableOpacity onPress={() => handleDeleteMedication(med.id, 'past')} style={styles.medActionButton}>
                                            {/* <IconSymbol name="trash.fill" size={20} color="#FF3B30" /> */}
                                            <ThemedText style={styles.medActionTextDelete}>Delete</ThemedText>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                        )}
                </ThemedView>

                {/* --- NEW: Send Schedule Section --- */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle" style={styles.sectionHeader}>Sync with Device</ThemedText>
                    <TouchableOpacity
                        onPress={handleSendSchedule}
                        style={[
                            styles.syncButton,
                            // Disable button if not connected or already sending
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
                    {!connectedDevice && (
                        <ThemedText style={styles.syncInfoText}>Go to the 'Connect' tab to connect your device.</ThemedText>
                    )}
                </ThemedView>

            </ScrollView>
        </ThemedView>
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // Input Styles
    inputGroup: { marginBottom: 15, }, // Increased spacing
    inputLabel: { fontSize: 15, fontWeight: '500', color: '#444', marginBottom: 6, },
    textInput: {
        height: 44, // Standard height
        borderColor: '#ccc', borderWidth: 1, borderRadius: 8, // Slightly more rounded
        paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 16, color: '#333',
    },
    notesInput: { height: 80, textAlignVertical: 'top', paddingTop: 10, },
    scrollContent: {
        padding: 15, // Use slightly less padding for scroll content
        paddingBottom: 40,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    backButton: {
        marginTop: 20,
        backgroundColor: '#007AFF',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    backButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    section: {
        marginBottom: 20,
        padding: 15,
        backgroundColor: 'rgba(255, 255, 255, 0.95)', // Slightly more opaque
        borderRadius: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    sectionHeader: {
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 8,
    },
    // Relation to Food Selector
    relationSelector: {
        // Styles for the container if needed, uses inputGroup margin
    },
    relationButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap', // Allow buttons to wrap
        gap: 8,
    },
    relationButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#007AFF',
        borderRadius: 15, // More rounded buttons
        backgroundColor: '#fff',
    },
    relationButtonSelected: {
        backgroundColor: '#007AFF',
    },
    relationButtonText: {
        color: '#007AFF',
        fontSize: 14,
        fontWeight: '500',
    },
    relationButtonTextSelected: {
        color: '#fff',
    },
    // Add Medication Button
    addMedButton: {
        backgroundColor: '#34C759',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10, // Add margin above button
    },
    addMedButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Medication List Styles
    noMedsText: {
        fontStyle: 'italic',
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 15,
    },
    medCard: {
        backgroundColor: '#fff', // White background for med card
        borderRadius: 6,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e8e8e8',
    },
    medCardMargin: {
        marginTop: 10, // Space between medication cards
    },
    pastMedCard: {
        backgroundColor: '#f8f8f8', // Slightly different background for past meds
        borderColor: '#ddd',
    },
    medNameHeader: {
        fontSize: 17,
        fontWeight: '600',
        marginBottom: 8,
        paddingBottom: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    pastMedNameHeader: {
        color: '#666',
        textDecorationLine: 'line-through',
    },
    medDetailsContainer: {
        marginBottom: 10, // Space between details and actions
        gap: 4, // Space between detail lines
    },
    medDetailText: {
        fontSize: 15,
        color: '#333',
    },
    medDetailLabel: {
        fontWeight: '500',
        color: '#555',
    },
    medActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end', // Align actions to the right
        gap: 15,
        marginTop: 5,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    medActionButton: {
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    medActionTextMarkPast: {
        color: 'green',
        fontSize: 14,
        fontWeight: '500',
    },
    medActionTextDelete: {
        color: '#FF3B30',
        fontSize: 14,
        fontWeight: '500',
    },
    syncButton: {
        backgroundColor: '#FF9500', // Orange color for sync action
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    syncButtonDisabled: {
        backgroundColor: '#aaa', // Grey out when disabled
    },
    syncButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    syncInfoText: {
        textAlign: 'center',
        marginTop: 10,
        fontSize: 14,
        color: '#666',
    },
    addTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, },
    timeInput: {
        flex: 1, // Take available space
        height: 44, borderColor: '#ccc', borderWidth: 1, borderRadius: 8,
        paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 16, color: '#333',
    },
    addTimeButton: {
        backgroundColor: '#5ac8fa', // Light blue for adding time
        paddingVertical: 11, // Match input height roughly
        paddingHorizontal: 15, borderRadius: 8,
    },
    addTimeButtonText: { color: 'white', fontSize: 14, fontWeight: 'bold', },
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
});
