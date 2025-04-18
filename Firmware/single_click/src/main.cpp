
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

// --- Function Prototypes ---
void blinkLed();
void startVibration();
void stopVibration();
bool loadSchedule();
bool saveSchedule();
void processSchedule();
void sendUpdate();
void moveToNextReminder();
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

            // Handle the received data (expecting schedule JSON)
            handleReceivedData(rxValue);
        }
    }
};

// --- Schedule Handling Logic ---

void handleReceivedData(const std::string &data)
{
    Serial.println("Attempting to parse schedule...");
    // Clear previous schedule data
    scheduleDoc.clear();
    DeserializationError error = deserializeJson(scheduleDoc, data);

    if (error)
    {
        Serial.print(F("deserializeJson() failed: "));
        Serial.println(error.f_str());
        scheduleLoaded = false;
        currentState = STATE_IDLE; // Go back to idle if parsing failed
        return;
    }

    // Check if it's an array (basic validation)
    if (!scheduleDoc.is<JsonArray>())
    {
        Serial.println("Error: Received JSON is not an array.");
        scheduleLoaded = false;
        currentState = STATE_IDLE;
        return;
    }

    // --- IMPORTANT: Modify the structure to store responses ---
    // Iterate through the received schedule and transform the 'times' array
    JsonArray scheduleArray = scheduleDoc.as<JsonArray>();
    for (JsonObject med : scheduleArray)
    {
        if (med.containsKey("times") && med["times"].is<JsonArray>())
        {
            JsonArray originalTimes = med["times"].as<JsonArray>();
            JsonArray newTimesArray; // Create a new array for objects

            for (JsonVariant t : originalTimes)
            {
                JsonObject timeObj = newTimesArray.createNestedObject();
                // Assuming original times are strings representing seconds offset
                timeObj["time"] = t.as<String>();
                timeObj["responded"] = false; // Initialize response as null (or false)
            }
            // Replace the original 'times' array with the new array of objects
            med["times"] = newTimesArray;
        }
        else
        {
            Serial.println("Warning: Medication entry missing 'times' array or invalid format.");
            // Optionally remove this invalid entry or handle it
        }
    }

    Serial.println("Schedule parsed and structure updated successfully.");
    scheduleLoaded = true;
    scheduleReceiveTime = millis();           // Record time for relative reminders
    currentMedIndex = 0;                      // Start from the first medication
    currentTimeIndex = 0;                     // Start from the first time for that medication
    currentState = STATE_PROCESSING_SCHEDULE; // Start processing
    Serial.println("State changed to STATE_PROCESSING_SCHEDULE");

    // Save the initial schedule with null responses (optional but good)
    saveSchedule();

    // Optional: Send confirmation back
    // pCharacteristic->setValue("ACK_SCHEDULE_RECEIVED");
    // pCharacteristic->notify();
    // blinkLed();
}

// Find the next reminder time and check if it's due
void processSchedule()
{
    if (!scheduleLoaded || scheduleDoc.isNull() || !scheduleDoc.is<JsonArray>())
    {
        currentState = STATE_IDLE;
        return;
    }

    JsonArray scheduleArray = scheduleDoc.as<JsonArray>();

    // Check if we've processed all medications
    if (currentMedIndex >= scheduleArray.size())
    {
        Serial.println("All medications processed.");
        // Optionally send update automatically here, or wait for request
        currentState = STATE_SENDING_UPDATE; // Or STATE_IDLE
        return;
    }

    JsonObject currentMed = scheduleArray[currentMedIndex];
    if (!currentMed || !currentMed.containsKey("times") || !currentMed["times"].is<JsonArray>())
    {
        Serial.println("Invalid medication entry or missing times. Skipping.");
        moveToNextReminder(); // Skip to next med/time
        return;
    }

    JsonArray timesArray = currentMed["times"].as<JsonArray>();

    // Check if we've processed all times for this medication
    if (currentTimeIndex >= timesArray.size())
    {
        Serial.printf("Finished times for med_id %s. Moving to next med.\n", currentMed["med_id"].as<const char *>());
        currentMedIndex++;
        currentTimeIndex = 0;
        // Re-run processSchedule to check the next med immediately
        // or wait for the next loop iteration
        return; // Let the next loop iteration handle the next med index check
    }

    JsonObject timeObj = timesArray[currentTimeIndex];
    if (!timeObj || !timeObj.containsKey("time") || !timeObj.containsKey("responded"))
    {
        Serial.println("Invalid time object. Skipping.");
        moveToNextReminder();
        return;
    }

    // Check if this reminder has already been processed (responded is not null)
    if (!timeObj["responded"].isNull())
    {
        // Serial.println("Reminder already processed. Skipping.");
        moveToNextReminder();
        return;
    }

    // --- Calculate Time ---
    // Assuming "time" is a string representing offset in SECONDS
    long reminderOffsetSeconds = timeObj["time"].as<String>().toInt();
    unsigned long reminderDueTimeMillis = scheduleReceiveTime + (reminderOffsetSeconds * 1000UL);
    unsigned long currentTimeMillis = millis();

    // Serial.printf("Checking Med %d, Time %d: Due at %lu ms, Current %lu ms\n",
    //               currentMedIndex, currentTimeIndex, reminderDueTimeMillis, currentTimeMillis);

    if (currentTimeMillis >= reminderDueTimeMillis)
    {
        Serial.printf("Reminder Due! Med ID: %s, Time Offset: %s\n",
                      currentMed["med_id"].as<const char *>(),
                      timeObj["time"].as<const char *>());

        startVibration();
        stateTimer = millis(); // Start timer for vibration duration
        currentState = STATE_VIBRATING;
        Serial.println("State changed to STATE_VIBRATING");
    }
    // Else: Not time yet, keep checking in the next loop iteration
}

void moveToNextReminder()
{
    if (!scheduleLoaded || !scheduleDoc.is<JsonArray>())
        return;
    JsonArray scheduleArray = scheduleDoc.as<JsonArray>();
    if (currentMedIndex < 0 || currentMedIndex >= scheduleArray.size())
        return; // Invalid state

    JsonObject currentMed = scheduleArray[currentMedIndex];
    if (!currentMed || !currentMed.containsKey("times") || !currentMed["times"].is<JsonArray>())
    {
        // Invalid med, try next one
        currentMedIndex++;
        currentTimeIndex = 0;
        return;
    }

    JsonArray timesArray = currentMed["times"].as<JsonArray>();
    currentTimeIndex++; // Move to next time slot

    if (currentTimeIndex >= timesArray.size())
    {
        // Finished times for this med, move to next med
        currentMedIndex++;
        currentTimeIndex = 0; // Reset time index for the new med
    }
    // State remains STATE_PROCESSING_SCHEDULE to check the next one
}

void recordResponse(bool responded)
{
    if (!scheduleLoaded || !scheduleDoc.is<JsonArray>() || currentMedIndex < 0 || currentTimeIndex < 0)
    {
        Serial.println("Error: Cannot record response, schedule not loaded or indices invalid.");
        return;
    }
    JsonArray scheduleArray = scheduleDoc.as<JsonArray>();
    if (currentMedIndex >= scheduleArray.size())
        return;
    JsonObject currentMed = scheduleArray[currentMedIndex];
    if (!currentMed || !currentMed.containsKey("times") || !currentMed["times"].is<JsonArray>())
        return;
    JsonArray timesArray = currentMed["times"].as<JsonArray>();
    if (currentTimeIndex >= timesArray.size())
        return;
    JsonObject timeObj = timesArray[currentTimeIndex];
    if (!timeObj)
        return;

    Serial.printf("Recording response for Med %d, Time %d: %s\n", currentMedIndex, currentTimeIndex, responded ? "Yes" : "No");
    timeObj["responded"] = responded;

    // Save the updated schedule after recording response
    saveSchedule();

    // Move to the next reminder check
    moveToNextReminder();
    currentState = STATE_PROCESSING_SCHEDULE; // Go back to checking times
    Serial.println("State changed to STATE_PROCESSING_SCHEDULE");
}

void sendUpdate()
{
    if (!deviceConnected)
    {
        Serial.println("Cannot send update: Device not connected.");
        currentState = STATE_IDLE; // Or back to processing if schedule still valid
        return;
    }
    if (!scheduleLoaded || scheduleDoc.isNull())
    {
        Serial.println("Cannot send update: No schedule data.");
        currentState = STATE_IDLE;
        return;
    }

    Serial.println("Serializing updated schedule...");
    String outputJson;
    serializeJson(scheduleDoc, outputJson);

    Serial.print("Sending Update: ");
    Serial.println(outputJson.c_str());

    // Send the JSON string via BLE Notification
    // Note: BLE notifications have size limits (MTU). If JSON is very large,
    // it might need chunking, but the library handles basic fragmentation.
    pCharacteristic->setValue(outputJson.c_str());
    pCharacteristic->notify();
    blinkLed(); // Blink on send

    Serial.println("Update sent.");
    // Decide what to do next. Go idle? Clear schedule?
    // Let's go idle, waiting for a new schedule or command.
    currentState = STATE_IDLE;
    // scheduleLoaded = false; // Optional: Clear schedule after sending?
    // scheduleDoc.clear();
    Serial.println("State changed to STATE_IDLE");
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

    // Clear existing data before loading
    scheduleDoc.clear();
    DeserializationError error = deserializeJson(scheduleDoc, file);
    file.close();

    if (error)
    {
        Serial.print(F("Failed to parse schedule file: "));
        Serial.println(error.f_str());
        // Delete corrupted file?
        // LittleFS.remove(SCHEDULE_FILENAME);
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
    currentMedIndex = 0;            // Start processing from the beginning
    currentTimeIndex = 0;
    // Don't automatically start processing? Or should we? Let's start.
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
        // Send the final schedule with responses
        sendUpdate();
        // sendUpdate() changes state back to IDLE after sending
        break;
    }

    // Small delay to prevent watchdog issues if loop is very fast
    delay(10);
} // End loop