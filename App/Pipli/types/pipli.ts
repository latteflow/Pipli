// types/pipli.ts

export type RelationToFood = 'before' | 'after' | 'with' | 'any';

// NEW: Define the structure for tracking response per time slot
export interface MedicationTimeStatus {
    time: string; // e.g., "8:00 AM"
    responded: boolean; // Status received from device
}

export interface Medication {
    id: string; // Unique ID for the medication entry in the app
    name: string;
    dose: string;
    times: string[]; // Array of scheduled times (e.g., ["8:00 AM", "9:00 PM"])
    durationDays: number; // Duration in days
    relationToFood: RelationToFood;
    notes?: string;
    // NEW: Store the response status for each time
    timeStatuses?: MedicationTimeStatus[]; // Optional for backward compatibility
}

export interface Profile {
    id: string;
    name: string;
    // ... other profile fields if any
    currentMedications: Medication[];
    pastMedications: Medication[];
}

// Key for storing profiles in AsyncStorage
export const PROFILES_STORAGE_KEY = '@PipliApp:profiles';