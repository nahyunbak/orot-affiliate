export interface Campaign {
  id: string;
  title: string;
  start: string;
  end: string;
  keywords: string[];
  likes: number;
  comments: number;
  views: number;
  reward: number;
  contractAddress: string | null;
  policyTx: string | null;
  fundingTx: string | null;
}
export interface Participant {
  id: string;
  name: string;
  handle: string;
  caption: string;
  postedAt: string;
  likes: number;
  comments: number;
  views: number;
  address: string;
  userId: number;
  status:
    | "pending"
    | "approving"
    | "approved"
    | "paying"
    | "paid"
    | "rejected"
    | "failed";
  reason: string | null;
  approvalTx: string | null;
  payoutTx: string | null;
  paidAmount: number | null;
  paidAt: string | null;
}
export interface Workspace {
  campaign: Campaign;
  participants: Participant[];
  operator: { address: string; balance: string | null };
  chain: {
    chainId: number;
    blockNumber: number | null;
    contractBalance: string | null;
    connected: boolean;
    explorer: string;
  };
}
export const labels: Record<Participant["status"], string> = {
  pending: "orot.status.pending",
  approving: "orot.status.approving",
  approved: "orot.status.approved",
  paying: "orot.status.paying",
  paid: "orot.status.paid",
  rejected: "orot.status.rejected",
  failed: "orot.status.failed",
};
export function checksFor(post: Participant, campaign: Campaign) {
  const start = Date.parse(campaign.start + "T00:00:00+09:00"),
    end = Date.parse(campaign.end + "T23:59:59+09:00"),
    posted = Date.parse(post.postedAt),
    now = Date.now();
  const caption = post.caption.normalize("NFKC").toLowerCase();
  const hashtags: string[] = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
  return {
    period: posted >= start && posted <= end && posted <= now,
    active: now >= start && now <= end,
    keywords: campaign.keywords.every((k) =>
      k.startsWith("#")
        ? hashtags.includes(k.normalize("NFKC").toLowerCase())
        : caption.includes(k.normalize("NFKC").toLowerCase()),
    ),
    engagement:
      post.likes >= campaign.likes &&
      post.comments >= campaign.comments &&
      post.views >= campaign.views,
  };
}
