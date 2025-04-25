
#include <Arduino.h>

// bluetooth related
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// srorage related (Optional but recommended for persistence)
#include "FS.h"
#include <LittleFS.h>

// JSON data library
#include <ArduinoJson.h>

#include <algorithm> // Needed for std::min

#define FORMAT_LITTLEFS_IF_FAILED true
#define SCHEDULE_FILENAME "/schedule.json"
#define MILLIS_COUNTER_FILENAME "/millis_counter.dat" // File to store last millis()

unsigned long lastMillisSaveTime = 0; // Timer for saving millis counter

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// --- BLE Chunking Settings ---
const size_t BLE_CHUNK_SIZE = 20;
const int BLE_CHUNK_DELAY_MS = 30; // Delay between sending chunks (adjust as needed)

// See the following for generating UUIDs:
// https://www.uuidgenerator.net/

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define VIBRATION_PIN 19
#define PAIR_PIN 23 // Not used in reminder logic, but kept for consistency
#define USER_PIN 34 // Used for responding to reminders
#define LED 2

#define BLINK_DURATION_MS 50 // How long the LED stays on during a blink

// --- Reminder System Settings ---
#define VIBRATION_DURATION_MS 5000 // How long to vibrate for a reminder
#define RESPONSE_TIMEOUT_MS 15000  // How long to wait for user input after vibration

#define UPDATE_REQUEST_CMD "SEND_UPDATE"

// --- State Machine ---
enum State
{
    STATE_IDLE,                // Waiting for a schedule or connection
    STATE_PROCESSING_SCHEDULE, // Actively checking reminder times
    STATE_VIBRATING,           // Currently vibrating for a reminder
    STATE_WAITING_RESPONSE,    // Waiting for user button press after vibration
    STATE_SENDING_UPDATE       // Preparing/sending updated schedule
};
State currentState = STATE_IDLE;

// -- -Schedule Data-- -
// Use JsonDocument for flexibility. Adjust size as needed.
JsonDocument scheduleDoc; // Increased size for schedule + responses
bool scheduleLoaded = false;
unsigned long scheduleReceiveTime = 0; // millis() when schedule was received/loaded

// --- Reminder Tracking ---
int currentMedIndex = -1;
int currentTimeIndex = -1;
unsigned long stateTimer = 0;                // Used for vibration duration and response timeout
unsigned long nextReminderDueTimeMillis = 0; // Stores the absolute time of the next reminder
unsigned long lastCountdownPrintMillis = 0;  // Timer for printing countdown

// -- -Function Prototypes-- -
void blinkLed();
void startVibration();
void stopVibration();
bool loadSchedule();
bool saveSchedule();
void processSchedule();
void sendUpdate(bool changeStateToIdleOnSuccess = true);
// void moveToNextReminder(); // No longer needed
void handleReceivedData(const std::string &data);

bool saveMillisCounter();
unsigned long loadMillisCounter();

// Stream opearator (kept from original)
template <class T>
inline Print &operator<<(Print &obj, T arg)
{
    obj.print(arg);
    return obj;
}
template <>
inline Print &operator<<(Print &obj, float arg)
{
    obj.print(arg, 4);
    return obj;
}
// It preserves the original LED state if it was meant to be ON (connected)
void blinkLed()
{
    bool originalState = digitalRead(LED);
    digitalWrite(LED, !originalState);
    delay(BLINK_DURATION_MS);
    digitalWrite(LED, originalState);
}

void startVibration()
{
    Serial.println("Starting Vibration");
    digitalWrite(VIBRATION_PIN, HIGH);
}

void stopVibration()
{
    Serial.println("Stopping Vibration");
    digitalWrite(VIBRATION_PIN, LOW);
}

class MyServerCallbacks : public BLEServerCallbacks
{
    void onConnect(BLEServer *pServer)
    {
        deviceConnected = true;
        digitalWrite(LED, HIGH); // LED ON when connected
        Serial.println("Device Connected");
        // Optional: Maybe request schedule update on connect?
        // pCharacteristic->setValue("REQUEST_SCHEDULE");
        // pCharacteristic->notify();
    };

    void onDisconnect(BLEServer *pServer)
    {
        deviceConnected = false;
        digitalWrite(LED, LOW); // LED OFF when disconnected
        Serial.println("Device Disconnected - Restarting Advertising");
        // Reset state if needed when disconnected? Maybe not, allow processing offline.
        // currentState = STATE_IDLE;
        // scheduleLoaded = false;
        delay(500);                  // Give stack time
        pServer->startAdvertising(); // Restart advertising
    }
};

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks
{
    void onWrite(BLECharacteristic *pCharacteristic)
    {
        std::string rxValue = pCharacteristic->getValue();
        if (rxValue.length() > 0)
        {
            Serial.println(" ");
            Serial.print("Received data: ");
            Serial.println(rxValue.c_str());
            blinkLed(); // Blink on any receive

            // --- Modification: Check for command first ---
            if (rxValue == UPDATE_REQUEST_CMD)
            {
                Serial.println("Received update request command.");
                // Attempt to send the update immediately if connected
                // sendUpdate() already checks for connection and loaded data
                sendUpdate(false);
            }
            else
            {
                // If it's not the command, assume it's a new schedule
                Serial.println("Data is not an update command, treating as new schedule.");
                handleReceivedData(rxValue);
            }
            // --- End Modification ---
        }
    }
};

// --- Function to save the current millis() counter ---
bool saveMillisCounter()
{
    unsigned long currentMillis = millis();
    File file = LittleFS.open(MILLIS_COUNTER_FILENAME, FILE_WRITE); // Open for writing (overwrite)
    if (!file)
    {
        Serial.println("Failed to open millis counter file for writing");
        return false;
    }

    // Write the current millis() value as binary data
    size_t bytesWritten = file.write((uint8_t *)&currentMillis, sizeof(currentMillis));
    file.close();

    if (bytesWritten == sizeof(currentMillis))
    {
        // Serial.printf("Millis counter saved: %lu\n", currentMillis); // Optional: Verbose logging
        return true;
    }
    else
    {
        Serial.println("Failed to write millis counter to file.");
        LittleFS.remove(MILLIS_COUNTER_FILENAME); // Attempt to remove potentially corrupted file
        return false;
    }
}

// --- Function to load the last saved millis() counter ---
unsigned long loadMillisCounter()
{
    if (!LittleFS.exists(MILLIS_COUNTER_FILENAME))
    {
        Serial.println("Millis counter file not found.");
        return 0; // Return 0 if no previous value exists
    }

    File file = LittleFS.open(MILLIS_COUNTER_FILENAME, FILE_READ);
    if (!file)
    {
        Serial.println("Failed to open millis counter file for reading");
        return 0;
    }

    unsigned long loadedMillis = 0;
    if (file.size() == sizeof(loadedMillis))
    {
        size_t bytesRead = file.read((uint8_t *)&loadedMillis, sizeof(loadedMillis));
        if (bytesRead != sizeof(loadedMillis))
        {
            Serial.println("Error reading millis counter file.");
            loadedMillis = 0; // Treat read error as if file didn't exist
        }
    }
    else
    {
        Serial.println("Millis counter file has incorrect size.");
        loadedMillis = 0; // Treat size error as if file didn't exist
    }

    file.close();

    if (loadedMillis > 0)
    {
        Serial.printf("Loaded last known millis: %lu\n", loadedMillis);
    }
    return loadedMillis;
}

// --- Schedule Handling Logic ---

void handleReceivedData(const std::string &data)
{
    Serial.println("Attempting to parse NEW schedule data string...");

    // --- Parse the incoming data string as a temporary array ---
    JsonDocument tempDoc; // Use a temporary document for the incoming array
    DeserializationError tempError = deserializeJson(tempDoc, data);
    if (tempError)
    {
        Serial.print(F("Initial parsing of received string failed: "));
        Serial.println(tempError.f_str());
        // Don't change state or clear existing valid schedule if parsing fails
        return;
    }
    if (!tempDoc.is<JsonArray>())
    {
        Serial.println("Error: Received data string is not a JSON array.");
        return;
    }
    JsonArray receivedArray = tempDoc.as<JsonArray>();
    // --- End temporary parsing ---

    // --- Prepare the main scheduleDoc with the new structure ---
    scheduleDoc.clear();                            // Clear previous data
    JsonObject root = scheduleDoc.to<JsonObject>(); // Make the root an object
    JsonArray scheduleArray = root.createNestedArray("schedule");
    if (scheduleArray.isNull())
    {
        Serial.println("Error: Failed to create nested schedule array. Memory full?");
        scheduleLoaded = false; // Mark as not loaded
        currentState = STATE_IDLE;
        return;
    }
    // --- End structure preparation ---

    // --- Populate the new schedule array with structured time objects ---
    bool structureUpdateSuccess = true;
    for (JsonObject med_in : receivedArray)
    { // Iterate the temporary parsed array
        // Create a corresponding object in the main scheduleDoc's array
        JsonObject med_out = scheduleArray.createNestedObject();
        if (med_out.isNull())
        {
            Serial.println("Error: Failed to create medication object. Memory full?");
            structureUpdateSuccess = false;
            break;
        }
        // Copy necessary fields (adjust if you have more fields)
        med_out["med_id"] = med_in["med_id"]; // Assuming med_id exists

        if (med_in.containsKey("times") && med_in["times"].is<JsonArray>())
        {
            JsonArray times_in = med_in["times"].as<JsonArray>();
            JsonArray times_out = med_out.createNestedArray("times");
            if (times_out.isNull())
            {
                Serial.println("Error: Failed to create nested times array. Memory full?");
                structureUpdateSuccess = false;
                break;
            }

            for (JsonVariant t_in : times_in)
            {
                JsonObject timeObj_out = times_out.createNestedObject();
                if (timeObj_out.isNull())
                {
                    Serial.println("Error: Failed to create nested time object. Memory full?");
                    structureUpdateSuccess = false;
                    break;
                }
                timeObj_out["time"] = t_in.as<String>(); // Copy time offset
                timeObj_out["responded"] = nullptr;      // Initialize responded state
            }
            if (!structureUpdateSuccess)
                break;
        }
        else
        {
            Serial.println("Warning: Medication entry missing 'times' array or invalid format.");
            // Handle as needed, maybe skip this medication entry
        }
    } // --- End populating ---

    if (!structureUpdateSuccess)
    {
        Serial.println("Failed to build new schedule structure. Aborting.");
        scheduleLoaded = false;
        currentState = STATE_IDLE;
        scheduleDoc.clear(); // Clear potentially corrupted document
        return;
    }

    // --- Store the original receive time ---
    scheduleReceiveTime = millis();                    // Get the current time
    root["originalReceiveTime"] = scheduleReceiveTime; // Store it in the JSON object
    // --- End storing time ---

    Serial.println("New schedule processed and structured successfully.");
    Serial.printf("Original Receive Time recorded: %lu\n", scheduleReceiveTime);

    // --- Debug: Print the modified structure ---
    Serial.println("--- New Schedule Structure ---");
    serializeJsonPretty(scheduleDoc, Serial);
    Serial.println("\n----------------------------");

    scheduleLoaded = true;
    // Reset indices - processSchedule will find the first one
    currentMedIndex = -1;
    currentTimeIndex = -1;
    currentState = STATE_PROCESSING_SCHEDULE;
    Serial.println("State changed to STATE_PROCESSING_SCHEDULE");

    // Save the new schedule (with timestamp)
    if (!saveSchedule())
    {
        Serial.println("Error saving new schedule!");
        // Handle error? Maybe revert state?
    }
}

// --- MODIFIED processSchedule ---
// Scans the entire schedule to find the earliest *absolute* time for the next reminder
void processSchedule()
{
    if (!scheduleLoaded || !scheduleDoc.is<JsonObject>() || !scheduleDoc.containsKey("schedule"))
    {
        currentState = STATE_IDLE;
        return;
    }

    JsonArray scheduleArray = scheduleDoc["schedule"].as<JsonArray>();
    unsigned long currentTimeMillis = millis();

    // Variables to track the earliest due reminder found in this scan
    unsigned long earliestDueTimeFound = 0; // Use 0 as initial, check if set later
    int earliestMedIndexFound = -1;
    int earliestTimeIndexFound = -1;
    bool reminderFound = false; // Flag if we found *any* unprocessed reminder

    // Scan ALL medications and ALL times
    for (int medIdx = 0; medIdx < scheduleArray.size(); ++medIdx)
    {
        JsonObject currentMed = scheduleArray[medIdx];
        // Basic validation for the medication entry
        if (!currentMed || !currentMed.containsKey("times") || !currentMed["times"].is<JsonArray>())
        {
            // Serial.printf("Skipping invalid med entry at index %d\n", medIdx); // Optional debug
            continue; // Skip to next medication
        }

        JsonArray timesArray = currentMed["times"].as<JsonArray>();
        for (int timeIdx = 0; timeIdx < timesArray.size(); ++timeIdx)
        {
            JsonObject timeObj = timesArray[timeIdx];
            // Basic validation for the time entry
            if (!timeObj || !timeObj.containsKey("time") || !timeObj.containsKey("responded"))
            {
                // Serial.printf("Skipping invalid time entry at med %d, time %d\n", medIdx, timeIdx); // Optional debug
                continue; // Skip to next time
            }

            // Check if this reminder needs processing (responded is null)
            if (timeObj["responded"].isNull())
            {
                // Calculate its absolute due time
                long reminderOffsetSeconds = timeObj["time"].as<String>().toInt();
                unsigned long reminderDueTimeMillis = scheduleReceiveTime + (reminderOffsetSeconds * 1000UL);

                // Compare with the earliest found so far
                if (!reminderFound || reminderDueTimeMillis < earliestDueTimeFound)
                {
                    earliestDueTimeFound = reminderDueTimeMillis;
                    earliestMedIndexFound = medIdx;
                    earliestTimeIndexFound = timeIdx;
                    reminderFound = true; // Mark that we found at least one
                }
            }
        } // End loop times
    } // End loop medications

    // --- After scanning everything ---

    if (reminderFound)
    {
        // We found at least one unprocessed reminder. Check if the earliest one is due.
        // Serial.printf("Earliest reminder found: Med %d, Time %d, Due: %lu, Now: %lu\n", // Debug
        //               earliestMedIndexFound, earliestTimeIndexFound, earliestDueTimeFound, currentTimeMillis);

        if (currentTimeMillis >= earliestDueTimeFound)
        {
            // It's time! Set the global indices for the active reminder
            currentMedIndex = earliestMedIndexFound;
            currentTimeIndex = earliestTimeIndexFound;

            // Get details for logging
            JsonObject med = scheduleArray[currentMedIndex];
            JsonObject time = med["times"].as<JsonArray>()[currentTimeIndex];

            Serial.printf("Reminder Due! Med ID: %s, Time Offset: %s (Indices: M%d, T%d)\n",
                          med["med_id"].as<const char *>(),
                          time["time"].as<const char *>(),
                          currentMedIndex, currentTimeIndex);

            startVibration();
            stateTimer = millis(); // Start timer for vibration duration
            currentState = STATE_VIBRATING;
            Serial.println("State changed to STATE_VIBRATING");
        }
        // Else: An unprocessed reminder exists, but it's not time yet. Stay in PROCESSING state.
        nextReminderDueTimeMillis = earliestDueTimeFound; // Store the time for the countdown
    }
    else
    {
        nextReminderDueTimeMillis = 0; // Reset when no reminders are pending

        // No unprocessed reminders were found in the entire schedule.
        Serial.println("All medications processed.");
        if (deviceConnected)
        {
            currentState = STATE_SENDING_UPDATE;
            Serial.println("Processing complete. State changed to STATE_SENDING_UPDATE.");
        }
        else
        {
            currentState = STATE_IDLE;
            Serial.println("Processing complete while disconnected. Update pending. State changed to STATE_IDLE.");
        }
    }
}

// --- MODIFIED recordResponse ---
void recordResponse(bool responded)
{
    // Check if indices are valid (should be set by processSchedule before VIBRATING state)
    if (!scheduleLoaded || !scheduleDoc.is<JsonObject>() || !scheduleDoc.containsKey("schedule") || currentMedIndex < 0 || currentTimeIndex < 0)
    {
        Serial.println("Error: Cannot record response, schedule not loaded or indices invalid.");
        currentState = STATE_IDLE;
        return;
    }

    JsonArray scheduleArray = scheduleDoc["schedule"].as<JsonArray>();
    // Bounds check just in case
    if (currentMedIndex >= scheduleArray.size())
    {
        Serial.println("Error: currentMedIndex out of bounds in recordResponse.");
        currentState = STATE_IDLE;
        return;
    }
    JsonObject currentMed = scheduleArray[currentMedIndex];
    if (!currentMed || !currentMed.containsKey("times") || !currentMed["times"].is<JsonArray>())
    {
        Serial.println("Error: Invalid med object in recordResponse.");
        currentState = STATE_IDLE;
        return;
    }
    JsonArray timesArray = currentMed["times"].as<JsonArray>();
    if (currentTimeIndex >= timesArray.size())
    {
        Serial.println("Error: currentTimeIndex out of bounds in recordResponse.");
        currentState = STATE_IDLE;
        return;
    }
    JsonObject timeObj = timesArray[currentTimeIndex];
    if (!timeObj)
    {
        Serial.println("Error: Invalid time object in recordResponse.");
        currentState = STATE_IDLE;
        return;
    }

    Serial.printf("Recording response for Med %d, Time %d: %s\n", currentMedIndex, currentTimeIndex, responded ? "Yes" : "No");
    timeObj["responded"] = responded;

    // Save the updated schedule after recording response
    saveSchedule();

    // *** Save the current millis counter immediately after recording response ***
    saveMillisCounter();

    // Go back to processing state to find the *next* earliest reminder
    currentState = STATE_PROCESSING_SCHEDULE;
    Serial.println("State changed to STATE_PROCESSING_SCHEDULE");
}

// -- -MODIFIED sendUpdate function signature-- -
void sendUpdate(bool changeStateToIdleOnSuccess) // Add parameter with default true
{
    // --- Check connection FIRST ---
    if (!deviceConnected)
    {
        Serial.println("Cannot send update: Device not connected. Update pending.");
        // Don't change state here regardless of the parameter, just return.
        // If called from STATE_SENDING_UPDATE, the state machine loop will handle moving to IDLE.
        return; // Exit without sending
    }

    // --- Check if data exists ---
    if (!scheduleLoaded || scheduleDoc.isNull())
    {
        Serial.println("Cannot send update: No schedule data loaded.");
        // If there's no data, we can safely go idle, regardless of why called.
        currentState = STATE_IDLE;
        return;
    }

    // --- Proceed with sending ---
    Serial.println("Serializing updated schedule...");
    String outputJson;
    // Use compact serialization for BLE to save space
    serializeJson(scheduleDoc, outputJson);

    Serial.print("Sending Update (total size ");
    Serial.print(outputJson.length());
    Serial.println(" bytes):");
    // Serial.println(outputJson.c_str()); // Optionally print full JSON for debug

    // --- Chunking Logic ---
    size_t totalLength = outputJson.length();
    for (size_t i = 0; i < totalLength; i += BLE_CHUNK_SIZE)
    {
        size_t chunkLen = std::min((size_t)BLE_CHUNK_SIZE, totalLength - i);
        // Use Arduino String's substring method
        String chunkStr = outputJson.substring(i, i + chunkLen);

        Serial.printf("  Sending chunk %d/%d (%d bytes)\n", //: %s\n", // Optionally print chunk content
                      (i / BLE_CHUNK_SIZE) + 1,
                      (totalLength + BLE_CHUNK_SIZE - 1) / BLE_CHUNK_SIZE,
                      chunkLen
                      //,chunkStr.c_str() // Uncomment to see chunk content
        );

        // Set value using uint8_t pointer and length
        pCharacteristic->setValue((uint8_t *)chunkStr.c_str(), chunkLen);
        pCharacteristic->notify();

        // IMPORTANT: Delay between chunks
        delay(BLE_CHUNK_DELAY_MS);
    }
    // --- End Chunking Logic ---

    blinkLed(); // Blink once after all chunks are sent

    Serial.println("Update sending process complete.");

    // --- MODIFIED State Change Logic ---
    if (changeStateToIdleOnSuccess)
    {
        currentState = STATE_IDLE;
        Serial.println("State changed to STATE_IDLE after sending final update.");
    }
    else
    {
        // If called for an intermediate update, just log it and DO NOT change state.
        Serial.println("Intermediate update sent. State remains unchanged.");
        // The caller (e.g., the onWrite callback) is responsible for managing the state.
    }
    // --- End MODIFIED State Change Logic ---
}

// --- LittleFS Functions (Optional but Recommended) ---
bool initializeFS()
{
    if (!LittleFS.begin(FORMAT_LITTLEFS_IF_FAILED))
    {
        Serial.println("LittleFS Mount Failed");
        return false;
    }
    Serial.println("LittleFS Mounted.");
    return true;
}

bool saveSchedule()
{
    // --- Check if data is loaded and is the correct object type ---
    if (!scheduleLoaded || !scheduleDoc.is<JsonObject>())
    {
        Serial.println("No valid schedule data (object) to save.");
        return false;
    }
    // --- End check ---

    File file = LittleFS.open(SCHEDULE_FILENAME, FILE_WRITE);
    if (!file)
    {
        Serial.println("Failed to open schedule file for writing");
        return false;
    }

    // Use compact JSON for saving to save space on flash
    size_t bytesWritten = serializeJson(scheduleDoc, file); // Serialize the whole object
    file.close();

    if (bytesWritten > 0)
    {
        Serial.printf("Schedule saved to %s (%d bytes)\n", SCHEDULE_FILENAME, bytesWritten);
        return true;
    }
    else
    {
        Serial.println("Failed to write schedule to file.");
        // Attempt to delete potentially corrupted file
        LittleFS.remove(SCHEDULE_FILENAME);
        return false;
    }
}

bool loadSchedule()
{
    if (!LittleFS.exists(SCHEDULE_FILENAME))
    {
        Serial.println("Schedule file not found.");
        scheduleLoaded = false; // Ensure flag is false
        return false;
    }

    File file = LittleFS.open(SCHEDULE_FILENAME, FILE_READ);
    if (!file)
    {
        Serial.println("Failed to open schedule file for reading");
        scheduleLoaded = false; // Ensure flag is false
        return false;
    }

    scheduleDoc.clear();
    DeserializationError error = deserializeJson(scheduleDoc, file);
    file.close();

    if (error)
    {
        Serial.print(F("Failed to parse schedule file: "));
        Serial.println(error.f_str());
        scheduleLoaded = false; // Ensure flag is false
        return false;
    }

    // --- Check for new object structure ---
    if (!scheduleDoc.is<JsonObject>() || !scheduleDoc.containsKey("schedule") || !scheduleDoc["schedule"].is<JsonArray>() || !scheduleDoc.containsKey("originalReceiveTime"))
    {
        Serial.println("Error: Loaded schedule file has incorrect structure or missing keys (originalReceiveTime).");
        scheduleDoc.clear();    // Clear invalid data
        scheduleLoaded = false; // Ensure flag is false
        return false;
    }
    // --- End structure check ---

    // --- Load the original timestamp INTO THE GLOBAL VARIABLE ---
    // This is the millis() value from the boot *when the schedule was received*
    scheduleReceiveTime = scheduleDoc["originalReceiveTime"].as<unsigned long>();
    // --- End loading timestamp ---

    Serial.println("Schedule loaded successfully from LittleFS.");
    Serial.printf("Original Receive Time (from previous boot): %lu\n", scheduleReceiveTime);

    // --- Debug: Print the loaded structure ---
    // Serial.println("--- Loaded Schedule Structure ---");
    // serializeJsonPretty(scheduleDoc, Serial);
    // Serial.println("\n-----------------------------");

    scheduleLoaded = true;
    // DO NOT reset scheduleReceiveTime = millis(); here!

    // Reset indices - processSchedule will find the first one
    currentMedIndex = -1;
    currentTimeIndex = -1;
    // State will be set in setup() after potential time adjustment
    // currentState = STATE_PROCESSING_SCHEDULE;
    // Serial.println("State changed to STATE_PROCESSING_SCHEDULE");
    return true;
}

//==================== SETUP ====================//
void setup()
{
    Serial.begin(115200);
    Serial.println("\nStarting Pipli Reminder Device...");

    // Initialize LittleFS
    if (!initializeFS())
    {
        // Handle FS failure (e.g., loop forever, indicate error)
        Serial.println("CRITICAL: File System Failed. Halting.");
        while (1)
            delay(1000);
    }

    pinMode(VIBRATION_PIN, OUTPUT);
    pinMode(PAIR_PIN, INPUT_PULLDOWN); // Use pulldown/pullup as appropriate
    pinMode(USER_PIN, INPUT_PULLDOWN); // Use pulldown for response button
    pinMode(LED, OUTPUT);

    digitalWrite(VIBRATION_PIN, LOW); // Ensure vibration is off
    digitalWrite(LED, LOW);           // Ensure LED is off

    // --- Load existing schedule AND Adjust Time ---
    unsigned long originalScheduleReceiveTime = 0;
    bool scheduleIsValid = loadSchedule(); // Loads schedule, sets scheduleLoaded, sets global scheduleReceiveTime

    if (scheduleIsValid)
    {
        originalScheduleReceiveTime = scheduleReceiveTime; // Keep the original value loaded from file

        unsigned long lastKnownMillis = loadMillisCounter(); // Load millis() saved just before last shutdown
        unsigned long timePassedBeforeShutdown = 0;

        // --- Sanity Checks for Time Adjustment ---
        // Only adjust if both the original time and the last counter seem valid (non-zero)
        if (lastKnownMillis > 0 && originalScheduleReceiveTime > 0)
        {
            // Calculate time elapsed *relative to the schedule's origin* before shutdown
            if (lastKnownMillis >= originalScheduleReceiveTime)
            {
                // Normal case or rollover where lastKnownMillis wrapped PAST originalReceiveTime
                timePassedBeforeShutdown = lastKnownMillis - originalScheduleReceiveTime;
            }
            else
            {
                // Potential rollover case OR stale counter file from a previous schedule.
                // The rollover calculation is complex to verify without more state.
                // A very simple heuristic: if lastKnownMillis is "small" and original is "large",
                // assume it's a stale counter file from before the current schedule was received.
                // Let's treat this cautiously and assume NO time passed relative to *this* schedule yet.
                // A more advanced check could compare against ULONG_MAX, but this is safer for now.
                Serial.println("Warning: lastKnownMillis < originalScheduleReceiveTime. Assuming stale counter or recent schedule receipt. Resetting elapsed time.");
                timePassedBeforeShutdown = 0;
                // // If you are SURE the device runs long enough for rollover (>49 days):
                // timePassedBeforeShutdown = (ULONG_MAX - originalScheduleReceiveTime) + 1 + lastKnownMillis;
            }
            Serial.printf("Time passed before shutdown (relative to schedule): %lu ms\n", timePassedBeforeShutdown);
        }
        else
        {
            Serial.println("Could not determine time passed before shutdown (invalid counter or schedule time).");
            timePassedBeforeShutdown = 0; // Default to no time passed if data is missing/invalid
        }
        // --- End Sanity Checks ---

        // Adjust the global scheduleReceiveTime for the current boot session
        scheduleReceiveTime = millis() - timePassedBeforeShutdown;

        Serial.printf("Adjusted scheduleReceiveTime for current session: %lu\n", scheduleReceiveTime);
        Serial.println("Existing schedule loaded. Will start processing.");
        currentState = STATE_PROCESSING_SCHEDULE; // Now set the state
    }
    else // loadSchedule() failed
    {
        Serial.println("No existing schedule found or load failed. Waiting for BLE connection.");
        currentState = STATE_IDLE;
        scheduleReceiveTime = 0; // Ensure it's zero if no schedule loaded
        // Attempt to delete potentially corrupt counter file if schedule load failed
        if (LittleFS.exists(MILLIS_COUNTER_FILENAME))
        {
            Serial.println("Deleting potentially stale millis counter file.");
            LittleFS.remove(MILLIS_COUNTER_FILENAME);
        }
    }
    // --- End Load and Adjust ---

    // --- Initialize BLE ---
    BLEDevice::init("Pipli");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());
    BLEService *pService = pServer->createService(SERVICE_UUID);
    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ |
            BLECharacteristic::PROPERTY_WRITE | // Crucial for receiving schedule
            BLECharacteristic::PROPERTY_NOTIFY |
            BLECharacteristic::PROPERTY_INDICATE);
    pCharacteristic->setCallbacks(new MyCharacteristicCallbacks()); // Handle writes
    pCharacteristic->addDescriptor(new BLE2902());                  // Needed for notifications

    // Set initial characteristic value (optional)
    pCharacteristic->setValue("Ready");

    pService->start();
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);
    pAdvertising->setMaxPreferred(0x12);
    BLEDevice::startAdvertising(); // Start advertising initially
    Serial.println("BLE Initialized. Waiting for connection or processing schedule...");
}

//==================== LOOP ====================//
void loop()
{

    // --- Periodically save millis counter ---
    // Only save if a schedule is loaded, otherwise, the counter isn't very useful
    if (scheduleLoaded && (millis() - lastMillisSaveTime >= 5000))
    {
        lastMillisSaveTime = millis();
        saveMillisCounter(); // Attempt to save the current millis() value
    }
    // --- End periodic save ---

    // --- Handle Connection State Changes (Advertising) ---
    // This logic is mostly handled by callbacks now, but keep advertising restart logic
    if (!deviceConnected && oldDeviceConnected)
    {
        // onDisconnect callback handles LED and prints message
        // It also restarts advertising
        oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected)
    {
        // onConnect callback handles LED and prints message
        oldDeviceConnected = deviceConnected;
    }

    // --- Main State Machine ---
    switch (currentState)
    {
    case STATE_IDLE:
        // Waiting for connection or schedule via BLE write
        // Or waiting for a command like "SEND_UPDATE" if implemented
        // Low power mode could potentially be entered here if idle for long
        break;

    case STATE_PROCESSING_SCHEDULE:
        // Check the schedule for due reminders
        processSchedule();

        // --- Add Countdown Logic ---
        if (millis() - lastCountdownPrintMillis >= 1000)
        {
            lastCountdownPrintMillis = millis();
            if (nextReminderDueTimeMillis > 0)
            {
                unsigned long now = millis();
                // nextReminderDueTimeMillis is calculated based on the adjusted scheduleReceiveTime
                if (nextReminderDueTimeMillis > now)
                {
                    unsigned long remainingMillis = nextReminderDueTimeMillis - now;
                    unsigned long remainingSeconds = remainingMillis / 1000;
                    Serial.printf("Next reminder in: %lu seconds\n", remainingSeconds);
                }
                else
                {
                    // Serial.println("Next reminder is due now or very soon.");
                }
            }
            else
            {
                if (scheduleLoaded)
                {
                    Serial.println("No pending reminders.");
                }
            }
        }
        // --- End Countdown Logic ---
        break;

    case STATE_VIBRATING:
        // Check if vibration duration has passed
        if (millis() - stateTimer >= VIBRATION_DURATION_MS)
        {
            stopVibration();
            stateTimer = millis(); // Start timer for response timeout
            currentState = STATE_WAITING_RESPONSE;
            Serial.println("State changed to STATE_WAITING_RESPONSE");
        }
        break;

    case STATE_WAITING_RESPONSE:
        // Check for user button press
        if (digitalRead(USER_PIN) == HIGH)
        {
            Serial.println("User button pressed - Responded YES");
            recordResponse(true); // Records response, saves, moves to next, sets state back
            // Debounce delay might be needed if button is bouncy
            delay(200);
        }
        // Check for response timeout
        else if (millis() - stateTimer >= RESPONSE_TIMEOUT_MS)
        {
            Serial.println("Response timeout - Responded NO");
            recordResponse(false); // Records response, saves, moves to next, sets state back
        }
        break;

    case STATE_SENDING_UPDATE:
        // Attempt to send the update
        sendUpdate();
        // If sendUpdate was called but couldn't send (because device was disconnected),
        // it would have returned without changing the state. We should transition
        // back to IDLE here, as the "sending attempt" is done for this cycle.
        // The data remains loaded for a future request.
        // If sendUpdate *did* send successfully, it already set the state to IDLE.
        if (currentState == STATE_SENDING_UPDATE)
        { // Check if sendUpdate didn't already change state
            Serial.println("Send attempt finished (or skipped if disconnected). Returning to IDLE.");
            currentState = STATE_IDLE;
        }
        break;
    }

    // Small delay to prevent watchdog issues if loop is very fast
    delay(10);
} // End loop