/**
 * Posting on Paro is for invited creators. Anyone can apply through the form;
 * approval is by hand, and the database is what finally decides who may post.
 */

/** The creator application, a Google Form, opened in a new tab. */
export const CREATOR_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdH-iTTr5nboRC3izGJOguLagzcLSKtBJHADbicdcWOU7LQqw/viewform";

/**
 * Whether an account may post a new prompt or change a prompt's picture:
 * approved creators, and verified accounts like @parostudio.
 */
export function canPost(profile: { verified?: boolean; is_creator?: boolean } | null | undefined): boolean {
  return !!profile && (!!profile.verified || !!profile.is_creator);
}
