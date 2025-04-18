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

// Helper to ensure medication has all fields (for loading old data)
const ensureMedicationDefaults = (med: Partial<Medication>): Medication => ({
    id: med.id || Date.now().toString() + Math.random().toString(36).substring(2, 7), // Ensure unique ID
    name: med.name || 'Unknown',
    dose: med.dose || '', // Default empty
    timeOfDay: med.timeOfDay || '', // Default empty
    relationToFood: med.relationToFood || 'any', // Default 'any'
    notes: med.notes || '', // Default empty string
});

export default function ProfileDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // --- State for NEW medication inputs ---
    const [newMedName, setNewMedName] = useState('');
    const [newMedDose, setNewMedDose] = useState('');
    const [newMedTimeOfDay, setNewMedTimeOfDay] = useState('');
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
                    // Ensure profiles AND their medications have all fields
                    const validatedProfiles = parsedProfiles.map(p => ({
                        ...p,
                        currentMedications: (p.currentMedications || []).map(ensureMedicationDefaults),
                        pastMedications: (p.pastMedications || []).map(ensureMedicationDefaults),
                    }));
                    setAllProfiles(validatedProfiles);
                    const foundProfile = validatedProfiles.find(p => p.id === id);
                    if (foundProfile) {
                        setProfile(foundProfile);
                        console.log('Profile found:', foundProfile);
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
        setNewMedTimeOfDay('');
        setNewMedRelationToFood('any');
        setNewMedNotes('');
    };

    // --- Add Medication Handler ---
    const handleAddMedication = () => {
        const medName = newMedName.trim();
        const medDose = newMedDose.trim();
        const medTime = newMedTimeOfDay.trim();

        if (!medName || !medDose || !medTime || !profile) {
            Alert.alert('Missing Information', 'Please enter medication name, dose, and time.');
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
            timeOfDay: medTime,
            relationToFood: newMedRelationToFood,
            notes: newMedNotes.trim() || undefined, // Store notes only if not empty
        };

        const updatedProfile = {
            ...profile,
            currentMedications: [...profile.currentMedications, newMed],
        };

        const updatedAllProfiles = allProfiles.map(p => p.id === id ? updatedProfile : p);
        saveAllProfiles(updatedAllProfiles);
        resetNewMedForm(); // Clear the form
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

    // --- Render Helper for Medication Item Display ---
    const renderMedicationDetails = (med: Medication) => (
        <View style={styles.medDetailsContainer}>
            <ThemedText style={styles.medDetailText}>
                <ThemedText style={styles.medDetailLabel}>Dose:</ThemedText> {med.dose}
            </ThemedText>
            <ThemedText style={styles.medDetailText}>
                <ThemedText style={styles.medDetailLabel}>Time:</ThemedText> {med.timeOfDay}
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
                        <TextInput
                            style={styles.textInput}
                            placeholder="e.g., Paracetamol"
                            value={newMedName}
                            onChangeText={setNewMedName}
                            placeholderTextColor="#aaa"
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Dose:</ThemedText>
                        <TextInput
                            style={styles.textInput}
                            placeholder="e.g., 1 tablet, 500mg"
                            value={newMedDose}
                            onChangeText={setNewMedDose}
                            placeholderTextColor="#aaa"
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Time:</ThemedText>
                        <TextInput
                            style={styles.textInput}
                            placeholder="e.g., Morning, 8:00 AM"
                            value={newMedTimeOfDay}
                            onChangeText={setNewMedTimeOfDay}
                            placeholderTextColor="#aaa"
                        />
                    </View>
                    {renderRelationToFoodSelector()}
                    <View style={styles.inputGroup}>
                        <ThemedText style={styles.inputLabel}>Notes (Optional):</ThemedText>
                        <TextInput
                            style={[styles.textInput, styles.notesInput]}
                            placeholder="e.g., Take with plenty of water"
                            value={newMedNotes}
                            onChangeText={setNewMedNotes}
                            placeholderTextColor="#aaa"
                            multiline
                        />
                    </View>
                    <TouchableOpacity onPress={handleAddMedication} style={styles.addMedButton}>
                        <ThemedText style={styles.addMedButtonText}>Add Medication</ThemedText>
                    </TouchableOpacity>
                </ThemedView>

                {/* --- Current Medications List --- */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle" style={styles.sectionHeader}>Current Medications</ThemedText>
                    {profile.currentMedications.length === 0 ? (
                        <ThemedText style={styles.noMedsText}>None</ThemedText>
                    ) : (
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
                    {profile.pastMedications.length === 0 ? (
                        <ThemedText style={styles.noMedsText}>None</ThemedText>
                    ) : (
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

            </ScrollView>
        </ThemedView>
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
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
    // Input Styles
    inputGroup: {
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: '#444',
        marginBottom: 5,
    },
    textInput: {
        height: 42, // Slightly smaller height
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 12,
        backgroundColor: '#fff',
        fontSize: 16,
        color: '#333',
    },
    notesInput: {
        height: 80, // Taller for multiline
        textAlignVertical: 'top', // Align text to top for multiline
        paddingTop: 10,
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
});
