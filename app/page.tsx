"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

  const statusTone =
    uiState === "error" ? "#f87171" : uiState === "success" ? "#34d399" : "#94a3b8";

  return (
    <TooltipProvider>
      <main
        className="app-shell"
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at 20% 0%, #1e293b 0%, #0f172a 40%, #020617 100%)",
          color: "#e2e8f0",
          padding: "max(20px, env(safe-area-inset-top)) 16px max(40px, env(safe-area-inset-bottom))",
        }}
      >
        <section
          className="content-wrap"
          style={{
            maxWidth: 980,
            margin: "0 auto",
          }}
        >
          <header
            className="top-nav"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: 14,
              padding: "10px 14px",
              background: "rgba(15, 23, 42, 0.7)",
              backdropFilter: "blur(10px)",
              marginBottom: 28,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background:
                    "linear-gradient(140deg, rgba(148,163,184,0.95), rgba(51,65,85,0.9))",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Vend-A-Shoe
              </p>
            </div>
            <Badge
              variant="outline"
              style={{
                borderColor: "rgba(52, 211, 153, 0.45)",
                color: "#86efac",
                background: "rgba(6, 78, 59, 0.35)",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#34d399",
                  display: "inline-block",
                  marginRight: 6,
                  boxShadow: "0 0 10px rgba(52, 211, 153, 0.8)",
                }}
              />
              Online
            </Badge>
          </header>

          <div className="hero" style={{ marginBottom: 26 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(32px, 6vw, 52px)",
                lineHeight: 1.05,
                letterSpacing: -1.4,
                fontWeight: 700,
                color: "#f8fafc",
              }}
            >
              Select a Bin
            </h1>
            <p
              style={{
                margin: "10px 0 0",
                color: "#94a3b8",
                fontSize: "clamp(15px, 2.4vw, 18px)",
              }}
            >
              Choose a product to dispense
            </p>
          </div>

          <div
            className="bin-grid"
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            {BINS.map(({ bin, gpio }) => {
              const isActive = uiState === "loading" && activeBin === bin;
              const statusText = isActive ? "Dispensing" : "Available";

              return (
                <Card
                  className="bin-card"
                  key={bin}
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background:
                      isActive
                        ? "linear-gradient(170deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.92))"
                        : "linear-gradient(170deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.92))",
                    boxShadow: isActive
                      ? "0 10px 30px rgba(37,99,235,0.28)"
                      : "0 8px 24px rgba(2, 6, 23, 0.55)",
                    transform: isActive ? "translateY(-1px)" : "translateY(0)",
                    transition: "all 220ms ease",
                  }}
                >
                  <CardHeader className="bin-card-header" style={{ display: "flex", gap: 8 }}>
                    <CardTitle
                      style={{
                        fontSize: 24,
                        fontWeight: 650,
                        letterSpacing: -0.5,
                        color: "#f8fafc",
                      }}
                    >
                      Bin {bin}
                    </CardTitle>
                    <CardDescription style={{ color: "#94a3b8", marginTop: -4 }}>
                      Product slot {bin}
                    </CardDescription>
                  </CardHeader>

                  <CardContent
                    className="bin-card-meta"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <Badge
                      style={{
                        background: isActive
                          ? "rgba(96, 165, 250, 0.18)"
                          : "rgba(100, 116, 139, 0.2)",
                        border: "1px solid rgba(148, 163, 184, 0.26)",
                        color: isActive ? "#bfdbfe" : "#cbd5e1",
                        fontWeight: 600,
                      }}
                    >
                      <span
                        className={isActive ? "pulse-dot" : undefined}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: isActive ? "#60a5fa" : "#94a3b8",
                          display: "inline-block",
                          marginRight: 6,
                        }}
                      />
                      {statusText}
                    </Badge>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: "rgba(148, 163, 184, 0.35)",
                            color: "#94a3b8",
                            background: "transparent",
                            cursor: "default",
                          }}
                        >
                          GPIO {gpio}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>
                        Physical control pin: GPIO {gpio}
                      </TooltipContent>
                    </Tooltip>
                  </CardContent>

                  <CardFooter
                    className="bin-card-footer"
                    style={{ paddingTop: 14, background: "transparent", border: 0 }}
                  >
                    <Button
                      className="bin-action-button"
                      type="button"
                      onClick={() => handleDispense(bin)}
                      disabled={uiState === "loading"}
                      style={{
                        width: "100%",
                        minHeight: 46,
                        borderRadius: 12,
                        fontSize: 15,
                        fontWeight: 640,
                        letterSpacing: 0.2,
                        background: isActive
                          ? "linear-gradient(140deg, #2563eb, #1d4ed8)"
                          : "linear-gradient(140deg, #0f172a, #1e293b)",
                        color: "#f8fafc",
                        border: "1px solid rgba(148, 163, 184, 0.22)",
                        boxShadow: isActive
                          ? "0 8px 22px rgba(37, 99, 235, 0.45)"
                          : "0 6px 16px rgba(2, 6, 23, 0.5)",
                        transition: "all 220ms ease",
                      }}
                    >
                      {isActive ? "Dispensing..." : "Dispense Product"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          <div
            className="status-line"
            style={{
              marginTop: 16,
              minHeight: 24,
              fontSize: 14,
              color: statusTone,
              transition: "color 200ms ease",
            }}
          >
            {message}
          </div>
        </section>
      </main>

      <style jsx>{`
        .content-wrap {
          width: 100%;
        }
        .hero {
          max-width: 620px;
        }
        .status-line {
          max-width: 620px;
          line-height: 1.4;
          word-break: break-word;
        }
        .bin-card {
          min-height: 208px;
        }
        .bin-action-button {
          min-height: 50px !important;
          font-size: 16px !important;
        }
        @media (max-width: 860px) {
          .bin-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .bin-card {
            min-height: 196px;
          }
        }
        @media (max-width: 640px) {
          .app-shell {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .top-nav {
            margin-bottom: 20px !important;
            padding: 10px 12px !important;
          }
          .hero {
            margin-bottom: 18px !important;
          }
          .bin-card-header {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
          .bin-card-meta {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
          .bin-card-footer {
            padding-left: 14px !important;
            padding-right: 14px !important;
            padding-bottom: 14px !important;
          }
          .bin-action-button {
            min-height: 54px !important;
            font-size: 16px !important;
          }
          .status-line {
            font-size: 13px !important;
          }
        }
        .pulse-dot {
          animation: pulse 1.1s ease-in-out infinite;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.85);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(0.85);
            opacity: 0.7;
          }
        }
      `}</style>
    </TooltipProvider>
  );
}
