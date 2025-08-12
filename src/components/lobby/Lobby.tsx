import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";

interface LobbyProps {
  session: Session | null;
  onLogout: () => void;
}

interface PresenceUser {
  id: string;
  email: string;
  online_at: string;
}

interface Invite {
  from: string;
  fromEmail: string;
  to: string;
  gameId: string;
  stake: number;
  at: string;
}

interface TopPlayer {
  user_id: string;
  username: string;
  games_won: number;
  games_lost: number;
  earnings: number;
}

const Lobby = ({ session, onLogout }: LobbyProps) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [stake, setStake] = useState<number>(10);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [sentInvites, setSentInvites] = useState<Invite[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [leaders, setLeaders] = useState<TopPlayer[]>([]);
  const [leadersLoading, setLeadersLoading] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const me = useMemo(() => {
    return {
      id: session?.user.id ?? "",
      email: session?.user.email ?? "unknown@user",
    };
  }, [session]);

  useEffect(() => {
    if (!me.id) return;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("profiles")
          .select("balance, username")
          .eq("id", me.id)
          .maybeSingle();

        if (error || !data) {
          try {
            await (supabase as any).from("profiles").insert({ id: me.id, username: me.email.split("@")[0] });
          } catch (_) {}
          const { data: d2 } = await (supabase as any)
            .from("profiles")
            .select("balance, username")
            .eq("id", me.id)
            .maybeSingle();
          setBalance(Number((d2?.balance ?? 0) as number));
        } else {
          setBalance(Number((data?.balance ?? 0) as number));
        }
      } catch (_) {
        // ignore
      }
    })();
  }, [me.id]);

  useEffect(() => {
    if (!me.id) return;
    let active = true;
    setLeadersLoading(true);
    (supabase as any)
      .rpc("get_top_players", { limit_count: 10 })
      .then(({ data, error }: any) => {
        if (!active) return;
        if (!error) setLeaders(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (active) setLeadersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [me.id]);

  useEffect(() => {
    if (!me.id) return;
    (supabase as any).rpc('has_role', { _user_id: me.id, _role: 'admin' }).then(({ data }: any) => {
      setIsAdmin(!!data);
    }).catch(() => setIsAdmin(false));
  }, [me.id]);

  useEffect(() => {
    if (!me.id) return;

    const channel = supabase.channel("lobby", {
      config: { presence: { key: me.id } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ email: string; online_at: string }>>;
        const list: PresenceUser[] = Object.entries(state).map(([id, arr]) => ({
          id,
          email: arr[0]?.email ?? id,
          online_at: arr[0]?.online_at ?? new Date().toISOString(),
        }));
        // Exclude self
        setUsers(list.filter((u) => u.id !== me.id));
      })
      .on("broadcast", { event: "invite" }, ({ payload }) => {
        const { to, from, fromEmail, gameId, stake } = payload as { to: string; from: string; fromEmail: string; gameId: string; stake: number };
        if (to === me.id) {
          setReceivedInvites((prev) => [
            { from, fromEmail, to, gameId, stake, at: new Date().toISOString() },
            ...prev,
          ]);
        }
      })
      .on("broadcast", { event: "accept" }, ({ payload }) => {
        const { gameId, to, from, stake } = payload as { gameId: string; to: string; from: string; stake: number };
        if (from === me.id || to === me.id) {
          const key = `game_debited_${gameId}_${me.id}`;
          if (!localStorage.getItem(key)) {
            (supabase as any).rpc("debit_balance", { amount: stake }).then(({ data, error }) => {
              if (error || data !== true) {
                toast.error("Balance debit failed. Please check your balance.");
              } else {
                setBalance((b) => Math.max(0, Number((b - stake).toFixed(2))));
              }
            });
            localStorage.setItem(key, "1");
          }
          navigate(`/game/${gameId}?stake=${encodeURIComponent(stake)}`);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: me.email, online_at: new Date().toISOString() });
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [me, navigate]);

  useEffect(() => {
    const onFocus = () => {
      // Refresh leaderboard
      setLeadersLoading(true);
      (supabase as any).rpc('get_top_players', { limit_count: 10 }).then(({ data }: any) => {
        setLeaders(Array.isArray(data) ? data : []);
      }).finally(() => setLeadersLoading(false));
      // Nudge presence tracking
      if (channelRef.current) {
        channelRef.current.track({ email: me.email, online_at: new Date().toISOString() });
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [me.email]);

  const sendInvite = async (target: PresenceUser) => {
    if (!channelRef.current) return;
    if (target.id === me.id) {
      toast.error("You cannot invite yourself");
      return;
    }
    if (!stake || stake <= 0) {
      toast.error("Enter a valid stake amount");
      return;
    }
    if (balance < stake) {
      toast.error("Insufficient balance for this stake");
      return;
    }

    const gameId = crypto.randomUUID();
    const ok = await channelRef.current.send({
      type: "broadcast",
      event: "invite",
      payload: { to: target.id, from: me.id, fromEmail: me.email, gameId, stake },
    });
    if (ok) {
      setSentInvites((prev) => [
        { from: me.id, fromEmail: me.email, to: target.id, gameId, stake, at: new Date().toISOString() },
        ...prev,
      ]);
      toast.success(`Invite sent to ${target.email}`);
    } else {
      toast.error("Failed to send invite");
    }
  };

  const isOnline = (id: string) => users.some((u) => u.id === id);
  const inviteById = (id: string) => {
    const target = users.find((u) => u.id === id);
    if (target) return sendInvite(target);
    toast.info("This player is currently offline");
  };

  const acceptInvite = async (inv: Invite) => {
    if (!channelRef.current) return;
    if (balance < inv.stake) {
      toast.error("Your balance is too low to accept this match");
      return;
    }

    // Notify inviter
    const ok = await channelRef.current.send({
      type: "broadcast",
      event: "accept",
      payload: { gameId: inv.gameId, from: inv.from, to: me.id, stake: inv.stake },
    });

    if (ok) {
      setReceivedInvites((prev) => prev.filter((i) => i.gameId !== inv.gameId));

      // Important: the sender of a broadcast does NOT receive their own event.
      // So we must debit and navigate locally for the acceptor as well.
      const key = `game_debited_${inv.gameId}_${me.id}`;
      if (!localStorage.getItem(key)) {
        try {
          const { data, error } = await (supabase as any).rpc("debit_balance", { amount: inv.stake });
          if (error || data !== true) {
            toast.error("Balance debit failed. Please check your balance.");
            return;
          }
          setBalance((b) => Math.max(0, Number((b - inv.stake).toFixed(2))));
          localStorage.setItem(key, "1");
        } catch (_) {
          toast.error("Balance debit failed. Try again.");
          return;
        }
      }
      // Navigate acceptor into the game immediately
      navigate(`/game/${inv.gameId}?stake=${encodeURIComponent(inv.stake)}`);
    } else {
      toast.error("Failed to accept invite");
    }
  };

  const ignoreInvite = (inv: Invite) => {
    setReceivedInvites((prev) => prev.filter((i) => i.gameId !== inv.gameId));
  };

  if (!session) {
    return null;
  }

  return (
    <section className="max-w-2xl w-full mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lobby</h1>
          <p className="text-muted-foreground">Signed in as {me.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>Dashboard</Button>
          {isAdmin && <Button variant="outline" onClick={() => navigate('/admin')}>Admin</Button>}
          <Button variant="secondary" onClick={onLogout}>Logout</Button>
        </div>
      </header>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Match settings</h2>
        <div className="rounded-md border border-border p-3 bg-card/50 flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Stake</label>
          <Input type="number" min={1} step="0.01" value={stake} onChange={(e) => setStake(Number(e.currentTarget.value))} className="w-32" />
          <span className="text-sm text-muted-foreground ml-auto">Balance: {balance.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Invites</h2>
        {receivedInvites.length === 0 && sentInvites.length === 0 ? (
          <p className="text-muted-foreground">No invites at the moment.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-md border border-border overflow-hidden">
              <div className="px-3 py-2 bg-card/50 font-medium">Received</div>
              <ul className="divide-y divide-border">
                {receivedInvites.map((inv) => (
                  <li key={inv.gameId} className="p-3 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm">From {inv.fromEmail}</p>
                      <p className="text-xs text-muted-foreground">Stake: {inv.stake}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => acceptInvite(inv)}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => ignoreInvite(inv)}>Ignore</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="px-3 py-2 bg-card/50 font-medium">Sent</div>
              <ul className="divide-y divide-border">
                {sentInvites.map((inv) => (
                  <li key={inv.gameId} className="p-3 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm">To {inv.to}</p>
                      <p className="text-xs text-muted-foreground">Stake: {inv.stake}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">Pending</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="px-3 py-2 bg-card/50 font-medium flex items-center justify-between">
            <span>Top players</span>
            {leadersLoading && <span className="text-xs text-muted-foreground">Refreshing…</span>}
          </div>
          {leaders.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">No data yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {leaders.map((p, idx) => {
                const online = isOnline(p.user_id);
                return (
                  <li key={p.user_id} className="p-3 flex items-center justify-between bg-card/50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5">#{idx + 1}</span>
                      <div>
                        <p className="font-medium">{p.username || 'Player'}</p>
                        <p className="text-xs text-muted-foreground">Wins: {p.games_won} · Earnings: {Number(p.earnings).toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${online ? 'text-foreground' : 'text-muted-foreground'}`}>{online ? 'Online' : 'Offline'}</span>
                      <Button size="sm" onClick={() => inviteById(p.user_id)} disabled={!online}>Invite</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Online players</h2>
        {users.length === 0 ? (
          <p className="text-muted-foreground">No other players online yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between p-3 bg-card/50">
                <div className="space-y-0.5">
                  <p className="font-medium">{u.email}</p>
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
                <Button onClick={() => sendInvite(u)}>Invite</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default Lobby;
