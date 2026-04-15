/** User-visible copy for the main-thread private-draft composer (ui-features §9). */

export const PRIVATE_BRANCH_LEAD = "Private draft";

/** Shown next to the checkbox (short line). */
export const PRIVATE_BRANCH_DESCRIPTION =
  "When checked: private lines stay visible in the tree and thread; when unchecked they are hidden until you check again. Your next send is private only while checked.";

/** Native tooltip on the whole control (slightly longer). */
export const PRIVATE_BRANCH_LABEL_TITLE =
  "When checked, your next send stores a private user line under the selected tree node; the assistant reply under it inherits the same private scope. Uncheck to send a shared line and to hide existing private events from this panel until you check again. Collaborators never see private lines (see repo docs for branching semantics).";
