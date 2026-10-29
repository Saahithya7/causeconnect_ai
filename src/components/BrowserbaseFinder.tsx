import React, { useState } from 'react';
import {
  Globe,
  Compass,
  Search,
  ShieldAlert,
  Calendar,
  Clock,
  MapPin,
  Building2,
  ExternalLink,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type {
  BrowserbaseOpportunity,
  BrowserbaseVerificationStatus,
  VolunteerProfile,
  CauseCategory
} from '../types';
import { searchVolunteerOpportunities } from '../services/browserbaseService';

interface BrowserbaseFinderProps {
  userProfile?: VolunteerProfile;
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
  userProfile
}) => {
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
  const [sourceSummary, setSourceSummary] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

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
    setSourceSummary(null);
    setIsSearching(true);
    setSearchStep(1);

    try {
      const response = await searchVolunteerOpportunities({
        location: location.trim(),
        interests: selectedInterests,
        preferred_dates: preferredDates.trim() || null,
        radius,
        max_results: maxResults
      });

      setResults(response.success ? response.opportunities : []);
      setSourceSummary(response.sourceSummary || response.message || null);
      setErrorMessage(response.success ? null : response.error || 'Live event discovery failed.');
      setHasSearched(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error executing live Playwright discovery.');
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

  const renderVerificationBadge = (status: BrowserbaseVerificationStatus) => {
    switch (status) {
      case 'unverified':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            Listing not independently verified
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
              <span>Playwright & Chromium Live Discovery</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
              CauseConnect Volunteer Event Finder
            </h2>
            <p className="mt-2 text-[#DFEAE1] text-sm sm:text-base leading-relaxed">
              Searches live volunteer listings using server-side Playwright. Only event details and links present on the source pages are shown; listings are not independently verified.
            </p>
          </div>

          <div className="flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1A382A] border border-[#244C3A]/80 text-xs text-white">
              <Globe className="w-3.5 h-3.5 text-[#D6C49A]" />
              <span className="font-medium text-[#E8F0E9]">Playwright Chromium</span>
            </div>
          </div>
        </div>
      </div>

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
              <span>Live source listings are not independently verified; complete registration on the organization’s page.</span>
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

      {/* Live browser progress */}
      {isSearching && (
        <div className="bg-[#1A382A] text-white rounded-2xl p-6 border border-[#315D48] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 text-[#D6C49A] animate-spin" />
              <h3 className="font-serif font-semibold text-base text-white">
                Playwright live search in progress
              </h3>
            </div>
            <span className="text-xs text-[#D6C49A] font-mono">Chromium browser session</span>
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
                Starting a Playwright Chromium browser...
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
                Opening the live volunteer search page...
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
                Reading event details and original links present on the page...
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
                Returning only source-linked listings found on the page...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Live search failure */}
      {errorMessage && (
        <div className="rounded-2xl p-5 shadow-sm border bg-red-50 border-red-200 text-red-900">
          <div className="flex items-start gap-3.5">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-semibold text-sm">Live search failed</h4>
              </div>
              <p className="text-xs leading-relaxed opacity-90">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Header */}
      {hasSearched && !isSearching && !errorMessage && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-serif font-bold text-lg text-[#244C3A]">
              Live results ({results.length})
            </h3>
          </div>
          {results.length > 0 && (
            <span className="text-xs text-[#5A7868]">
              {sourceSummary}
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
                  {opp.category && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F0E9] text-[#244C3A] border border-[#D5E0D7]">
                    {opp.category}
                  </span>}
                  {renderVerificationBadge(opp.verification_status)}
                </div>

                {/* Title & Organizer */}
                <div>
                  <h4 className="font-serif font-bold text-lg text-[#244C3A] leading-snug">
                    {opp.title || opp.event_name}
                  </h4>
                  {(opp.organization || opp.organizer_name) && <div className="flex items-center gap-1.5 text-xs text-[#315D48] font-medium mt-1">
                    <Building2 className="w-3.5 h-3.5 text-[#5A7868]" />
                    <span>{opp.organization || opp.organizer_name}</span>
                  </div>}
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
                    {(opp.date || opp.event_date) && <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                      <span>{opp.date || opp.event_date}</span>
                    </div>}
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
                {opp.description && <p className="text-xs text-[#5A7868] leading-relaxed line-clamp-3">
                  {opp.description}
                </p>}
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
                  {opp.registration_url ? (
                    <a
                      href={opp.registration_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#D5E0D7] text-[#244C3A] hover:bg-[#E8F0E9] text-xs font-medium transition-colors"
                    >
                      <span>Registration Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-[#5A7868] italic">
                      Registration link not listed on source
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
            No live event listings found
          </h4>
          <p className="text-xs text-[#5A7868] max-w-md mx-auto">
            {sourceSummary || 'The live search completed but returned no source-linked event listings.'}
          </p>
        </div>
      )}
    </div>
  );
};
