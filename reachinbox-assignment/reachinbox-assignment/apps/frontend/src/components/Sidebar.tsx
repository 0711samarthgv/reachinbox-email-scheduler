import {
  Clock3,
  Send,
  ChevronDown,
  LogOut,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';

import { Logo } from './Logo';
import { api } from '../lib/api';
import { useEffect, useState } from 'react';

type SidebarProps = {
  user: any;
  section: string;
  counts: {
    scheduled: number;
    sent: number;
  };
  onSection: (section: string) => void;
  onCompose: () => void;
};

export function Sidebar({
  user,
  section,
  counts,
  onSection,
  onCompose,
}: SidebarProps) {
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackTeamName, setSlackTeamName] = useState<string | null>(null);
  const [checkingSlack, setCheckingSlack] = useState(true);

  /*
   * Check Slack connection status when dashboard loads.
   */
  useEffect(() => {
    const checkSlackStatus = async () => {
      try {
        const result = await api.slackStatus();

        setSlackConnected(Boolean(result?.connected));
        setSlackTeamName(result?.teamName || null);
      } catch (error) {
        console.error('Failed to check Slack status:', error);

        setSlackConnected(false);
        setSlackTeamName(null);
      } finally {
        setCheckingSlack(false);
      }
    };

    checkSlackStatus();
  }, []);

  /*
   * Connect Slack using the deployed production backend.
   *
   * IMPORTANT:
   * Replace YOUR-API-RENDER-URL with the URL of your
   * Express API service on Render.
   *
   * Do NOT use the BullMQ worker URL here.
   */
  const connectSlack = () => {
    window.location.href =
      'https://YOUR-API-RENDER-URL.onrender.com/api/slack/oauth/start';
  };

  /*
   * Logout.
   */
  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <aside className="min-h-screen w-[342px] shrink-0 border-r border-slate-100 bg-white px-4 py-6">
      {/* LOGO */}
      <Logo />

      {/* USER PROFILE */}
      <div className="mt-7 flex items-center justify-between rounded-[20px] bg-[#f3f6f4] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={user?.avatarUrl || 'https://i.pravatar.cc/80'}
            alt="Profile"
            className="h-10 w-10 rounded-full object-cover"
          />

          <div className="min-w-0">
            <div className="truncate text-[16px] font-medium">
              {user?.name || 'User'}
            </div>

            <div className="truncate text-[13px] text-slate-400">
              {user?.email || ''}
            </div>
          </div>
        </div>

        <ChevronDown size={19} className="text-slate-500" />
      </div>

      {/* COMPOSE */}
      <button
        onClick={onCompose}
        className="mt-3 w-full rounded-full border border-[#00ad45] py-2.5 text-[17px] font-medium text-[#00ad45] transition hover:bg-[#ecfbf1]"
      >
        Compose
      </button>

      {/* CORE */}
      <div className="mt-8 px-5 text-[14px] text-slate-400">
        CORE
      </div>

      {/* NAVIGATION */}
      <nav className="mt-2 space-y-1">
        {/* SCHEDULED */}
        <button
          onClick={() => onSection('scheduled')}
          className={`flex w-full items-center justify-between rounded-[17px] px-5 py-3 text-[17px] transition ${
            section === 'scheduled'
              ? 'bg-[#e2f5eb] font-semibold text-slate-800'
              : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="flex items-center gap-4">
            <Clock3 size={21} />
            Scheduled
          </span>

          <span className="text-[14px] text-slate-500">
            {counts.scheduled}
          </span>
        </button>

        {/* SENT */}
        <button
          onClick={() => onSection('sent')}
          className={`flex w-full items-center justify-between rounded-[17px] px-5 py-3 text-[17px] transition ${
            section === 'sent'
              ? 'bg-[#e2f5eb] font-semibold text-slate-800'
              : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="flex items-center gap-4">
            <Send size={21} />
            Sent
          </span>

          <span className="text-[14px] text-slate-500">
            {counts.sent}
          </span>
        </button>
      </nav>

      {/* BOTTOM ACTIONS */}
      <div className="mt-8 space-y-2 px-2">
        {/* SLACK */}
        {checkingSlack ? (
          <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400">
            <MessageSquare size={18} />
            Checking Slack...
          </div>
        ) : slackConnected ? (
          <div className="rounded-xl bg-[#ecfbf1] px-3 py-3">
            <div className="flex items-center gap-3 text-sm font-medium text-[#008f3c]">
              <CheckCircle2 size={18} />

              <span>Slack Connected</span>
            </div>

            {slackTeamName && (
              <div className="mt-1 pl-[30px] text-xs text-slate-500">
                {slackTeamName}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={connectSlack}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
          >
            <MessageSquare size={18} />

            Connect Slack
          </button>
        )}

        {/* LOGOUT */}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
        >
          <LogOut size={18} />

          Logout
        </button>
      </div>
    </aside>
  );
}
