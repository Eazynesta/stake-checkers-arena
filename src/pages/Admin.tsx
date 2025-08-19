import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface TopPlayer {
  user_id: string;
  username: string;
  games_won: number;
  games_lost: number;
  earnings: number;
}

interface SummaryRow { period: string; total: number }

export default function Admin() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [summary, setSummary] = useState<Record<string, number>>({ day: 0, week: 0, month: 0 });
  const [leaders, setLeaders] = useState<TopPlayer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const me = useMemo(() => ({ id: session?.user.id ?? "", email: session?.user.email ?? "" }), [session]);

  useEffect(() => {
    document.title = "Admin Dashboard | Checkers Platform";
    const description = "Live users, revenue summary, and top players";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", description);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", window.location.href);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  // Presence from lobby for live users count
  useEffect(() => {
    const channel = supabase.channel("lobby-admin", { config: { presence: { key: me.id || crypto.randomUUID() } } });
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ email: string }>>;
        setOnlineCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: me.email || "admin@viewer" });
        }
      });
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [me.id, me.email]);

  // Fetch summaries + leaderboard
  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: s }, { data: l }, { data: u }, { data: ua }] = await Promise.all([
        (supabase as any).rpc("get_earnings_summary"),
        (supabase as any).rpc("get_top_players", { limit_count: 10 }),
        (supabase as any).rpc("get_total_users"),
        (supabase as any).rpc("get_total_auth_users"),
      ]);
      if (!active) return;
      if (Array.isArray(s)) {
        const map: Record<string, number> = { day: 0, week: 0, month: 0 };
        (s as SummaryRow[]).forEach((row) => { map[row.period] = Number(row.total || 0); });
        setSummary(map);
      }
      setLeaders(Array.isArray(l) ? (l as TopPlayer[]) : []);
      // Prefer profiles count; fallback to auth.users count
      const candidates = [u, ua].filter((x) => x !== null && x !== undefined);
      for (const c of candidates) {
        const value = typeof c === "number" ? c : Number(c);
        if (!Number.isNaN(value) && value > 0) { setTotalUsers(value); break; }
      }
    })();
    const interval = setInterval(() => {
      (supabase as any).rpc("get_earnings_summary").then(({ data }: any) => {
        if (!active) return;
        if (Array.isArray(data)) {
          const map: Record<string, number> = { day: 0, week: 0, month: 0 };
          (data as SummaryRow[]).forEach((row) => { map[row.period] = Number(row.total || 0); });
          setSummary(map);
        }
      });
    }, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (!session) return null;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <section className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground">Monitor platform activity</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate("/")}>Back to Lobby</Button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <article className="rounded-lg border border-border bg-card/50 p-4">
            <h2 className="text-sm text-muted-foreground">Live users</h2>
            <p className="text-3xl font-semibold mt-1">{onlineCount}</p>
          </article>
          <article className="rounded-lg border border-border bg-card/50 p-4">
            <h2 className="text-sm text-muted-foreground">Registered users</h2>
            <p className="text-3xl font-semibold mt-1">{totalUsers}</p>
          </article>
          <article className="rounded-lg border border-border bg-card/50 p-4">
            <h2 className="text-sm text-muted-foreground">Earnings (day)</h2>
            <p className="text-3xl font-semibold mt-1">{summary.day.toFixed(2)}</p>
          </article>
          <article className="rounded-lg border border-border bg-card/50 p-4">
            <h2 className="text-sm text-muted-foreground">Earnings (week)</h2>
            <p className="text-3xl font-semibold mt-1">{summary.week.toFixed(2)}</p>
          </article>
          <article className="rounded-lg border border-border bg-card/50 p-4">
            <h2 className="text-sm text-muted-foreground">Earnings (month)</h2>
            <p className="text-3xl font-semibold mt-1">{summary.month.toFixed(2)}</p>
          </article>
        </section>

        <section className="rounded-lg border border-border bg-card/50 overflow-hidden">
          <div className="px-4 py-3 font-medium">Leaderboard</div>
          <ul className="divide-y divide-border">
            {leaders.map((p, idx) => (
              <li key={p.user_id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5">#{idx + 1}</span>
                  <div>
                    <p className="font-medium">{p.username || 'Player'}</p>
                    <p className="text-xs text-muted-foreground">Wins: {p.games_won} · Earnings: {Number(p.earnings).toFixed(2)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
