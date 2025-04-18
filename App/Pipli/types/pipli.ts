// types/pipli.ts

export type RelationToFood = 'before' | 'after' | 'with' | 'any';

export type Medication = {
    id: string; // Unique ID for this medication entry within the profile
    name: string;
    dose: string; // e.g., "1 tablet", "10ml", "1 puff"
    // REMOVED: timeOfDay: string;
    times: string[]; // Array of times (e.g., ["8:00 AM", "9:00 PM"])
    durationDays: number; // Number of days for the course (e.g., 7, 30)
    relationToFood: RelationToFood;
    notes?: string; // Optional notes
    // Optional: Add startDate if needed later
    // startDate?: string; // ISO date string?
};

export type Profile = {
    id: string;
    name: string;
    currentMedications: Medication[];
    pastMedications: Medication[];
};

// Key for storing profiles in AsyncStorage
export const PROFILES_STORAGE_KEY = '@PipliApp:profiles';