import { Registration, VolunteerAvailability, VolunteerProfile, ScheduleConflict } from '../types';

export interface ParsedEventTiming {
  start: Date;
  end: Date;
  isKnown: boolean;
  dayOfWeek: string;
  durationMinutes: number;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Parses a 12-hour or 24-hour time string into hours and minutes
 * e.g. "10:00 AM" -> { hours: 10, minutes: 0 }
 * e.g. "01:30 PM" -> { hours: 13, minutes: 30 }
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  const clean = timeStr.trim().toUpperCase();
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const period = match12[3];

    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
  }

  const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return { hours: parseInt(match24[1], 10), minutes: parseInt(match24[2], 10) };
  }

  return null;
}

/**
 * Parses event date string and time string into a concrete Start and End Date
 */
export function parseEventDateTime(dateStr: string, timeStr: string): ParsedEventTiming | null {
  if (!dateStr || !timeStr) return null;

  // Clean date string: remove leading day of week if present (e.g. "Saturday, Nov 14, 2026" -> "Nov 14, 2026")
  let cleanDate = dateStr.replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+/i, '').trim();

  // If date contains special relative tokens or days of week like "Saturday & Sunday mornings"
  if (
    cleanDate.toLowerCase().includes('upcoming') ||
    cleanDate.toLowerCase().includes('weekend') ||
    cleanDate.toLowerCase().includes('mornings') ||
    cleanDate.toLowerCase().includes('evenings') ||
    /^(?:saturday|sunday|weekday)/i.test(cleanDate)
  ) {
    // Generate next Saturday
    const now = new Date();
    const nextSat = new Date();
    nextSat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
    cleanDate = nextSat.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  let baseDate = new Date(cleanDate);
  if (isNaN(baseDate.getTime())) {
    // Check if original dateStr had a parsable date
    const fallbackDate = new Date(dateStr);
    if (!isNaN(fallbackDate.getTime())) {
      baseDate = fallbackDate;
    } else {
      // Use next weekend date as fallback base date
      const now = new Date();
      const nextSat = new Date();
      nextSat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
      baseDate = nextSat;
    }
  }

  const cleanTime = timeStr.trim();
  const isFlexible = /flexible|self-paced|tbd|anytime|as needed|open hours/i.test(cleanTime);
  if (isFlexible) {
    const start = new Date(baseDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(12, 0, 0, 0);
    return {
      start,
      end,
      isKnown: false,
      dayOfWeek: DAYS_OF_WEEK[baseDate.getDay()],
      durationMinutes: 180
    };
  }

  // Parse time range, e.g. "10:00 AM - 1:00 PM" or "10:00 AM to 01:00 PM"
  // Note: Must use (?:-|–|—|\bto\b) instead of [-–—to] which splits on individual characters 't' or 'o'
  const parts = cleanTime.split(/\s*(?:-|–|—|\bto\b)\s*/i);
  if (parts.length >= 2) {
    const startTime = parseTimeString(parts[0]);
    const endTime = parseTimeString(parts[1]);

    if (startTime && endTime) {
      const start = new Date(baseDate);
      start.setHours(startTime.hours, startTime.minutes, 0, 0);

      const end = new Date(baseDate);
      end.setHours(endTime.hours, endTime.minutes, 0, 0);

      // Handle overnight shift if end <= start
      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }

      const durationMinutes = Math.round((end.getTime() - start.getTime()) / (60 * 1000));
      return {
        start,
        end,
        isKnown: true,
        dayOfWeek: DAYS_OF_WEEK[start.getDay()],
        durationMinutes
      };
    }
  }

  // Single time provided (e.g. "10:00 AM") -> assume 2-hour duration
  const singleTime = parseTimeString(cleanTime);
  if (singleTime) {
    const start = new Date(baseDate);
    start.setHours(singleTime.hours, singleTime.minutes, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 2);
    return {
      start,
      end,
      isKnown: true,
      dayOfWeek: DAYS_OF_WEEK[start.getDay()],
      durationMinutes: 120
    };
  }

  // Unknown format
  const start = new Date(baseDate);
  start.setHours(9, 0, 0, 0);
  const end = new Date(baseDate);
  end.setHours(12, 0, 0, 0);
  return {
    start,
    end,
    isKnown: false,
    dayOfWeek: DAYS_OF_WEEK[baseDate.getDay()],
    durationMinutes: 180
  };
}

/**
 * Intelligent Schedule Conflict Detector for CommitMate
 * 1. Checks if target timing is unknown -> returns advisory incomplete warning (does not block).
 * 2. Checks against preferred available days and working hours.
 * 3. Checks direct overlaps with all other active registered events.
 * 4. Checks transit buffer (default 30 min).
 */
export function detectScheduleConflicts(
  targetEvent: { id?: string; title: string; date: string; time: string },
  existingRegistrations: Registration[] = [],
  availabilityProfile?: Partial<VolunteerProfile>
): ScheduleConflict {
  const targetTiming = parseEventDateTime(targetEvent.date, targetEvent.time);

  // 1. Unknown or flexible timing check
  if (!targetTiming || !targetTiming.isKnown) {
    const explanation = 'Event timing is flexible or self-scheduled. Automated schedule conflict check is advisory — please verify shift hours with event organizers.';
    return {
      hasConflict: false,
      isIncomplete: true,
      severity: 'info',
      explanation,
      incompleteReason: explanation,
      conflictDescription: explanation,
      suggestedAction: 'Timing is advisory: Does not block your registration'
    };
  }

  // 2. Check overlap with other active registered events
  const targetStart = targetTiming.start.getTime();
  const targetEnd = targetTiming.end.getTime();
  const bufferMs = 30 * 60 * 1000; // 30 min buffer

  const activeRegistrations = existingRegistrations.filter(
    (reg) =>
      reg.id !== targetEvent.id &&
      reg.opportunityId !== targetEvent.id &&
      reg.status !== 'cancelled'
  );

  for (const reg of activeRegistrations) {
    const regTiming = parseEventDateTime(reg.date, reg.time);
    if (!regTiming || !regTiming.isKnown) continue;

    const regStart = regTiming.start.getTime();
    const regEnd = regTiming.end.getTime();

    // Direct overlap check: (StartA < EndB) and (EndA > StartB)
    const isDirectOverlap = targetStart < regEnd && targetEnd > regStart;
    if (isDirectOverlap) {
      const explanation = `Direct schedule overlap with your registered event "${reg.opportunityTitle}" scheduled for ${reg.date} at ${reg.time}.`;
      return {
        hasConflict: true,
        isIncomplete: false,
        conflictType: 'overlap',
        severity: 'blocking',
        conflictingEventTitle: reg.opportunityTitle,
        conflictingEventTime: `${reg.date} (${reg.time})`,
        conflictingRegistration: reg,
        explanation,
        conflictDescription: explanation,
        suggestedAction: 'Reschedule or cancel conflicting commitment before confirming'
      };
    }

    // Insufficient buffer check (less than 30 mins between consecutive events on the same day)
    const isSameDay =
      targetTiming.start.getFullYear() === regTiming.start.getFullYear() &&
      targetTiming.start.getMonth() === regTiming.start.getMonth() &&
      targetTiming.start.getDate() === regTiming.start.getDate();

    if (isSameDay) {
      const gapBefore = targetStart - regEnd;
      const gapAfter = regStart - targetEnd;

      if ((gapBefore > 0 && gapBefore < bufferMs) || (gapAfter > 0 && gapAfter < bufferMs)) {
        const gapMins = Math.round(Math.min(gapBefore > 0 ? gapBefore : Infinity, gapAfter > 0 ? gapAfter : Infinity) / 60000);
        const explanation = `Only ${gapMins} minutes between this event and "${reg.opportunityTitle}". Recommended buffer is at least 30 minutes for transit and preparation.`;
        return {
          hasConflict: true,
          isIncomplete: false,
          conflictType: 'insufficient_buffer',
          severity: 'warning',
          conflictingEventTitle: reg.opportunityTitle,
          conflictingEventTime: `${reg.date} (${reg.time})`,
          conflictingRegistration: reg,
          explanation,
          conflictDescription: explanation,
          suggestedAction: 'Allow sufficient travel time between activities'
        };
      }
    }
  }

  // 3. Check against volunteer preferred days
  const preferredDays = availabilityProfile?.preferredDays || [];
  if (preferredDays.length > 0) {
    const isWeekend = targetTiming.dayOfWeek === 'Saturday' || targetTiming.dayOfWeek === 'Sunday';
    const isDayMatched =
      preferredDays.includes(targetTiming.dayOfWeek as any) ||
      (preferredDays.includes('Weekday') && !isWeekend);

    if (!isDayMatched) {
      const explanation = `Event takes place on ${targetTiming.dayOfWeek}, which is not in your preferred volunteering days (${preferredDays.join(', ')}).`;
      return {
        hasConflict: true,
        isIncomplete: false,
        conflictType: 'outside_available_days',
        severity: 'warning',
        explanation,
        conflictDescription: explanation,
        suggestedAction: 'Verify your availability for this day'
      };
    }
  }

  // 4. Check against volunteer preferred working hours
  const workingHours = availabilityProfile?.preferredWorkingHours;
  if (workingHours?.start && workingHours?.end) {
    const prefStart = parseTimeString(workingHours.start);
    const prefEnd = parseTimeString(workingHours.end);

    if (prefStart && prefEnd) {
      const eventStartMins = targetTiming.start.getHours() * 60 + targetTiming.start.getMinutes();
      const eventEndMins = targetTiming.end.getHours() * 60 + targetTiming.end.getMinutes();
      const prefStartMins = prefStart.hours * 60 + prefStart.minutes;
      const prefEndMins = prefEnd.hours * 60 + prefEnd.minutes;

      if (eventStartMins < prefStartMins || eventEndMins > prefEndMins) {
        const explanation = `Event hours (${targetEvent.time}) fall outside your preferred working window (${workingHours.start} - ${workingHours.end}).`;
        return {
          hasConflict: true,
          isIncomplete: false,
          conflictType: 'outside_preferred_hours',
          severity: 'warning',
          explanation,
          conflictDescription: explanation,
          suggestedAction: 'Adjust your schedule or availability settings'
        };
      }
    }
  }

  // No conflict detected
  return {
    hasConflict: false,
    isIncomplete: false,
    severity: 'info',
    explanation: 'No schedule conflicts found. Event fits cleanly into your volunteering calendar.',
    conflictDescription: 'No schedule conflicts found.'
  };
}

/**
 * Finds all overlapping commitments among registered events
 */
export function findAllRegisteredConflicts(
  registrations: Registration[] = [],
  profile?: Partial<VolunteerProfile>
): { regA: Registration; regB: Registration; conflict: ScheduleConflict }[] {
  const active = registrations.filter((r) => r.status !== 'cancelled');
  const conflicts: { regA: Registration; regB: Registration; conflict: ScheduleConflict }[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const regA = active[i];
      const regB = active[j];
      const conflict = detectScheduleConflicts(
        { id: regB.id, title: regB.opportunityTitle, date: regB.date, time: regB.time },
        [regA],
        profile
      );
      if (conflict.hasConflict && conflict.conflictType === 'overlap') {
        conflicts.push({ regA, regB, conflict });
      }
    }
  }
  return conflicts;
}
