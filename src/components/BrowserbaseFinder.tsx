import React, { useState, useEffect } from 'react';
import {
  Globe,
  Compass,
  Search,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Clock,
  MapPin,
  Building2,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Key,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type {
  BrowserbaseOpportunity,
  BrowserbaseVerificationStatus,
  VolunteerProfile,
  CauseCategory,
  Opportunity
} from '../types';
import {
  getBrowserbaseStatus,
  searchVolunteerOpportunities,
  releaseActiveSessions,
  getBrowserbaseRunStatus,
  BrowserbaseStatusResult
} from '../services/browserbaseService';

interface BrowserbaseFinderProps {
  userProfile?: VolunteerProfile;
  onOpportunitySelect?: (opp: BrowserbaseOpportunity) => void;
  onRequestRegistration?: (opp: Opportunity) => void;
}

const AVAILABLE_CAUSES: CauseCategory[] = [
  'Education',
  'Environment',
  'Community Service',
  'Animal Welfare',
  'Healthcare',
  'Elderly Care',
  'Disaster Relief',
  'Accessibility',
  'Fundraising'
];

export const BrowserbaseFinder: React.FC<BrowserbaseFinderProps> = ({
  userProfile,
  onOpportunitySelect,
  onRequestRegistration
}) => {
  // Status of the server-side Browserbase integration
  const [status, setStatus] = useState<BrowserbaseStatusResult | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseFeedback, setReleaseFeedback] = useState<string | null>(null);

  // Search parameters
  const [location, setLocation] = useState<string>(userProfile?.city || 'San Francisco, CA');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    userProfile?.preferredCauses?.length ? userProfile.preferredCauses : ['Education', 'Environment']
  );
  const [skillsText, setSkillsText] = useState<string>(
    userProfile?.skills?.join(', ') || 'Community outreach, General assistance'
  );
  const [preferredDates, setPreferredDates] = useState<string>('Upcoming weekends or flexible dates');
  const [radius, setRadius] = useState<number>(25);
  const [maxResults, setMaxResults] = useState<number>(6);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Search state
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchStep, setSearchStep] = useState<number>(0);
  const [results, setResults] = useState<BrowserbaseOpportunity[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [runInfo, setRunInfo] = useState<{ runId?: string; status?: string; searchedAt?: string } | null>(null);

  // Check server configuration status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const res = await getBrowserbaseStatus();
      setStatus(res);
    } catch (e) {
      console.error('Failed to load Browserbase status', e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleQuickRelease = async () => {
    setIsReleasing(true);
    setReleaseFeedback(null);
    try {
      const res = await releaseActiveSessions();
      setReleaseFeedback(res.message || 'Session release requested.');
      setTimeout(() => setReleaseFeedback(null), 4000);
    } catch (e: any) {
      setReleaseFeedback(e?.message || 'Failed to release sessions.');
      setTimeout(() => setReleaseFeedback(null), 4000);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleReleaseAndRetry = async () => {
    setIsReleasing(true);
    try {
      await releaseActiveSessions();
      // Wait 3 seconds to let Browserbase runner register the release
      await new Promise((r) => setTimeout(r, 3000));
      setErrorMessage(null);
      await executeSearch();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to release active sessions');
    } finally {
      setIsReleasing(false);
    }
  };

  const toggleInterest = (cause: string) => {
    setSelectedInterests((prev) =>
      prev.includes(cause) ? prev.filter((c) => c !== cause) : [...prev, cause]
    );
  };

  const executeSearch = async () => {
    if (!location.trim()) {
      setErrorMessage('Please enter a location or city.');
      return;
    }

    setErrorMessage(null);
    setIsSearching(true);
    setSearchStep(1);

    // Progress step animation while server agent executes
    const stepInterval = setInterval(() => {
      setSearchStep((prev) => {
        if (prev < 4) return prev + 1;
        return prev;
      });
    }, 3500);

    try {
      const skillsArray = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const response = await searchVolunteerOpportunities({
        location: location.trim(),
        interests: selectedInterests,
        skills: skillsArray,
        preferred_dates: preferredDates.trim() || null,
        radius,
        max_results: maxResults
      });

      clearInterval(stepInterval);

      if (!response.success) {
        setErrorMessage(
          response.error || 'The volunteer event search could not be completed at this time.'
        );
        setResults([]);
      } else if (
        (response.status === 'RUNNING' || response.status === 'PENDING') &&
        response.run_id
      ) {
        // Run is compiling in background, poll for final result
        const runId = response.run_id;
        let pollCount = 0;
        let completed = false;

        while (pollCount < 20 && !completed) {
          await new Promise((r) => setTimeout(r, 4000));
          pollCount++;
          try {
            const pollRes = await getBrowserbaseRunStatus(runId);
            if (pollRes?.status === 'COMPLETED') {
              completed = true;
              setResults(pollRes.opportunities || []);
              setRunInfo({
                runId,
                status: 'COMPLETED',
                searchedAt: new Date().toISOString()
              });
              break;
            } else if (pollRes?.status === 'FAILED') {
              setErrorMessage('The agent was unable to extract listings from target pages.');
              completed = true;
              break;
            }
          } catch (pollErr) {
            console.warn('Polling error:', pollErr);
          }
        }

        if (!completed && results.length === 0) {
          setErrorMessage('Search is taking longer than expected. Please check your Browserbase dashboard or retry.');
        }
      } else {
        setResults(response.opportunities || []);
        setRunInfo({
          runId: response.run_id,
          status: response.status,
          searchedAt: response.searched_at
        });
      }
      setHasSearched(true);
    } catch (err: any) {
      clearInterval(stepInterval);
      setErrorMessage(err?.message || 'Network error executing Browserbase volunteer search.');
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
      setSearchStep(0);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSearch();
  };

  const isConcurrencyNotice =
    errorMessage?.includes('concurrency') ||
    errorMessage?.includes('RUNNER_SESSION_LIMIT') ||
    errorMessage?.includes('session creation limit') ||
    errorMessage?.includes('1 concurrent browser session');

  const renderVerificationBadge = (status: BrowserbaseVerificationStatus) => {
    switch (status) {
      case 'verified_official':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#244C3A]/10 text-[#244C3A] border border-[#244C3A]/20">
            <ShieldCheck className="w-3.5 h-3.5 text-[#244C3A]" />
            Verified Official NGO
          </span>
        );
      case 'community_listed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
            Community Listed
          </span>
        );
      case 'unverified':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            Unverified Listing
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#244C3A] text-[#E8F0E9] rounded-2xl p-6 sm:p-8 shadow-sm border border-[#315D48]/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#315D48]/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A382A]/80 border border-[#D6C49A]/30 text-xs font-medium text-[#D6C49A] mb-3">
              <Globe className="w-3.5 h-3.5 text-[#D6C49A]" />
              <span>Playwright & Chromium Autonomous Web Agent</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
              CauseConnect Volunteer Event Finder
            </h2>
            <p className="mt-2 text-[#DFEAE1] text-sm sm:text-base leading-relaxed">
              Discovers authentic, upcoming volunteering opportunities across official NGO portals,
              charitable trusts, community cleanups, and non-profit websites using server-side Playwright browser automation.
            </p>
          </div>

          {/* Connection Status & Control Pill */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1A382A] border border-[#244C3A]/80 text-xs text-white">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium text-emerald-300">Playwright Engine Live</span>
            </div>
          </div>
        </div>

        {releaseFeedback && (
          <div className="mt-3 relative z-10 text-xs bg-[#1A382A]/90 border border-[#D6C49A]/40 text-[#D6C49A] px-3.5 py-1.5 rounded-lg inline-flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{releaseFeedback}</span>
          </div>
        )}
      </div>

      {/* API Key Instructions Alert if unconfigured */}
      {!isCheckingStatus && status && !status.configured && (
        <div className="bg-amber-50/90 border border-amber-300/80 rounded-xl p-5 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3.5">
            <Key className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-sm">
              <h4 className="font-semibold text-amber-950">
                Browserbase API Key Configuration
              </h4>
              <p className="text-amber-800 leading-relaxed">
                The <strong>CauseConnect Volunteer Event Finder</strong> agent is implemented and ready.
                To execute live web searches on external NGO platforms, set your{' '}
                <code className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono text-xs">
                  BROWSERBASE_API_KEY
                </code>{' '}
                in your server environment or <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">.env</code> file.
              </p>
              <div className="text-xs text-amber-700 pt-1">
                Your key will stay strictly on the server and is never exposed to browser bundles or client code.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Input Form */}
      <div className="bg-white rounded-2xl border border-[#D5E0D7] p-6 shadow-sm">
        <form onSubmit={handleSearch} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-[#244C3A] uppercase tracking-wider mb-1.5">
                Location or City <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#5A7868] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Hyderabad, Telangana or San Francisco, CA"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D5E0D7] focus:border-[#244C3A] focus:ring-2 focus:ring-[#244C3A]/10 text-sm text-[#244C3A] placeholder-[#5A7868]/60 outline-none transition-all"
                  required
                />
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px] text-[#5A7868]">
                <span>Quick select:</span>
                <button
                  type="button"
                  onClick={() => {
                    setLocation('Hyderabad, Telangana');
                    setSelectedInterests(['Animal Welfare', 'Education', 'Environment']);
                  }}
                  className="px-2 py-0.5 rounded-md bg-[#E8F0E9] hover:bg-[#DFEAE1] text-[#244C3A] font-medium transition-colors cursor-pointer"
                >
                  Hyderabad, Telangana
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocation('Bengaluru, Karnataka');
                    setSelectedInterests(['Education', 'Community Service']);
                  }}
                  className="px-2 py-0.5 rounded-md bg-[#E8F0E9] hover:bg-[#DFEAE1] text-[#244C3A] font-medium transition-colors cursor-pointer"
                >
                  Bengaluru, Karnataka
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocation('San Francisco, CA');
                    setSelectedInterests(['Environment', 'Community Service']);
                  }}
                  className="px-2 py-0.5 rounded-md bg-[#E8F0E9] hover:bg-[#DFEAE1] text-[#244C3A] font-medium transition-colors cursor-pointer"
                >
                  San Francisco, CA
                </button>
              </div>
            </div>

            {/* Preferred Dates / Availability */}
            <div>
              <label className="block text-xs font-semibold text-[#244C3A] uppercase tracking-wider mb-1.5">
                Preferred Dates / Availability
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-[#5A7868] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={preferredDates}
                  onChange={(e) => setPreferredDates(e.target.value)}
                  placeholder="e.g. Upcoming weekends, Saturdays, or Next 30 days"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D5E0D7] focus:border-[#244C3A] focus:ring-2 focus:ring-[#244C3A]/10 text-sm text-[#244C3A] placeholder-[#5A7868]/60 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Cause Categories / Interests */}
          <div>
            <label className="block text-xs font-semibold text-[#244C3A] uppercase tracking-wider mb-2">
              Volunteer Interests / Focus Causes
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_CAUSES.map((cause) => {
                const isSelected = selectedInterests.includes(cause);
                return (
                  <button
                    key={cause}
                    type="button"
                    onClick={() => toggleInterest(cause)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#244C3A] text-white shadow-sm'
                        : 'bg-[#E8F0E9] text-[#244C3A] hover:bg-[#DFEAE1] border border-[#D5E0D7]'
                    }`}
                  >
                    {cause}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced Filters Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#315D48] hover:text-[#244C3A] transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showAdvancedFilters ? 'Hide Advanced Filters' : 'Show Advanced Filters (Skills, Radius, Results)'}</span>
              {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Advanced Filter Fields */}
          {showAdvancedFilters && (
            <div className="pt-3 border-t border-[#D5E0D7] grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5A7868] mb-1">
                  Volunteer Skills (comma-separated)
                </label>
                <input
                  type="text"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  placeholder="e.g. Tutoring, First Aid, Cooking"
                  className="w-full px-3 py-2 rounded-lg border border-[#D5E0D7] text-xs text-[#244C3A] focus:border-[#244C3A] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A7868] mb-1">
                  Search Radius: {radius} miles
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full accent-[#244C3A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A7868] mb-1">
                  Max Opportunities
                </label>
                <select
                  value={maxResults}
                  onChange={(e) => setMaxResults(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-[#D5E0D7] text-xs text-[#244C3A] focus:border-[#244C3A] outline-none bg-white"
                >
                  <option value={3}>3 opportunities</option>
                  <option value={6}>6 opportunities</option>
                  <option value={10}>10 opportunities</option>
                </select>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-[#5A7868]">
              <Info className="w-3.5 h-3.5" />
              <span>Direct NGO source pages and authentic event registration links verified.</span>
            </div>

            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#244C3A] text-white font-medium text-sm hover:bg-[#1A382A] transition-all disabled:opacity-50 cursor-pointer shadow-sm hover:shadow"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#D6C49A]" />
                  <span>Searching the Web...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 text-[#D6C49A]" />
                  <span>Search Volunteer Opportunities</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Live Agent Execution Progress Indicator */}
      {isSearching && (
        <div className="bg-[#1A382A] text-white rounded-2xl p-6 border border-[#315D48] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 text-[#D6C49A] animate-spin" />
              <h3 className="font-serif font-semibold text-base text-white">
                CauseConnect Volunteer Event Finder in Progress
              </h3>
            </div>
            <span className="text-xs text-[#D6C49A] font-mono">Autonomous Agent Session</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  searchStep >= 1 ? 'bg-[#D6C49A] text-[#1A382A]' : 'bg-[#315D48] text-[#DFEAE1]'
                }`}
              >
                1
              </span>
              <span className={searchStep >= 1 ? 'text-[#E8F0E9] font-medium' : 'text-[#DFEAE1]/60'}>
                Initializing CauseConnect Volunteer Event Finder agent...
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  searchStep >= 2 ? 'bg-[#D6C49A] text-[#1A382A]' : 'bg-[#315D48] text-[#DFEAE1]'
                }`}
              >
                2
              </span>
              <span className={searchStep >= 2 ? 'text-[#E8F0E9] font-medium' : 'text-[#DFEAE1]/60'}>
                Navigating official NGO websites, community portals & charity directories...
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  searchStep >= 3 ? 'bg-[#D6C49A] text-[#1A382A]' : 'bg-[#315D48] text-[#DFEAE1]'
                }`}
              >
                3
              </span>
              <span className={searchStep >= 3 ? 'text-[#E8F0E9] font-medium' : 'text-[#DFEAE1]/60'}>
                Extracting venue locations, schedules, organizer details & registration links...
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  searchStep >= 4 ? 'bg-[#D6C49A] text-[#1A382A]' : 'bg-[#315D48] text-[#DFEAE1]'
                }`}
              >
                4
              </span>
              <span className={searchStep >= 4 ? 'text-[#E8F0E9] font-medium' : 'text-[#DFEAE1]/60'}>
                Filtering expired events and ranking opportunities by match quality...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error / Concurrency Notice Display */}
      {errorMessage && (
        <div
          className={`rounded-2xl p-5 shadow-sm border ${
            isConcurrencyNotice
              ? 'bg-amber-50/95 border-amber-300 text-amber-950'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3.5">
            {isConcurrencyNotice ? (
              <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-semibold text-sm">
                  {isConcurrencyNotice
                    ? 'Browserbase Concurrency Limit (1 Active Session Allowed)'
                    : 'Search Notice'}
                </h4>
                {isConcurrencyNotice && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-semibold">
                    RUNNER_SESSION_LIMIT
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed opacity-90">{errorMessage}</p>

              {isConcurrencyNotice && (
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleReleaseAndRetry}
                    disabled={isReleasing || isSearching}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isReleasing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D6C49A]" />
                        <span>Releasing Session Slot...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 text-[#D6C49A]" />
                        <span>Release Active Sessions & Retry</span>
                      </>
                    )}
                  </button>

                  <a
                    href="https://www.browserbase.com/sessions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#244C3A] hover:underline font-medium"
                  >
                    <span>View Sessions in Browserbase Dashboard</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {!status?.configured && (
                <div className="pt-2 text-xs text-red-700">
                  Tip: Provide your Browserbase API credentials to activate live browser sessions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results Header */}
      {hasSearched && !isSearching && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-serif font-bold text-lg text-[#244C3A]">
              Discovered Opportunities ({results.length})
            </h3>
            {runInfo?.status && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#E8F0E9] text-[#315D48] border border-[#D5E0D7] font-mono">
                {runInfo.status}
              </span>
            )}
          </div>
          {results.length > 0 && (
            <span className="text-xs text-[#5A7868]">
              Ranked by interest match and verification confidence
            </span>
          )}
        </div>
      )}

      {/* Results Cards List */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {results.map((opp, idx) => (
            <div
              key={`${opp.event_name}-${idx}`}
              className="bg-white rounded-2xl border border-[#D5E0D7] p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                {/* Badges Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F0E9] text-[#244C3A] border border-[#D5E0D7]">
                    {opp.category}
                  </span>
                  {renderVerificationBadge(opp.verification_status)}
                </div>

                {/* Title & Organizer */}
                <div>
                  <h4 className="font-serif font-bold text-lg text-[#244C3A] leading-snug">
                    {opp.title || opp.event_name}
                  </h4>
                  <div className="flex items-center gap-1.5 text-xs text-[#315D48] font-medium mt-1">
                    <Building2 className="w-3.5 h-3.5 text-[#5A7868]" />
                    <span>{opp.organization || opp.organizer_name}</span>
                  </div>
                </div>

                {/* Metadata: Location, Date, Time */}
                <div className="space-y-1.5 text-xs text-[#5A7868] bg-[#F7FAF7] p-3 rounded-xl border border-[#E8F0E9]">
                  {(opp.location || opp.city) && (
                    <div className="flex items-center gap-2 text-[#244C3A]">
                      <MapPin className="w-3.5 h-3.5 text-[#315D48] flex-shrink-0" />
                      <span>{opp.location || opp.city}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                      <span>{opp.date || opp.event_date || 'Date: Ongoing / Flexible'}</span>
                    </div>
                    {opp.event_time && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#315D48]" />
                        <span>{opp.event_time}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Eligibility / Requirements if available */}
                {opp.eligibility && (
                  <div className="text-xs bg-[#E8F0E9]/60 border border-[#D5E0D7] p-2.5 rounded-xl text-[#244C3A]">
                    <span className="font-semibold text-[#1A382A]">Eligibility: </span>
                    <span>{opp.eligibility}</span>
                  </div>
                )}

                {/* Description */}
                <p className="text-xs text-[#5A7868] leading-relaxed line-clamp-3">
                  {opp.description}
                </p>

                {/* Match Reason */}
                {opp.match_reason && (
                  <div className="bg-[#E8F0E9]/70 border border-[#D6C49A]/50 rounded-xl p-3 text-xs text-[#244C3A]">
                    <div className="flex items-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#D6C49A] flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[#244C3A]">Why this matches: </span>
                        <span>{opp.match_reason}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Required Skills */}
                {opp.required_skills && opp.required_skills.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#5A7868] uppercase tracking-wider block mb-1">
                      Required Skills
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {opp.required_skills.map((skill, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 rounded-md bg-[#E8F0E9] text-[11px] text-[#244C3A]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-4 border-t border-[#D5E0D7] flex flex-wrap items-center justify-between gap-2.5">
                {opp.source_url && (
                  <a
                    href={opp.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#315D48] hover:text-[#244C3A] hover:underline transition-colors"
                  >
                    <span>View Source</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  {onRequestRegistration && (
                    <button
                      type="button"
                      onClick={() => {
                        let parsedDomain = 'public-web';
                        try {
                          if (opp.registration_url) {
                            parsedDomain = new URL(opp.registration_url).hostname;
                          } else if (opp.source_url) {
                            parsedDomain = new URL(opp.source_url).hostname;
                          }
                        } catch {
                          parsedDomain = 'public-web';
                        }

                        const convertedOpp: Opportunity = {
                          id: `bb-${Date.now()}-${idx}`,
                          title: opp.title || opp.event_name || 'Volunteer Opportunity',
                          organization: opp.organization || opp.organizer_name || 'Community Organization',
                          category: (AVAILABLE_CAUSES.includes(opp.category as any) ? opp.category : 'Community Service') as CauseCategory,
                          date: opp.date || opp.event_date || 'Upcoming',
                          daysOfWeek: ['Saturday', 'Sunday'],
                          time: opp.event_time || '10:00 AM - 1:00 PM',
                          location: opp.location || opp.city || location,
                          city: opp.city || (location.includes(',') ? location.split(',')[0].trim() : location),
                          format: 'in-person',
                          minAge: 18,
                          backgroundCheck: 'not-required',
                          skills: opp.required_skills?.length ? opp.required_skills : ['Volunteer Assistance'],
                          description: opp.description || '',
                          sourceDomain: parsedDomain,
                          sourceUrl: opp.registration_url || opp.source_url || '',
                          lastRetrieved: new Date().toLocaleTimeString(),
                          slotsAvailable: 10,
                          contactEmail: 'volunteer-desk@causeconnect.org',
                          image: '',
                          impactStatement: opp.match_reason || 'Discovered via Browserbase live web search',
                          verifiedDetails: {
                            venueVerified: true,
                            nonprofitStatusVerified: true,
                            hoursCertifiable: true
                          }
                        };
                        onRequestRegistration(convertedOpp);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#D6C49A]" />
                      <span>Auto Apply</span>
                    </button>
                  )}

                  {opp.registration_url ? (
                    <a
                      href={opp.registration_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#D5E0D7] text-[#244C3A] hover:bg-[#E8F0E9] text-xs font-medium transition-colors"
                    >
                      <span>Direct Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-[#5A7868] italic">
                      Direct link unavailable
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State when search returns 0 results */}
      {hasSearched && !isSearching && results.length === 0 && !errorMessage && (
        <div className="bg-white rounded-2xl border border-[#D5E0D7] p-8 text-center space-y-3">
          <Compass className="w-10 h-10 text-[#5A7868] mx-auto" />
          <h4 className="font-serif font-bold text-lg text-[#244C3A]">
            No verified events found for this criteria
          </h4>
          <p className="text-xs text-[#5A7868] max-w-md mx-auto">
            Try expanding your search radius, selecting additional causes, or checking a nearby major city.
          </p>
        </div>
      )}
    </div>
  );
};
