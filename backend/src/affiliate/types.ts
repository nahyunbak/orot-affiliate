export interface CampaignSettings {
  title: string;
  start: string;
  end: string;
  keywords: string[];
  likes: number;
  comments: number;
  views: number;
  reward: number;
}
export interface PostEvidence {
  name: string;
  handle: string;
  caption: string;
  postedAt: string;
  likes: number;
  comments: number;
  views: number;
}
export function checkEvidence(
  evidence: PostEvidence,
  settings: CampaignSettings,
  now = Date.now(),
) {
  const start = Date.parse(settings.start + 'T00:00:00+09:00');
  const end = Date.parse(settings.end + 'T23:59:59+09:00');
  const posted = Date.parse(evidence.postedAt);
  const caption = evidence.caption.normalize('NFKC').toLowerCase();
  const hashtags: string[] = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
  const keywords = settings.keywords.every((word) => {
    const key = word.normalize('NFKC').toLowerCase();
    return key.startsWith('#') ? hashtags.includes(key) : caption.includes(key);
  });
  return {
    period: posted >= start && posted <= end && posted <= now,
    active: now >= start && now <= end,
    keywords,
    engagement: ['likes', 'comments', 'views'].every(
      (key) =>
        Number.isSafeInteger(evidence[key]) && evidence[key] >= settings[key],
    ),
  };
}
