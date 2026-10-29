import React, { useState, useMemo } from 'react';
import {
  Calendar,
  MapPin,
  User,
  Shield,
  ShieldAlert,
  ExternalLink,
  Search,
  RotateCcw,
  PlusCircle,
  Sparkles,
  Compass,
  CheckCircle2,
  Building2,
  Clock,
  Globe
} from 'lucide-react';
import { Opportunity, CauseCategory, VolunteerProfile } from '../types';
import { BrowserbaseFinder } from './BrowserbaseFinder';

interface DiscoverViewProps {
  opportunities: Opportunity[];
  onViewDetails: (opp: Opportunity) => void;
  onRequestRegistration: (opp: Opportunity) => void;
  registeredOppIds: string[];
  initialCauseFilter?: CauseCategory | 'all';
  onPublishClick?: () => void;
  onSeedOpportunities?: () => Promise<void>;
  isSeeding?: boolean;
  userProfile?: VolunteerProfile;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  opportunities,
  onViewDetails,
  onRequestRegistration,
  registeredOppIds,
  initialCauseFilter = 'all',
  onPublishClick,
  onSeedOpportunities,
  isSeeding = false,
  userProfile
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'browserbase'>('catalog');
  const [selectedCause, setSelectedCause] = useState<string>(initialCauseFilter);
  const [selectedSkill, setSelectedSkill] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedEligibility, setSelectedEligibility] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract unique filter options dynamically from real Supabase data
  const causeOptions: string[] = useMemo(() => {
    const set = new Set(opportunities.map((o) => o.category));
    return Array.from(set);
  }, [opportunities]);

  const skillOptions: string[] = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((o) => {
      o.skills.forEach((s) => {
        if (s && s !== 'No specific skills') set.add(s);
      });
    });
    return Array.from(set).sort();
  }, [opportunities]);

  const locationOptions: string[] = useMemo(() => {
    const set = new Set(opportunities.map((o) => o.location));
    return Array.from(set);
  }, [opportunities]);

  // Filter logic
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      // Cause filter
      if (selectedCause !== 'all' && opp.category !== selectedCause) {
        return false;
      }

      // Skill filter
      if (selectedSkill !== 'all') {
        const hasSkill = opp.skills.some(
          (s) => s.toLowerCase() === selectedSkill.toLowerCase()
        );
        if (!hasSkill) return false;
      }

      // Day filter
      if (selectedDay !== 'all') {
        const matchesDay = opp.daysOfWeek.some((d) => d === selectedDay);
        if (!matchesDay) return false;
      }

      // Location / Mode filter
      if (selectedLocation !== 'all') {
        if (selectedLocation === 'Online / Remote') {
          if (opp.format !== 'online' && !opp.location.toLowerCase().includes('remote')) {
            return false;
          }
        } else if (opp.location !== selectedLocation) {
          return false;
        }
      }

      // Eligibility filter
      if (selectedEligibility !== 'all') {
        if (selectedEligibility === 'no-background-check' && opp.backgroundCheck !== 'not-required') {
          return false;
        }
        if (selectedEligibility === 'all-ages' && (opp.minAge === 0 || opp.minAge > 16)) {
          return false;
        }
        if (selectedEligibility === 'verified-only' && !opp.verifiedDetails.venueVerified) {
          return false;
        }
      }

      // Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = opp.title.toLowerCase().includes(q);
        const matchesOrg = opp.organization.toLowerCase().includes(q);
        const matchesDesc = opp.description.toLowerCase().includes(q);
        const matchesCategory = opp.category.toLowerCase().includes(q);
        const matchesLocation = opp.location.toLowerCase().includes(q);
        const matchesSkills = opp.skills.some((s) => s.toLowerCase().includes(q));

        if (
          !matchesTitle &&
          !matchesOrg &&
          !matchesDesc &&
          !matchesCategory &&
          !matchesLocation &&
          !matchesSkills
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    opportunities,
    selectedCause,
    selectedSkill,
    selectedDay,
    selectedLocation,
    selectedEligibility,
    searchQuery
  ]);

  const resetFilters = () => {
    setSelectedCause('all');
    setSelectedSkill('all');
    setSelectedDay('all');
    setSelectedLocation('all');
    setSelectedEligibility('all');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedCause !== 'all' ||
    selectedSkill !== 'all' ||
    selectedDay !== 'all' ||
    selectedLocation !== 'all' ||
    selectedEligibility !== 'all' ||
    searchQuery !== '';

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#244C3A] font-bold tracking-tight">
            Discover Opportunities
          </h1>
          <p className="text-sm sm:text-base text-[#59665C] mt-1 font-normal">
            Browse the Supabase catalog or search live volunteer listings with Playwright.
          </p>
        </div>
      </div>

      {/* View Switcher: Database Catalog vs Live Playwright Discovery */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[#D5E0D7] pb-4">
        <div className="flex items-center gap-2 p-1 bg-[#E8F0E9] rounded-xl border border-[#D5E0D7] self-start">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'catalog'
                ? 'bg-[#244C3A] text-white shadow-xs'
                : 'text-[#244C3A] hover:bg-[#DFEAE1]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Verified Catalog ({opportunities.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('browserbase')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'browserbase'
                ? 'bg-[#244C3A] text-white shadow-xs'
                : 'text-[#244C3A] hover:bg-[#DFEAE1]'
            }`}
          >
            <Globe className="w-4 h-4 text-[#D6C49A]" />
            <span>Live Web Finder (Playwright Agent)</span>
          </button>
        </div>

        {activeTab === 'catalog' && onPublishClick && (
          <button
            onClick={onPublishClick}
            className="px-4 py-2.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4 text-[#D6C49A]" />
            <span>Publish Opportunity</span>
          </button>
        )}
      </div>

      {activeTab === 'browserbase' ? (
        <BrowserbaseFinder
          userProfile={userProfile}
        />
      ) : (
        <>
          {/* Filter Bar with Search and Dropdowns */}
      <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
        {/* Search input and reset button */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
            <input
              type="text"
              placeholder="Search opportunities by title, organization, cause, or skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-[#E8F0E9]/60 border border-[#D5E0D7] rounded-xl text-[#244C3A] placeholder-[#59665C]/50 focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30 focus:border-[#244C3A]"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-[#244C3A] bg-[#DFEAE1] hover:bg-[#C9CEC0] rounded-xl transition-colors border border-[#5A7868]/40 cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          )}
        </div>

        {/* 5 Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
          {/* 1. Causes */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-[#59665C] mb-1 uppercase tracking-wider">
              Cause Area
            </label>
            <select
              value={selectedCause}
              onChange={(e) => setSelectedCause(e.target.value)}
              className="w-full p-2.5 text-xs bg-[#E8F0E9]/70 border border-[#D5E0D7] rounded-xl text-[#244C3A] font-medium focus:outline-none focus:ring-1 focus:ring-[#244C3A]"
            >
              <option value="all">All Causes</option>
              {causeOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Skills */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-[#59665C] mb-1 uppercase tracking-wider">
              Skills
            </label>
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className="w-full p-2.5 text-xs bg-[#E8F0E9]/70 border border-[#D5E0D7] rounded-xl text-[#244C3A] font-medium focus:outline-none focus:ring-1 focus:ring-[#244C3A]"
            >
              <option value="all">All Skills</option>
              {skillOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Days of Week */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-[#59665C] mb-1 uppercase tracking-wider">
              Days
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full p-2.5 text-xs bg-[#E8F0E9]/70 border border-[#D5E0D7] rounded-xl text-[#244C3A] font-medium focus:outline-none focus:ring-1 focus:ring-[#244C3A]"
            >
              <option value="all">All Days</option>
              <option value="Saturday">Saturdays</option>
              <option value="Sunday">Sundays</option>
              <option value="Weekday">Weekdays</option>
            </select>
          </div>

          {/* 4. Location & Mode */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-[#59665C] mb-1 uppercase tracking-wider">
              Location
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full p-2.5 text-xs bg-[#E8F0E9]/70 border border-[#D5E0D7] rounded-xl text-[#244C3A] font-medium focus:outline-none focus:ring-1 focus:ring-[#244C3A]"
            >
              <option value="all">All Locations</option>
              <option value="Online / Remote">Remote / Online</option>
              {locationOptions
                .filter((l) => !l.toLowerCase().includes('remote') && !l.toLowerCase().includes('online'))
                .map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
            </select>
          </div>

          {/* 5. Eligibility & Vetting */}
          <div className="relative col-span-2 sm:col-span-1">
            <label className="block text-[11px] font-bold text-[#59665C] mb-1 uppercase tracking-wider">
              Eligibility Gate
            </label>
            <select
              value={selectedEligibility}
              onChange={(e) => setSelectedEligibility(e.target.value)}
              className="w-full p-2.5 text-xs bg-[#E8F0E9]/70 border border-[#D5E0D7] rounded-xl text-[#244C3A] font-medium focus:outline-none focus:ring-1 focus:ring-[#244C3A]"
            >
              <option value="all">Any Eligibility</option>
              <option value="no-background-check">No Background Check</option>
              <option value="all-ages">Teens & Students (Age &le; 16)</option>
              <option value="verified-only">Verified Nonprofits Only</option>
            </select>
          </div>
        </div>

        {/* Results Count Banner */}
        <div className="flex items-center justify-between text-xs text-[#59665C] pt-2 border-t border-[#D5E0D7]/80">
          <div>
            Showing <strong className="text-[#244C3A]">{filteredOpportunities.length}</strong> live opportunities
          </div>
          {hasActiveFilters && (
            <div className="text-[11px] text-[#5A7868]">
              Filters active · <button onClick={resetFilters} className="underline cursor-pointer">Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Empty State vs Cards Grid */}
      {opportunities.length === 0 ? (
        /* Empty Database State */
        <div className="bg-white border border-[#D5E0D7] rounded-3xl p-10 sm:p-14 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#DFEAE1] flex items-center justify-center text-[#244C3A] mx-auto">
            <Compass className="w-7 h-7 text-[#315D48]" />
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
              No Volunteer Opportunities Published Yet
            </h3>
            <p className="text-xs sm:text-sm text-[#59665C] leading-relaxed">
              There are currently no active volunteer listings in the Supabase <code>opportunities</code> table. You can publish a new community initiative or seed verified listings.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            {onPublishClick && (
              <button
                onClick={onPublishClick}
                className="px-5 py-2.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
              >
                <PlusCircle className="w-4 h-4 text-[#D6C49A]" />
                <span>Publish New Opportunity</span>
              </button>
            )}

            {onSeedOpportunities && (
              <button
                onClick={onSeedOpportunities}
                disabled={isSeeding}
                className="px-5 py-2.5 rounded-xl border border-[#5A7868]/40 bg-white hover:bg-[#E8F0E9] text-[#244C3A] text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4 text-[#315D48]" />
                <span>{isSeeding ? 'Seeding Database...' : 'Seed Verified Community Listings'}</span>
              </button>
            )}
          </div>
        </div>
      ) : filteredOpportunities.length === 0 ? (
        /* Filters Matched 0 */
        <div className="bg-white border border-[#D5E0D7] rounded-3xl p-10 text-center space-y-4">
          <Search className="w-10 h-10 text-[#5A7868] mx-auto opacity-50" />
          <h3 className="font-serif text-xl font-bold text-[#244C3A]">
            No opportunities match your filter criteria
          </h3>
          <p className="text-xs text-[#59665C] max-w-md mx-auto">
            Try adjusting your search keywords, cause category, or availability filters to see more results.
          </p>
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-[#244C3A] text-white rounded-xl text-xs font-semibold hover:bg-[#315D48] cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset all filters</span>
          </button>
        </div>
      ) : (
        /* Real Opportunities Grid (2 columns on large screens) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredOpportunities.map((opp) => {
            const isRegistered = registeredOppIds.includes(opp.id);

            return (
              <div
                key={opp.id}
                className="group bg-[#FFFFFF] border border-[#D5E0D7] rounded-3xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Visual Header Strip with Photographic Thumbnail */}
                  <div className="relative h-44 w-full overflow-hidden bg-[#244C3A]">
                    <img
                      src={opp.image}
                      alt={opp.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-104"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                    {/* Top tags */}
                    <div className="absolute top-3.5 left-3.5 flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#244C3A]/90 backdrop-blur-md text-[#E8F0E9] border border-white/20">
                        {opp.category}
                      </span>
                    </div>

                    {/* Title & Organization in photo banner */}
                    <div className="absolute bottom-3 left-4 right-4 text-white">
                      <h2
                        onClick={() => onViewDetails(opp)}
                        className="font-serif text-xl sm:text-2xl font-bold leading-tight tracking-tight hover:text-[#D6C49A] cursor-pointer"
                      >
                        {opp.title}
                      </h2>
                      <p className="text-xs text-[#DFEAE1] font-medium mt-0.5 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#D6C49A]" />
                        <span>{opp.organization}</span>
                      </p>
                    </div>
                  </div>

                  {/* Card Content Body */}
                  <div className="p-5 sm:p-6 space-y-4">
                    {/* Metadata Row 1: Date & Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-xs text-[#244C3A]/90">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#5A7868] shrink-0" />
                        <span className="font-semibold">{opp.date}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#5A7868] shrink-0" />
                        <span className="truncate">{opp.location}</span>
                      </div>
                    </div>

                    {/* Metadata Row 2: Age and Background Check */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-xs">
                      <div className="flex items-center gap-2 text-[#59665C]">
                        <User className="w-4 h-4 text-[#5A7868] shrink-0" />
                        <span>Min Age: <strong className="text-[#244C3A]">{opp.minAge > 0 ? `${opp.minAge}+` : 'Not specified'}</strong></span>
                      </div>

                      <div className="flex items-center gap-2">
                        {opp.backgroundCheck === 'required' ? (
                          <>
                            <Shield className="w-4 h-4 text-[#315D48] shrink-0" />
                            <span className="text-[#315D48] font-semibold">Background Check Required</span>
                          </>
                        ) : opp.backgroundCheck === 'not-required' ? (
                          <>
                            <Shield className="w-4 h-4 text-[#5A7868] shrink-0" />
                            <span className="text-[#59665C]">No Background Check Needed</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                            <span className="text-amber-800">Background Check Status Not Stated</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Skills Chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {opp.skills.length === 0 && (
                        <span className="text-xs text-[#59665C]">Required skills not provided</span>
                      )}
                      {opp.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E8F0E9] text-[#244C3A] border border-[#D5DACA]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Description excerpt */}
                    <p className="text-xs text-[#59665C] line-clamp-2 leading-relaxed">
                      {opp.description || 'Description not provided'}
                    </p>
                  </div>
                </div>

                {/* Card Footer with Provenance and Actions */}
                <div className="p-5 sm:p-6 pt-0 space-y-4">
                  {/* Verified Provenance */}
                  <div className="flex items-center justify-between text-xs text-[#59665C] pt-3 border-t border-[#D5E0D7]">
                    <div className="flex items-center gap-1.5 hover:text-[#244C3A]">
                      {opp.sourceUrl ? (
                        <>
                          <ExternalLink className="w-3.5 h-3.5 text-[#315D48]" />
                          <a
                            href={opp.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {opp.sourceDomain}
                          </a>
                        </>
                      ) : <span>Source URL not provided</span>}
                    </div>
                    <span className="text-[11px] text-[#5A7868]">{opp.lastRetrieved}</span>
                  </div>

                  {/* Action Buttons: view details or continue manually */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => onViewDetails(opp)}
                      className="w-full py-2.5 px-4 rounded-xl border border-[#5A7868]/50 bg-[#FFFFFF] hover:bg-[#E8F0E9] text-[#244C3A] text-xs sm:text-sm font-bold transition-colors cursor-pointer text-center"
                    >
                      View Details
                    </button>

                    <button
                      onClick={() => onRequestRegistration(opp)}
                      disabled={isRegistered}
                      aria-label={isRegistered ? 'Application Already Recorded' : `Apply manually to ${opp.title}`}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                        isRegistered
                          ? 'bg-[#DFEAE1] text-[#244C3A]/60 cursor-not-allowed'
                          : 'bg-[#244C3A] hover:bg-[#315D48] text-white shadow-xs'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#D6C49A] shrink-0" />
                      <span>{isRegistered ? 'Application Recorded' : 'Apply Manually'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
};
