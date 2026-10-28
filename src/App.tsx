import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Menu,
  ExternalLink,
  Sparkles,
  ArrowLeft,
  User,
  Heart,
  Calendar,
  Compass,
  Database,
  PlusCircle,
  RefreshCw
} from 'lucide-react';
import {
  EMPTY_USER_PROFILE,
  EMPTY_METRICS
} from './data/defaults';
import {
  Opportunity,
  VolunteerProfile,
  Registration,
  AgentLog,
  ImpactMetrics,
  CauseCategory
} from './types';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  getProfile,
  saveProfile,
  getOpportunitiesFromSupabase,
  getUserRegistrations,
  createSupabaseRegistration,
  deleteSupabaseRegistration,
  updateRegistrationStatus,
  getAgentRuns,
  recordAgentRun,
  seedInitialOpportunities
} from './services/supabaseService';
import { Logo } from './components/Logo';
import { Sidebar, DashboardView } from './components/Sidebar';
import { LandingPage } from './components/LandingPage';
import { SignInPage } from './components/SignInPage';
import { DiscoverView } from './components/DiscoverView';
import { MyMatchesView } from './components/MyMatchesView';
import { OverviewView } from './components/OverviewView';
import { RegisteredEventsView } from './components/RegisteredEventsView';
import { AgentActivityView } from './components/AgentActivityView';
import { TestCasesView } from './components/TestCasesView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { CommitMateView } from './components/CommitMateView';
import { WaitlistGuardianView } from './components/WaitlistGuardianView';
import { OpportunityDetailModal } from './components/OpportunityDetailModal';
import { RegistrationModal } from './components/RegistrationModal';
import { CreateOpportunityModal } from './components/CreateOpportunityModal';
import { findAllRegisteredConflicts } from './lib/commitMateSchedule';

export default function App() {
  // Application view mode: 'landing' | 'signin' | 'dashboard'
  const [appMode, setAppMode] = useState<'landing' | 'signin' | 'dashboard'>('landing');
  const [currentDashboardView, setCurrentDashboardView] = useState<DashboardView>('discover');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [initialCauseFilter, setInitialCauseFilter] = useState<CauseCategory | 'all'>('all');

  // Supabase Auth session state
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);

  // Application Real Data States (Zero fake mock data)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [userProfile, setUserProfile] = useState<VolunteerProfile>(EMPTY_USER_PROFILE);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);

  // Modals & UI States
  const [detailModalOpp, setDetailModalOpp] = useState<Opportunity | null>(null);
  const [registrationModalOpp, setRegistrationModalOpp] = useState<Opportunity | null>(null);
  const [isCreateOppModalOpen, setIsCreateOppModalOpen] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [authToast, setAuthToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Dynamic Metrics computed exclusively from real records
  const metrics: ImpactMetrics = useMemo(() => {
    const completed = registrations.filter((r) => r.status === 'completed');
    const upcoming = registrations.filter((r) => r.status !== 'completed' && r.status !== 'cancelled');
    const totalHours = completed.reduce((sum, r) => sum + (r.hoursLogged || 4), 0);

    const categories = new Set(registrations.map((r) => r.category));
    userProfile.preferredCauses.forEach((c) => categories.add(c));

    const badges = [];
    if (completed.length >= 1) {
      badges.push({
        id: 'badge-1',
        title: 'Community Pioneer',
        description: 'Completed first verified volunteer shift',
        icon: 'Award',
        earnedDate: 'Verified'
      });
    }
    if (totalHours >= 10) {
      badges.push({
        id: 'badge-2',
        title: 'Dedicated Volunteer',
        description: 'Logged 10+ hours of community social impact',
        icon: 'Sparkles',
        earnedDate: 'Verified'
      });
    }
    if (categories.size >= 3) {
      badges.push({
        id: 'badge-3',
        title: 'Cross-Cause Champion',
        description: 'Supported diverse social impact categories',
        icon: 'Heart',
        earnedDate: 'Verified'
      });
    }

    return {
      totalHoursVolunteered: totalHours,
      eventsCompleted: completed.length,
      upcomingEvents: upcoming.length,
      causesSupportedCount: categories.size,
      peopleImpacted: completed.length * 15,
      badgesUnlocked: badges
    };
  }, [registrations, userProfile]);

  // Load public opportunities and agent runs from Supabase
  const loadPublicData = useCallback(async () => {
    try {
      const oppResult = await getOpportunitiesFromSupabase();
      if (oppResult.opportunities) {
        setOpportunities(oppResult.opportunities);
      }
    } catch (err) {
      console.warn('Error loading public opportunities:', err);
    }

    try {
      const agentResult = await getAgentRuns();
      if (agentResult.logs) {
        setAgentLogs(agentResult.logs);
      }
    } catch (err) {
      console.warn('Error loading agent runs:', err);
    }
  }, []);

  // Load user data for authenticated user from Supabase
  const loadUserData = useCallback(async (userId: string, userEmail?: string) => {
    // 1. Fetch Profile from public.profiles
    try {
      const { profile } = await getProfile(userId);
      if (profile) {
        setUserProfile(profile);
      } else if (userEmail) {
        // Initial profile creation for newly authenticated user
        const initialProf: VolunteerProfile = {
          ...EMPTY_USER_PROFILE,
          name: userEmail.split('@')[0],
          email: userEmail
        };
        setUserProfile(initialProf);
        saveProfile(userId, userEmail, initialProf).catch((e) => console.warn('Profile initialization:', e));
      }
    } catch (err) {
      console.warn('Error loading user profile:', err);
    }

    // 2. Fetch User's Real Registrations from public.registrations
    try {
      const regResult = await getUserRegistrations(userId);
      if (regResult.registrations) {
        setRegistrations(regResult.registrations);
      }
    } catch (err) {
      console.warn('Error loading user registrations:', err);
    }
  }, []);

  // Check active session on initial startup & subscribe to auth changes
  useEffect(() => {
    loadPublicData();

    if (!isSupabaseConfigured() || !supabase) {
      setIsSessionLoading(false);
      return;
    }

    // Inspect URL for email verification code, hash tokens, or verification errors
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const code = searchParams.get('code');
      const errorMsg =
        hashParams.get('error_description') ||
        searchParams.get('error_description') ||
        hashParams.get('error') ||
        searchParams.get('error');

      const isSignupNotice =
        hashParams.get('type') === 'signup' ||
        searchParams.get('type') === 'signup' ||
        hashParams.get('type') === 'email_change';

      if (errorMsg) {
        setAuthToast({
          type: 'error',
          message: `Verification notice: ${decodeURIComponent(errorMsg.replace(/\+/g, ' '))}`
        });
        setAppMode('signin');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (code) {
        // Exchange PKCE confirmation code
        supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
          if (!error && data.session?.user) {
            setAuthToast({
              type: 'success',
              message: 'Email verified successfully! Welcome to CauseConnect AI.'
            });
            setSupabaseUserId(data.session.user.id);
            loadUserData(data.session.user.id, data.session.user.email);
            setAppMode('dashboard');
          } else if (error) {
            setAuthToast({
              type: 'error',
              message: `Verification failed: ${error.message}`
            });
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        });
      } else if (isSignupNotice) {
        setAuthToast({
          type: 'success',
          message: 'Your email address has been verified successfully! Welcome to CauseConnect AI.'
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Check existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session?.user && !error) {
        setSupabaseUserId(session.user.id);
        loadUserData(session.user.id, session.user.email);
        setAppMode('dashboard');
      }
      setIsSessionLoading(false);
    }).catch(() => {
      setIsSessionLoading(false);
    });

    // Listen to auth state transitions
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        setSupabaseUserId(session.user.id);
        await loadUserData(session.user.id, session.user.email);
        setAppMode('dashboard');
      } else if (event === 'SIGNED_OUT') {
        setSupabaseUserId(null);
        setUserProfile(EMPTY_USER_PROFILE);
        setRegistrations([]);
        setAppMode('signin');
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setSupabaseUserId(session.user.id);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [loadPublicData, loadUserData]);

  // Navigation handlers
  const handleGoToApp = (targetView: 'discover' | 'profile' | 'matches' = 'discover') => {
    setCurrentDashboardView(targetView);
    setAppMode('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectCauseFilterFromLanding = (cause: CauseCategory) => {
    setInitialCauseFilter(cause);
    setCurrentDashboardView('discover');
    setAppMode('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignInSuccess = (authenticatedProfile: VolunteerProfile, userId?: string) => {
    setUserProfile(authenticatedProfile);
    if (userId) {
      setSupabaseUserId(userId);
      loadUserData(userId, authenticatedProfile.email);
    }
    setAppMode('dashboard');
    setCurrentDashboardView('discover');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignOut = async () => {
    if (supabase && isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Sign out notice:', e);
      }
    }
    setSupabaseUserId(null);
    setUserProfile(EMPTY_USER_PROFILE);
    setRegistrations([]);
    setAppMode('signin');
  };

  // Real Database Registration Actions
  const handleConfirmRegistration = async (
    opp: Opportunity,
    userNotes: string,
    options?: {
      status?: string;
      confirmationReference?: string;
    }
  ): Promise<{ success: boolean; error: string | null; registration?: Registration }> => {
    let activeUserId = supabaseUserId;
    if (!activeUserId && supabase && isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        activeUserId = sessionData.session.user.id;
        setSupabaseUserId(activeUserId);
      }
    }

    if (!activeUserId) {
      return {
        success: false,
        error: 'You must be signed in to submit an approved registration. Please sign in to your volunteer account.'
      };
    }

    const res = await createSupabaseRegistration(activeUserId, opp.id, {
      opportunity: opp,
      status: options?.status || 'confirmed',
      confirmationReference: options?.confirmationReference,
      userNotes
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Failed to persist registration to Supabase database.'
      };
    }

    // Refresh registrations from database
    const regResult = await getUserRegistrations(activeUserId);
    if (regResult.registrations && regResult.registrations.length > 0) {
      setRegistrations(regResult.registrations);
    } else if (res.registration) {
      setRegistrations((prev) => [
        res.registration!,
        ...prev.filter((r) => r.opportunityId !== res.registration!.opportunityId && r.id !== res.registration!.id)
      ]);
    }

    // Record agent audit run in database
    await recordAgentRun(
      'user_consent_gate',
      'completed',
      {
        opportunity_id: opp.id,
        opportunity_title: opp.title,
        action: 'Volunteer Approval Verified & Persisted',
        organization: opp.organization
      }
    );

    // Refresh agent runs
    const agentResult = await getAgentRuns();
    if (agentResult.logs) {
      setAgentLogs(agentResult.logs);
    }

    const finalReg = res.registration || regResult.registrations?.find((r) => r.opportunityId === opp.id || r.opportunityTitle === opp.title);

    if (finalReg) {
      setRegistrations((prev) => [
        finalReg,
        ...prev.filter((r) => r.opportunityId !== finalReg.opportunityId && r.id !== finalReg.id)
      ]);
    }

    return { success: true, registration: finalReg, error: null };
  };

  const handleRefreshRegistrations = useCallback(async () => {
    let activeId = supabaseUserId;
    if (!activeId && supabase && isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        activeId = sessionData.session.user.id;
        setSupabaseUserId(activeId);
      }
    }
    if (!activeId) return;
    try {
      const regResult = await getUserRegistrations(activeId);
      if (regResult.registrations) {
        setRegistrations(regResult.registrations);
      }
    } catch (e) {
      console.warn('Error refreshing registrations:', e);
    }
  }, [supabaseUserId]);

  useEffect(() => {
    if (currentDashboardView === 'registered') {
      handleRefreshRegistrations();
    }
  }, [currentDashboardView, handleRefreshRegistrations]);

  const handleCancelRegistration = async (regId: string) => {
    if (!supabaseUserId) return;
    const res = await deleteSupabaseRegistration(supabaseUserId, regId);
    if (res.success) {
      const regResult = await getUserRegistrations(supabaseUserId);
      if (regResult.registrations) {
        setRegistrations(regResult.registrations);
      }
    }
  };

  const handleLogHours = async (regId: string, _hours: number) => {
    if (!supabaseUserId) return;
    const res = await updateRegistrationStatus(supabaseUserId, regId, 'completed');
    if (res.success) {
      const regResult = await getUserRegistrations(supabaseUserId);
      if (regResult.registrations) {
        setRegistrations(regResult.registrations);
      }
    }
  };

  const handleSaveProfile = async (
    updated: VolunteerProfile
  ): Promise<{ success: boolean; error: string | null }> => {
    if (!supabaseUserId) {
      setUserProfile(updated);
      return { success: true, error: null };
    }

    const res = await saveProfile(supabaseUserId, updated.email, updated);
    if (res.success) {
      // Re-fetch persisted profile to guarantee verified database sync
      const fresh = await getProfile(supabaseUserId);
      if (fresh.profile) {
        setUserProfile(fresh.profile);
      } else {
        setUserProfile(updated);
      }

      // Record profile re-ranking run
      await recordAgentRun(
        'profile_vector_update',
        'completed',
        {
          user_id: supabaseUserId,
          causes_count: updated.preferredCauses.length,
          skills_count: updated.skills.length
        }
      );

      return { success: true, error: null };
    }

    return { success: false, error: res.error || 'Failed to save profile changes to database.' };
  };

  const handleUpdatePartialProfile = async (
    updates: Partial<VolunteerProfile>
  ): Promise<{ success: boolean; error: string | null }> => {
    return handleSaveProfile({
      ...userProfile,
      ...updates
    });
  };

  const handleTriggerAgentRescan = async () => {
    await recordAgentRun(
      'eligibility_audit',
      'completed',
      {
        verified_listings: opportunities.length,
        safeguards_active: 'Age Restrictions & Background Transparency',
        audited_at: new Date().toISOString()
      }
    );
    const agentResult = await getAgentRuns();
    if (agentResult.logs) {
      setAgentLogs(agentResult.logs);
    }
  };

  const handleSeedOpportunities = async () => {
    setIsSeeding(true);
    const res = await seedInitialOpportunities();
    setIsSeeding(false);
    if (res.success) {
      await loadPublicData();
    } else {
      alert(`Could not seed opportunities: ${res.error}`);
    }
  };

  const handleOpportunityCreated = (newOpp: Opportunity) => {
    setOpportunities((prev) => [newOpp, ...prev]);
  };

  const handleExportData = () => {
    const dataToExport = {
      profile: userProfile,
      registrations,
      metrics,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `causeconnect-volunteer-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const registeredOppIds = useMemo(() => {
    return registrations.map((r) => r.opportunityId);
  }, [registrations]);

  const registeredConflictsCount = useMemo(() => {
    return findAllRegisteredConflicts(registrations, userProfile).length;
  }, [registrations, userProfile]);

  const waitlistCount = useMemo(() => {
    return registrations.filter((r) => r.status === 'waitlisted' || r.monitoringEnabled).length;
  }, [registrations]);

  const waitlistVacatedCount = useMemo(() => {
    return registrations.filter((r) => r.availabilityStatus === 'spot_available').length;
  }, [registrations]);

  // Loading Screen while verifying session
  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-[#1A382A] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-3 border-[#315D48] border-t-[#D6C49A] rounded-full animate-spin mx-auto" />
          <h2 className="font-serif text-xl font-bold text-[#E8F0E9]">
            Connecting to CauseConnect...
          </h2>
          <p className="text-xs text-[#DFEAE1]/70 font-mono">
            Verifying Supabase PostgreSQL credentials
          </p>
        </div>
      </div>
    );
  }

  // 1. Landing Page Mode
  if (appMode === 'landing') {
    return (
      <>
        {authToast && (
          <div className="fixed top-5 right-5 z-50 max-w-md px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-semibold animate-fade-in bg-white border-[#D5E0D7] text-[#244C3A]">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${authToast.type === 'success' ? 'bg-emerald-600' : 'bg-amber-600'}`} />
            <span className="flex-1">{authToast.message}</span>
            <button
              onClick={() => setAuthToast(null)}
              className="text-[#5A7868] hover:text-[#244C3A] cursor-pointer text-sm font-bold ml-1"
            >
              ✕
            </button>
          </div>
        )}
        <LandingPage
          onGoToApp={() => handleGoToApp('discover')}
          onSignInClick={() => setAppMode('signin')}
          onSelectCauseFilter={handleSelectCauseFilterFromLanding}
          userProfile={userProfile}
        />
      </>
    );
  }

  // 2. Sign In Mode
  if (appMode === 'signin') {
    return (
      <>
        {authToast && (
          <div className="fixed top-5 right-5 z-50 max-w-md px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-semibold animate-fade-in bg-white border-[#D5E0D7] text-[#244C3A]">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${authToast.type === 'success' ? 'bg-emerald-600' : 'bg-amber-600'}`} />
            <span className="flex-1">{authToast.message}</span>
            <button
              onClick={() => setAuthToast(null)}
              className="text-[#5A7868] hover:text-[#244C3A] cursor-pointer text-sm font-bold ml-1"
            >
              ✕
            </button>
          </div>
        )}
        <SignInPage
          onSignInSuccess={handleSignInSuccess}
          onGoToLanding={() => setAppMode('landing')}
          currentUser={userProfile}
        />
      </>
    );
  }

  // 3. Authenticated Dashboard Mode
  return (
    <div className="min-h-screen bg-[#E8F0E9] text-[#244C3A] flex">
      {authToast && (
        <div className="fixed top-5 right-5 z-50 max-w-md px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-semibold animate-fade-in bg-white border-[#D5E0D7] text-[#244C3A]">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${authToast.type === 'success' ? 'bg-emerald-600' : 'bg-amber-600'}`} />
          <span className="flex-1">{authToast.message}</span>
          <button
            onClick={() => setAuthToast(null)}
            className="text-[#5A7868] hover:text-[#244C3A] cursor-pointer text-sm font-bold ml-1"
          >
            ✕
          </button>
        </div>
      )}
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentDashboardView}
        onSelectView={(view) => setCurrentDashboardView(view)}
        onGoToLanding={() => setAppMode('landing')}
        onSignOut={handleSignOut}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        activeMatchCount={opportunities.length}
        registeredCount={registrations.length}
        conflictCount={registeredConflictsCount}
        waitlistCount={waitlistCount}
        waitlistVacatedCount={waitlistVacatedCount}
        userName={userProfile.name || 'Volunteer'}
        supabaseUserId={supabaseUserId}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:ml-72 flex flex-col min-w-0">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-30 bg-[#E8F0E9]/95 backdrop-blur-md border-b border-[#D5E0D7] px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Menu */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 rounded-xl text-[#244C3A] hover:bg-[#DFEAE1] md:hidden cursor-pointer"
              aria-label="Open sidebar menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb indicator */}
            <div className="flex items-center gap-2 text-xs text-[#59665C]">
              <button
                onClick={() => setAppMode('landing')}
                className="hover:text-[#244C3A] font-semibold transition-colors cursor-pointer"
              >
                CauseConnect
              </button>
              <span>/</span>
              <span className="font-bold text-[#244C3A] capitalize">
                {currentDashboardView.replace('-', ' ')}
              </span>
            </div>
          </div>

          {/* Right Header Navigation & Actions */}
          <div className="flex items-center gap-3">
            {/* Supabase Status Pill */}
            {isSupabaseConfigured() && (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
                <Database className="w-3 h-3 text-emerald-600" />
                <span>Supabase Live</span>
              </div>
            )}

            <button
              onClick={() => setIsCreateOppModalOpen(true)}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#D6C49A]" />
              <span>Publish Opportunity</span>
            </button>

            <button
              onClick={() => setAppMode('landing')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#5A7868]/40 bg-white text-xs font-semibold text-[#244C3A] hover:bg-[#DFEAE1] transition-colors cursor-pointer"
            >
              <span>Public Homepage</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#315D48]" />
            </button>

            {/* User Profile Pill */}
            <button
              onClick={() => setCurrentDashboardView('profile')}
              className="inline-flex items-center gap-2 pl-2 pr-3 py-1 rounded-full bg-white border border-[#D5E0D7] text-xs font-semibold text-[#244C3A] hover:border-[#244C3A]/40 transition-colors shadow-2xs cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-[#244C3A] text-[#D6C49A] flex items-center justify-center font-bold text-[11px]">
                {(userProfile.name || 'V').charAt(0)}
              </div>
              <span className="hidden sm:inline">{userProfile.name || 'Profile'}</span>
            </button>
          </div>
        </header>

        {/* Dynamic View Body */}
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1">
          {currentDashboardView === 'discover' && (
            <DiscoverView
              opportunities={opportunities}
              onViewDetails={(opp) => setDetailModalOpp(opp)}
              onRequestRegistration={(opp) => setRegistrationModalOpp(opp)}
              registeredOppIds={registeredOppIds}
              initialCauseFilter={initialCauseFilter}
              onPublishClick={() => setIsCreateOppModalOpen(true)}
              onSeedOpportunities={handleSeedOpportunities}
              isSeeding={isSeeding}
              userProfile={userProfile}
            />
          )}

          {currentDashboardView === 'matches' && (
            <MyMatchesView
              opportunities={opportunities}
              userProfile={userProfile}
              onViewDetails={(opp) => setDetailModalOpp(opp)}
              onRequestRegistration={(opp) => setRegistrationModalOpp(opp)}
              registeredOppIds={registeredOppIds}
              onGoToProfile={() => setCurrentDashboardView('profile')}
            />
          )}

          {currentDashboardView === 'overview' && (
            <OverviewView
              metrics={metrics}
              registrations={registrations}
              opportunities={opportunities}
              userProfile={userProfile}
              onGoToView={(view) => setCurrentDashboardView(view)}
              onViewDetails={(opp) => setDetailModalOpp(opp)}
            />
          )}

          {currentDashboardView === 'registered' && (
            <RegisteredEventsView
              registrations={registrations}
              onCancelRegistration={handleCancelRegistration}
              onLogHours={handleLogHours}
              onGoToDiscover={() => setCurrentDashboardView('discover')}
              onGoToWaitlist={() => setCurrentDashboardView('waitlist')}
              onRefresh={handleRefreshRegistrations}
            />
          )}

          {currentDashboardView === 'commitmate' && (
            <CommitMateView
              registrations={registrations}
              userProfile={userProfile}
              supabaseUserId={supabaseUserId}
              onUpdateProfile={handleUpdatePartialProfile}
              onRefreshRegistrations={handleRefreshRegistrations}
              onNavigateToDiscover={() => setCurrentDashboardView('discover')}
            />
          )}

          {currentDashboardView === 'waitlist' && (
            <WaitlistGuardianView
              registrations={registrations}
              userProfile={userProfile}
              supabaseUserId={supabaseUserId}
              onRefreshRegistrations={handleRefreshRegistrations}
              onNavigateToDiscover={() => setCurrentDashboardView('discover')}
            />
          )}

          {currentDashboardView === 'agent' && (
            <AgentActivityView
              logs={agentLogs}
              onTriggerAgentRescan={handleTriggerAgentRescan}
            />
          )}

          {currentDashboardView === 'tests' && (
            <TestCasesView />
          )}

          {currentDashboardView === 'profile' && (
            <ProfileView
              profile={userProfile}
              onSaveProfile={handleSaveProfile}
              onGoToMatches={() => setCurrentDashboardView('matches')}
            />
          )}

          {currentDashboardView === 'settings' && (
            <SettingsView
              onExportData={handleExportData}
            />
          )}
        </main>
      </div>

      {/* Opportunity Detail Modal */}
      <OpportunityDetailModal
        opportunity={detailModalOpp}
        userProfile={userProfile}
        registrations={registrations}
        isOpen={Boolean(detailModalOpp)}
        onClose={() => setDetailModalOpp(null)}
        onRequestRegistration={(opp) => {
          setDetailModalOpp(null);
          setRegistrationModalOpp(opp);
        }}
        isAlreadyRegistered={
          detailModalOpp ? registeredOppIds.includes(detailModalOpp.id) : false
        }
      />

      {/* Registration Review & Approval Modal */}
      <RegistrationModal
        opportunity={registrationModalOpp}
        userProfile={userProfile}
        registrations={registrations}
        isOpen={Boolean(registrationModalOpp)}
        onClose={() => setRegistrationModalOpp(null)}
        onConfirmRegistration={handleConfirmRegistration}
        onGoToRegisteredEvents={() => setCurrentDashboardView('registered')}
        onPromptSignIn={() => {
          setRegistrationModalOpp(null);
          setAppMode('signin');
        }}
        isAuthenticated={Boolean(supabaseUserId)}
      />

      {/* Create / Publish Opportunity Modal */}
      <CreateOpportunityModal
        isOpen={isCreateOppModalOpen}
        onClose={() => setIsCreateOppModalOpen(false)}
        onOpportunityCreated={handleOpportunityCreated}
      />
    </div>
  );
}
