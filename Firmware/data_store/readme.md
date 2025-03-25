
Esp32: pinouts
http://randomnerdtutorials.com/esp32-pinout-reference-gpios/

Software dependencies: 
Make 
Platform IO 
Pio CLI 


## ESP32 
1. Make bluetooth work 
2. File sytem to Save JSON 
3. 



when pressing mechanical switches, it will debounce. The switch turn on and off multiple times before it settles.
This is due to the mechanical nature of the switch. To debounce, we can use a software solution.
The software solution is to wait for a certain amount of time before we consider the switch to be stable. This is called debouncing.