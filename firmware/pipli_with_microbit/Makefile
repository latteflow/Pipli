all: compile 
upload: upload_
monitor: monitor_
compile: compile_

upload_: 
	@pio run -t upload -e bbcmicrobit_v2

compile_: 
	@pio run -e bbcmicrobit_v2

monitor_: 
	@pio device monitor -b 115200

clean: 
	@pio run -t clean

list: 
	@pio device list