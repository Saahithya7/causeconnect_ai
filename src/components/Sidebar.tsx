import React from 'react';
import {
  LayoutGrid,
  Compass,
  Heart,
  Calendar,
  CalendarCheck,
  Activity,
  FlaskConical,
  User,
  Settings,
  X,
  ExternalLink,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Database
} from 'lucide-react';
import { Logo } from './Logo';

export type DashboardView =
  | 'overview'
  | 'discover'
  | 'matches'
  | 'registered'
  | 'commitmate'
  | 'waitlist'
  | 'agent'
  | 'tests'
  | 'profile'
  | 'settings';

interface SidebarProps {
  currentView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  onGoToLanding: () => void;
  onSignOut: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  activeMatchCount?: number;
  registeredCount?: number;
  conflictCount?: number;
  waitlistCount?: number;
  waitlistVacatedCount?: number;
  userName?: string;
  supabaseUserId?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  onGoToLanding,
  onSignOut,
  isOpenMobile,
  onCloseMobile,
  activeMatchCount = 0,
  registeredCount = 0,
  conflictCount = 0,
  waitlistCount = 0,
  waitlistVacatedCount = 0,
  userName = 'Volunteer',
  supabaseUserId
}) => {
  const navItems = [
    {
      id: 'overview' as DashboardView,
      label: 'Overview',
      icon: LayoutGrid
    },
    {
      id: 'discover' as DashboardView,
      label: 'Discover Opportunities',
      icon: Compass
    },
    {
      id: 'matches' as DashboardView,
      label: 'My Matches',
      icon: Heart,
      badge: activeMatchCount > 0 ? activeMatchCount : undefined
    },
    {
      id: 'registered' as DashboardView,
      label: 'Registered Events',
      icon: Calendar,
      badge: registeredCount > 0 ? registeredCount : undefined
    },
    {
      id: 'commitmate' as DashboardView,
      label: 'CommitMate Agent',
      icon: CalendarCheck,
      badge: conflictCount > 0 ? `${conflictCount} conflict${conflictCount > 1 ? 's' : ''}` : undefined
    },
    {
      id: 'waitlist' as DashboardView,
      label: 'WaitlistGuardian',
      icon: ShieldAlert,
      badge: waitlistVacatedCount > 0 ? `${waitlistVacatedCount} open!` : waitlistCount > 0 ? waitlistCount : undefined
    },
    {
      id: 'agent' as DashboardView,
      label: 'Agent Activity',
      icon: Activity
    },
    {
      id: 'tests' as DashboardView,
      label: 'Test Cases',
      icon: FlaskConical
    },
    {
      id: 'profile' as DashboardView,
      label: 'Profile',
      icon: User
    },
    {
      id: 'settings' as DashboardView,
      label: 'Settings',
      icon: Settings
    }
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#244C3A] text-[#E8F0E9] flex flex-col justify-between border-r border-[#315D48] transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top: Logo & Close Button (Mobile) */}
        <div>
          <div className="p-6 flex items-center justify-between border-b border-[#315D48]">
            <Logo onClick={onGoToLanding} />
            <button
              onClick={onCloseMobile}
              className="p-1 rounded-lg hover:bg-[#315D48] text-[#DFEAE1] md:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectView(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-[#315D48] text-white shadow-xs font-semibold'
                      : 'text-[#DFEAE1] hover:bg-[#315D48]/50 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#D6C49A]' : 'text-[#5A7868]'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        isActive
                          ? 'bg-[#244C3A] text-[#D6C49A]'
                          : 'bg-[#315D48] text-[#DFEAE1]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: User status, Live Database indicator, sign out */}
        <div className="p-4 border-t border-[#315D48] space-y-3">
          {/* User profile card */}
          <div className="flex items-center justify-between bg-[#315D48]/40 p-2.5 rounded-xl border border-[#315D48]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#315D48] border border-[#D6C49A]/30 flex items-center justify-center font-bold text-xs text-[#D6C49A] shrink-0">
                {userName.charAt(0) || 'V'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#E8F0E9] truncate">{userName}</div>
                <div className="text-[10px] text-[#DFEAE1]/70 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#D6C49A]" />
                  <span>Authenticated</span>
                </div>
              </div>
            </div>

            <button
              onClick={onSignOut}
              title="Sign Out"
              className="p-1.5 rounded-lg hover:bg-[#244C3A] text-[#DFEAE1] hover:text-white transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onGoToLanding}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-[#DFEAE1] hover:text-white hover:bg-[#315D48]/40 transition-colors font-medium cursor-pointer"
          >
            <span>Public Site View</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#D6C49A]" />
          </button>

          {/* Supabase Live Database Connection card */}
          <div className="bg-[#1A382A] border border-[#315D48] rounded-xl p-3 shadow-inner">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-bold text-[#E8F0E9] tracking-tight">Supabase Live</span>
              </div>
              <span className="text-[10px] text-[#D6C49A] font-semibold bg-[#315D48]/60 px-2 py-0.5 rounded-full">
                RLS Active
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#DFEAE1]/80 font-mono text-[10px] truncate">
              {supabaseUserId ? `UID: ${supabaseUserId.slice(0, 12)}...` : 'Connected to PostgreSQL'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
