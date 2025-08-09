import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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

const Lobby = ({ session, onLogout }: LobbyProps) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const me = useMemo(() => {
    return {
      id: session?.user.id ?? "",
      email: session?.user.email ?? "unknown@user",
    };
  }, [session]);

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
        const { to, from, fromEmail, gameId } = payload as { to: string; from: string; fromEmail: string; gameId: string };
        if (to === me.id) {
          const accept = window.confirm(`${fromEmail} invited you to play. Accept?`);
          if (accept) {
            channel.send({
              type: "broadcast",
              event: "accept",
              payload: { gameId, from, to: me.id },
            });
            navigate(`/game/${gameId}`);
          }
        }
      })
      .on("broadcast", { event: "accept" }, ({ payload }) => {
        const { gameId, to, from } = payload as { gameId: string; to: string; from: string };
        if (from === me.id || to === me.id) {
          navigate(`/game/${gameId}`);
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

  const sendInvite = async (target: PresenceUser) => {
    if (!channelRef.current) return;
    const gameId = crypto.randomUUID();
    const ok = await channelRef.current.send({
      type: "broadcast",
      event: "invite",
      payload: { to: target.id, from: me.id, fromEmail: me.email, gameId },
    });
    if (ok) {
      toast.success(`Invite sent to ${target.email}`);
    } else {
      toast.error("Failed to send invite");
    }
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
        <Button variant="secondary" onClick={onLogout}>Logout</Button>
      </header>

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
