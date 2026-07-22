import blocked from "./assets/blocked.tgs?url";
import calling from "./assets/calling.tgs?url";
import cleaning from "./assets/cleaning.tgs?url";
import confused from "./assets/confused.tgs?url";
import happy from "./assets/happy.tgs?url";
import incognito from "./assets/incognito.tgs?url";
import invite from "./assets/invite.tgs?url";
import notFound from "./assets/not-found.tgs?url";
import sad from "./assets/sad.tgs?url";
import searching from "./assets/searching.tgs?url";

export const STICKERS = {
  blocked,
  calling,
  cleaning,
  confused,
  happy,
  incognito,
  invite,
  "not-found": notFound,
  sad,
  searching,
} as const;

export type StickerId = keyof typeof STICKERS;
