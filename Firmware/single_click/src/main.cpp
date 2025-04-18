/*
    Video: https://www.youtube.com/watch?v=oCMOYS71NIU
    Based on Neil Kolban example for IDF: https://github.com/nkolban/esp32-snippets/blob/master/cpp_utils/tests/BLE%20Tests/SampleNotify.cpp
    Ported to Arduino ESP32 by Evandro Copercini
    updated by chegewara

   Create a BLE server that, once we receive a connection, will send periodic notifications.
   The service advertises itself as: 4fafc201-1fb5-459e-8fcc-c5c9c331914b
   And has a characteristic of: beb5483e-36e1-4688-b7f5-ea07361b26a8

   The design of creating the BLE server is:
   1. Create a BLE Server
   2. Create a BLE Service
   3. Create a BLE Characteristic on the Service
   4. Create a BLE Descriptor on the characteristic
   5. Start the service.
   6. Start advertising.

   A connect handler associated with the server starts a background task that performs notification
   every couple of seconds.
*/
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

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

void setup()
{
  Serial.begin(115200);

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