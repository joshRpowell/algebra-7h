/* Algebra 7H — published site config.
 *
 * MUST CONTAIN ZERO IDENTIFYING INFORMATION. This file is served publicly.
 * Anything naming a teacher, a school, or a learner belongs in site.conf or
 * .leakpatterns, neither of which is ever published (INV-3, INV-4).
 *
 * Loaded first in every page's <head>, before the no-flash script and the stylesheets.
 */
window.SITE = {
  // Identity of the site
  title: "Algebra 7 Honors",
  term:  "2026–2027",
  pagesUrl: "https://joshrpowell.github.io/algebra-7h/",

  // localStorage prefix. NEVER CHANGE THIS on a live site — every learner's saved
  // progress and roster is stored under it, and renaming silently wipes all of it.
  ns: "alg7h",

  // Where a finished run is filed. Private repo; see INV-5.
  progressRepo: "joshRpowell/algebra-7h-progress",
  labels: { run: "results", review: "needs-review", lesson: "lesson:" },

  // Grading + UI copy that varies by subject
  subject: "algebra",   // used to group runs in the cross-subject progress DB
  grader: "algebra",
  answerPlaceholder: "x = ?  or  no solution"
};
