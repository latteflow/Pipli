
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

#define FORMAT_LITTLEFS_IF_FAILED true
#define SCHEDULE_FILENAME "/schedule.json"

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

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
#define VIBRATION_DURATION_MS 2000 // How long to vibrate for a reminder
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
unsigned long stateTimer = 0; // Used for vibration duration and response timeout

// -- -Function Prototypes-- -
void blinkLed();
void startVibration();
void stopVibration();
bool loadSchedule();
bool saveSchedule();
void processSchedule();
void sendUpdate();
// void moveToNextReminder(); // No longer needed
void handleReceivedData(const std::string &data);

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
                sendUpdate();
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

// --- Schedule Handling Logic ---

void handleReceivedData(const std::string &data)
{
    Serial.println("Attempting to parse schedule...");
    // Clear previous schedule data
    scheduleDoc.clear(); // Make sure you are using DynamicJsonDocument or have allocated enough static memory
    DeserializationError error = deserializeJson(scheduleDoc, data);

    if (error)
    {
        Serial.print(F("deserializeJson() failed: "));
        Serial.println(error.f_str());
        scheduleLoaded = false;
        currentState = STATE_IDLE;
        return;
    }

    if (!scheduleDoc.is<JsonArray>())
    {
        Serial.println("Error: Received JSON is not an array.");
        scheduleLoaded = false;
        currentState = STATE_IDLE;
        return;
    }

    JsonArray scheduleArray = scheduleDoc.as<JsonArray>();
    bool structureUpdateSuccess = true; // Flag to track success

    for (JsonObject med : scheduleArray)
    {
        if (med.containsKey("times") && med["times"].is<JsonArray>())
        {
            // Temporarily store original time strings because we modify the object
            std::vector<String> originalTimeStrings;
            JsonArray originalTimes = med["times"].as<JsonArray>();
            for (JsonVariant t : originalTimes)
            {
                originalTimeStrings.push_back(t.as<String>());
            }

            // *** FIX: Create the new array directly nested within 'med' ***
            // This ensures it uses scheduleDoc's memory pool.
            // It implicitly removes/replaces the old "times" key.
            JsonArray newTimesArray = med.createNestedArray("times");
            if (newTimesArray.isNull())
            {
                Serial.println("Error: Failed to create nested times array. Memory full?");
                structureUpdateSuccess = false;
                break; // Exit the loop on memory error
            }

            // Populate the newly created nested array
            for (const String &t_str : originalTimeStrings)
            {
                JsonObject timeObj = newTimesArray.createNestedObject();
                if (timeObj.isNull())
                {
                    Serial.println("Error: Failed to create nested time object. Memory full?");
                    structureUpdateSuccess = false;
                    break; // Exit the inner loop
                }
                timeObj["time"] = t_str;
                // Use JsonNull to clearly indicate "not yet responded" vs "responded false"
                timeObj["responded"] = nullptr;
            }
            if (!structureUpdateSuccess)
                break; // Exit outer loop if inner loop failed
        }
        else
        {
            Serial.println("Warning: Medication entry missing 'times' array or invalid format.");
            // Decide if this is an error or just needs skipping
            // structureUpdateSuccess = false; // Uncomment if this should halt processing
            // break;
        }
    } // End for loop iterating through medications

    if (!structureUpdateSuccess)
    {
        Serial.println("Failed to update schedule structure. Aborting.");
        scheduleLoaded = false;
        currentState = STATE_IDLE;
        scheduleDoc.clear(); // Clear potentially corrupted document
        return;
    }

    Serial.println("Schedule parsed and structure updated successfully.");

    // --- Debug: Print the modified structure ---
    Serial.println("--- Modified Structure ---");
    serializeJsonPretty(scheduleDoc, Serial);
    Serial.println("\n------------------------");

    scheduleLoaded = true;
    scheduleReceiveTime = millis();
    // Reset indices - processSchedule will find the first one
    currentMedIndex = -1;
    currentTimeIndex = -1;
    currentState = STATE_PROCESSING_SCHEDULE;
    Serial.println("State changed to STATE_PROCESSING_SCHEDULE");

    // Save the initial schedule (now with correct structure)
    if (!saveSchedule())
    {
        Serial.println("Error saving initial schedule!");
        // Handle error? Maybe revert state?
    }
}

// --- MODIFIED processSchedule ---
// Scans the entire schedule to find the earliest *absolute* time for the next reminder
void processSchedule()
{
    if (!scheduleLoaded || scheduleDoc.isNull() || !scheduleDoc.is<JsonArray>())
    {
        currentState = STATE_IDLE;
        return;
    }

    JsonArray scheduleArray = scheduleDoc.as<JsonArray>();
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
    }
    else
    {
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
    if (!scheduleLoaded || scheduleDoc.isNull() || !scheduleDoc.is<JsonArray>() || currentMedIndex < 0 || currentTimeIndex < 0)
    {
        Serial.println("Error: Cannot record response, schedule not loaded or indices invalid.");
        currentState = STATE_IDLE; // Go idle to prevent issues
        return;
    }

    JsonArray scheduleArray = scheduleDoc.as<JsonArray>();
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

    // --- No longer move to next reminder explicitly ---
    // moveToNextReminder();

    // Reset active indices
    // currentMedIndex = -1; // Optional: Reset, but processSchedule will overwrite anyway
    // currentTimeIndex = -1;

    // Go back to processing state to find the *next* earliest reminder
    currentState = STATE_PROCESSING_SCHEDULE;
    Serial.println("State changed to STATE_PROCESSING_SCHEDULE");
}

void sendUpdate()
{
    // --- Check connection FIRST ---
    if (!deviceConnected)
    {
        Serial.println("Cannot send update: Device not connected. Update pending.");
        // Don't change state here. The state machine will handle it.
        // The updated scheduleDoc remains loaded.
        return; // Exit without sending
    }

    // --- Check if data exists ---
    if (!scheduleLoaded || scheduleDoc.isNull())
    {
        Serial.println("Cannot send update: No schedule data loaded.");
        // If there's no data, we can safely go idle.
        currentState = STATE_IDLE;
        return;
    }

    // --- Proceed with sending ---
    Serial.println("Serializing updated schedule...");
    String outputJson;
    // Use serializeJsonPretty for easier debugging if needed, otherwise serializeJson
    serializeJson(scheduleDoc, outputJson);
    // serializeJsonPretty(scheduleDoc, Serial); // Debug output

    Serial.print("Sending Update: ");
    Serial.println(outputJson.c_str());

    pCharacteristic->setValue(outputJson.c_str());
    pCharacteristic->notify();
    blinkLed(); // Blink on send

    Serial.println("Update sent successfully.");

    // --- IMPORTANT: Decide what to do after successful send ---
    // Option 1: Go idle, keep data (allows resending if requested again)
    currentState = STATE_IDLE;
    Serial.println("State changed to STATE_IDLE after sending.");

    // Option 2: Go idle, clear data (requires new schedule)
    // scheduleLoaded = false;
    // scheduleDoc.clear();
    // if (LittleFS.exists(SCHEDULE_FILENAME)) { // Also clear persisted file?
    //     LittleFS.remove(SCHEDULE_FILENAME);
    // }
    // currentState = STATE_IDLE;
    // Serial.println("State changed to STATE_IDLE and schedule cleared after sending.");

    // Let's stick with Option 1 (keep data) for now.
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
    if (!scheduleLoaded || scheduleDoc.isNull())
    {
        Serial.println("No schedule data to save.");
        // Optionally delete existing file if schedule is cleared
        // if (LittleFS.exists(SCHEDULE_FILENAME)) {
        //     LittleFS.remove(SCHEDULE_FILENAME);
        // }
        return false;
    }

    File file = LittleFS.open(SCHEDULE_FILENAME, FILE_WRITE);
    if (!file)
    {
        Serial.println("Failed to open schedule file for writing");
        return false;
    }

    size_t bytesWritten = serializeJson(scheduleDoc, file);
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
        return false;
    }

    File file = LittleFS.open(SCHEDULE_FILENAME, FILE_READ);
    if (!file)
    {
        Serial.println("Failed to open schedule file for reading");
        return false;
    }

    scheduleDoc.clear();
    DeserializationError error = deserializeJson(scheduleDoc, file);
    file.close();

    if (error)
    {
        Serial.print(F("Failed to parse schedule file: "));
        Serial.println(error.f_str());
        return false;
    }

    if (!scheduleDoc.is<JsonArray>())
    {
        Serial.println("Error: Loaded schedule file is not a JSON array.");
        return false;
    }

    Serial.println("Schedule loaded successfully from LittleFS.");
    scheduleLoaded = true;
    scheduleReceiveTime = millis(); // Treat load time as the new reference
    // Reset indices - processSchedule will find the first one
    currentMedIndex = -1;
    currentTimeIndex = -1;
    currentState = STATE_PROCESSING_SCHEDULE;
    Serial.println("State changed to STATE_PROCESSING_SCHEDULE");
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

    // --- Try to load existing schedule ---
    if (loadSchedule())
    {
        Serial.println("Existing schedule loaded. Will start processing.");
        // State is set to STATE_PROCESSING_SCHEDULE inside loadSchedule()
    }
    else
    {
        Serial.println("No existing schedule found or load failed. Waiting for BLE connection.");
        currentState = STATE_IDLE;
    }

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