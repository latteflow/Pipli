// /Users/satishgaurav/Documents/extra/LatteFlow/Pipli/App/Pipli/app/(tabs)/index.tsx

import React, { useState, useEffect } from 'react';
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
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router'; // Import Link

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
// import { IconSymbol } from '@/components/ui/IconSymbol';
import { Profile, PROFILES_STORAGE_KEY } from '@/types/pipli'; // Adjust path if needed



export default function HomeScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // --- Load profiles (remains the same) ---
  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoading(true);
      try {
        const storedProfiles = await AsyncStorage.getItem(PROFILES_STORAGE_KEY);
        if (storedProfiles !== null) {
          const parsedProfiles: Profile[] = JSON.parse(storedProfiles);
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

  // --- Save profiles (remains the same) ---
  const saveProfiles = async (updatedProfiles: Profile[]) => {
    try {
      await AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      console.log('Profiles saved:', updatedProfiles);
    } catch (error) {
      console.error('Failed to save profiles to storage', error);
      Alert.alert('Error', 'Could not save profile changes.');
    }
  };

  // --- Add Profile (remains the same) ---
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
      currentMedications: [],
      pastMedications: [],
    };
    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);
    saveProfiles(updatedProfiles);
    setNewProfileName('');
    Keyboard.dismiss();
  };

  // --- Delete Profile (remains the same, no need to clear medicationInputs here) ---
  const handleDeleteProfile = (idToDelete: string) => {
    Alert.alert(
      'Confirm Deletion',
      `Are you sure you want to delete the profile "${profiles.find(p => p.id === idToDelete)?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedProfiles = profiles.filter(profile => profile.id !== idToDelete);
            setProfiles(updatedProfiles);
            saveProfiles(updatedProfiles);
          },
        },
      ]
    );
  };

  // --- Remove medication handlers from HomeScreen ---
  // handleMedInputChange, handleAddMedication, handleMoveMedicationToPast, handleDeleteMedication

  // --- SIMPLIFIED Render Profile Item ---
  const renderProfileItem = ({ item: profile }: { item: Profile }) => (
    // Wrap the entire item content with Link
    <Link href={`/profile/${profile.id}`} asChild>
      <TouchableOpacity activeOpacity={0.7}>
        <ThemedView style={styles.profileItemContainer}>
          <ThemedText style={styles.profileName}>{profile.name}</ThemedText>
          {/* Keep delete button here, but stop propagation to prevent navigation */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation(); // Prevent the Link navigation
              handleDeleteProfile(profile.id);
            }}
            style={styles.deleteProfileButton}
          >
            {/* Replace with IconSymbol if available */}
            <ThemedText style={styles.deleteProfileButtonText}>Delete</ThemedText>
            {/* <IconSymbol name="trash" size={20} color="#FF3B30" /> */}
          </TouchableOpacity>
        </ThemedView>
      </TouchableOpacity>
    </Link>
  );

  // --- Main Render (remains largely the same, just uses simplified renderProfileItem) ---
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/pipli-banner.png')}
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
        <ThemedText type="subtitle">Add New Patient</ThemedText>
        <View style={styles.addProfileContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Enter patient name"
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
        <ThemedText type="subtitle">Patients</ThemedText>
        {isLoading ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loadingIndicator} />
        ) : profiles.length === 0 ? (
          <ThemedText style={styles.noProfilesText}>No profiles added yet. Add one above.</ThemedText>
        ) : (
          <FlatList
            data={profiles}
            renderItem={renderProfileItem} // Uses the simplified version now
            keyExtractor={item => item.id}
            style={styles.profileList}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.profileSeparator} />}
          />
        )}
      </ThemedView>

    </ParallaxScrollView>
  );
}

// --- Styles ---
// Update styles for the simplified profile item
const styles = StyleSheet.create({
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reactLogo: { height: 300, width: 400, bottom: 0, left: 0, position: 'absolute' },
  sectionContainer: {
    gap: 12,
    marginBottom: 16,
    padding: 15,
    backgroundColor: 'rgba(245, 245, 245, 0.9)',
    borderRadius: 10,
  },
  addProfileContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textInput: {
    flex: 1, height: 45, borderColor: '#ccc', borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 15, backgroundColor: '#fff', fontSize: 16, color: '#333',
  },
  addButton: {
    backgroundColor: '#007AFF', paddingVertical: 12, paddingHorizontal: 15,
    borderRadius: 8, justifyContent: 'center', alignItems: 'center',
  },
  addButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  loadingIndicator: { marginTop: 20 },
  noProfilesText: { textAlign: 'center', marginTop: 15, fontSize: 16, color: '#888' },
  profileList: { marginTop: 0 },
  profileSeparator: { height: 1, backgroundColor: '#eee', marginVertical: 5 }, // Thin separator line
  // SIMPLIFIED Profile Item Styles
  profileItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 15, // Adjusted padding
    paddingHorizontal: 15,
    // Removed internal gap, shadow - apply shadow/elevation if desired
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  profileName: {
    fontSize: 18, // Slightly larger name on list
    fontWeight: '500',
    flex: 1, // Allow name to take space
    marginRight: 10,
  },
  deleteProfileButton: {
    padding: 8, // Slightly larger tap area for delete
    marginLeft: 5,
  },
  deleteProfileButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  // Remove medication-related styles from HomeScreen styles
});
