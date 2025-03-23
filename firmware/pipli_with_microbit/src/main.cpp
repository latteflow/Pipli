/*
 * Blink
 * Turns on an LED on for one second,
 * then off for one second, repeatedly.
 */

#include <Arduino.h>

#define LED_ROW1 6

void setup()
{
  Serial.begin(115200);
  // initialize LED digital pin as an output.
  pinMode(LED_ROW1, OUTPUT);
}

void loop()
{
  // turn the LED on (HIGH is the voltage level)
  digitalWrite(LED_ROW1, HIGH);
  // wait for a second
  delay(1000);
  // turn the LED off by making the voltage LOW
  digitalWrite(LED_ROW1, LOW);
  // wait for a second
  delay(1000);
  Serial.println("Hello World");
}