#!/usr/bin/env python3
import logging
import os
import subprocess
import time
from datetime import datetime, timezone

from supabase import Client, create_client

POLL_INTERVAL_SECONDS = 1
DEFAULT_DEVICE_ID = "vend-a-shoe-001"
SERVO_SCRIPT_PATH = "/home/brainchildengineering/Vend-A-Shoe/servo_motor.py"
BIN_TO_GPIO = {
    1: 17,
    2: 27,
    3: 24,
    4: 23,
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def fetch_oldest_pending(supabase: Client, device_id: str):
    response = (
        supabase.table("device_commands")
        .select("id,device_id,action,status,created_at")
        .eq("device_id", device_id)
        .eq("status", "pending")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return response.data[0]


def claim_command(supabase: Client, command_id: str) -> bool:
    response = (
        supabase.table("device_commands")
        .update({"status": "running", "error": None, "completed_at": None})
        .eq("id", command_id)
        .eq("status", "pending")
        .execute()
    )
    return bool(response.data)


def mark_completed(supabase: Client, command_id: str) -> None:
    (
        supabase.table("device_commands")
        .update(
            {
                "status": "completed",
                "completed_at": utc_now_iso(),
                "error": None,
            }
        )
        .eq("id", command_id)
        .execute()
    )


def mark_failed(supabase: Client, command_id: str, error_message: str) -> None:
    (
        supabase.table("device_commands")
        .update(
            {
                "status": "failed",
                "completed_at": utc_now_iso(),
                "error": error_message[:2000],
            }
        )
        .eq("id", command_id)
        .execute()
    )


def parse_bin_from_action(action: str) -> int:
    if action == "dispense":
        return 1
    if action.startswith("dispense_bin_"):
        bin_value = action.removeprefix("dispense_bin_")
        if bin_value.isdigit():
            parsed_bin = int(bin_value)
            if parsed_bin in BIN_TO_GPIO:
                return parsed_bin
    raise ValueError(
        f"Unsupported action '{action}'. Expected 'dispense' or 'dispense_bin_1-4'."
    )


def run_motor_for_bin(bin_number: int) -> None:
    gpio_pin = BIN_TO_GPIO[bin_number]
    subprocess.run(
        [
            "python3",
            SERVO_SCRIPT_PATH,
            "--pin",
            str(gpio_pin),
        ],
        check=True,
    )


def process_one(supabase: Client, device_id: str) -> None:
    command = fetch_oldest_pending(supabase, device_id)
    if not command:
        return

    command_id = command["id"]
    if not claim_command(supabase, command_id):
        return

    try:
        bin_number = parse_bin_from_action(command["action"])
        run_motor_for_bin(bin_number)
        mark_completed(supabase, command_id)
        logging.info("Completed command %s for bin %s", command_id, bin_number)
    except Exception as exc:
        mark_failed(supabase, command_id, str(exc))
        logging.exception("Failed command %s", command_id)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    supabase_url = require_env("SUPABASE_URL")
    supabase_key = require_env("SUPABASE_KEY")
    device_id = os.getenv("DEVICE_ID", DEFAULT_DEVICE_ID)

    supabase: Client = create_client(supabase_url, supabase_key)
    logging.info("Worker started for device_id=%s", device_id)

    while True:
        try:
            process_one(supabase, device_id)
        except Exception:
            logging.exception("Worker loop error")
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
