import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const me = useMemo(() => ({ id: session?.user.id ?? "", email: session?.user.email ?? "" }), [session]);

  const [username, setUsername] = useState("");
  const [balance, setBalance] = useState(0);
  const [gamesWon, setGamesWon] = useState(0);
  const [gamesLost, setGamesLost] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [amount, setAmount] = useState<number>(10);

  // SEO basics
  useEffect(() => {
    document.title = "Player Dashboard | Checkers";
    const description = "Manage username, deposit or withdraw dummy funds, and view your stats.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/auth", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadProfile = async () => {
    if (!me.id) return;
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("username, balance, games_won, games_lost, earnings")
      .eq("id", me.id)
      .maybeSingle();
    if (error || !data) {
      try {
        await (supabase as any).from("profiles").insert({ id: me.id, username: me.email.split("@")[0] });
      } catch (_) {}
      const { data: d2 } = await (supabase as any)
        .from("profiles")
        .select("username, balance, games_won, games_lost, earnings")
        .eq("id", me.id)
        .maybeSingle();
      if (d2) applyProfile(d2);
    } else {
      applyProfile(data);
    }
  };

  const applyProfile = (p: any) => {
    setUsername(p.username ?? "");
    setBalance(Number(p.balance ?? 0));
    setGamesWon(Number(p.games_won ?? 0));
    setGamesLost(Number(p.games_lost ?? 0));
    setEarnings(Number(p.earnings ?? 0));
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const saveUsername = async () => {
    if (!username.trim()) return;
    const { error } = await (supabase as any).from("profiles").update({ username }).eq("id", me.id);
    if (error) toast.error("Failed to update username");
    else {
      toast.success("Username updated");
      loadProfile();
    }
  };

  const deposit = async () => {
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    const { error } = await (supabase as any).rpc("credit_balance", { amount });
    if (error) return toast.error("Deposit failed");
    toast.success("Deposited");
    loadProfile();
  };

  const withdraw = async () => {
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    const { data, error } = await (supabase as any).rpc("debit_balance", { amount });
    if (error || data !== true) return toast.error("Insufficient balance");
    toast.success("Withdrawn");
    loadProfile();
  };

  if (!session) return null;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <section className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Player Dashboard</h1>
            <p className="text-muted-foreground">Signed in as {me.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/')}>Back to Lobby</Button>
          </div>
        </header>

        <section className="grid md:grid-cols-2 gap-6">
          <article className="rounded-lg border border-border p-4 bg-card/50 space-y-3">
            <h2 className="font-semibold">Profile</h2>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Username</label>
              <div className="flex items-center gap-2">
                <Input value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
                <Button onClick={saveUsername}>Save</Button>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-border p-4 bg-card/50 space-y-3">
            <h2 className="font-semibold">Wallet (Dummy)</h2>
            <p className="text-sm text-muted-foreground">Balance: {balance.toFixed(2)}</p>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} step="0.01" className="w-32" value={amount} onChange={(e) => setAmount(Number(e.currentTarget.value))} />
              <Button onClick={deposit}>Deposit</Button>
              <Button variant="outline" onClick={withdraw}>Withdraw</Button>
            </div>
            <p className="text-xs text-muted-foreground">Note: No real payments. This is placeholder logic.</p>
          </article>

          <article className="md:col-span-2 rounded-lg border border-border p-4 bg-card/50 space-y-3">
            <h2 className="font-semibold">Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Games Won</p>
                <p className="text-xl font-semibold">{gamesWon}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Games Lost</p>
                <p className="text-xl font-semibold">{gamesLost}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Earnings</p>
                <p className="text-xl font-semibold">{earnings.toFixed(2)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Current Balance</p>
                <p className="text-xl font-semibold">{balance.toFixed(2)}</p>
              </div>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
