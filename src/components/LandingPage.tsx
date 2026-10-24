import React, { useState } from 'react';
import {
  Sparkles,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  HeartPulse,
  Users,
  PawPrint,
  Heart,
  Flame,
  Leaf,
  Eye,
  DollarSign,
  CheckCircle2,
  Calendar,
  MapPin,
  Clock,
  Compass,
  FileCheck,
  Award,
  ChevronRight
} from 'lucide-react';
import { Logo } from './Logo';
import { CauseCategory } from '../types';

interface LandingPageProps {
  onGoToApp: (targetView?: 'discover' | 'profile' | 'matches') => void;
  onGoToSignIn?: () => void;
  onSignInClick?: () => void;
  onSelectCauseFilter?: (cause: CauseCategory) => void;
  userProfile?: any;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onGoToApp,
  onGoToSignIn,
  onSignInClick,
  onSelectCauseFilter,
  userProfile
}) => {
  const [activeModal, setActiveModal] = useState<'about' | 'how-it-works' | 'privacy' | null>(null);
  const handleSignIn = onSignInClick || onGoToSignIn || (() => {});

  // 7 Core Cause Categories from Prompt
  const causeCategories = [
    {
      id: 'Education',
      category: 'Education' as CauseCategory,
      title: 'Education & Mentorship',
      subtitle: 'Tutoring, STEM workshops, literacy, and career coaching',
      image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80',
      tag: 'Education',
      points: ['After-school reading buddies', 'Weekend code club mentors', 'First-generation college prep', 'Adult digital literacy']
    },
    {
      id: 'Community Service',
      category: 'Community Service' as CauseCategory,
      title: 'Community & Social Welfare',
      subtitle: 'Surplus food rescue, community pantries, and meal outreach',
      image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=900&q=80',
      tag: 'Community',
      points: ['Pantry box sorting & packing', 'Hot meals distribution', 'Neighborhood mutual aid', 'Essential supply drives']
    },
    {
      id: 'Healthcare',
      category: 'Healthcare' as CauseCategory,
      title: 'Healthcare & Elderly Care',
      subtitle: 'Mobile clinic triage, senior companionship, and wellness outreach',
      image: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=900&q=80',
      tag: 'Healthcare & Care',
      points: ['Preventive health screening triage', 'Elderly digital companion visits', 'Mental health hotline support', 'Clinic records assistance']
    },
    {
      id: 'Animal Welfare',
      category: 'Animal Welfare' as CauseCategory,
      title: 'Animal Welfare & Rescue',
      subtitle: 'Shelter dog walking, kitten foster support, and wildlife rehabilitation',
      image: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80',
      tag: 'Animal Welfare',
      points: ['Shelter canine socialization', 'Foster pet transit coordinator', 'Adoption day event guides', 'Wildlife rescue support']
    },
    {
      id: 'Disaster Relief',
      category: 'Disaster Relief' as CauseCategory,
      title: 'Disaster Relief & Environment',
      subtitle: 'Emergency supply kits, flood restoration, and wetland conservation',
      image: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=900&q=80',
      tag: 'Relief & Eco',
      points: ['Emergency ration backpack kits', 'Rapid flood cleanup & triage', 'Riparian wetland debris clearing', 'Native flora restoration']
    },
    {
      id: 'Accessibility',
      category: 'Accessibility' as CauseCategory,
      title: 'Accessibility & Inclusion',
      subtitle: 'Audio textbook narration, wheelchair guide support, sensory events',
      image: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=900&q=80',
      tag: 'Inclusion',
      points: ['Audio textbook recording', 'Sensory-friendly event helper', 'Screen reader document QA', 'Paralympic community sports']
    },
    {
      id: 'Fundraising',
      category: 'Fundraising' as CauseCategory,
      title: 'Fundraising & Nonprofit Support',
      subtitle: 'Charity galas, grant proposal drafting, and digital storytelling',
      image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
      tag: 'Capacity Building',
      points: ['Charity campaign outreach', 'Donor appreciation management', 'Social media storytelling', 'Volunteer shift coordinating']
    }
  ];

  return (
    <div className="min-h-screen bg-[#1A382A] text-[#E8F0E9] selection:bg-[#D6C49A]/30 flex flex-col justify-between">
      {/* 1. Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#1A382A]/90 backdrop-blur-md border-b border-[#315D48]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo onClick={() => onGoToApp('discover')} />

          <nav className="hidden md:flex items-center gap-7 text-xs sm:text-sm font-medium text-[#DFEAE1]">
            <button
              onClick={() => setActiveModal('about')}
              className="hover:text-[#D6C49A] transition-colors"
            >
              About
            </button>
            <button
              onClick={() => onGoToApp('discover')}
              className="hover:text-[#D6C49A] transition-colors"
            >
              Explore Opportunities
            </button>
            <button
              onClick={() => setActiveModal('how-it-works')}
              className="hover:text-[#D6C49A] transition-colors"
            >
              How It Works
            </button>
            <button
              onClick={() => setActiveModal('privacy')}
              className="hover:text-[#D6C49A] transition-colors"
            >
              Trust & Privacy
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSignIn}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl text-[#E8F0E9] hover:text-[#D6C49A] transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => onGoToApp('profile')}
              className="px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white border border-[#D6C49A]/40 transition-all shadow-md"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="space-y-16 sm:space-y-24 pb-16">
        {/* 2. Editorial Hero Section with Asymmetrical Photographic Collage */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Headline & Content */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#244C3A] border border-[#315D48] text-xs font-semibold text-[#D6C49A]">
                <Sparkles className="w-3.5 h-3.5 text-[#D6C49A]" />
                <span>Explainable AI Volunteering Platform</span>
              </div>

              <h1 className="font-serif text-4xl sm:text-6xl text-[#E8F0E9] leading-[1.08] tracking-tight font-normal">
                Find your purpose.{' '}
                <span className="italic text-[#D6C49A] font-serif block sm:inline">
                  Make a difference.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-[#DFEAE1] leading-relaxed max-w-xl font-normal">
                Volunteering that fits your causes, skills and week. Every match score is mathematically explained. Every registration waits for your review and explicit approval. Nothing is submitted without you.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={() => onGoToApp('discover')}
                  className="px-6 py-3.5 rounded-xl bg-[#D6C49A] hover:bg-[#C8B385] text-[#244C3A] font-bold text-sm transition-all shadow-lg hover:shadow-xl flex items-center gap-2 cursor-pointer"
                >
                  <span>Find Opportunities</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onGoToApp('profile')}
                  className="px-6 py-3.5 rounded-xl border border-[#DFEAE1]/40 bg-[#244C3A]/70 hover:bg-[#244C3A] text-[#E8F0E9] font-semibold text-sm transition-all cursor-pointer"
                >
                  Create Your Profile
                </button>
              </div>

              {/* Verified Cause Category Quick Strip */}
              <div className="pt-4 border-t border-[#315D48]/60">
                <div className="text-xs uppercase tracking-wider font-semibold text-[#5A7868] mb-2">
                  Equal representation across 7 vital domains:
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {['Education', 'Food Pantry', 'Health Clinics', 'Animal Shelter', 'Senior Care', 'Disaster Prep', 'Accessibility'].map((badge) => (
                    <span
                      key={badge}
                      className="px-2.5 py-1 rounded-lg bg-[#244C3A]/80 text-[#DFEAE1] border border-[#315D48]/50"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Asymmetrical Photographic Grid Layout (Target Design Inspired) */}
            <div className="lg:col-span-6">
              <div className="grid grid-cols-12 gap-3 sm:gap-4">
                {/* Large Main Photo: Tutoring Children */}
                <div className="col-span-12 relative rounded-3xl overflow-hidden shadow-2xl border border-[#315D48]/60 aspect-[16/9] group">
                  <img
                    src="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80"
                    alt="Volunteers tutoring students in community school"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-103"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  <div className="absolute top-3.5 left-3.5">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#244C3A]/90 backdrop-blur-md text-[#D6C49A] border border-[#D6C49A]/30">
                      Education & Mentorship
                    </span>
                  </div>
                  <div className="absolute bottom-3.5 left-4 right-4 text-white">
                    <div className="font-serif text-lg sm:text-xl font-bold">
                      Weekend Reading & Code Mentors
                    </div>
                    <div className="text-xs text-[#DFEAE1]">
                      Empowering underserved students with creative literacy and STEM skills
                    </div>
                  </div>
                </div>

                {/* Sub-card Left: Food Pantry Outreach */}
                <div className="col-span-6 relative rounded-2xl overflow-hidden shadow-lg border border-[#315D48]/50 aspect-[4/3] group">
                  <img
                    src="https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=800&q=80"
                    alt="Community food program sorting groceries"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 text-white">
                    <span className="text-[10px] uppercase font-bold text-[#D6C49A]">Community Welfare</span>
                    <div className="text-xs font-semibold line-clamp-1">Surplus Food Rescue</div>
                  </div>
                </div>

                {/* Sub-card Right: Animal Shelter Care */}
                <div className="col-span-6 relative rounded-2xl overflow-hidden shadow-lg border border-[#315D48]/50 aspect-[4/3] group">
                  <img
                    src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=800&q=80"
                    alt="Animal rescue shelter volunteer walking dogs"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 text-white">
                    <span className="text-[10px] uppercase font-bold text-[#D6C49A]">Animal Care</span>
                    <div className="text-xs font-semibold line-clamp-1">Rescue Dog Socialization</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Three Core Pillars (Warm Ivory Panels) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-[#E8F0E9] text-[#244C3A] rounded-3xl p-8 shadow-xl border border-[#D5E0D7] hover:-translate-y-1 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#DFEAE1] flex items-center justify-center text-[#244C3A] mb-5">
                <Sparkles className="w-6 h-6 text-[#315D48]" />
              </div>
              <h3 className="font-serif text-2xl font-bold tracking-tight mb-2 text-[#244C3A]">
                Explained matches
              </h3>
              <p className="text-sm text-[#59665C] leading-relaxed">
                See exactly which interests, skills, free days, and commute limits earned each point. No opaque black-box recommendations.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-[#E8F0E9] text-[#244C3A] rounded-3xl p-8 shadow-xl border border-[#D5E0D7] hover:-translate-y-1 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#DFEAE1] flex items-center justify-center text-[#244C3A] mb-5">
                <UserCheck className="w-6 h-6 text-[#315D48]" />
              </div>
              <h3 className="font-serif text-2xl font-bold tracking-tight mb-2 text-[#244C3A]">
                Clear eligibility
              </h3>
              <p className="text-sm text-[#59665C] leading-relaxed">
                Age constraints and background-check rules are verified against nonprofit filings. Unknown details are flagged, never assumed.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-[#E8F0E9] text-[#244C3A] rounded-3xl p-8 shadow-xl border border-[#D5E0D7] hover:-translate-y-1 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#DFEAE1] flex items-center justify-center text-[#244C3A] mb-5">
                <ShieldCheck className="w-6 h-6 text-[#315D48]" />
              </div>
              <h3 className="font-serif text-2xl font-bold tracking-tight mb-2 text-[#244C3A]">
                You approve everything
              </h3>
              <p className="text-sm text-[#59665C] leading-relaxed">
                Review every piece of personal information before any registration is transmitted. Zero blind automated submissions.
              </p>
            </div>
          </div>
        </section>

        {/* 4. Complete Cause Categories Grid (Image-rich, Diverse, High Impact) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#244C3A] text-[#D6C49A] border border-[#315D48] uppercase tracking-wider">
                Multi-Cause Social Impact
              </span>
              <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#E8F0E9] mt-3">
                Explore All 7 Volunteering Causes
              </h2>
              <p className="text-sm sm:text-base text-[#DFEAE1] mt-1.5 max-w-2xl font-normal">
                CauseConnect is built for every type of community need. From education and clinics to animal shelters and disaster relief.
              </p>
            </div>

            <button
              onClick={() => onGoToApp('discover')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D6C49A] text-[#244C3A] font-bold text-xs sm:text-sm hover:bg-[#C8B385] transition-colors self-start md:self-auto cursor-pointer"
            >
              <span>Explore All Opportunities</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {causeCategories.map((cause) => (
              <div
                key={cause.id}
                className="bg-[#E8F0E9] text-[#244C3A] rounded-3xl overflow-hidden shadow-xl border border-[#D5E0D7] flex flex-col justify-between group hover:shadow-2xl transition-all"
              >
                <div>
                  {/* Photo Banner */}
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={cause.image}
                      alt={cause.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <span className="absolute top-3.5 left-3.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#244C3A]/90 backdrop-blur-md text-[#E8F0E9] border border-white/20">
                      {cause.tag}
                    </span>
                    <div className="absolute bottom-3 left-4 right-4 text-white">
                      <h3 className="font-serif text-xl font-bold leading-tight">
                        {cause.title}
                      </h3>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 space-y-4">
                    <p className="text-xs text-[#59665C] leading-relaxed">
                      {cause.subtitle}
                    </p>

                    <div className="space-y-1.5 pt-1">
                      {cause.points.map((pt, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-[#244C3A]/85">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#315D48] shrink-0" />
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="p-6 pt-0">
                  <button
                    onClick={() => {
                      if (onSelectCauseFilter) onSelectCauseFilter(cause.category);
                      onGoToApp('discover');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#5A7868]/40 bg-white hover:bg-[#DFEAE1] text-[#244C3A] text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Browse {cause.title.split('&')[0]} Roles</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Sage-Green Feature Section: How AI Matching Works */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="bg-[#DFEAE1] text-[#244C3A] rounded-3xl p-8 sm:p-12 shadow-2xl border border-[#5A7868]/30 space-y-8">
            <div className="max-w-3xl space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#244C3A] text-[#D6C49A] uppercase tracking-wider">
                Transparent Science
              </span>
              <h2 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#244C3A]">
                How Explainable AI Matching Works
              </h2>
              <p className="text-sm sm:text-base text-[#59665C] leading-relaxed">
                Rather than an obscure algorithm, CauseConnect scores opportunities on four transparent pillars with full volunteer inspection rights.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-[#5A7868]/20 shadow-xs space-y-2">
                <div className="text-xs font-bold text-[#315D48] uppercase tracking-wider">
                  Pillar 1 · 35 Points
                </div>
                <h4 className="font-serif text-xl font-bold text-[#244C3A]">
                  Cause Alignment
                </h4>
                <p className="text-xs text-[#59665C] leading-relaxed">
                  Evaluates alignment with your prioritized social causes across education, healthcare, animals, and relief.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#5A7868]/20 shadow-xs space-y-2">
                <div className="text-xs font-bold text-[#315D48] uppercase tracking-wider">
                  Pillar 2 · 30 Points
                </div>
                <h4 className="font-serif text-xl font-bold text-[#244C3A]">
                  Skills Fit
                </h4>
                <p className="text-xs text-[#59665C] leading-relaxed">
                  Matches your declared competencies—such as tutoring, coding, first aid, driving, and translation—to role needs.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#5A7868]/20 shadow-xs space-y-2">
                <div className="text-xs font-bold text-[#315D48] uppercase tracking-wider">
                  Pillar 3 · 20 Points
                </div>
                <h4 className="font-serif text-xl font-bold text-[#244C3A]">
                  Schedule & Availability
                </h4>
                <p className="text-xs text-[#59665C] leading-relaxed">
                  Checks weekend, weekday evening, or flexible hours to ensure you never face scheduling friction.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#5A7868]/20 shadow-xs space-y-2">
                <div className="text-xs font-bold text-[#315D48] uppercase tracking-wider">
                  Pillar 4 · 15 Points
                </div>
                <h4 className="font-serif text-xl font-bold text-[#244C3A]">
                  Location & Mode
                </h4>
                <p className="text-xs text-[#59665C] leading-relaxed">
                  Considers distance from your home city or verifies remote / online connectivity with zero commute.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Dark Forest Call-to-Action Panel */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#244C3A] to-[#315D48] p-8 sm:p-14 border border-[#D6C49A]/30 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-3 text-center md:text-left max-w-2xl">
              <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#E8F0E9] leading-tight">
                Ready to find a volunteer role you'll love?
              </h2>
              <p className="text-sm sm:text-base text-[#DFEAE1] leading-relaxed">
                Join thousands of volunteers creating positive social impact across education, community relief, healthcare, and animal care.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <button
                onClick={() => onGoToApp('profile')}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#D6C49A] hover:bg-[#C8B385] text-[#244C3A] font-bold text-sm shadow-xl transition-all cursor-pointer"
              >
                Create Volunteer Profile
              </button>
              <button
                onClick={() => onGoToApp('discover')}
                className="w-full sm:w-auto px-7 py-4 rounded-xl border border-white/30 hover:bg-white/10 text-white font-semibold text-sm transition-all cursor-pointer"
              >
                Browse Listings
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#315D48]/40 bg-[#244C3A]/40 py-8 px-6 text-xs text-[#DFEAE1]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>© 2026 CauseConnect AI. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => setActiveModal('about')} className="hover:text-[#D6C49A]">About Us</button>
            <button onClick={() => setActiveModal('how-it-works')} className="hover:text-[#D6C49A]">Matching Engine</button>
            <button onClick={() => setActiveModal('privacy')} className="hover:text-[#D6C49A]">Trust & Privacy Charter</button>
            <button onClick={onGoToSignIn} className="hover:text-[#D6C49A]">Volunteer Login</button>
          </div>
        </div>
      </footer>

      {/* Info Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#E8F0E9] text-[#244C3A] border border-[#D5E0D7] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-[#244C3A]/60 hover:text-[#244C3A] p-1.5 rounded-full hover:bg-[#DFEAE1]"
            >
              ✕
            </button>

            {activeModal === 'about' && (
              <div className="space-y-4">
                <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
                  About CauseConnect AI
                </h3>
                <p className="text-xs sm:text-sm text-[#59665C] leading-relaxed">
                  CauseConnect is an inclusive, AI-powered volunteer matching engine designed to connect individuals with verified opportunities across Education, Healthcare, Community Service, Food Relief, Animal Welfare, Senior Companionship, Disaster Response, and Accessibility.
                </p>
                <div className="p-4 bg-[#DFEAE1] rounded-xl space-y-2 text-xs text-[#244C3A]">
                  <div className="font-bold">Our Three Commitments:</div>
                  <div>1. Transparent explainable scoring, not opaque algorithms.</div>
                  <div>2. Clear eligibility checks with unconfirmed criteria flagged.</div>
                  <div>3. Human-in-the-loop consent on all registration submissions.</div>
                </div>
              </div>
            )}

            {activeModal === 'how-it-works' && (
              <div className="space-y-4">
                <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
                  How the Matching Engine Works
                </h3>
                <p className="text-xs sm:text-sm text-[#59665C] leading-relaxed">
                  Every recommendation is built on a 100-point affinity vector:
                </p>
                <ul className="text-xs space-y-2 text-[#244C3A]">
                  <li><strong>Cause Alignment (35%):</strong> Prioritizes causes you care about most.</li>
                  <li><strong>Skills Fit (30%):</strong> Matches your strengths (teaching, programming, triage, first aid).</li>
                  <li><strong>Schedule Fit (20%):</strong> Respects your chosen weekend or weekday availability.</li>
                  <li><strong>Location & Format (15%):</strong> Evaluates in-person radius vs remote opportunities.</li>
                </ul>
              </div>
            )}

            {activeModal === 'privacy' && (
              <div className="space-y-4">
                <h3 className="font-serif text-2xl font-bold text-[#244C3A]">
                  Trust & Privacy Charter
                </h3>
                <p className="text-xs sm:text-sm text-[#59665C] leading-relaxed">
                  CauseConnect AI respects volunteer autonomy. No background checks, resumes, or personal contact details are shared with organizers until you review the exact payload and click approve.
                </p>
                <p className="text-xs text-[#59665C]">
                  All volunteer opportunities are backed by live PostgreSQL data and protected by strict Row-Level Security.
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-[#D5E0D7] mt-6 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
