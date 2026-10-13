export const site = {
  name: 'DSM Tech Events',
  url: 'https://dsmtechevents.com',
  tagline: 'Every Des Moines tech meetup, user group and conference in one place.',
  timeZone: 'America/Chicago',
  repo: 'https://github.com/kylehoehns/dsmtechevents',
  email: 'hello@dsmtechevents.com',
  // When the refresh runs, in UTC: the schedule in .github/workflows/refresh.yml
  // (tests/format.test.mjs checks the two match).
  refreshUtc: ['10:20', '15:20', '19:20', '23:20'],
};
