import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  Building2,
  MapPin,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Globe,
  Tag
} from 'lucide-react';
import { createOpportunityInSupabase } from '../services/supabaseService';
import { Opportunity } from '../types';

interface CreateOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpportunityCreated: (newOpp: Opportunity) => void;
}

const COMMON_SKILLS = [
  'Teaching',
  'Programming',
  'Communication',
  'Mentoring',
  'First Aid',
  'Organization',
  'Animal Care',
  'Food Preparation',
  'Community Outreach',
  'Data Entry',
  'Environmental Conservation'
];

export const CreateOpportunityModal: React.FC<CreateOpportunityModalProps> = ({
  isOpen,
  onClose,
  onOpportunityCreated
}) => {
  const [title, setTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(75);
  const [backgroundCheckRequired, setBackgroundCheckRequired] = useState(false);
  const [skills, setSkills] = useState<string[]>(['Community Outreach']);
  const [customSkill, setCustomSkill] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleSkill = (skill: string) => {
    if (skills.includes(skill)) {
      if (skills.length > 1) {
        setSkills(skills.filter((s) => s !== skill));
      }
    } else {
      setSkills([...skills, skill]);
    }
  };

  const handleAddCustomSkill = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    if (customSkill.trim() && !skills.includes(customSkill.trim())) {
      setSkills([...skills, customSkill.trim()]);
      setCustomSkill('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim() || !organization.trim() || !location.trim() || !description.trim()) {
      setErrorMessage('Please fill out all required fields.');
      return;
    }

    setIsSubmitting(true);

    const res = await createOpportunityInSupabase({
      title,
      organization,
      location,
      description,
      minAge,
      maxAge,
      backgroundCheckRequired,
      requiredSkills: skills,
      sourceUrl: sourceUrl.trim() || undefined
    });

    setIsSubmitting(false);

    if (res.success && res.opportunity) {
      onOpportunityCreated(res.opportunity);
      onClose();
    } else {
      setErrorMessage(res.error || 'Failed to publish opportunity to Supabase.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-8 relative flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#D5E0D7] flex items-center justify-between bg-[#E8F0E9]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#244C3A] flex items-center justify-center text-[#E8F0E9]">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-[#244C3A]">
                Publish Volunteer Opportunity
              </h3>
              <p className="text-xs text-[#59665C]">
                Persist a legitimate volunteer opening directly into the Supabase database.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white hover:bg-[#E8F0E9] text-[#244C3A] border border-[#D5E0D7] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto max-h-[80vh]">
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Opportunity Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekend Code & STEM Mentor"
                className="w-full p-2.5 text-xs sm:text-sm bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Organization Name *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
                <input
                  type="text"
                  required
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g. OpenLearn Foundation"
                  className="w-full pl-9 pr-3 p-2.5 text-xs sm:text-sm bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Location & Mode *
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Bengaluru, Karnataka (In-person) or Remote"
                  className="w-full pl-9 pr-3 p-2.5 text-xs sm:text-sm bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Verified Listing URL (Optional)
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7868]" />
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://organization.org/volunteer"
                  className="w-full pl-9 pr-3 p-2.5 text-xs sm:text-sm bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#244C3A] mb-1">
              Description & Volunteer Scope *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the volunteering role, expected responsibilities, schedule, and social impact..."
              className="w-full p-2.5 text-xs sm:text-sm bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
            />
          </div>

          {/* Eligibility criteria */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[#E8F0E9] rounded-2xl border border-[#D5E0D7]">
            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Min Age
              </label>
              <input
                type="number"
                min={12}
                max={99}
                value={minAge}
                onChange={(e) => setMinAge(parseInt(e.target.value) || 18)}
                className="w-full p-2 text-xs bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#244C3A] mb-1">
                Max Age
              </label>
              <input
                type="number"
                min={18}
                max={99}
                value={maxAge}
                onChange={(e) => setMaxAge(parseInt(e.target.value) || 75)}
                className="w-full p-2 text-xs bg-white border border-[#D5E0D7] rounded-xl text-[#244C3A]"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={backgroundCheckRequired}
                  onChange={(e) => setBackgroundCheckRequired(e.target.checked)}
                  className="w-4 h-4 accent-[#244C3A] rounded cursor-pointer"
                />
                <span className="text-xs font-semibold text-[#244C3A]">
                  Background Check Req.
                </span>
              </label>
            </div>
          </div>

          {/* Required Skills */}
          <div>
            <label className="block text-xs font-semibold text-[#244C3A] mb-1.5">
              Required Skills
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {COMMON_SKILLS.map((sk) => {
                const isSelected = skills.includes(sk);
                return (
                  <button
                    key={sk}
                    type="button"
                    onClick={() => toggleSkill(sk)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#244C3A] text-white border border-[#244C3A]'
                        : 'bg-white border border-[#D5DACA] text-[#244C3A] hover:bg-[#E8F0E9]'
                    }`}
                  >
                    {sk} {isSelected ? '✓' : '+'}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={customSkill}
                onChange={(e) => setCustomSkill(e.target.value)}
                onKeyDown={handleAddCustomSkill}
                placeholder="Add other custom skill..."
                className="flex-1 p-2 text-xs bg-[#E8F0E9]/50 border border-[#D5E0D7] rounded-xl text-[#244C3A]"
              />
              <button
                type="button"
                onClick={handleAddCustomSkill}
                className="px-3 py-2 bg-[#DFEAE1] hover:bg-[#C9CEC0] text-[#244C3A] text-xs font-semibold rounded-xl cursor-pointer"
              >
                Add Skill
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D5E0D7]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-[#D5DACA] bg-white text-[#244C3A] rounded-xl text-xs font-semibold hover:bg-[#E8F0E9] transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#244C3A] hover:bg-[#315D48] text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-70"
            >
              {isSubmitting ? 'Publishing to Supabase...' : 'Publish to Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
