# Pipli \- Medicine reminder device for elderly people.

A Device to help elderly people  
Github link: [https://github.com/latteflow/Pipli](https://github.com/latteflow/Pipli)  
Drawio file: 

Contributors: Nandani & Latteflow Team   
Started on: 21 January 2025

## Problem Statement 

Nowadays, most elderly people live alone at home. They often cannot leave because they are emotionally attached to their homes. However, living alone makes it difficult for them to take care of themselves. 

To solve this problem, we can create a low-cost device that provides timely reminders for meals and medication. This device can be worn on the wrist like a watch, making it easy to carry and use. It uses a low-cost microcontroller and a small ubiquitous replaceable battery. It can be easily connected to a smartphone via Bluetooth, where the reminders can be pre-programmed and saved in advance. The device will be easily accessible, ensuring elderly individuals receive important reminders without hassle.

The design and the code will be made open-source, such that everyone can access and easily replicate the design to help. 

We can create a device app called Pipli, which will feature a reminder system for important notifications. This app is designed to be highly convenient for elderly users, ensuring that they can easily set and receive reminders for various tasks and events. By focusing on a user-friendly interface with large buttons and clear instructions, Pipli will cater specifically to the needs of seniors, helping them manage their daily schedules effectively.

Approach 

![][image1]

This device will have a note chart for important items such as medication and food reminders. We can create a mockup of the app using Figma to ensure that everything is easy to understand. The app will include several features, such as buttons for help, sound notifications, feedback, and options for listening, downloading, or sharing information. This design will enhance user experience and make it more accessible for elderly users.

Do UX mockup of the app on the Figma 

1 Start writing a detailed approach 

- [ ] What is required   
- [ ] A smartphone with an application   
- [ ] Customizable options such as \- Repeat intervals, Advance alerts and Sound notifications.  
- [ ] A Pipli device to manage 

2 What functionality will the device have 

- [ ] Haptic feedback, ie, vibration   
- [ ] Sound   
- [ ] A button for Help  
- [ ] A button to listen   
- [ ] To create a new note  
- [ ] Delete Option  
- [ ] Share Option   
- [ ] Download Option

3 What components will it have 

- [ ] An MCU with WiFi/Bluetooth  
- [ ] Vibration motor   
- [ ] Sound   
- [ ] Button 

## 

## Electronics

Once each sensor and actuator has been tested and programmed individually, we have to design a PCB, which needs to be printed.   
Finally, we will solder every component and test it. When everything is working, then we will incorporate it into the mechanical housing 

KiCAD: [https://www.kicad.org/](https://www.kicad.org/)

![][image2]  
 Example PCB 

## Firmware

For programming and all: [https://platformio.org/](https://platformio.org/)

It has an extension for VS Code, please sign up and try to get it working

Website to simulate and run your program: [https://wokwi.com/esp32](https://wokwi.com/esp32)

## Mechanical Design 

Autodesk Fusion:   
[https://www.autodesk.com/in/products/fusion-360/overview](https://www.autodesk.com/in/products/fusion-360/overview)

Once the electronics are ready, we will start the mechanical design process. We will be utilizing the 3D printer for design iterations. 

Meanwhile, you should start designing the sketch, iterate, and think about user interactions and user experience. 

![][image3]

A Mockup of the Pipli device with Buttons

Fusion 360 Link for the design: 

[https://a360.co/4kiht4b](https://a360.co/4kiht4b)

## Application

Android / IOS   
[https://reactnative.dev/](https://reactnative.dev/)

We will have an app which will let the user connect and configure the reminders. It will be a primary way to connect to the device and save the program and reminders. Once the medicine course is over, it can be removed and a new medicine course can be saved for someone else. It will have the ability to connect to multiple devices.  

The app will be created in the React Native framework, such that both Android and IOS devices can work. 

UI / UX 

Figma:   
[https://www.figma.com/](https://www.figma.com/)

- [ ] PUT user interaction workflow here   
    


1. Press a button   
2. The device will wake up   
3. It will try to search for a new device   
4. If there is no device, then it will go into sleep mode   
5. Once the reminder comes close, it will wake up and try to play the sound/vibration sensor   
6. Once the user presses the button confirming they have taken medicine / do the work.   
7. Then it will go to sleep 

The user can ask for help by pressing the button   
If the device wakes and tries to connect with the smartphone, it will play the sound or send a notification that someone is in need of help.

## Components required 

ESP32

Tutorial: [https://randomnerdtutorials.com/projects-esp32/](https://randomnerdtutorials.com/projects-esp32/)

USB micro programmer / UBB C programmer 

LED 

Vibration motor: 

[https://robu.in/product/dc-vibration-motor-module/](https://robu.in/product/dc-vibration-motor-module/)

How to interface vibration motor with sensor: 

[https://thecustomizewindows.com/2021/08/esp32-and-coin-vibrator-motor/](https://thecustomizewindows.com/2021/08/esp32-and-coin-vibrator-motor/) 

Sound sensor: 

[https://www.elprocus.com/sound-sensor-working-and-its-applications/](https://www.elprocus.com/sound-sensor-working-and-its-applications/)

 Sound buzzers: 

[https://esp32io.com/tutorials/esp32-piezo-buzzer](https://esp32io.com/tutorials/esp32-piezo-buzzer)

[https://robu.in/product/5v-active-alarm-buzzer-module-arduino/](https://robu.in/product/5v-active-alarm-buzzer-module-arduino/)

Buttons or Tactile switch: 

[https://robu.in/product/6x6x5-tactile-push-button-switch/](https://robu.in/product/6x6x5-tactile-push-button-switch/)

Rechargeable battery: 

[https://robu.in/product/400mah-pcm-protected-micro-li-po-battery-2/](https://robu.in/product/400mah-pcm-protected-micro-li-po-battery-2/)

Lipo charger with USB C: 

[https://robu.in/product/lipo-charger-with-usc-c-type-jack/](https://robu.in/product/lipo-charger-with-usc-c-type-jack/)

[https://www.flyrobo.in/tp4056-1a-li-ion-lithium-battery-charging-module-with-current-protection-type-c?tracking=ads\&gQT=1](https://www.flyrobo.in/tp4056-1a-li-ion-lithium-battery-charging-module-with-current-protection-type-c?tracking=ads&gQT=1)

[https://robu.in/product/tp4056-1a-li-ion-lithium-battery-charging-module-with-current-protection-type-c/](https://robu.in/product/tp4056-1a-li-ion-lithium-battery-charging-module-with-current-protection-type-c/)

3d Printing service: [https://robu.in/product/3d-printing-service/](https://robu.in/product/3d-printing-service/)

2 List key steps

* Break down the journey into individual steps   
  Pipli Device \- Medicine Remainder  
- [ ] User interaction workflow  
1. Open the  phone go to the  bluetooth option and press the bluetooth  and open and see the Pipli device  