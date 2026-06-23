"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type UiState = "idle" | "loading" | "success" | "error";
type BinNumber = 1 | 2 | 3 | 4;

const BINS: Array<{ bin: BinNumber; gpio: number }> = [
  { bin: 1, gpio: 17 },
  { bin: 2, gpio: 27 },
  { bin: 3, gpio: 24 },
  { bin: 4, gpio: 23 },
];

export default function Page() {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [message, setMessage] = useState("");
  const [activeBin, setActiveBin] = useState<BinNumber | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createClient(supabaseUrl, supabaseAnonKey);
  }, [supabaseUrl, supabaseAnonKey]);

  const handleDispense = async (bin: BinNumber) => {
    if (!supabase) {
      setUiState("error");
      setMessage(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
      return;
    }

    setUiState("loading");
    setActiveBin(bin);
    setMessage("");

    const { data, error } = await supabase
      .from("device_commands")
      .insert({
        device_id: "vend-a-shoe-001",
        action: `dispense_bin_${bin}`,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      setUiState("error");
      setMessage(error.message);
      setActiveBin(null);
      return;
    }

    setUiState("success");
    setMessage(`Bin ${bin} command queued: ${data.id}`);
    setActiveBin(null);
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

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          {BINS.map(({ bin, gpio }) => (
            <button
              key={bin}
              type="button"
              onClick={() => handleDispense(bin)}
              disabled={uiState === "loading"}
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: 16,
                borderRadius: 12,
                border: "none",
                background: "#111827",
                color: "#ffffff",
                opacity: uiState === "loading" ? 0.7 : 1,
                cursor: uiState === "loading" ? "not-allowed" : "pointer",
              }}
            >
              {uiState === "loading" && activeBin === bin
                ? `Dispensing Bin ${bin}...`
                : `Bin ${bin} (GPIO ${gpio})`}
            </button>
          ))}
        </div>

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
