import React, { useState } from 'react';
import {
  User,
  Mail,
  MapPin,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  HeartPulse,
  Users,
  PawPrint,
  Heart,
  Flame,
  Leaf,
  Eye,
  DollarSign,
  Plus,
  X,
  Sparkles
} from 'lucide-react';
import { VolunteerProfile, CauseCategory } from '../types';

interface ProfileViewProps {
  profile: VolunteerProfile;
  onSaveProfile: (updated: VolunteerProfile) => Promise<{ success: boolean; error: string | null }>;
  onGoToMatches: () => void;
}

const ALL_CAUSES: { name: CauseCategory; icon: React.ElementType }[] = [
  { name: 'Education', icon: BookOpen },
  { name: 'Healthcare', icon: HeartPulse },
  { name: 'Community Service', icon: Users },
  { name: 'Animal Welfare', icon: PawPrint },
  { name: 'Elderly Care', icon: Heart },
  { name: 'Disaster Relief', icon: Flame },
  { name: 'Environment', icon: Leaf },
  { name: 'Accessibility', icon: Eye },
  { name: 'Fundraising', icon: DollarSign }
];

const SUGGESTED_SKILLS = [
  'Teaching',
  'Programming',
  'Communication',
  'Research',
  'First Aid',
  'Heavy Lifting',
  'Animal Handling',
  'Organization',
  'Cooking',
  'Clear Diction',
  'Audio Editing',
  'Empathy'
];

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  onSaveProfile,
  onGoToMatches
}) => {
  const [formData, setFormData] = useState<VolunteerProfile>({ ...profile });
  const [newSkill, setNewSkill] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  React.useEffect(() => {
    setFormData({ ...profile });
  }, [profile]);

  const toggleCause = (cause: CauseCategory) => {
    const exists = formData.preferredCauses.includes(cause);
    if (exists) {
      if (formData.preferredCauses.length > 1) {
        setFormData({
          ...formData,
          preferredCauses: formData.preferredCauses.filter((c) => c !== cause)
        });
      }
    } else {
      setFormData({
        ...formData,
        preferredCauses: [...formData.preferredCauses, cause]
      });
    }
  };

  const toggleDay = (day: 'Saturday' | 'Sunday' | 'Weekday') => {
    const exists = formData.preferredDays.includes(day);
    if (exists) {
      if (formData.preferredDays.length > 1) {
        setFormData({
          ...formData,
          preferredDays: formData.preferredDays.filter((d) => d !== day)
        });
      }
    } else {
      setFormData({
        ...formData,
        preferredDays: [...formData.preferredDays, day]
      });
    }
  };

  const toggleSkill = (skill: string) => {
    const exists = formData.skills.includes(skill);
    if (exists) {
      setFormData({
        ...formData,
        skills: formData.skills.filter((s) => s !== skill)
      });
    } else {
      setFormData({
        ...formData,
        skills: [...formData.skills, skill]
      });
    }
  };

  const addCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData({
        ...formData,
        skills: [...formData.skills, newSkill.trim()]
      });
      setNewSkill('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSavedSuccess(false);

    const res = await onSaveProfile(formData);
    setIsSaving(false);

    if (res.success) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } else {
      setSaveError(res.error || 'Failed to save profile changes to Supabase.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#244C3A] font-bold tracking-tight">
            Volunteer Matching Profile
          </h1>
          <p className="text-sm sm:text-base text-[#59665C] mt-1 font-normal">
            Configure your causes, skills, and availability. Saved directly to your Supabase PostgreSQL profile.
          </p>
        </div>

        {savedSuccess && (
          <div className="px-4 py-2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>Profile saved to Supabase & verified!</span>
          </div>
        )}
      </div>

      {saveError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 flex items-start gap-2.5">
          <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold">Error saving profile to database:</div>
            <div>{saveError}</div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white border border-[#D5E0D7] rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-serif text-xl font-bold text-[#244C3A]">
            Personal & Location Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Full Name:
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full p-2.5 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Email Address:
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full p-2.5 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Date of Birth:
              </label>
              <input
                type="date"
                value={formData.dateOfBirth || ''}
                onChange={(e) => {
                  const dobVal = e.target.value;
                  let calculatedAge = formData.age;
                  if (dobVal) {
                    const dob = new Date(dobVal);
                    if (!isNaN(dob.getTime())) {
                      const diffMs = Date.now() - dob.getTime();
                      calculatedAge = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                    }
                  }
                  setFormData({ ...formData, dateOfBirth: dobVal, age: calculatedAge });
                }}
                className="w-full p-2.5 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Age (years, auto-calculated):
              </label>
              <input
                type="number"
                min="13"
                max="105"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 18 })}
                required
                className="w-full p-2.5 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Phone Number (for event coordinators):
              </label>
              <input
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
                className="w-full p-2.5 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Home City / Metro Area:
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
                className="w-full p-2.5 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
              />
            </div>
          </div>

          {/* Education & Experience */}
          <div>
            <label className="block text-xs font-semibold text-[#244C3A] mb-1">
              Education & Relevant Experience:
            </label>
            <textarea
              rows={2}
              value={formData.educationExperience || formData.bio || ''}
              onChange={(e) => setFormData({ ...formData, educationExperience: e.target.value, bio: e.target.value })}
              placeholder="e.g. B.S. in Environmental Science, 2 years youth tutoring, certified first aid..."
              className="w-full p-2.5 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
            />
          </div>

          {/* Background Check Verification & Consent Toggles */}
          <div className="pt-2 space-y-2">
            <label className="flex items-center gap-3 p-3 bg-[#E8F0E9] rounded-xl border border-[#D5E0D7] cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasBackgroundCheck}
                onChange={(e) => setFormData({ ...formData, hasBackgroundCheck: e.target.checked })}
                className="w-4 h-4 rounded text-[#244C3A] accent-[#244C3A] cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-[#244C3A] block">
                  I have a current background clearance certificate on file
                </span>
                <span className="text-[11px] text-[#244C3A]/70">
                  Enables instant eligibility for youth education, vulnerable elder care, and hospital positions.
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 bg-[#E8F0E9] rounded-xl border border-[#D5E0D7] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(formData.backgroundCheckConsent)}
                onChange={(e) => setFormData({ ...formData, backgroundCheckConsent: e.target.checked })}
                className="w-4 h-4 rounded text-[#244C3A] accent-[#244C3A] cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-[#244C3A] block">
                  Authorize CauseConnect AI to request volunteer background check consent on your behalf
                </span>
                <span className="text-[11px] text-[#244C3A]/70">
                  Permits the Auto-Apply agent to prepare applications requiring organization safety verification.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Cause Category Preferences */}
        <div className="bg-white border border-[#D5E0D7] rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-xl font-bold text-[#244C3A]">
                Causes of Interest (Social Impact Domains)
              </h3>
              <p className="text-xs text-[#244C3A]/70 mt-0.5">
                Select every domain where you wish to give your time and energy.
              </p>
            </div>
            <span className="text-xs font-semibold text-[#315D48] bg-[#E8F0E9] px-2.5 py-0.5 rounded-full">
              {formData.preferredCauses.length} Selected
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            {ALL_CAUSES.map(({ name, icon: Icon }) => {
              const isSelected = formData.preferredCauses.includes(name);

              return (
                <button
                  type="button"
                  key={name}
                  onClick={() => toggleCause(name)}
                  className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#244C3A] text-white border-[#244C3A] shadow-xs'
                      : 'bg-[#FFFFFF] text-[#244C3A] border-[#D5E0D7] hover:bg-[#E8F0E9]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-[#D6C49A]' : 'text-[#315D48]'
                    }`}
                  />
                  <span className="text-xs font-semibold">{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Skills & Experience */}
        <div className="bg-white border border-[#D5E0D7] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-xl font-bold text-[#244C3A]">
                Skills & Experience
              </h3>
              <p className="text-xs text-[#244C3A]/70 mt-0.5">
                Skills directly boost matching scores for roles seeking specialized assistance.
              </p>
            </div>
          </div>

          {/* Active Skills Chips */}
          <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl">
            {formData.skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[#244C3A] text-white"
              >
                <span>{skill}</span>
                <button
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className="hover:text-red-300 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Quick Select Suggested Skills */}
          <div>
            <div className="text-[11px] font-semibold text-[#244C3A]/70 uppercase tracking-wider mb-2">
              Add suggested skills:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_SKILLS.filter((s) => !formData.skills.includes(s)).map((skill) => (
                <button
                  type="button"
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  className="px-2.5 py-1 text-xs bg-[#E8F0E9]/70 hover:bg-[#E8F0E9] text-[#244C3A] rounded-lg border border-[#D5DACA]/50 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3 text-[#315D48]" />
                  <span>{skill}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Add custom skill input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Or type a custom skill (e.g. Graphic Design, Translation)..."
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              className="flex-1 p-2 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] placeholder-[#244C3A]/50 focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
            />
            <button
              type="button"
              onClick={addCustomSkill}
              className="px-4 py-2 bg-[#315D48] hover:bg-[#244C3A] text-white text-xs font-semibold rounded-xl"
            >
              Add Skill
            </button>
          </div>
        </div>

        {/* Schedule & Availability */}
        <div className="bg-white border border-[#D5E0D7] rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-serif text-xl font-bold text-[#244C3A]">
            Weekly Availability & Event Format
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-2">
                Available Days:
              </label>
              <div className="flex flex-wrap gap-2">
                {(['Saturday', 'Sunday', 'Weekday'] as const).map((day) => {
                  const isSelected = formData.preferredDays.includes(day);
                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-[#244C3A] text-white border-[#244C3A]'
                          : 'bg-white text-[#244C3A] border-[#D5E0D7] hover:bg-[#E8F0E9]'
                      }`}
                    >
                      {day}s
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-2">
                Format Preference:
              </label>
              <select
                value={formData.preferredFormat}
                onChange={(e) =>
                  setFormData({ ...formData, preferredFormat: e.target.value as any })
                }
                className="w-full p-2.5 text-xs bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/20"
              >
                <option value="all">Both In-Person & Remote / Online</option>
                <option value="in-person">In-Person Only</option>
                <option value="online">Remote / Online Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={onGoToMatches}
            className="text-xs font-semibold text-[#315D48] hover:underline"
          >
            ← View Match Scores with Current Profile
          </button>

          <button
            type="submit"
            className="w-full sm:w-auto px-8 py-3 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
          >
            Save Profile & Recalculate Matches
          </button>
        </div>
      </form>
    </div>
  );
};
