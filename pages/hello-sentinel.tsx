export default function Page() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
        fontFamily:
          "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "2rem",
      }}
    >
      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        {/* Subtle glow ring */}
        <div
          aria-hidden="true"
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)",
            border: "1.5px solid rgba(167,139,250,0.25)",
            marginBottom: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z"
              stroke="rgba(167,139,250,0.85)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "clamp(1rem, 3.5vw, 1.35rem)",
            fontWeight: 400,
            letterSpacing: "0.01em",
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.85)",
            maxWidth: "32ch",
            textWrap: "balance",
          }}
        >
          Hello from{" "}
          <span
            style={{
              color: "#c4b5fd",
              fontWeight: 600,
              letterSpacing: "0.03em",
            }}
          >
            Sentinel
          </span>{" "}
          —{" "}
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9em" }}>
            first run, 2026-06-25
          </span>
        </p>

        {/* Thin rule accent */}
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(167,139,250,0.5), transparent)",
            marginTop: "0.25rem",
          }}
        />
      </div>
    </main>
  );
}
