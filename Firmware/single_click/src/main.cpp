
#include <Arduino.h>

// bluetooth related
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// srorage related
#include "FS.h"
#include <LittleFS.h>

// JSON data library
#include <ArduinoJson.h>

#define FORMAT_LITTLEFS_IF_FAILED true

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// See the following for generating UUIDs:
// https://www.uuidgenerator.net/

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define VIBRATION_PIN 19
#define PAIR_PIN 23
#define USER_PIN 34
#define LED 2

#define MTU 200              // Maximum Transmission Unit
#define BLINK_DURATION_MS 50 // How long the LED stays on during a blink

int value = 0;

// Stream opearator
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
  bool originalState = digitalRead(LED); // Read current state (might be HIGH if connected)
  digitalWrite(LED, !originalState);     // Toggle LED ON (if off) or OFF (if on) briefly
  delay(BLINK_DURATION_MS);
  digitalWrite(LED, originalState); // Restore original state
}

class MyServerCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer *pServer)
  {
    deviceConnected = true;
    BLEDevice::startAdvertising();
  };

  void onDisconnect(BLEServer *pServer)
  {
    deviceConnected = false;
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
      for (int i = 0; i < rxValue.length(); i++)
      {
        Serial.print(rxValue[i]);
      }
      Serial.println();
      blinkLed();
    }
  }
};

//==================== STORAGE RELATED ====================//

void listDir(fs::FS &fs, const char *dirname, uint8_t levels)
{
  Serial.printf("Listing directory: %s\r\n", dirname);

  File root = fs.open(dirname);
  if (!root)
  {
    Serial.println("- failed to open directory");
    return;
  }
  if (!root.isDirectory())
  {
    Serial.println(" - not a directory");
    return;
  }

  File file = root.openNextFile();
  while (file)
  {
    if (file.isDirectory())
    {
      Serial.print("  DIR : ");
      Serial.println(file.name());
      if (levels)
      {
        listDir(fs, file.path(), levels - 1);
      }
    }
    else
    {
      Serial.print("  FILE: ");
      Serial.print(file.name());
      Serial.print("\tSIZE: ");
      Serial.println(file.size());
    }
    file = root.openNextFile();
  }
}

void createDir(fs::FS &fs, const char *path)
{
  Serial.printf("Creating Dir: %s\n", path);
  if (fs.mkdir(path))
  {
    Serial.println("Dir created");
  }
  else
  {
    Serial.println("mkdir failed");
  }
}

void removeDir(fs::FS &fs, const char *path)
{
  Serial.printf("Removing Dir: %s\n", path);
  if (fs.rmdir(path))
  {
    Serial.println("Dir removed");
  }
  else
  {
    Serial.println("rmdir failed");
  }
}

void readFile(fs::FS &fs, const char *path)
{
  Serial.printf("Reading file: %s\r\n", path);

  File file = fs.open(path);
  if (!file || file.isDirectory())
  {
    Serial.println("- failed to open file for reading");
    return;
  }

  JsonDocument doc;
  deserializeJson(doc, file);
  const char *sensor = doc["sensor"];
  long time = doc["time"];
  double latitude = doc["data"][0];
  double longitude = doc["data"][1];

  Serial.println(sensor);
  Serial.println(time);
  Serial.println(latitude, 6);
  Serial.println(longitude, 6);
  Serial.println("Json parse working");

  Serial.println("- read from file:");
  while (file.available())
  {
    Serial.write(file.read());
  }
  file.close();
}

void writeFile(fs::FS &fs, const char *path, const char *message)
{
  Serial.printf("Writing file: %s\r\n", path);

  File file = fs.open(path, FILE_WRITE);
  if (!file)
  {
    Serial.println("- failed to open file for writing");
    return;
  }
  if (file.print(message))
  {
    Serial.println("- file written");
  }
  else
  {
    Serial.println("- write failed");
  }
  file.close();
}

void appendFile(fs::FS &fs, const char *path, const char *message)
{
  Serial.printf("Appending to file: %s\r\n", path);

  File file = fs.open(path, FILE_APPEND);
  if (!file)
  {
    Serial.println("- failed to open file for appending");
    return;
  }
  if (file.print(message))
  {
    Serial.println("- message appended");
  }
  else
  {
    Serial.println("- append failed");
  }
  file.close();
}

void renameFile(fs::FS &fs, const char *path1, const char *path2)
{
  Serial.printf("Renaming file %s to %s\r\n", path1, path2);
  if (fs.rename(path1, path2))
  {
    Serial.println("- file renamed");
  }
  else
  {
    Serial.println("- rename failed");
  }
}

void deleteFile(fs::FS &fs, const char *path)
{
  Serial.printf("Deleting file: %s\r\n", path);
  if (fs.remove(path))
  {
    Serial.println("- file deleted");
  }
  else
  {
    Serial.println("- delete failed");
  }
}

void testFileIO(fs::FS &fs, const char *path)
{
  Serial.printf("Testing file I/O with %s\r\n", path);

  static uint8_t buf[512];
  size_t len = 0;
  File file = fs.open(path, FILE_WRITE);
  if (!file)
  {
    Serial.println("- failed to open file for writing");
    return;
  }

  size_t i;
  Serial.print("- writing");
  uint32_t start = millis();
  for (i = 0; i < 2048; i++)
  {
    if ((i & 0x001F) == 0x001F)
    {
      Serial.print(".");
    }
    file.write(buf, 512);
  }
  Serial.println("");
  uint32_t end = millis() - start;
  Serial.printf(" - %u bytes written in %lu ms\r\n", 2048 * 512, end);
  file.close();

  file = fs.open(path);
  start = millis();
  end = start;
  i = 0;
  if (file && !file.isDirectory())
  {
    len = file.size();
    size_t flen = len;
    start = millis();
    Serial.print("- reading");
    while (len)
    {
      size_t toRead = len;
      if (toRead > 512)
      {
        toRead = 512;
      }
      file.read(buf, toRead);
      if ((i++ & 0x001F) == 0x001F)
      {
        Serial.print(".");
      }
      len -= toRead;
    }
    Serial.println("");
    end = millis() - start;
    Serial.printf("- %u bytes read in %lu ms\r\n", flen, end);
    file.close();
  }
  else
  {
    Serial.println("- failed to open file for reading");
  }
}
//==================== END STORAGE RELATED ====================//

void setup()
{
  Serial.begin(115200);

  // Initialize LittleFS
  if (!LittleFS.begin(FORMAT_LITTLEFS_IF_FAILED))
  {
    Serial.println("LittleFS Mount Failed");
    return;
  }

  pinMode(VIBRATION_PIN, OUTPUT);
  pinMode(PAIR_PIN, INPUT);
  pinMode(USER_PIN, INPUT);

  pinMode(LED, OUTPUT);   // Built-in LED
  digitalWrite(LED, LOW); // Ensure LED is off initially

  // Create the BLE Device
  BLEDevice::init("Pipli");

  // Create the BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create the BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create a BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_INDICATE);

  // incoming writes
  pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

  // Create a BLE Descriptor
  pCharacteristic->addDescriptor(new BLE2902());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); // functions that help with iPhone connections issue
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("Waiting a client connection to notify...");

  // JSON input string.
  const char *json = "{\"sensor\":\"gps\",\"time\":1351824120,\"data\":[48.756080,2.302038]}";
  delay(3000);
  listDir(LittleFS, "/", 3);
  createDir(LittleFS, "/mydir");
  writeFile(LittleFS, "/mydir/hello.txt", json);
  listDir(LittleFS, "/", 1);
  readFile(LittleFS, "/mydir/hello.txt");
}

void loop()
{

  // check if the button is pressed
  if (digitalRead(USER_PIN) == HIGH)
  {
    Serial.println("User 34 button pressed");
    // notify changed value
    digitalWrite(VIBRATION_PIN, HIGH);
  }
  else if (digitalRead(PAIR_PIN) == HIGH)
  {
    // Serial.println("User 23 button pressed");
    // notify changed value
    digitalWrite(VIBRATION_PIN, HIGH);
  }
  else
  {
    digitalWrite(VIBRATION_PIN, LOW);
  }

  EVERY_N_SECONDS(5)
  {
    // Serial.println("5 seconds passed");
    // notify changed value
    digitalWrite(VIBRATION_PIN, HIGH);
  }
  JsonDocument doc;

  doc["med_id"] = "A";
  doc["time"] = 1351824120;
  doc["ala_time"][0] = 48.756080;
  doc["ala_time"][1] = 2.302038;

  serializeJson(doc, Serial);

  // reset value on disconnection
  if (!deviceConnected)
  {
    value = 0; // reset value if not connected
  }

  // notify changed value
  if (deviceConnected)
  {

    String str = "Hello from Pipli!" + String(value); // String to send
    int str_len = str.length() + 1;

    // Prepare the character array (the buffer)
    char char_array[MTU]; // MTU

    // Copy it over
    str.toCharArray(char_array, str_len);
    pCharacteristic->setValue(char_array); // to send a test message

    pCharacteristic->notify(); // send the value to the app!

    blinkLed();

    value++;
    delay(2000); // bluetooth stack will go into congestion, if too many packets are sent, in 6 hours test i was able to go as low as 3ms
  }

  // disconnecting
  if (!deviceConnected && oldDeviceConnected)
  {
    // Set buildin LED to indicate disconnection
    digitalWrite(LED, LOW);
    delay(500);                  // give the bluetooth stack the chance to get things ready
    pServer->startAdvertising(); // restart advertising
    Serial.println("start advertising");
    oldDeviceConnected = deviceConnected;
  }
  // connecting
  if (deviceConnected && !oldDeviceConnected)
  {
    // do stuff here on connecting
    oldDeviceConnected = deviceConnected;

    // Set buildin LED to indicate connection
    digitalWrite(LED, HIGH);
  }
}