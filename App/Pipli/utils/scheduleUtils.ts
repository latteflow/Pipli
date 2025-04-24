// utils/scheduleUtils.ts

import { Medication } from '@/types/pipli'; // Adjust the import path as needed

/**
 * Calculates the Unix timestamp (in seconds) for a given time string (e.g., "8:00 AM")
 * on a specific reference date.
 * Returns null if parsing fails or the time string is invalid.
 */
const calculateTimestampForTime = (timeStr: string, referenceDate: Date): number | null => {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) {
        console.warn(`[calculateTimestampForTime] Invalid time format: ${timeStr}`);
        return null;
    }

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    // Validate basic hour/minute ranges (12-hour format)
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
        console.warn(`[calculateTimestampForTime] Invalid time values (12-hour format): ${timeStr}`);
        return null;
    }

    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) { // Handle 12:xx AM (midnight)
        hours = 0;
    }

    // Double-check hours are now valid 24-hour format (0-23) after conversion
    if (hours < 0 || hours > 23) {
        console.warn(`[calculateTimestampForTime] Hour calculation error resulted in invalid 24h format: ${timeStr}`);
        return null;
    }

    // Create a new Date object based on the reference date (to keep year, month, day)
    const specificTimeDate = new Date(referenceDate);
    // Set the hours and minutes for this specific time
    specificTimeDate.setHours(hours, minutes, 0, 0); // Set seconds and ms to 0

    // Return the Unix timestamp in seconds
    return Math.floor(specificTimeDate.getTime() / 1000);
};

/**
 * Prepares the medication schedule in the JSON format required by the Pipli device.
 * Times are sent as offsets in seconds relative to ref_time (midnight today).
 *
 * @param medications - An array of current medications from the app's state.
 * @param useShortId - If true, generates short IDs 'A', 'B', 'C'... Otherwise uses medication.id. Defaults to true.
 * @returns A JSON string representing the schedule payload, or null/empty array string if input is invalid or no valid medications are found.
 */
export const prepareScheduleForDevice = (
    medications: Medication[],
    useShortId: boolean = true
): string | null => {
    if (!Array.isArray(medications)) {
        console.error("[prepareScheduleForDevice] Invalid input: medications must be an array.");
        return null;
    }

    // Calculate ref_time (midnight today in local time)
    const refTimeDate = new Date();
    refTimeDate.setHours(0, 0, 0, 0); // Set to midnight local time
    const refTimeSeconds = Math.floor(refTimeDate.getTime() / 1000);
    const refTimeString = refTimeSeconds.toString();

    const deviceSchedulePayload = medications
        .map((med, index) => {
            // --- Generate med_id ---
            let med_id: string;
            if (useShortId) {
                if (index >= 26) {
                    console.warn(`[prepareScheduleForDevice] Cannot generate unique letter ID for medication index ${index} (>= 26). Falling back to index number.`);
                    med_id = index.toString();
                } else {
                    med_id = String.fromCharCode(65 + index); // 'A', 'B', ...
                }
            } else {
                med_id = med.id;
            }

            // --- Calculate time offsets in SECONDS relative to ref_time ---
            const timeOffsetsInSeconds = med.times
                .map(timeStr => calculateTimestampForTime(timeStr, refTimeDate)) // Get absolute timestamp for each time today
                .filter((timestamp): timestamp is number => timestamp !== null && timestamp >= refTimeSeconds) // Ensure timestamp is valid and not before ref_time
                .map(absoluteTimestamp => {
                    const offsetSeconds = absoluteTimestamp - refTimeSeconds; // Calculate offset from midnight
                    return offsetSeconds.toString(); // Convert offset to string
                });

            // --- Validate and Assemble ---
            if (timeOffsetsInSeconds.length === 0) {
                if (med.times.length > 0) {
                    console.warn(`[prepareScheduleForDevice] Medication "${med.name}" (ID: ${med.id}) has times defined, but none resulted in valid second offsets relative to ${refTimeString}. Skipping.`);
                } else {
                    console.log(`[prepareScheduleForDevice] Medication "${med.name}" (ID: ${med.id}) has no scheduled times. Skipping.`);
                }
                return null; // Exclude this medication
            }

            return {
                med_id: med_id,
                ref_time: refTimeString,
                times: timeOffsetsInSeconds, // Array of offset strings (in seconds)
            };
        })
        .filter(item => item !== null); // Remove null entries

    if (deviceSchedulePayload.length === 0) {
        console.log("[prepareScheduleForDevice] No valid medications found to generate a schedule.");
        return '[]'; // Send an empty array string
    }

    return JSON.stringify(deviceSchedulePayload);
};
