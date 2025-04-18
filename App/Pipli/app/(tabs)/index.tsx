// /Users/satishgaurav/Documents/extra/LatteFlow/Pipli/App/Pipli/app/(tabs)/index.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  Image,
  StyleSheet,
  Platform,
  TextInput, // Import TextInput
  TouchableOpacity, // Import TouchableOpacity
  FlatList, // Import FlatList
  Alert, // Import Alert
  View, // Import View for layout
  ActivityIndicator, // For loading state
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Import AsyncStorage

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol'; // Import IconSymbol for delete icon

// Define a type for the profile object
type Profile = {
  id: string;
  name: string;
};

// Key for storing profiles in AsyncStorage
const PROFILES_STORAGE_KEY = '@PipliApp:profiles';

export default function HomeScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [isLoading, setIsLoading] = useState(true); // State to track loading

  // --- Load profiles from AsyncStorage on component mount ---
  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoading(true);
      try {
        const storedProfiles = await AsyncStorage.getItem(PROFILES_STORAGE_KEY);
        if (storedProfiles !== null) {
          setProfiles(JSON.parse(storedProfiles));
        }
        console.log('Profiles loaded:', storedProfiles ? JSON.parse(storedProfiles) : 'None');
      } catch (error) {
        console.error('Failed to load profiles from storage', error);
        Alert.alert('Error', 'Could not load profiles.');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfiles();
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Helper function to save profiles ---
  const saveProfiles = async (updatedProfiles: Profile[]) => {
    try {
      await AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      console.log('Profiles saved:', updatedProfiles);
    } catch (error) {
      console.error('Failed to save profiles to storage', error);
      Alert.alert('Error', 'Could not save profile changes.');
    }
  };

  // --- Function to add a new profile ---
  const handleAddProfile = () => {
    const trimmedName = newProfileName.trim();
    if (!trimmedName) {
      Alert.alert('Invalid Name', 'Please enter a name for the profile.');
      return;
    }

    // Optional: Check for duplicates
    if (profiles.some(profile => profile.name.toLowerCase() === trimmedName.toLowerCase())) {
      Alert.alert('Duplicate Name', 'A profile with this name already exists.');
      return;
    }


    const newProfile: Profile = {
      id: Date.now().toString(), // Simple unique ID using timestamp
      name: trimmedName,
    };

    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles); // Update state
    saveProfiles(updatedProfiles); // Save to AsyncStorage
    setNewProfileName(''); // Clear input field
  };

  // --- Function to delete a profile ---
  const handleDeleteProfile = (idToDelete: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedProfiles = profiles.filter(profile => profile.id !== idToDelete);
            setProfiles(updatedProfiles); // Update state
            saveProfiles(updatedProfiles); // Save to AsyncStorage
          },
        },
      ]
    );
  };

  // --- Render item for the FlatList ---
  const renderProfileItem = ({ item }: { item: Profile }) => (
    <ThemedView style={styles.profileItemContainer}>
      <ThemedText style={styles.profileName}>{item.name}</ThemedText>
      <TouchableOpacity onPress={() => handleDeleteProfile(item.id)} style={styles.deleteButton}>
        {/* Using an icon for delete */}
        {/* <IconSymbol name="trash.fill" size={20} color="#FF3B30" /> */}
        <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );

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
      {/* Keep existing Welcome section */}
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>

      {/* --- Profile Management Section --- */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedText type="subtitle">Manage Profiles</ThemedText>
        <ThemedText style={styles.sectionDescription}>
          Add or remove profiles for people using the Pipli device.
        </ThemedText>

        {/* Add Profile Input */}
        <View style={styles.addProfileContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Enter profile name"
            value={newProfileName}
            onChangeText={setNewProfileName}
            placeholderTextColor="#999"
          />
          <TouchableOpacity onPress={handleAddProfile} style={styles.addButton}>
            <ThemedText style={styles.addButtonText}>Add</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Profile List */}
        {isLoading ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loadingIndicator} />
        ) : profiles.length === 0 ? (
          <ThemedText style={styles.noProfilesText}>No profiles added yet.</ThemedText>
        ) : (
          <FlatList
            data={profiles}
            renderItem={renderProfileItem}
            keyExtractor={item => item.id}
            style={styles.profileList}
            scrollEnabled={false} // Disable FlatList scrolling inside ParallaxScrollView
          />
        )}
      </ThemedView>
      {/* --- End Profile Management Section --- */}
    </ParallaxScrollView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  // Existing styles
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  // New styles for Profile Management
  sectionContainer: {
    gap: 12, // Spacing within the profile section
    marginBottom: 16, // Space below the profile section
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.8)', // Semi-transparent white background
    borderRadius: 10,
  },
  sectionDescription: {
    fontSize: 15,
    color: '#555',
    marginBottom: 8,
  },
  addProfileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 15,
  },
  textInput: {
    flex: 1, // Take available space
    height: 45,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#333',
  },
  addButton: {
    backgroundColor: '#34C759', // Green color for add
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingIndicator: {
    marginTop: 20,
  },
  noProfilesText: {
    textAlign: 'center',
    marginTop: 15,
    fontSize: 16,
    color: '#888',
  },
  profileList: {
    marginTop: 10,
  },
  profileItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee', // Light separator line
    backgroundColor: 'transparent', // Ensure background is transparent if parent has color
  },
  profileName: {
    fontSize: 17,
    flex: 1, // Allow name to take space
    marginRight: 10, // Space before delete button
  },
  deleteButton: {
    padding: 5, // Make tap area slightly larger
  },
  deleteButtonText: { // Style if using text instead of icon
    color: '#FF3B30', // Red color for delete
    fontSize: 14,
    fontWeight: '500',
  },
});
