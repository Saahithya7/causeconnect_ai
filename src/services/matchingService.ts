import { Opportunity, VolunteerProfile, MatchExplanation } from '../types';

export function calculateMatchScore(
  profile: VolunteerProfile,
  opp: Opportunity
): MatchExplanation {
  // 1. Cause Alignment (Max 35 points)
  let causeScore = 0;
  let causeExplanation = '';
  const isCausePreferred = profile.preferredCauses.includes(opp.category);

  if (isCausePreferred) {
    causeScore = 35;
    causeExplanation = `High alignment: "${opp.category}" is in your prioritized causes.`;
  } else {
    causeScore = 12;
    causeExplanation = `Secondary alignment: "${opp.category}" offers valuable broader community impact.`;
  }

  // 2. Skills Match (Max 30 points)
  let skillsScore = 0;
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  if (opp.skills.includes('No specific skills')) {
    skillsScore = 28;
    matchedSkills.push('Open to all willing volunteers');
  } else {
    const oppSkillsLower = opp.skills.map((s) => s.toLowerCase());
    const profileSkillsLower = profile.skills.map((s) => s.toLowerCase());

    opp.skills.forEach((skill) => {
      if (profileSkillsLower.includes(skill.toLowerCase())) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    });

    if (oppSkillsLower.length > 0) {
      const matchRatio = matchedSkills.length / oppSkillsLower.length;
      skillsScore = Math.round(matchRatio * 30);
      if (matchedSkills.length > 0 && skillsScore < 15) {
        skillsScore = 15; // baseline encouragement
      }
    } else {
      skillsScore = 25;
    }
  }

  // 3. Availability & Days (Max 20 points)
  let availabilityScore = 0;
  let availabilityExplanation = '';
  const hasDayOverlap = opp.daysOfWeek.some((day) => profile.preferredDays.includes(day));

  if (hasDayOverlap) {
    availabilityScore = 20;
    availabilityExplanation = `Fits your schedule: Scheduled on ${opp.daysOfWeek.join(' / ')}, matching your preferred volunteering days.`;
  } else {
    availabilityScore = 6;
    availabilityExplanation = `Scheduled on ${opp.daysOfWeek.join(' / ')}, outside your regular active days.`;
  }

  // 4. Location & Format (Max 15 points)
  let locationScore = 0;
  let locationExplanation = '';

  if (opp.format === 'online') {
    locationScore = 15;
    locationExplanation = 'Online / Remote event fits your location and has zero commute requirements.';
  } else if (
    opp.city.toLowerCase() === profile.city.toLowerCase() ||
    opp.location.toLowerCase().includes(profile.city.toLowerCase())
  ) {
    locationScore = 15;
    locationExplanation = `In-person event located within your home city (${profile.city}).`;
  } else {
    locationScore = 5;
    locationExplanation = `In-person event located in ${opp.city}, which may require travel from ${profile.city}.`;
  }

  // Eligibility Verification
  const eligibilityNotes: string[] = [];
  const unconfirmedFields: string[] = [];
  let eligibilityStatus: 'eligible' | 'warning' | 'ineligible' = 'eligible';

  // Age restriction
  if (profile.age < opp.minAge) {
    eligibilityStatus = 'ineligible';
    eligibilityNotes.push(`Requires minimum age of ${opp.minAge} (volunteer profile age: ${profile.age}).`);
  } else {
    eligibilityNotes.push(`Age requirement met: ${profile.age} yrs (minimum ${opp.minAge} yrs).`);
  }

  // Background check
  if (opp.backgroundCheck === 'required') {
    if (profile.hasBackgroundCheck) {
      eligibilityNotes.push('Background check verified on your profile.');
    } else {
      if (eligibilityStatus !== 'ineligible') eligibilityStatus = 'warning';
      eligibilityNotes.push('Organizer requires background clearance before shift.');
    }
  } else if (opp.backgroundCheck === 'not-confirmed') {
    unconfirmedFields.push('Background check requirement not confirmed by organizer feed.');
    eligibilityNotes.push('Notice: Background check status is currently unconfirmed by the organization.');
  } else {
    eligibilityNotes.push('No background check required for this role.');
  }

  // Calculate total score
  let totalScore = causeScore + skillsScore + availabilityScore + locationScore;
  if (eligibilityStatus === 'ineligible') {
    totalScore = Math.min(totalScore, 42); // Cap ineligible events
  }

  return {
    totalScore,
    causeMatch: {
      score: causeScore,
      max: 35,
      explanation: causeExplanation,
    },
    skillsMatch: {
      score: skillsScore,
      max: 30,
      matchedSkills,
      missingSkills,
    },
    availabilityMatch: {
      score: availabilityScore,
      max: 20,
      explanation: availabilityExplanation,
    },
    locationMatch: {
      score: locationScore,
      max: 15,
      explanation: locationExplanation,
    },
    eligibilityStatus,
    eligibilityNotes,
    verifiedEligibility: opp.verifiedDetails.venueVerified && opp.verifiedDetails.nonprofitStatusVerified,
    unconfirmedFields,
  };
}
