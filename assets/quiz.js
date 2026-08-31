/* Algebra 7H — shared quiz engine.
 * Renders a practice set, grades it instantly, remembers progress in this browser,
 * and can save a run as a GitHub issue in the PRIVATE progress repo.
 *
 * Usage from a lesson page:
 *   Quiz.mount({ lesson:"0001", title:"...", unit:"Unit 1 — ...",
 *                mount:"#quiz", problems:[ {prompt, answer, hint, sol}, ... ] });
 */
(function (global) {
  "use strict";

  var PROGRESS_REPO = "joshRpowell/algebra-7h-progress";

  /* ---------------- student identity ----------------
   * Several kids share this site, so every run has to say who did it, and each
   * kid's saved progress has to live under its own key or they clobber each
   * other on a shared browser. First names only — enough to tell runs apart.
   */
  var ROSTER_KEY = "alg7h:roster", CURRENT_KEY = "alg7h:current";

  function lsGet(k, dflt) {
    try { var v = localStorage.getItem(k); return v === null ? dflt : JSON.parse(v); }
    catch (e) { return dflt; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function cleanName(raw) {
    var s = String(raw || "")
      .replace(/[^A-Za-z0-9\u00C0-\u024F '\-]/g, "")  // letters (incl. accents), digits, space, apostrophe, hyphen
      .replace(/\s+/g, " ").trim().slice(0, 24);
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function slugify(n) {
    return String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  var Student = {
    roster:  function () { var r = lsGet(ROSTER_KEY, []); return Array.isArray(r) ? r : []; },
    current: function () { var c = lsGet(CURRENT_KEY, null); return typeof c === "string" && c ? c : null; },
    set: function (name) {
      var n = cleanName(name);
      if (!n) return null;
      var r = this.roster();
      if (r.indexOf(n) === -1) { r.push(n); r.sort(); lsSet(ROSTER_KEY, r); }
      lsSet(CURRENT_KEY, n);
      return n;
    },
    clear: function () { try { localStorage.removeItem(CURRENT_KEY); } catch (e) {} }
  };


  var NONE = ["nosolution","none","no","nosolutions","emptyset","empty","∅","{}","nosol"];
  var ALL  = ["all","allreals","allrealnumbers","infinite","infinitelymany",
              "infinitelymanysolutions","infinitesolutions","infinity","everynumber","alln"];

  /* Parse a linear expression in x ("-2x + 10", "10-2x", "-x", "3x-2x+4")
   * into {a, b} for ax + b. Returns null if it is not a plain linear expression,
   * so anything unusual falls through to a literal string comparison. */
  function parseLinear(s) {
    if (!/x/.test(s)) return null;
    if (!/^[-+0-9x.]*$/.test(s)) return null;          // no parens, no other letters
    var terms = s.replace(/-/g, "+-").split("+").filter(function (t) { return t !== ""; });
    var a = 0, b = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (t.indexOf("x") > -1) {
        var c = t.replace("x", "");
        if (c === "" || c === "+") c = "1";
        if (c === "-") c = "-1";
        var av = parseFloat(c);
        if (isNaN(av)) return null;
        a += av;
      } else {
        var bv = parseFloat(t);
        if (isNaN(bv)) return null;
        b += bv;
      }
    }
    return { a: a, b: b };
  }

  function normalize(raw) {
    var s = String(raw).toLowerCase().trim()
      .replace(/[−–—]/g, "-")      // unicode minus / dashes -> hyphen
      .replace(/\u00b7|\*/g, "")   // stray multiplication marks
      .replace(/[\s,]/g, "");
    if (NONE.indexOf(s) > -1) return "none";
    if (ALL.indexOf(s)  > -1) return "all";
    s = s.replace(/^x=/, "");
    if (/^[+-]?\d+(\.\d+)?$/.test(s)) return String(parseFloat(s));
    var lin = parseLinear(s);
    if (lin) return lin.a + "x" + (lin.b >= 0 ? "+" : "") + lin.b;   // canonical ax+b
    return s;
  }

  function esc(t) {
    return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function Quiz(cfg, student) {
    this.cfg = cfg;
    this.P = cfg.problems;
    this.student = student;
    this.key = "alg7h:" + slugify(student) + ":" + cfg.lesson;
    this.started = Date.now();
    this.stats = this.P.map(function () {
      return { attempts:0, solved:false, firstTry:false, hint:false, shownSol:false, wrong:[] };
    });
    this.restore();
  }

  /* ---------- persistence (this browser) ---------- */
  Quiz.prototype.save = function () {
    try {
      localStorage.setItem(this.key, JSON.stringify({
        stats: this.stats, started: this.started, saved: Date.now()
      }));
    } catch (e) { /* private mode / storage off — feature degrades, page still works */ }
  };
  Quiz.prototype.restore = function () {
    try {
      var raw = localStorage.getItem(this.key);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && Array.isArray(d.stats) && d.stats.length === this.P.length) {
        this.stats = d.stats;
        if (d.started) this.started = d.started;
      }
    } catch (e) {}
  };
  Quiz.prototype.reset = function () {
    try { localStorage.removeItem(this.key); } catch (e) {}
    location.reload();
  };

  /* ---------- rendering ---------- */
  Quiz.prototype.mount = function () {
    var self = this, host = document.querySelector(this.cfg.mount);

    this.P.forEach(function (p, i) {
      var el = document.createElement("div");
      el.className = "q"; el.id = "q" + i;
      el.innerHTML =
        '<div class="qhead">Problem ' + (i+1) + ' of ' + self.P.length + '</div>' +
        '<div class="prompt">' + p.prompt + '</div>' +
        '<div class="row">' +
          '<input type="text" id="in' + i + '" placeholder="x = ?  or  no solution" ' +
                 'autocomplete="off" spellcheck="false" aria-label="Answer to problem ' + (i+1) + '">' +
          '<button data-check="' + i + '">Check</button>' +
          '<button class="ghost" data-hint="' + i + '">Hint</button>' +
          '<button class="ghost" data-sol="' + i + '">Show solution</button>' +
        '</div>' +
        '<div class="hint" id="hint' + i + '" style="display:none">' + p.hint + '</div>' +
        '<div class="fb" id="fb' + i + '"><div class="verdictline"></div><div class="detail"></div></div>' +
        '<div class="sol" id="sol' + i + '"><pre>' + esc(p.sol) + '</pre></div>';
      host.appendChild(el);
    });

    host.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.check !== undefined) self.check(+b.dataset.check);
      if (b.dataset.hint  !== undefined) self.showHint(+b.dataset.hint);
      if (b.dataset.sol   !== undefined) self.showSol(+b.dataset.sol);
    });

    this.P.forEach(function (_, i) {
      document.getElementById("in" + i).addEventListener("keydown", function (e) {
        if (e.key === "Enter") self.check(i);
      });
    });

    this.renderSavePanel();
    this.repaint();
  };

  Quiz.prototype.showHint = function (i) {
    document.getElementById("hint" + i).style.display = "block";
    if (!this.stats[i].solved) { this.stats[i].hint = true; this.save(); }
  };
  Quiz.prototype.showSol = function (i) {
    document.getElementById("sol" + i).classList.add("show");
    if (!this.stats[i].solved) { this.stats[i].shownSol = true; this.save(); }
  };

  Quiz.prototype.check = function (i) {
    var p = this.P[i], st = this.stats[i];
    var raw = document.getElementById("in" + i).value;
    if (!raw.trim()) return;

    var got = normalize(raw), want = normalize(p.answer);
    var card = document.getElementById("q" + i);
    var fb = document.getElementById("fb" + i);
    var line = fb.querySelector(".verdictline");
    var det  = fb.querySelector(".detail");
    fb.classList.add("show");

    if (!st.solved) st.attempts++;

    if (got === want) {
      if (!st.solved) {
        st.solved = true;
        st.firstTry = (st.attempts === 1 && !st.hint && !st.shownSol);
      }
      card.classList.remove("wrong"); card.classList.add("right");
      fb.classList.remove("no"); fb.classList.add("ok");
      line.textContent = st.firstTry ? "Correct — first try." : "Correct.";
      det.textContent = want === "none"
        ? "The variable cancelled and left a false statement — a contradiction, so there is no solution."
        : want === "all"
        ? "The variable cancelled and left a true statement — an identity, so every real number works."
        : "Now say it out loud: which step would you write down to justify it?";
      document.getElementById("sol" + i).classList.add("show");
    } else {
      if (!st.solved && st.wrong.indexOf(raw.trim()) === -1) st.wrong.push(raw.trim());
      card.classList.remove("right"); card.classList.add("wrong");
      fb.classList.remove("ok"); fb.classList.add("no");
      line.textContent = "Not quite — try once more.";
      // A predicted wrong answer gets a diagnosis of that specific mistake.
      var hit = null;
      if (p.commonErrors) {
        for (var k = 0; k < p.commonErrors.length; k++) {
          if (normalize(p.commonErrors[k].ans) === got) { hit = p.commonErrors[k]; break; }
        }
      }
      if (hit) {
        det.textContent = hit.say;
      } else if (p.whenWrong) {
        det.textContent = p.whenWrong;
      } else if (got === "0" && (want === "none" || want === "all")) {
        det.textContent = "This is the trap. The variable disappearing does NOT mean x = 0 — it tells you about the NUMBER of solutions. Look at the statement left over and ask whether it's true or false.";
      } else if ((got === "none" || got === "all") && want !== "none" && want !== "all") {
        det.textContent = "The variable doesn't actually cancel here — the coefficients on the two sides are different. Redo the step where you moved the variable term.";
      } else if (want === "none" || want === "all") {
        det.textContent = "Watch what happens to the variable term when you subtract it from both sides. Does any x survive?";
      } else {
        det.textContent = "Check your signs first — that's usually where this goes wrong. Hit Hint for a nudge, or Show solution for every step.";
      }
      document.getElementById("hint" + i).style.display = "block";
    }
    this.save();
    this.repaint();
  };

  /* ---------- score + restored state ---------- */
  Quiz.prototype.repaint = function () {
    var self = this, n = 0, first = 0, attempted = 0;
    this.stats.forEach(function (st, i) {
      if (st.solved) {
        n++;
        var card = document.getElementById("q" + i);
        card.classList.add("right");
        document.getElementById("sol" + i).classList.add("show");
      }
      if (st.firstTry) first++;
      if (st.attempts > 0) attempted++;
      if (st.hint) document.getElementById("hint" + i).style.display = "block";
      if (st.shownSol) document.getElementById("sol" + i).classList.add("show");
    });
    var total = this.P.length;
    var txt = document.getElementById("scoretext");
    if (txt) txt.textContent = n + " of " + total + (first ? "  ·  " + first + " first try" : "");
    var bar = document.getElementById("bar");
    if (bar) bar.style.width = (100 * n / total) + "%";
    var done = document.getElementById("done");
    if (done && n === total) done.classList.add("show");

    var btn = document.getElementById("saveBtn");
    if (btn) {
      btn.disabled = attempted === 0;
      btn.textContent = n === total ? "Save my results to GitHub"
                                    : "Save progress so far (" + n + "/" + total + ")";
    }
    var rb = document.getElementById("resetBtn");
    if (rb) rb.style.display = attempted ? "inline-block" : "none";
    this.lastCounts = { solved:n, first:first, total:total, attempted:attempted };
  };

  /* ---------- GitHub issue export ---------- */
  Quiz.prototype.buildIssue = function () {
    var c = this.lastCounts, cfg = this.cfg, self = this;
    var mins = Math.max(1, Math.round((Date.now() - this.started) / 60000));

    var rows = this.stats.map(function (st, i) {
      var status = st.solved ? (st.firstTry ? "✅ first try" : "☑️ solved") : "❌ unsolved";
      var aids = [];
      if (st.hint) aids.push("hint");
      if (st.shownSol) aids.push("solution");
      return "| " + (i+1) + " | `" + self.P[i].prompt + "` | " + status + " | " +
             st.attempts + " | " + (aids.length ? aids.join(", ") : "—") + " | " +
             (st.wrong.length ? "`" + st.wrong.slice(0,4).join("`, `") + "`" : "—") + " |";
    }).join("\n");

    var struggled = this.stats
      .map(function (st, i) { return (!st.solved || st.attempts > 2 || st.shownSol) ? (i+1) : null; })
      .filter(function (x) { return x; });

    var title = this.student + " · Lesson " + cfg.lesson + " — " + cfg.title + " — " +
                c.solved + "/" + c.total + " (" + c.first + " first try)";

    var body =
      "**Student:** " + this.student + "  \n" +
      "**Lesson:** " + cfg.lesson + " — " + cfg.title + "  \n" +
      "**Unit:** " + cfg.unit + "  \n" +
      "**Finished:** " + new Date().toLocaleString() + "  \n" +
      "**Time on page:** ~" + mins + " min\n\n" +
      "## Score\n\n" +
      "- Solved: **" + c.solved + " / " + c.total + "**\n" +
      "- Correct on the first try, no help: **" + c.first + "**\n" +
      (struggled.length
        ? "- Worth revisiting: problems **" + struggled.join(", ") + "**\n"
        : "- Nothing flagged for review.\n") +
      "\n## Problem by problem\n\n" +
      "| # | Problem | Result | Attempts | Used | Wrong answers tried |\n" +
      "|---|---------|--------|----------|------|---------------------|\n" +
      rows + "\n\n" +
      "## Notes for my tutor\n\n" +
      "_Anything confusing? Type it here before you submit._\n\n" +
      "<!-- machine-readable; do not edit below -->\n" +
      "```json\n" +
      JSON.stringify({
        student: this.student, lesson: cfg.lesson, solved: c.solved, total: c.total,
        firstTry: c.first, minutes: mins,
        problems: this.stats.map(function (st, i) {
          return { n:i+1, solved:st.solved, firstTry:st.firstTry,
                   attempts:st.attempts, hint:st.hint, solution:st.shownSol,
                   wrong:st.wrong };
        })
      }, null, 1) + "\n```\n";

    // Only labels that already exist in the repo — GitHub's prefill URL drops
    // unknown ones, so the student name lives in the title/body/JSON instead.
    var labels = "results,lesson:" + cfg.lesson + (struggled.length ? ",needs-review" : "");
    return {
      title: title, body: body,
      url: "https://github.com/" + PROGRESS_REPO + "/issues/new" +
           "?title=" + encodeURIComponent(title) +
           "&body="  + encodeURIComponent(body) +
           "&labels=" + encodeURIComponent(labels)
    };
  };

  Quiz.prototype.renderSavePanel = function () {
    var self = this;
    var host = document.getElementById("savepanel");
    if (!host) return;
    host.innerHTML =
      '<h3>Save your results</h3>' +
      '<p>Saving as <strong>' + esc(this.student) + '</strong>. ' +
      'Sends this run to the <strong>private</strong> progress repo as a GitHub issue, ' +
      'so it follows you between computers and your tutor can see how it actually went. ' +
      'GitHub opens with everything filled in — add a note if you want, then hit ' +
      '<em>Create</em>.</p>' +
      '<div class="row">' +
        '<button id="saveBtn" disabled>Save my results to GitHub</button>' +
        '<button class="ghost" id="copyBtn">Copy as text</button>' +
        '<button class="ghost" id="resetBtn" style="display:none">Start over</button>' +
      '</div>' +
      '<div class="hint" id="saveMsg" style="display:none"></div>';

    document.getElementById("saveBtn").addEventListener("click", function () {
      var issue = self.buildIssue();
      window.open(issue.url, "_blank", "noopener");
      msg("Opened GitHub in a new tab. Press <strong>Create</strong> there to save it. " +
          "If the tab is blank, you may need to sign in to GitHub first.");
    });

    document.getElementById("copyBtn").addEventListener("click", function () {
      var issue = self.buildIssue();
      var text = "# " + issue.title + "\n\n" + issue.body;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { msg("Copied. Paste it anywhere — a new issue, a note, or a message to your tutor."); },
          function () { fallback(text); });
      } else { fallback(text); }
    });

    document.getElementById("resetBtn").addEventListener("click", function () {
      if (confirm("Clear your saved answers for this lesson and start fresh?")) self.reset();
    });

    function fallback(text) {
      var w = window.open("", "_blank");
      if (w) { w.document.write("<pre>" + esc(text) + "</pre>"); w.document.close(); }
      msg("Clipboard blocked by the browser — your results opened in a new tab instead.");
    }
    function msg(html) {
      var m = document.getElementById("saveMsg");
      m.innerHTML = html; m.style.display = "block";
    }
  };

  /* ---------------- student bar / picker ---------------- */
  function renderIdentity(cfg, onReady) {
    var bar = document.getElementById("studentbar");
    if (!bar) { onReady(Student.current() || "Unknown"); return; }

    function showCurrent(name) {
      bar.className = "studentbar";
      bar.innerHTML =
        '<span class="who">Working as <strong>' + esc(name) + '</strong></span>' +
        '<button class="ghost" id="switchBtn">Not you? Switch</button>';
      document.getElementById("switchBtn").addEventListener("click", function () {
        Student.clear();
        showPicker(true);
      });
    }

    function showPicker(isSwitch) {
      var r = Student.roster();
      bar.className = "studentbar picking";
      bar.innerHTML =
        '<div class="pickwrap">' +
          '<h3>Who\'s working on this lesson?</h3>' +
          '<p>Your answers and progress are saved separately for each person, so you ' +
          'won\'t overwrite anyone else\'s work.</p>' +
          (r.length
            ? '<div class="row roster">' + r.map(function (n) {
                return '<button data-pick="' + esc(n) + '">' + esc(n) + '</button>';
              }).join("") + '</div>' +
              '<p class="or">or add someone new:</p>'
            : "") +
          '<div class="row">' +
            '<input type="text" id="newName" placeholder="First name" maxlength="24" ' +
                   'autocomplete="off" aria-label="Your first name">' +
            '<button id="startBtn">Start</button>' +
          '</div>' +
          '<div class="hint" id="nameErr" style="display:none"></div>' +
        '</div>';

      bar.querySelectorAll("[data-pick]").forEach(function (b) {
        b.addEventListener("click", function () { choose(b.dataset.pick, isSwitch); });
      });
      var input = document.getElementById("newName");
      document.getElementById("startBtn").addEventListener("click", function () {
        choose(input.value, isSwitch);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") choose(input.value, isSwitch);
      });
      if (!isSwitch) setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    }

    function choose(raw, isSwitch) {
      var name = Student.set(raw);
      if (!name) {
        var err = document.getElementById("nameErr");
        if (err) { err.textContent = "Type a first name to get started."; err.style.display = "block"; }
        return;
      }
      if (isSwitch) { location.reload(); return; }   // reload so the right saved progress loads
      showCurrent(name);
      onReady(name);
    }

    var cur = Student.current();
    if (cur) { showCurrent(cur); onReady(cur); }
    else { showPicker(false); }
  }

  global.Quiz = {
    mount: function (cfg) {
      renderIdentity(cfg, function (student) {
        var q = new Quiz(cfg, student);
        q.mount();
        global.__quiz = q;
      });
    },
    normalize: normalize,
    Student: Student,
    _cleanName: cleanName,
    _slugify: slugify
  };
})(window);
