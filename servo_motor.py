#!/usr/bin/env python3
import argparse
import time

try:
    import RPi.GPIO as GPIO
except ImportError as exc:
    raise RuntimeError(
        "RPi.GPIO is required on Raspberry Pi to control the servo motor."
    ) from exc


PWM_FREQUENCY_HZ = 50
HOME_DUTY_CYCLE = 2.5
TARGET_DUTY_CYCLE = 12.5
STEP_DUTY_CYCLE = 0.2
STEP_DELAY_SECONDS = 0.02
SETTLE_SECONDS = 0.6


def sweep_servo(pwm: GPIO.PWM, start: float, end: float) -> None:
    if start == end:
        return
    direction = 1 if end > start else -1
    duty = start
    while (direction == 1 and duty < end) or (direction == -1 and duty > end):
        pwm.ChangeDutyCycle(duty)
        time.sleep(STEP_DELAY_SECONDS)
        duty += direction * STEP_DUTY_CYCLE
    pwm.ChangeDutyCycle(end)


def main() -> None:
    parser = argparse.ArgumentParser(description="Drive a single vending servo")
    parser.add_argument("--pin", type=int, required=True, help="BCM GPIO pin number")
    args = parser.parse_args()

    GPIO.setmode(GPIO.BCM)
    GPIO.setup(args.pin, GPIO.OUT)
    pwm = GPIO.PWM(args.pin, PWM_FREQUENCY_HZ)

    try:
        pwm.start(HOME_DUTY_CYCLE)
        time.sleep(0.3)
        sweep_servo(pwm, HOME_DUTY_CYCLE, TARGET_DUTY_CYCLE)
        time.sleep(SETTLE_SECONDS)
        sweep_servo(pwm, TARGET_DUTY_CYCLE, HOME_DUTY_CYCLE)
        time.sleep(0.2)
    finally:
        pwm.stop()
        GPIO.cleanup(args.pin)


if __name__ == "__main__":
    main()
