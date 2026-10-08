import { mkdir, writeFile } from 'node:fs/promises';

const username = process.env.GITHUB_PROFILE_USERNAME;
const token = process.env.GITHUB_TOKEN;
if (!username || !token) {
  throw new Error('GITHUB_PROFILE_USERNAME and GITHUB_TOKEN are required');
}

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'github-profile-activity',
  },
  body: JSON.stringify({
    query: `query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          endedAt
          contributionCalendar { totalContributions }
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }
    }`,
    variables: { username },
  }),
});
if (!response.ok) throw new Error(`GitHub request failed: HTTP ${response.status}`);
const result = await response.json();
if (result.errors?.length) {
  throw new Error(`GitHub GraphQL failed: ${result.errors.map(error => error.message).join('; ')}`);
}
const activity = result.data?.user?.contributionsCollection;
if (!activity) throw new Error('GitHub returned no contribution data');

const publicOnly = process.env.GITHUB_PROFILE_PUBLIC_ONLY === 'true';
const stats = [
  ['Contributions', activity.contributionCalendar?.totalContributions],
  [publicOnly ? 'Public pull requests' : 'Pull requests', activity.totalPullRequestContributions],
  [publicOnly ? 'Public PR reviews' : 'PR reviews', activity.totalPullRequestReviewContributions],
];
for (const [label, value] of stats) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label} count`);
}
const snapshot = new Date(activity.endedAt).toISOString().slice(0, 10);

function renderActivity(dark) {
  const foreground = dark ? '#f0f6fc' : '#1f2328';
  const muted = dark ? '#9198a1' : '#59636e';
  const columns = stats.map(([label, value], index) => {
    const x = 16 + index * 300;
    return `<text x="${x}" y="85" font-size="42" fill="${foreground}">${value.toLocaleString('en-US')}</text>
  <text x="${x}" y="121" font-size="18" fill="${muted}">${label}</text>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="150" viewBox="0 0 900 150" role="img" aria-labelledby="title">
  <title id="title">Past year: ${stats.map(([label, value]) => `${label} ${value}`).join(', ')}</title>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
  <text x="16" y="24" font-size="15" fill="${muted}">Past year · ${snapshot} snapshot</text>
  ${columns}
  </g>
</svg>\n`;
}

await mkdir('dist', { recursive: true });
await Promise.all([
  writeFile('dist/activity.svg', renderActivity(false)),
  writeFile('dist/activity-dark.svg', renderActivity(true)),
]);
console.log('[generateActivity] Generated contribution stats', Object.fromEntries(stats));
