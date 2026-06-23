# Vend-A-Shoe

An autonomous cyber-physical vending platform that bridges cloud infrastructure with real-world hardware. Vend-A-Shoe enables users to remotely dispense physical inventory through a web application by orchestrating a distributed system spanning cloud databases, embedded controllers, mechanical actuation, and real-time hardware execution.

Built during my Hardware Engineering Internship at BrainChild Engineering, this project explores how modern software infrastructure can reliably interact with physical devices through secure, scalable IoT architectures.

---

## Overview

Most web applications terminate at a screen.

Vend-A-Shoe extends software into the physical world.

A user can remotely interact with a deployed web application to trigger real-world hardware actions. Commands are transmitted through a cloud-hosted control layer, processed by an embedded Raspberry Pi worker, and executed through electromechanical hardware including high-torque servo motors and GPIO peripherals.

The result is a complete cloud-to-hardware pipeline capable of controlling physical devices from anywhere with internet access.

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
Raspberry Pi Worker Node
 │
 ▼
GPIO Control Layer
 │
 ├── MG996R Servo Motors
 ├── Status LEDs
 └── Future Sensor Expansion
 │
 ▼
Physical Shoe Dispensing Mechanism
```

---

## Engineering Scope

Vend-A-Shoe required integration across four engineering domains.

### Software Engineering

* Full-stack web application using Next.js and TypeScript
* Remote command generation and state management
* Cloud-hosted deployment through Vercel
* User-facing control dashboard

### Distributed Systems

* Supabase-backed command queue architecture
* Worker-node execution model
* Command claiming to prevent duplicate execution
* Status tracking and fault recovery
* Scalable cloud-to-device communication

### Embedded Systems

* Raspberry Pi GPIO control
* PWM-based servo actuation
* Hardware-safe execution sequencing
* Python worker infrastructure
* Real-time command processing

### Mechanical Engineering

* Physical dispensing mechanism design
* Servo-driven actuation system
* CAD-based hardware development
* Electromechanical integration

---

## Key Technical Highlights

### Cloud-to-Hardware Communication

Rather than exposing the Raspberry Pi directly to the public internet, Vend-A-Shoe uses Supabase as an intermediary command queue.

Benefits include:

* Improved security
* NAT/firewall compatibility
* Persistent command storage
* Device state tracking
* Scalability to multiple hardware devices

### Distributed Command Processing

The Raspberry Pi operates as a dedicated worker node that:

1. Polls for pending commands
2. Claims commands atomically
3. Executes hardware actions
4. Updates completion status
5. Handles execution failures

This architecture mirrors production job-processing systems commonly used in large-scale cloud infrastructure.

### Embedded Hardware Control

The system interfaces directly with GPIO peripherals including:

* MG996R high-torque servo motors
* Status LEDs
* Future fan and sensor integrations

Servo control is implemented through PWM-based actuation while maintaining electrical isolation between high-current hardware and Raspberry Pi control signals.

---

## Engineering Challenges

### Reliable Remote Actuation

One of the primary challenges was creating a mechanism for remotely controlling hardware without exposing embedded devices directly to the internet.

The final architecture uses a cloud-hosted command queue where the Raspberry Pi acts as a worker node, significantly improving security and reliability.

### Servo Power Delivery

MG996R servos require significantly more current than can safely be supplied through Raspberry Pi GPIO pins.

To address this:

* Servos are powered through an external power supply
* GPIO pins are used exclusively for control signals
* Grounds are shared across systems
* Motion sequences are tuned to prevent excessive current draw

### Fault Recovery and Observability

Commands transition through multiple execution states:

```text
pending → running → completed
                  ↘
                   failed
```

This provides visibility into system behavior and allows recovery from interrupted hardware actions.

---

## Tech Stack

### Frontend

* Next.js
* TypeScript
* Tailwind CSS
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

* MG996R Servo Motors
* Status LEDs
* External Power Distribution

---

## Future Improvements

* Closed-loop servo feedback control
* Camera-based inventory verification
* Computer vision dispensing validation
* Real-time updates through WebSockets
* Multi-lane dispensing architecture
* Mobile application support
* Inventory database integration
* QR-code purchasing workflow
* Remote telemetry dashboard

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
* Full-Stack Development
* Electromechanical Design
* Hardware Control
* System Integration

Vend-A-Shoe demonstrates how modern cloud software can be extended beyond the browser to reliably control real-world hardware through a scalable, production-inspired architecture.

