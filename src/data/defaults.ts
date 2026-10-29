import { VolunteerProfile, ImpactMetrics } from '../types';

export const EMPTY_USER_PROFILE: VolunteerProfile = {
  name: '',
  email: '',
  age: 0,
  city: '',
  hasBackgroundCheck: false,
  preferredCauses: [],
  skills: [],
  preferredDays: [],
  preferredFormat: 'all',
  maxDistanceMiles: 25,
  bio: ''
};

export const EMPTY_METRICS: ImpactMetrics = {
  totalHoursVolunteered: 0,
  eventsCompleted: 0,
  upcomingEvents: 0,
  causesSupportedCount: 0,
  peopleImpacted: 0,
  badgesUnlocked: []
};
