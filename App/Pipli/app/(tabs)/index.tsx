// /Users/satishgaurav/Documents/extra/LatteFlow/Pipli/App/Pipli/app/(tabs)/index.tsx

import React, { useState, useEffect } from 'react'; // Removed useCallback for now, add if needed
import {
  Image,
  StyleSheet,
  Platform,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  View,
  ActivityIndicator,
  Keyboard, // Import Keyboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
// Assuming IconSymbol is correctly set up for these icons
// import { IconSymbol } from '@/components/ui/IconSymbol';

// --- Define Medication Type ---
type Medication = {
  id: string; // Unique ID for this medication entry within the profile
  name: string;
  // Potential future fields: dosage, frequency, notes, addedDate, completedDate
};

// --- Update Profile Type ---
type Profile = {
  id: string;
  name: string;
  currentMedications: Medication[];
  pastMedications: Medication[];
};

// Key for storing profiles in AsyncStorage
const PROFILES_STORAGE_KEY = '@PipliApp:profiles';

export default function HomeScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // --- State for medication inputs (keyed by profile ID) ---
  const [medicationInputs, setMedicationInputs] = useState<{ [profileId: string]: string }>({});

  // --- Load profiles ---
  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoading(true);
      try {
        const storedProfiles = await AsyncStorage.getItem(PROFILES_STORAGE_KEY);
        if (storedProfiles !== null) {
          const parsedProfiles: Profile[] = JSON.parse(storedProfiles);
          // Ensure medication arrays exist (for backward compatibility)
          const validatedProfiles = parsedProfiles.map(p => ({
            ...p,
            currentMedications: p.currentMedications || [],
            pastMedications: p.pastMedications || [],
          }));
          setProfiles(validatedProfiles);
          console.log('Profiles loaded:', validatedProfiles);
        } else {
          console.log('No profiles found in storage.');
        }
      } catch (error) {
        console.error('Failed to load profiles from storage', error);
        Alert.alert('Error', 'Could not load profiles.');
      } finally {
        setIsLoading(false);
      }
    };
    loadProfiles();
  }, []);

  // --- Save profiles ---
  const saveProfiles = async (updatedProfiles: Profile[]) => {
    try {
      await AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      console.log('Profiles saved:', updatedProfiles);
    } catch (error) {
      console.error('Failed to save profiles to storage', error);
      Alert.alert('Error', 'Could not save profile changes.');
    }
  };

  // --- Add Profile ---
  const handleAddProfile = () => {
    const trimmedName = newProfileName.trim();
    if (!trimmedName) {
      Alert.alert('Invalid Name', 'Please enter a name for the profile.');
      return;
    }
    if (profiles.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      Alert.alert('Duplicate Name', 'A profile with this name already exists.');
      return;
    }

    const newProfile: Profile = {
      id: Date.now().toString(),
      name: trimmedName,
      currentMedications: [], // Initialize empty arrays
      pastMedications: [],   // Initialize empty arrays
    };

    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);
    saveProfiles(updatedProfiles);
    setNewProfileName('');
    Keyboard.dismiss(); // Dismiss keyboard
  };

  // --- Delete Profile ---
  const handleDeleteProfile = (idToDelete: string) => {
    Alert.alert(
      'Confirm Deletion',
      `Are you sure you want to delete the profile "${profiles.find(p => p.id === idToDelete)?.name}" and all its medications?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedProfiles = profiles.filter(profile => profile.id !== idToDelete);
            setProfiles(updatedProfiles);
            saveProfiles(updatedProfiles);
            // Also remove any lingering medication input state for this profile
            setMedicationInputs(prev => {
              const newState = { ...prev };
              delete newState[idToDelete];
              return newState;
            });
          },
        },
      ]
    );
  };

  // --- Handle Medication Input Change ---
  const handleMedInputChange = (profileId: string, text: string) => {
    setMedicationInputs(prev => ({
      ...prev,
      [profileId]: text,
    }));
  };

  // --- Add Medication to Current List ---
  const handleAddMedication = (profileId: string) => {
    const medName = (medicationInputs[profileId] || '').trim();
    if (!medName) {
      Alert.alert('Invalid Name', 'Please enter a medication name.');
      return;
    }

    const updatedProfiles = profiles.map(profile => {
      if (profile.id === profileId) {
        // Optional: Check for duplicates within current meds
        if (profile.currentMedications.some(m => m.name.toLowerCase() === medName.toLowerCase())) {
          Alert.alert('Duplicate Medication', 'This medication is already in the current list.');
          return profile; // Return unchanged profile
        }
        const newMed: Medication = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 7), // More unique ID
          name: medName,
        };
        return {
          ...profile,
          currentMedications: [...profile.currentMedications, newMed],
        };
      }
      return profile;
    });

    setProfiles(updatedProfiles);
    saveProfiles(updatedProfiles);
    // Clear the specific input field
    handleMedInputChange(profileId, '');
    Keyboard.dismiss(); // Dismiss keyboard
  };

  // --- Move Medication to Past List ---
  const handleMoveMedicationToPast = (profileId: string, medicationId: string) => {
    const updatedProfiles = profiles.map(profile => {
      if (profile.id === profileId) {
        const medToMove = profile.currentMedications.find(m => m.id === medicationId);
        if (!medToMove) return profile; // Should not happen

        // Optional: Check if already in past list to avoid duplicates
        const alreadyInPast = profile.pastMedications.some(m => m.name.toLowerCase() === medToMove.name.toLowerCase());

        return {
          ...profile,
          currentMedications: profile.currentMedications.filter(m => m.id !== medicationId),
          // Add to past list only if it's not already there by name
          pastMedications: alreadyInPast ? profile.pastMedications : [...profile.pastMedications, medToMove],
        };
      }
      return profile;
    });
    setProfiles(updatedProfiles);
    saveProfiles(updatedProfiles);
  };

  // --- Delete Medication (from either list) ---
  const handleDeleteMedication = (profileId: string, medicationId: string, listType: 'current' | 'past') => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this medication entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedProfiles = profiles.map(profile => {
              if (profile.id === profileId) {
                if (listType === 'current') {
                  return {
                    ...profile,
                    currentMedications: profile.currentMedications.filter(m => m.id !== medicationId),
                  };
                } else { // listType === 'past'
                  return {
                    ...profile,
                    pastMedications: profile.pastMedications.filter(m => m.id !== medicationId),
                  };
                }
              }
              return profile;
            });
            setProfiles(updatedProfiles);
            saveProfiles(updatedProfiles);
          },
        },
      ]
    );
  };


  // --- Render Profile Item (Now includes medication lists) ---
  const renderProfileItem = ({ item: profile }: { item: Profile }) => (
    <ThemedView style={styles.profileItemContainer}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <ThemedText style={styles.profileName}>{profile.name}</ThemedText>
        <TouchableOpacity onPress={() => handleDeleteProfile(profile.id)} style={styles.deleteProfileButton}>
          {/* Replace with IconSymbol if available and preferred */}
          <ThemedText style={styles.deleteProfileButtonText}>Delete Profile</ThemedText>
          {/* <IconSymbol name="trash.circle.fill" size={24} color="#FF3B30" /> */}
        </TouchableOpacity>
      </View>

      {/* Add Current Medication Input */}
      <View style={styles.addMedContainer}>
        <TextInput
          style={styles.medTextInput}
          placeholder="Add current medication"
          value={medicationInputs[profile.id] || ''}
          onChangeText={(text) => handleMedInputChange(profile.id, text)}
          placeholderTextColor="#aaa"
        />
        <TouchableOpacity onPress={() => handleAddMedication(profile.id)} style={styles.addMedButton}>
          <ThemedText style={styles.addMedButtonText}>Add</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Current Medications List */}
      <View style={styles.medListContainer}>
        <ThemedText style={styles.medListHeader}>Current Medications:</ThemedText>
        {profile.currentMedications.length === 0 ? (
          <ThemedText style={styles.noMedsText}>None</ThemedText>
        ) : (
          profile.currentMedications.map(med => (
            <View key={med.id} style={styles.medItem}>
              <ThemedText style={styles.medName}>{med.name}</ThemedText>
              <View style={styles.medActions}>
                <TouchableOpacity onPress={() => handleMoveMedicationToPast(profile.id, med.id)} style={styles.medActionButton}>
                  {/* Replace with IconSymbol if available */}
                  <ThemedText style={styles.medActionTextMarkPast}>Mark Past</ThemedText>
                  {/* <IconSymbol name="checkmark.circle" size={18} color="green" /> */}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteMedication(profile.id, med.id, 'current')} style={styles.medActionButton}>
                  {/* Replace with IconSymbol if available */}
                  <ThemedText style={styles.medActionTextDelete}>Delete</ThemedText>
                  {/* <IconSymbol name="xmark.circle" size={18} color="#FF3B30" /> */}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Past Medications List */}
      <View style={styles.medListContainer}>
        <ThemedText style={styles.medListHeader}>Past Medications:</ThemedText>
        {profile.pastMedications.length === 0 ? (
          <ThemedText style={styles.noMedsText}>None</ThemedText>
        ) : (
          profile.pastMedications.map(med => (
            <View key={med.id} style={styles.medItem}>
              <ThemedText style={[styles.medName, styles.pastMedName]}>{med.name}</ThemedText>
              <View style={styles.medActions}>
                {/* Only show delete for past medications */}
                <TouchableOpacity onPress={() => handleDeleteMedication(profile.id, med.id, 'past')} style={styles.medActionButton}>
                  {/* Replace with IconSymbol if available */}
                  <ThemedText style={styles.medActionTextDelete}>Delete</ThemedText>
                  {/* <IconSymbol name="xmark.circle" size={18} color="#FF3B30" /> */}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

    </ThemedView>
  );

  // --- Main Render ---
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }
    >
      {/* Welcome section */}
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>

      {/* Add Profile Section */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedText type="subtitle">Add New Profile</ThemedText>
        <View style={styles.addProfileContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Enter profile name"
            value={newProfileName}
            onChangeText={setNewProfileName}
            placeholderTextColor="#999"
          />
          <TouchableOpacity onPress={handleAddProfile} style={styles.addButton}>
            <ThemedText style={styles.addButtonText}>Add Profile</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>

      {/* Profiles List Section */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedText type="subtitle">Profiles & Medications</ThemedText>
        {isLoading ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loadingIndicator} />
        ) : profiles.length === 0 ? (
          <ThemedText style={styles.noProfilesText}>No profiles added yet. Add one above.</ThemedText>
        ) : (
          <FlatList
            data={profiles}
            renderItem={renderProfileItem}
            keyExtractor={item => item.id}
            style={styles.profileList}
            scrollEnabled={false} // Keep false inside ParallaxScrollView
            ItemSeparatorComponent={() => <View style={styles.profileSeparator} />} // Add separator
          />
        )}
      </ThemedView>

    </ParallaxScrollView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: 'absolute' },
  sectionContainer: {
    gap: 12,
    marginBottom: 16,
    padding: 15,
    backgroundColor: 'rgba(245, 245, 245, 0.9)', // Slightly less transparent background
    borderRadius: 10,
  },
  // Add Profile Styles
  addProfileContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textInput: { // Used for Add Profile input
    flex: 1,
    height: 45,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#333',
  },
  addButton: { // Used for Add Profile button
    backgroundColor: '#007AFF', // Blue for add profile
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  // Loading and Empty List Styles
  loadingIndicator: { marginTop: 20 },
  noProfilesText: { textAlign: 'center', marginTop: 15, fontSize: 16, color: '#888' },
  // Profile List Styles
  profileList: { marginTop: 0 }, // Remove top margin if section has padding
  profileSeparator: { height: 10, backgroundColor: 'transparent' }, // Space between profile cards
  // Profile Item Styles
  profileItemContainer: {
    backgroundColor: '#fff', // White background for each profile card
    borderRadius: 8,
    padding: 15,
    gap: 15, // Space between elements inside the card
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  profileName: {
    fontSize: 19,
    fontWeight: '600', // Semi-bold for profile name
    flex: 1, // Allow name to wrap if long
  },
  deleteProfileButton: { padding: 5 },
  deleteProfileButtonText: { color: '#FF3B30', fontSize: 14, fontWeight: '500' },
  // Add Medication Styles within Profile Item
  addMedContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medTextInput: { // Input specifically for adding meds within a profile
    flex: 1,
    height: 40,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f9f9f9',
    fontSize: 15,
  },
  addMedButton: {
    backgroundColor: '#34C759', // Green for adding meds
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
  },
  addMedButtonText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  // Medication List Styles
  medListContainer: { marginTop: 5, gap: 5 },
  medListHeader: { fontSize: 16, fontWeight: '500', color: '#555', marginBottom: 5 },
  noMedsText: { fontStyle: 'italic', color: '#999', fontSize: 14 },
  medItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginLeft: 10, // Indent medication items slightly
  },
  medName: { fontSize: 15, flexShrink: 1, marginRight: 10 }, // Allow name to shrink
  pastMedName: { color: '#777', textDecorationLine: 'line-through' }, // Style for past meds
  medActions: { flexDirection: 'row', gap: 10 },
  medActionButton: { padding: 4 },
  medActionTextMarkPast: { color: 'green', fontSize: 13 },
  medActionTextDelete: { color: '#FF3B30', fontSize: 13 },
});
