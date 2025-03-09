all: compile 
upload: upload_esp32
monitor: monitor_esp32
compile: compile_esp32

upload_esp32: 
	@pio run -t upload -e esp32doit-devkit-v1

compile_esp32: 
	@pio run -e esp32doit-devkit-v1

monitor_esp32: 
	@pio device monitor -b 115200

clean: 
	@pio run -t clean

list: 
	@pio device list