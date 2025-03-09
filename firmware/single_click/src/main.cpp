#include <Arduino.h>

bool buttonPinStatus = false;

void setup()
{
  // initialise serial commuication at a baud rate or 115200
  Serial.begin(115200);

  // print a message to the Serial Monitor
  Serial.println("ESP 32 power Up");

  // set GPIO 4 as an output pin (for controlling an LED or other output de
  pinMode(4, OUTPUT);
  pinMode(15, INPUT_PULLUP);
  pinMode(14, OUTPUT);
}

void loop()
{

  buttonPinStatus = digitalRead(15);
  Serial.print(buttonPinStatus);

  if (buttonPinStatus == HIGH)
  {
    Serial.println("Button is pressed");
    digitalWrite(4, HIGH);
    digitalWrite(14, HIGH);
  }
  else
  {
    Serial.println("Button is not pressed");
    digitalWrite(4, LOW);
    digitalWrite(14, LOW);
  }
  // smal delay to stabilize simulation (not required in actual hardware)
  delay(100);
}