import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";

// Static fallback images — only used when the DB has no "ours" channel thumbnails
import s1 from "@/assets/stories/s1.jpg";
import s2 from "@/assets/stories/s2.jpg";
import s3 from "@/assets/stories/s3.jpg";
import s4 from "@/assets/stories/s4.jpg";
import s5 from "@/assets/stories/s5.jpg";
import s6 from "@/assets/stories/s6.jpg";

const FALLBACKS = [s1, s2, s3, s4, s5, s6];

const errorMessages: Record<string, string> = {
  no_code:      "Login was cancelled or no code received.",
  oauth_failed: "Google sign-in failed. Please try again.",
  access_denied:"Your account is not allowed. Contact the project owner.",
  disabled:     "Your account has been disabled.",
};

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick N items round-robin from array (fills columns) */
function fill(arr: string[], n: number): string[] {
  if (!arr.length) return [];
  return Array.from({ length: n }, (_, i) => arr[i % arr.length]);
}

export default function Login() {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [col1, setCol1]         = useState<string[]>([]);
  const [col2, setCol2]         = useState<string[]>([]);
  const navigate                = useNavigate();
  const [searchParams]          = useSearchParams();

  // ── Handle OAuth error params ───────────────────────────────────────────
  useEffect(() => {
    const err  = searchParams.get("error");
    const hint = searchParams.get("hint");
    if (err) setError(hint ? decodeURIComponent(hint) : errorMessages[err] || "Something went wrong.");
  }, [searchParams]);

  // ── Redirect if already logged in ──────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => { if (r.ok) navigate("/", { replace: true }); })
      .catch(() => {});
  }, [navigate]);

  // ── Fetch real thumbnails from "ours" channels; fall back to static images ──
  useEffect(() => {
    fetch("/api/public/thumbnails")
      .then((r) => r.ok ? r.json() : { urls: [] })
      .then(({ urls }: { urls: string[] }) => {
        // Use real thumbnails if the DB has at least 6; otherwise use fallbacks
        const pool = urls.length >= 6 ? shuffle(urls) : shuffle(FALLBACKS as unknown as string[]);
        setCol1(fill(pool, 8));
        setCol2(fill(shuffle(pool), 8)); // shuffle again for column variety
      })
      .catch(() => {
        const pool = shuffle(FALLBACKS as unknown as string[]);
        setCol1(fill(pool, 8));
        setCol2(fill(shuffle(pool), 8));
      });
  }, []); // runs once per page load — new random order every visit

  // ── Google sign-in ──────────────────────────────────────────────────────
  const handleLogin = () => {
    setLoading(true);
    setError(null);
    fetch("/api/auth/google/url", { credentials: "include" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = data?.error || data?.message || r.statusText || "Server error";
          throw new Error(typeof msg === "string" ? msg : "Could not get login URL");
        }
        return data;
      })
      .then((data) => {
        const url = data?.url;
        if (url && typeof url === "string") { window.location.href = url; return; }
        throw new Error("No login URL returned. Check Railway Variables: GOOGLE_CLIENT_ID, APP_URL.");
      })
      .catch((err) => {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Could not start sign-in. Check your connection.");
      });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#070707]">
      {/* Left — Scrolling thumbnails from our channels (1/3) */}
      <div className="hidden lg:block w-1/3 relative overflow-hidden">
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-[#070707]/20 z-10 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[#070707] to-transparent z-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#070707] to-transparent z-20 pointer-events-none" />
        <div className="absolute top-0 right-0 bottom-0 w-16 bg-gradient-to-l from-[#070707] to-transparent z-20 pointer-events-none" />

        <div className="flex gap-3 p-3 h-full">
          {[col1, col2].map((col, colIdx) => (
            <div key={colIdx} className="flex-1 overflow-hidden">
              {col.length > 0 && (
                <div
                  className={colIdx % 2 === 0 ? "animate-scroll-up" : "animate-scroll-down"}
                  style={{ animationDuration: `${30 + colIdx * 10}s` }}
                >
                  {/* Duplicate tiles for seamless loop */}
                  {[col, col].map((tiles, pass) => (
                    <div key={pass} className="flex flex-col gap-3">
                      {tiles.map((src, i) => (
                        <div key={`${pass}-${i}`} className="rounded-xl overflow-hidden shrink-0 h-64 w-full">
                          <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right — Login form (2/3) */}
      <div className="flex-1 flex items-center justify-center relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(var(--primary) / 0.06) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 w-full max-w-[360px] mx-6">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="Falak" className="h-8 mb-5" />
            <h1 className="text-xl font-semibold tracking-tight mb-2 text-center">
              Sign in to Falak
            </h1>
            <p className="text-sm text-dim text-center leading-relaxed">
              YouTube channel intelligence
              <br />
              for Arabic content creators
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6">
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-[12px]">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-elevated border border-border rounded-xl text-foreground text-[13px] font-medium transition-all hover:bg-border hover:border-sensor/20 ${
                loading ? "opacity-60 cursor-not-allowed pointer-events-none" : "cursor-pointer"
              }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Continue with Google
            </button>

            <div className="h-px bg-border my-5" />

            <div className="bg-primary/[0.06] border border-primary/10 rounded-xl p-3 flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>
              <p className="text-[12px] text-dim leading-relaxed">
                Access is restricted to{" "}
                <span className="text-sensor font-medium">approved accounts</span> only.
              </p>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-dim text-center font-mono">falak · v2.0</p>
        </div>
      </div>
    </div>
  );
}
