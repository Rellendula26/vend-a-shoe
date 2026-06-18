"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type UiState = "idle" | "loading" | "success" | "error";

export default function Page() {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [message, setMessage] = useState("");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createClient(supabaseUrl, supabaseAnonKey);
  }, [supabaseUrl, supabaseAnonKey]);

  const handleDispense = async () => {
    if (!supabase) {
      setUiState("error");
      setMessage(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
      return;
    }

    setUiState("loading");
    setMessage("");

    const { data, error } = await supabase
      .from("device_commands")
      .insert({
        device_id: "vend-a-shoe-001",
        action: "dispense",
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      setUiState("error");
      setMessage(error.message);
      return;
    }

    setUiState("success");
    setMessage(`Command queued: ${data.id}`);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <section style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 32, marginBottom: 24 }}>Vend-A-Shoe Controller</h1>

        <button
          type="button"
          onClick={handleDispense}
          disabled={uiState === "loading"}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 18,
            borderRadius: 12,
            border: "none",
            background: "#111827",
            color: "#ffffff",
            opacity: uiState === "loading" ? 0.7 : 1,
            cursor: uiState === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {uiState === "loading" ? "Dispensing..." : "Dispense Shoe"}
        </button>

        {uiState === "success" && (
          <p style={{ color: "green", marginTop: 16 }}>{message}</p>
        )}
        {uiState === "error" && (
          <p style={{ color: "crimson", marginTop: 16 }}>{message}</p>
        )}
      </section>
    </main>
  );
}
