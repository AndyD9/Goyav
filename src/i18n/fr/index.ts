// French translations, split by app area so each file stays reviewable.
// Keys are the exact English strings passed to t(). When two areas
// translate the same key, the later spread wins, so keep shared words in
// common.ts.
import { common } from "./common";
import { mail } from "./mail";
import { messageList } from "./messageList";
import { compose } from "./compose";
import { account } from "./account";
import { preferences } from "./preferences";
import { calendar } from "./calendar";
import { contacts } from "./contacts";
import { pgp } from "./pgp";

export const fr: Readonly<Record<string, string>> = {
  ...mail,
  ...messageList,
  ...compose,
  ...account,
  ...preferences,
  ...calendar,
  ...contacts,
  ...pgp,
  ...common,
};
