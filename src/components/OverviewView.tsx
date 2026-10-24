import React from 'react';
import {
  Clock,
  CheckCircle2,
  Calendar,
  Sparkles,
  Award,
  ArrowRight,
  TrendingUp,
  Heart,
  Users,
  Compass,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { ImpactMetrics, Opportunity, Registration, VolunteerProfile } from '../types';

interface OverviewViewProps {
  metrics: ImpactMetrics;
  registrations: Registration[];
  opportunities: Opportunity[];
  userProfile: VolunteerProfile;
  onGoToView: (view: 'discover' | 'matches' | 'registered' | 'profile') => void;
  onViewDetails: (opp: Opportunity) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  metrics,
  registrations,
  opportunities,
  userProfile,
  onGoToView,
  onViewDetails
}) => {
  const upcomingRegs = registrations.filter((r) => r.status === 'confirmed' || r.status === 'pending_approval');
  const nextEvent = upcomingRegs[0];

  const causeDiversity = React.useMemo(() => {
    const causes = userProfile.preferredCauses && userProfile.preferredCauses.length > 0
      ? userProfile.preferredCauses
      : ['Community Service'];
    const count = Math.min(causes.length, 4);
    const slice = causes.slice(0, count);
    const colors = ['#244C3A', '#315D48', '#3B6B54', '#5A7868', '#D6C49A'];
    const basePercent = Math.floor(100 / count);
    return slice.map((name, i) => ({
      name,
      percent: i === count - 1 ? 100 - (basePercent * (count - 1)) : basePercent,
      color: colors[i % colors.length]
    }));
  }, [userProfile.preferredCauses]);

  return (
    <div className="space-y-6">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#244C3A] font-bold tracking-tight">
            Impact Dashboard
          </h1>
          <p className="text-sm sm:text-base text-[#244C3A]/75 mt-1 font-normal">
            Welcome back, {userProfile.name}. Track your volunteer journey and social-impact milestones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onGoToView('discover')}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-[#244C3A] text-white hover:bg-[#315D48] transition-colors shadow-xs"
          >
            Find Next Opportunity
          </button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Hours Volunteered */}
        <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#244C3A]/70">
            <span>Hours Volunteered</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F0E9] flex items-center justify-center text-[#315D48]">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="font-serif text-3xl sm:text-4xl font-bold text-[#244C3A]">
              {metrics.totalHoursVolunteered} <span className="text-base font-normal text-[#244C3A]/60">hrs</span>
            </div>
            <div className="mt-2 w-full bg-[#E8F0E9] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#244C3A] h-full rounded-full"
                style={{ width: `${Math.min(100, (metrics.totalHoursVolunteered / 50) * 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-[#244C3A]/60 mt-1.5 flex justify-between">
              <span>Goal: 50 hrs / year</span>
              <span>{Math.round((metrics.totalHoursVolunteered / 50) * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Events Attended */}
        <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#244C3A]/70">
            <span>Completed Events</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F0E9] flex items-center justify-center text-[#315D48]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="font-serif text-3xl sm:text-4xl font-bold text-[#244C3A]">
              {metrics.eventsCompleted}
            </div>
            <div className="text-xs text-[#315D48] font-medium mt-1">
              Verified organization sign-offs
            </div>
          </div>
        </div>

        {/* Upcoming Shifts */}
        <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#244C3A]/70">
            <span>Upcoming Shifts</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F0E9] flex items-center justify-center text-[#315D48]">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="font-serif text-3xl sm:text-4xl font-bold text-[#244C3A]">
              {upcomingRegs.length}
            </div>
            <button
              onClick={() => onGoToView('registered')}
              className="text-xs text-[#315D48] font-semibold hover:underline mt-1 flex items-center gap-1"
            >
              <span>View schedule</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* People / Cause Reach */}
        <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#244C3A]/70">
            <span>Community Reach</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F0E9] flex items-center justify-center text-[#315D48]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="font-serif text-3xl sm:text-4xl font-bold text-[#244C3A]">
              {metrics.peopleImpacted}+
            </div>
            <div className="text-xs text-[#244C3A]/70 mt-1">
              Beneficiaries impacted
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Next Volunteer Shift & Cause Diversity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Next Shift Spotlight Card */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#244C3A]/70">
                Next Upcoming Commitment
              </span>
              {nextEvent && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F0E9] text-[#244C3A]">
                  {nextEvent.category}
                </span>
              )}
            </div>

            {nextEvent ? (
              <div className="space-y-3">
                <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
                  {nextEvent.opportunityTitle}
                </h3>
                <p className="text-xs font-medium text-[#315D48]">
                  {nextEvent.organization}
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs text-[#244C3A]/80 pt-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#315D48]" />
                    <span>{nextEvent.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#315D48]" />
                    <span>{nextEvent.time}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#315D48]" />
                    <span>{nextEvent.location}</span>
                  </div>
                </div>

                {nextEvent.userNotes && (
                  <div className="p-3 bg-[#E8F0E9] rounded-xl text-xs text-[#244C3A]/80 border border-[#D5E0D7]/80">
                    <span className="font-semibold text-[#244C3A]">Your notes:</span> {nextEvent.userNotes}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-[#244C3A]/70 text-sm">
                No upcoming commitments scheduled. Browse opportunities to make an impact!
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-[#D5E0D7] flex items-center justify-between">
            <button
              onClick={() => onGoToView('registered')}
              className="text-xs font-semibold text-[#315D48] hover:underline"
            >
              Manage all registrations →
            </button>
            <button
              onClick={() => onGoToView('matches')}
              className="px-4 py-2 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] transition-colors"
            >
              See New Matches
            </button>
          </div>
        </div>

        {/* Cause Diversity Breakdown */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#244C3A]/70">
                Cause Impact Diversity
              </span>
              <span className="text-xs font-semibold text-[#315D48]">
                {metrics.causesSupportedCount} Causes Active
              </span>
            </div>

            <p className="text-xs text-[#244C3A]/75 leading-relaxed mb-4">
              CauseConnect celebrates balanced social impact across multiple domains.
            </p>

            <div className="space-y-3">
              {causeDiversity.map((cause) => (
                <div key={cause.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-[#244C3A]">{cause.name}</span>
                    <span className="font-bold text-[#244C3A]">{cause.percent}%</span>
                  </div>
                  <div className="w-full bg-[#E8F0E9] h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${cause.percent}%`, backgroundColor: cause.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#D5E0D7] text-[11px] text-[#244C3A]/60 flex items-center justify-between">
            <span>Balanced volunteer footprint</span>
            <span className="text-emerald-700 font-semibold">✓ Well rounded</span>
          </div>
        </div>
      </div>

      {/* Achievements / Badges Section */}
      <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-xl font-bold text-[#244C3A]">
              Impact Badges & Achievements
            </h3>
            <p className="text-xs text-[#244C3A]/70 mt-0.5">
              Milestones unlocked through verified volunteer contributions.
            </p>
          </div>
          <span className="text-xs font-bold text-[#315D48] bg-[#E8F0E9] px-3 py-1 rounded-full">
            {metrics.badgesUnlocked.length} Badges Earned
          </span>
        </div>

        {metrics.badgesUnlocked.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-[#D5E0D7] bg-[#E8F0E9]/40 text-center space-y-2">
            <Award className="w-8 h-8 text-[#5A7868] mx-auto opacity-50" />
            <div className="text-xs font-bold text-[#244C3A]">No Badges Unlocked Yet</div>
            <p className="text-[11px] text-[#59665C] max-w-sm mx-auto leading-relaxed">
              Complete verified volunteer shifts and log hours to earn community milestone badges.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {metrics.badgesUnlocked.map((badge) => (
              <div
                key={badge.id}
                className="p-4 rounded-xl border border-[#D5E0D7] bg-[#E8F0E9]/60 flex items-start gap-3.5 hover:bg-[#E8F0E9] transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#244C3A] flex items-center justify-center text-[#D6C49A] shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[#244C3A]">{badge.title}</div>
                  <div className="text-[11px] text-[#244C3A]/75 leading-snug">{badge.description}</div>
                  <div className="text-[10px] text-[#315D48] font-medium pt-1">Unlocked {badge.earnedDate}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Opportunities Carousel/Strip */}
      <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-xl font-bold text-[#244C3A]">
              Recommended for your Skills & Causes
            </h3>
            <span className="text-xs font-semibold text-[#315D48] bg-[#E8F0E9] px-2.5 py-0.5 rounded-full">
              Explainable AI
            </span>
          </div>
          <button
            onClick={() => onGoToView('discover')}
            className="text-xs font-semibold text-[#244C3A] hover:text-[#315D48] flex items-center gap-1 cursor-pointer"
          >
            <span>Browse all listings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {opportunities.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-[#D5E0D7] bg-[#E8F0E9]/40 text-center space-y-3">
            <Compass className="w-8 h-8 text-[#5A7868] mx-auto opacity-50" />
            <div className="text-sm font-bold text-[#244C3A]">No Volunteer Opportunities Active</div>
            <p className="text-xs text-[#59665C] max-w-md mx-auto leading-relaxed">
              There are currently no listings in the Supabase database. Visit the Discover tab to publish or view community opportunities.
            </p>
            <button
              onClick={() => onGoToView('discover')}
              className="px-4 py-2 bg-[#244C3A] text-white rounded-xl text-xs font-semibold hover:bg-[#315D48] transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Explore Opportunities</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {opportunities.slice(0, 3).map((opp) => (
              <div
                key={opp.id}
                onClick={() => onViewDetails(opp)}
                className="p-4 rounded-xl border border-[#D5E0D7] hover:border-[#244C3A]/40 transition-all cursor-pointer flex flex-col justify-between space-y-3 bg-[#FFFFFF]"
              >
                <div>
                  <span className="text-[10px] font-semibold text-[#244C3A] bg-[#E8F0E9] px-2 py-0.5 rounded-full">
                    {opp.category}
                  </span>
                  <h4 className="font-serif text-base font-bold text-[#244C3A] mt-2 line-clamp-1 hover:text-[#315D48]">
                    {opp.title}
                  </h4>
                  <p className="text-xs text-[#244C3A]/70 line-clamp-2 mt-1">
                    {opp.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#D5E0D7]/50 flex items-center justify-between text-xs text-[#244C3A]/70">
                  <span>{opp.date}</span>
                  <span className="text-[#315D48] font-semibold">View Details →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
