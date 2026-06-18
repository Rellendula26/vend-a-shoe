# Vend-A-Shoe
# Project for BrainChild Engineering Internship

A cloud-connected vending system that allows a user to remotely actuate physical hardware through a web application. The system integrates a Next.js frontend, Supabase command queue, Raspberry Pi control layer, and embedded hardware to create a complete end-to-end IoT workflow.

## Overview

Vend-A-Shoe demonstrates how modern web infrastructure can be connected directly to physical hardware.

When a user presses a button on the deployed web application:

1. A command is inserted into a Supabase database.
2. A Raspberry Pi worker continuously polls for pending commands.
3. The worker claims the command and executes a hardware control script.
4. GPIO peripherals are actuated, including servo motors and LEDs.
5. Command status is updated in the database to provide execution tracking and reliability.

This architecture enables remote control of physical devices from anywhere with internet access.

---

## System Architecture

```text
User
 │
 ▼
Next.js Frontend (Vercel)
 │
 ▼
Supabase Command Queue
 │
 ▼
Raspberry Pi Worker
 │
 ▼
GPIO Control Layer
 │
 ├── MG996R Servo
 ├── Status LEDs
 └── Future Peripheral Expansion
```

---

## Technical Highlights

### Cloud-to-Hardware Communication

Rather than exposing the Raspberry Pi directly to the internet, Vend-A-Shoe uses Supabase as an intermediary command queue.

This approach provides:

* Improved security
* NAT/firewall compatibility
* Reliable command persistence
* Device state tracking
* Scalability to multiple hardware devices

### Embedded Systems Integration

The Raspberry Pi interfaces directly with GPIO peripherals:

* MG996R high-torque servo motors
* Status LEDs
* Future fan and sensor expansion

Control logic is implemented in Python using:

* gpiozero
* PWM servo control
* Hardware-safe movement sequencing

### Distributed Command Processing

The Raspberry Pi runs a dedicated worker process that:

* Polls Supabase for pending commands
* Claims commands to prevent duplicate execution
* Executes hardware actions
* Reports completion status
* Handles failure states

This pattern mirrors production distributed job processing systems used in large-scale cloud infrastructure.

---

## Tech Stack

### Frontend

* Next.js
* TypeScript
* Vercel

### Backend Infrastructure

* Supabase
* PostgreSQL
* Row Level Security (RLS)

### Embedded Systems

* Raspberry Pi 4
* Python
* GPIOZero
* PWM Servo Control

### Hardware

* MG996R Servo Motor
* LEDs
* External Power Supply

---

## Key Engineering Challenges

### Reliable Remote Actuation

One challenge was ensuring hardware commands could be executed remotely without exposing the Raspberry Pi directly to the public internet.

The final solution leveraged a cloud-hosted command queue architecture where the Pi acts as a worker node rather than a public-facing server.

### Servo Control and Power Delivery

MG996R servos require significantly more current than can be safely supplied by Raspberry Pi GPIO pins.

To address this:

* Servos are powered through an external power supply
* GPIO pins are used only for control signals
* Grounds are shared between systems
* Motion sequences were tuned to avoid stalling and excessive current draw

### Fault Recovery

The worker system tracks command execution status:

* pending
* running
* completed
* failed

This provides observability and allows recovery from interrupted hardware actions.

---

## Future Improvements

* Real-time command updates via WebSockets
* Camera-based inventory verification
* Multiple vending lanes
* Inventory database integration
* QR code purchasing
* Mobile application
* Sensor feedback and closed-loop control
* Computer vision for dispensing validation

---

## Running the Project

### Frontend

```bash
npm install
npm run dev
```

### Raspberry Pi Worker

```bash
source .venv/bin/activate

export SUPABASE_URL="YOUR_SUPABASE_URL"
export SUPABASE_KEY="YOUR_SUPABASE_KEY"

python3 pi_worker.py
```

---

## Learning Outcomes

This project combines concepts from:

* Embedded Systems
* Internet of Things (IoT)
* Distributed Systems
* Cloud Infrastructure
* Web Development
* Hardware Control
* System Integration

The result is a complete cloud-to-hardware pipeline capable of remotely controlling physical devices through a modern web application.
