import Image from "next/image";
import type { Participant } from "./types";
const paths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3z",
  wallet: "M3 6h17v15H3zM3 6V3h14M15 12h6v5h-6z",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  comment: "M21 11.5a9 9 0 0 1-9.5 9L3 22l1.5-7.5A9 9 0 1 1 21 11.5Z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  search: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z",
  check: "m5 12 4 4L19 6",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M9 15v6",
  close: "m6 6 12 12M6 18 18 6",
  external: "M14 3h7v7M21 3 11 13M10 5H3v16h16v-7",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Avatar({
  post,
  ring = false,
}: {
  post: Pick<Participant, "id" | "name">;
  ring?: boolean;
}) {
  return (
    <span
      className={`avatar-wrap [display:inline-flex] [border-radius:50%] [padding:3px] [flex-shrink:0] ${ring ? "ring [background:linear-gradient(35deg,_var(--color-feed-tone-28),_var(--color-feed-tone-29),_var(--color-feed-tone-30))] [padding:2px] [&_.avatar]:[width:57px] [&_.avatar]:[height:57px] [&_.avatar]:[border:3px_solid_white] [&_.avatar]:[font-size:var(--text-feed-19)] max-[1250px]:[&_.avatar]:[width:51px] max-[1250px]:[&_.avatar]:[height:51px] max-[1050px]:[&_.avatar]:[width:57px] max-[1050px]:[&_.avatar]:[height:57px] max-[600px]:[&_.avatar]:[width:50px] max-[600px]:[&_.avatar]:[height:50px] max-[600px]:[&_.avatar]:[font-size:var(--text-feed-17)]" : ""}`}
    >
      <span
        className={`avatar [display:grid] [place-items:center] [width:35px] [height:35px] [border-radius:50%] [overflow:hidden] [background:var(--color-feed-tone-18)] [color:var(--color-feed-tone-19)] [font-size:var(--text-feed-12)] [font-weight:650] [border:2px_solid_white] [&.avatar-s2]:[background:var(--color-feed-tone-20)] [&.avatar-s2]:[color:var(--color-feed-tone-21)] [&.avatar-s3]:[background:var(--color-feed-tone-22)] [&.avatar-s3]:[color:var(--color-feed-tone-23)] [&.avatar-s4]:[background:var(--color-feed-tone-24)] [&.avatar-s4]:[color:var(--color-feed-tone-25)] [&.avatar-s5]:[background:var(--color-feed-tone-26)] [&.avatar-s5]:[color:var(--color-feed-tone-27)] avatar-${post.id}`}
      >
        <Image
          src={`/images/maroo/${post.id}-profile.jpg`}
          alt=""
          width={64}
          height={64}
          className="h-full w-full object-cover"
          unoptimized
        />
      </span>
    </span>
  );
}
export const fmt = (n: number | string) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
    Number(n),
  );
export const short = (s: string) => s.slice(0, 7) + "…" + s.slice(-5);
export const explorer = "https://explorer-testnet.maroo.io";
