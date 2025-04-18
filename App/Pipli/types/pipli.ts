export type RelationToFood = 'before' | 'after' | 'with' | 'any';

export type Medication = {
    id: string; // Unique ID for this medication entry within the profile
    name: string;
    dose: string; // e.g., "1 tablet", "10ml", "1 puff"
    timeOfDay: string; // e.g., "Morning", "8:00 AM", "Before Bed"
    relationToFood: RelationToFood;
    notes?: string; // Optional notes
    // Consider adding frequency (e.g., "Daily", "Twice a day") later
};

export type Profile = {
    id: string;
    name: string;
    currentMedications: Medication[];
    pastMedications: Medication[];
};

// Key for storing profiles in AsyncStorage
export const PROFILES_STORAGE_KEY = '@PipliApp:profiles';