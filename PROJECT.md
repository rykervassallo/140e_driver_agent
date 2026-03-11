## Overall goal
Create agent who observes webcam output from a phone camera using and outputs actions for an RC car.

## Supported tools
- Turn left 15 degrees
- Turn right 15 degrees
- Move forwards 1 foot
- Move forwards 2 inches
- Move backwards 1 foot
- Move backwards 2 inches
- More later as needed

## Overall architecture
Rasp pi attached to motor driver on RC car, with nrf module plugged in 
<>
Rasp pi plugged into computer USB, nrf module plugged in 
<>
Computer attached to phone webcam

## Required software
- Car side Rpi code (I will write this)
- Computer side Rpi code (I will write this)
- Agent running on computer

## Agent goals
Take in prompt from user, continually observe camera output to control car according to user's request. Use the available tools, which will be supported over USB (the "Turn left 15 degrees" will send a signal thru USB to computer side Pi to send an NRF signal to drive the car). The agent should ingest the prompt, and continually observe the camera output and generate tool calls until it believes it has fulfilled the user's request in the prompt.


