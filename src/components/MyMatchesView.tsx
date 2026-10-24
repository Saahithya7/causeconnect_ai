import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Calendar,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Filter,
  ArrowRight
} from 'lucide-react';
import { Opportunity, VolunteerProfile, MatchExplanation } from '../types';
import { calculateMatchScore } from '../services/matchingService';

interface MyMatchesViewProps {
  opportunities: Opportunity[];
  userProfile: VolunteerProfile;
  onViewDetails: (opp: Opportunity) => void;
  onRequestRegistration: (opp: Opportunity) => void;
  registeredOppIds: string[];
  onGoToProfile: () => void;
}

export const MyMatchesView: React.FC<MyMatchesViewProps> = ({
  opportunities,
  userProfile,
  onViewDetails,
  onRequestRegistration,
  registeredOppIds,
  onGoToProfile
}) => {
  const [filterTier, setFilterTier] = useState<'all' | 'high' | 'verified'>('all');
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  // Compute match explanations for all opportunities
  const matches = useMemo(() => {
    return opportunities
      .map((opp) => ({
        opportunity: opp,
        explanation: calculateMatchScore(userProfile, opp)
      }))
      .sort((a, b) => b.explanation.totalScore - a.explanation.totalScore);
  }, [opportunities, userProfile]);

  const filteredMatches = useMemo(() => {
    return matches.filter((item) => {
      if (filterTier === 'high') return item.explanation.totalScore >= 80;
      if (filterTier === 'verified') return item.explanation.verifiedEligibility;
      return true;
    });
  }, [matches, filterTier]);

  const toggleExpand = (id: string) => {
    setExpandedMatchId(expandedMatchId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-3xl sm:text-4xl text-[#244C3A] font-bold tracking-tight">
              My Matches
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F0E9] text-[#315D48] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Explainable AI
            </span>
          </div>
          <p className="text-sm sm:text-base text-[#244C3A]/75 mt-1 font-normal">
            Personalized opportunities ranked by verified cause alignment, skill fit, and availability.
          </p>
        </div>

        <button
          onClick={onGoToProfile}
          className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#D5DACA] bg-white text-[#244C3A] hover:bg-[#E8F0E9] transition-colors self-start sm:self-auto"
        >
          Edit Matching Preferences
        </button>
      </div>

      {/* Matching Criteria Banner */}
      <div className="p-4 bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 text-xs text-[#244C3A]/80">
          <div className="font-semibold text-[#244C3A]">
            Active Matching Profile: {userProfile.name} ({userProfile.city})
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <span className="text-[#244C3A]/60">Causes:</span>
            {userProfile.preferredCauses.map((c) => (
              <span key={c} className="font-medium text-[#244C3A]">
                {c} ·
              </span>
            ))}
            <span className="text-[#244C3A]/60 ml-2">Days:</span>
            <span className="font-medium text-[#244C3A]">{userProfile.preferredDays.join(', ')}</span>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 bg-[#E8F0E9] p-1 rounded-xl border border-[#D5E0D7] text-xs">
          <button
            onClick={() => setFilterTier('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterTier === 'all'
                ? 'bg-[#244C3A] text-white shadow-xs'
                : 'text-[#244C3A]/70 hover:text-[#244C3A]'
            }`}
          >
            All ({matches.length})
          </button>
          <button
            onClick={() => setFilterTier('high')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterTier === 'high'
                ? 'bg-[#244C3A] text-white shadow-xs'
                : 'text-[#244C3A]/70 hover:text-[#244C3A]'
            }`}
          >
            Top Matches (80%+)
          </button>
          <button
            onClick={() => setFilterTier('verified')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterTier === 'verified'
                ? 'bg-[#244C3A] text-white shadow-xs'
                : 'text-[#244C3A]/70 hover:text-[#244C3A]'
            }`}
          >
            Verified Nonprofits
          </button>
        </div>
      </div>

      {/* Matches List or Clean Empty State */}
      {filteredMatches.length === 0 ? (
        <div className="bg-white border border-[#D5E0D7] rounded-3xl p-10 sm:p-14 text-center space-y-4 shadow-xs">
          <Sparkles className="w-12 h-12 text-[#5A7868] mx-auto opacity-60" />
          <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
            No Matching Opportunities Available
          </h3>
          <p className="text-xs sm:text-sm text-[#59665C] max-w-md mx-auto leading-relaxed">
            {opportunities.length === 0
              ? 'There are currently no active opportunities in the database to calculate affinity rankings. Once opportunities are published in Supabase, they will appear here scored according to your causes and skills.'
              : 'None of the active opportunities match your selected filter tier. Try viewing all matches or adjusting your profile causes and skills.'}
          </p>
          <div className="pt-2">
            <button
              onClick={onGoToProfile}
              className="px-5 py-2.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
            >
              Update Volunteer Profile Criteria
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map(({ opportunity: opp, explanation: exp }) => {
            const isExpanded = expandedMatchId === opp.id;
            const isRegistered = registeredOppIds.includes(opp.id);

          return (
            <div
              key={opp.id}
              className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl shadow-xs overflow-hidden transition-all hover:border-[#244C3A]/40"
            >
              {/* Main Match Row */}
              <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                {/* Left info */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F0E9] text-[#244C3A]">
                      {opp.category}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F0E9] text-[#315D48] border border-[#D5DACA]">
                      {exp.totalScore}% Match Score
                    </span>
                    {exp.verifiedEligibility && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified
                      </span>
                    )}
                  </div>

                  <h3
                    onClick={() => onViewDetails(opp)}
                    className="font-serif text-xl sm:text-2xl font-bold text-[#244C3A] hover:text-[#315D48] cursor-pointer"
                  >
                    {opp.title}
                  </h3>

                  <p className="text-xs text-[#244C3A]/70 font-medium">
                    {opp.organization} · {opp.impactStatement}
                  </p>

                  <div className="flex flex-wrap gap-4 text-xs text-[#244C3A]/80 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                      <span>{opp.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#315D48]" />
                      <span>{opp.location}</span>
                    </div>
                  </div>
                </div>

                {/* Right score dial & action buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                  <button
                    onClick={() => toggleExpand(opp.id)}
                    className="px-4 py-2.5 rounded-xl border border-[#D5DACA] bg-[#E8F0E9] hover:bg-[#E8F0E9] text-[#244C3A] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>{isExpanded ? 'Hide Breakdown' : 'Explain Match'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => onRequestRegistration(opp)}
                    disabled={isRegistered}
                    className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isRegistered
                        ? 'bg-[#E8F0E9] text-[#244C3A]/60 cursor-not-allowed'
                        : 'bg-[#244C3A] hover:bg-[#315D48] text-white shadow-xs'
                    }`}
                  >
                    {isRegistered ? 'Request Sent' : 'Request Registration'}
                  </button>
                </div>
              </div>

              {/* Expandable Mathematical Match Breakdown */}
              {isExpanded && (
                <div className="bg-[#E8F0E9] border-t border-[#D5E0D7] p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#D5E0D7]/80 pb-2">
                    <span className="font-serif font-bold text-sm text-[#244C3A]">
                      Explainable Score Breakdown (Total: {exp.totalScore}/100)
                    </span>
                    <span className="text-[11px] text-[#315D48] font-medium">
                      Calculated from your verified profile criteria
                    </span>
                  </div>

                  {/* 4 Score Pillars */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Pillar 1: Cause */}
                    <div className="bg-white p-3.5 rounded-xl border border-[#D5E0D7] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#244C3A]/70 font-semibold">1. Cause Alignment</span>
                        <span className="font-bold text-[#244C3A]">
                          {exp.causeMatch.score} / {exp.causeMatch.max}
                        </span>
                      </div>
                      <div className="w-full bg-[#E8F0E9] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#244C3A] h-full rounded-full"
                          style={{ width: `${(exp.causeMatch.score / exp.causeMatch.max) * 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-[#244C3A]/80 leading-snug">
                        {exp.causeMatch.explanation}
                      </p>
                    </div>

                    {/* Pillar 2: Skills */}
                    <div className="bg-white p-3.5 rounded-xl border border-[#D5E0D7] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#244C3A]/70 font-semibold">2. Skills Fit</span>
                        <span className="font-bold text-[#244C3A]">
                          {exp.skillsMatch.score} / {exp.skillsMatch.max}
                        </span>
                      </div>
                      <div className="w-full bg-[#E8F0E9] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#244C3A] h-full rounded-full"
                          style={{ width: `${(exp.skillsMatch.score / exp.skillsMatch.max) * 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-[#244C3A]/80 leading-snug">
                        Matched: {exp.skillsMatch.matchedSkills.join(', ') || 'General support'}
                      </p>
                    </div>

                    {/* Pillar 3: Availability */}
                    <div className="bg-white p-3.5 rounded-xl border border-[#D5E0D7] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#244C3A]/70 font-semibold">3. Schedule Fit</span>
                        <span className="font-bold text-[#244C3A]">
                          {exp.availabilityMatch.score} / {exp.availabilityMatch.max}
                        </span>
                      </div>
                      <div className="w-full bg-[#E8F0E9] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#244C3A] h-full rounded-full"
                          style={{ width: `${(exp.availabilityMatch.score / exp.availabilityMatch.max) * 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-[#244C3A]/80 leading-snug">
                        {exp.availabilityMatch.explanation}
                      </p>
                    </div>

                    {/* Pillar 4: Location */}
                    <div className="bg-white p-3.5 rounded-xl border border-[#D5E0D7] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#244C3A]/70 font-semibold">4. Location & Mode</span>
                        <span className="font-bold text-[#244C3A]">
                          {exp.locationMatch.score} / {exp.locationMatch.max}
                        </span>
                      </div>
                      <div className="w-full bg-[#E8F0E9] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#244C3A] h-full rounded-full"
                          style={{ width: `${(exp.locationMatch.score / exp.locationMatch.max) * 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-[#244C3A]/80 leading-snug">
                        {exp.locationMatch.explanation}
                      </p>
                    </div>
                  </div>

                  {/* Eligibility notes */}
                  <div className="pt-2">
                    <div className="text-xs font-semibold text-[#244C3A] mb-1">
                      Eligibility & Transparency Verification:
                    </div>
                    <ul className="space-y-1">
                      {exp.eligibilityNotes.map((note, idx) => (
                        <li key={idx} className="text-xs text-[#244C3A]/80 flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#315D48] shrink-0" />
                          <span>{note}</span>
                        </li>
                      ))}
                      {exp.unconfirmedFields.map((field, idx) => (
                        <li key={idx} className="text-xs text-amber-800 flex items-center gap-2 font-medium">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Unconfirmed: {field}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
