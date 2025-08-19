import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Home, LayoutDashboard, Shield, LogOut, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type AppLayoutProps = {
  title?: string;
  children: React.ReactNode;
};

export default function AppLayout({ title, children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [inviteCount, setInviteCount] = useState<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const me = useMemo(() => ({ id: session?.user.id ?? "", email: session?.user.email ?? "" }), [session]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!me.id) return;
    (supabase as any).rpc('has_role', { _user_id: me.id, _role: 'admin' })
      .then(({ data }: any) => setIsAdmin(!!data))
      .catch(() => setIsAdmin(false));
  }, [me.id]);

  // Lightweight lobby subscription to collect invite count globally
  useEffect(() => {
    if (!me.id) return;
    const channel = supabase.channel("lobby", { config: { presence: { key: me.id } } });
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "invite" }, ({ payload }) => {
        const { to } = payload as { to: string };
        if (to === me.id) {
          setInviteCount((c) => Math.min(99, c + 1));
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: me.email || "user@viewer" });
        }
      });
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [me.id, me.email]);

  const isActive = (path: string) => location.pathname === path;

  if (!session) return null;

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div className="px-2 py-1 text-lg font-semibold">Checkers Arena</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/") || isActive("/lobby")}>
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate("/lobby"); }}>
                      <Home />
                      <span>Lobby</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/dashboard")}>
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }}>
                      <LayoutDashboard />
                      <span>Dashboard</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/admin")}>
                      <a href="#" onClick={(e) => { e.preventDefault(); navigate("/admin"); }}>
                        <Shield />
                        <span>Admin</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild onClick={async () => { await supabase.auth.signOut(); navigate("/auth", { replace: true }); }}>
                <button type="button">
                  <LogOut />
                  <span>Logout</span>
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <div className="font-semibold">{title || ""}</div>
          <div className="ml-auto flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate("/lobby")}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                >
                  <User2 className="h-5 w-5" />
                  {inviteCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white text-center">
                      {inviteCount > 9 ? '9+' : inviteCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Pending invites</TooltipContent>
            </Tooltip>
            <Button size="sm" variant="outline" onClick={() => navigate('/dashboard')}>Dashboard</Button>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => navigate('/admin')}>Admin</Button>
            )}
          </div>
        </div>
        <div className="min-h-[calc(100svh-56px)]">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}


