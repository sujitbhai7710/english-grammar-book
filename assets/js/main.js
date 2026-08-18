/**
 * main.js — Concept Book of English Grammar (Premium Interactive Edition)
 *
 * Responsibilities:
 *   1. computeBasePath()  — robust subpath handling for GitHub Pages
 *   2. Homepage: render TOC from data/toc.json with search + section tabs
 *   3. Chapter page: render theory as colored callouts + bullet points,
 *      render MCQs with click-to-reveal interactivity, progress bar, score
 *
 * No frameworks — pure vanilla JS.
 */
(function () {
  "use strict";

  /* ===================================================================
   * 1. Base path computation (works for /index.html AND /chapters/chXX.html)
   * =================================================================== */
  function computeBasePath() {
    var path = window.location.pathname;
    if (path.endsWith("/index.html")) {
      path = path.substring(0, path.length - "index.html".length);
    } else if (path.endsWith("/")) {
      // directory path — keep
    } else if (path.indexOf("/chapters/") !== -1) {
      path = path.substring(0, path.indexOf("/chapters/") + 1);
    } else {
      path = path.substring(0, path.lastIndexOf("/") + 1);
    }
    if (!path.endsWith("/")) path = path + "/";
    return path;
  }
  var BASE = computeBasePath();

  function url(relativePath) {
    relativePath = relativePath.replace(/^\/+/, "");
    return BASE + relativePath;
  }

  /* ===================================================================
   * 2. HTML helpers
   * =================================================================== */
  function escapeHtml(text) {
    if (text == null) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(String(text)));
    return div.innerHTML;
  }
  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Grammar-term inline chips */
  var GRAMMAR_TERMS = [
    ["Subject", "t-subject"],
    ["Verb", "t-verb"],
    ["Noun", "t-noun"],
    ["Adjective", "t-adj"],
    ["Adverb", "t-adv"],
    ["Preposition", "t-prep"],
    ["Conjunction", "t-conj"],
    ["Pronoun", "t-pronoun"],
    ["Interjection", "t-pronoun"],
    ["Gerund", "t-noun"],
    ["Participle", "t-adj"],
    ["Infinitive", "t-verb"],
    ["Object", "t-subject"],
    ["Clause", "t-conj"],
    ["Phrase", "t-conj"],
  ];

  function highlightTerms(escaped) {
    var html = escaped;
    for (var i = 0; i < GRAMMAR_TERMS.length; i++) {
      var term = GRAMMAR_TERMS[i][0];
      var cls = GRAMMAR_TERMS[i][1];
      // Match word boundary, capitalized term, word boundary
      var re = new RegExp("\\b(" + term + ")\\b", "g");
      html = html.replace(re, '<span class="term-chip ' + cls + '">$1</span>');
    }
    return html;
  }

  /* Build a callout block */
  function callout(type, label, icon, htmlContent) {
    return (
      '<div class="callout callout-' + type + '">' +
      '<span class="callout-icon" aria-hidden="true">' + icon + "</span>" +
      '<div class="callout-body">' +
      (label ? '<div class="callout-title">' + label + "</div>" : "") +
      '<div class="callout-text">' + htmlContent + "</div>" +
      "</div></div>"
    );
  }

  /* ===================================================================
   * 3. Theory parsing & rendering
   * =================================================================== */

  /* Classify a single sentence/clause into a content type */
  function classifySentence(s) {
    var t = s.trim();
    if (!t) return null;
    var lower = t.toLowerCase();

    // Notes / warnings
    if (/^(note|remember|important|warning|caution|tip)\b[:\-]?/i.test(t)) {
      return { type: "note", text: t };
    }
    // Formulas / rules
    if (/^(formula|rule|structure|pattern)\b[:\-]?/i.test(t)) {
      return { type: "formula", text: t };
    }
    if (/[=→]/.test(t) && t.length < 200) {
      return { type: "formula", text: t };
    }
    if (/\b[A-Z][a-z]+\s*\+\s*[A-Z][a-zA-Z0-9]*\b/.test(t)) {
      // "Subject + V2 + Object" style formula
      return { type: "formula", text: t };
    }
    // Examples
    if (/^(examples?|e\.g\.|for example|ex\.?)\b[:\-\s]/i.test(t)) {
      return { type: "example", text: t };
    }
    // List-like (comma-separated capitalized words ending with "etc.")
    if (/\betc\.?$/i.test(t) && /^[A-Z]/.test(t) && t.split(",").length >= 2) {
      return { type: "example", text: t };
    }
    // Definition
    if (
      /\b(is a|is an|is the|is used to|is a word that|refers to|means|is defined as)\b/i.test(
        lower
      )
    ) {
      return { type: "definition", text: t };
    }
    // Heading-like (short, all-caps or Title Case with no period)
    if (
      t.length < 80 &&
      !/[.;]$/.test(t) &&
      /^[A-Z][A-Za-z\s&\-]+$/.test(t) &&
      t.split(" ").length <= 6
    ) {
      return { type: "heading", text: t };
    }
    return { type: "paragraph", text: t };
  }

  /* Render classified sentence to HTML */
  function renderClassified(item) {
    if (!item) return "";
    var text = item.text;
    var html = highlightTerms(escapeHtml(text));
    switch (item.type) {
      case "definition":
        return callout("blue", "Definition", "💡", html);
      case "example":
        return callout("green", "Examples", "✅", html);
      case "note":
        return callout("yellow", "Note", "⚠️", html);
      case "formula":
        return (
          callout("purple", "Formula / Rule", "📐", html)
        );
      case "heading":
        return '<h3 class="theory-heading">' + html + "</h3>";
      default:
        return "<p>" + html + "</p>";
    }
  }

  /* Try to detect numbered list items like "1 Noun A noun is..."
   * Returns { groups: [[block, block, ...], [block, ...]], firstStart } or null.
   * Groups are split whenever the number resets (e.g. 8 → 1 starts a new list).
   */
  function tryParseNumberedItems(text) {
    // Match "N Title" where N is a digit and Title is 1-3 capitalized words,
    // immediately followed by whitespace and a letter or "(".
    // NOTE: the optional title-word group requires 2+ trailing letters after the
    // leading capital — this prevents greedy matching of articles like " A" or
    // " An" as part of the title (e.g. "1 Noun A noun is..." → title "Noun", not
    // "Noun A"). Single-char capitalized words (articles) thus stay in content.
    var re = /(\d+)\s+([A-Z][A-Za-z''\-&]*(?:\s+[A-Z][A-Za-z''\-&]{2,}){0,2})\s+(?=[A-Za-z(])/g;
    var matches = [];
    var m;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        number: parseInt(m[1], 10),
        title: m[2].trim()
      });
    }
    if (matches.length < 3) return null;

    // Build blocks; also split into groups when number resets.
    var blocks = [];
    for (var i = 0; i < matches.length; i++) {
      var contentStart = matches[i].end;
      var contentEnd = i + 1 < matches.length ? matches[i + 1].start : text.length;
      var content = text.substring(contentStart, contentEnd).trim();
      // Drop trailing number that may belong to next item
      content = content.replace(/\s+\d+\s*$/, "").trim();
      blocks.push({
        type: "numbered",
        number: matches[i].number,
        title: matches[i].title,
        content: content,
        isFirstOfGroup:
          i === 0 || matches[i].number <= matches[i - 1].number
      });
    }

    // Group blocks into separate lists (each list resets numbering).
    // Drop stray single-item "groups" (likely false-positive matches such as
    // "1 Parts of Speech" appearing inside another item's content).
    var groups = [];
    var currentGroup = [];
    for (var j = 0; j < blocks.length; j++) {
      if (blocks[j].isFirstOfGroup && currentGroup.length > 0) {
        if (currentGroup.length >= 2) groups.push(currentGroup);
        else {
          // Single-item group: fold its content back into the previous group's
          // last item (so we don't lose the text).
          if (groups.length > 0) {
            var prevGroup = groups[groups.length - 1];
            var prevLast = prevGroup[prevGroup.length - 1];
            if (prevLast && currentGroup[0]) {
              prevLast.content =
                (prevLast.content || "") +
                " " + currentGroup[0].number + " " + currentGroup[0].title +
                " " + (currentGroup[0].content || "");
            }
          }
        }
        currentGroup = [];
      }
      currentGroup.push(blocks[j]);
    }
    if (currentGroup.length > 0) {
      if (currentGroup.length >= 2) groups.push(currentGroup);
      else if (groups.length > 0) {
        var prevGroup2 = groups[groups.length - 1];
        var prevLast2 = prevGroup2[prevGroup2.length - 1];
        if (prevLast2 && currentGroup[0]) {
          prevLast2.content =
            (prevLast2.content || "") +
            " " + currentGroup[0].number + " " + currentGroup[0].title +
            " " + (currentGroup[0].content || "");
        }
      }
    }
    if (groups.length === 0) return null;

    return { groups: groups, firstStart: matches[0].start };
  }

  /* Split content into sentences/clauses for classification */
  function splitSentences(text) {
    // Split on period+space, exclamation, question mark, OR semicolon
    var parts = text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?;])\s+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    return parts;
  }

  /* Split a numbered-item's content into definition + example portions.
   * Strategy: classify each sentence; group consecutive same-type.
   */
  function renderItemContent(content) {
    if (!content) return "";
    var sentences = splitSentences(content);
    var html = "";
    for (var i = 0; i < sentences.length; i++) {
      var item = classifySentence(sentences[i]);
      html += renderClassified(item);
    }
    return html;
  }

  /* Main theory renderer */
  function renderTheory(theory) {
    if (!theory || !theory.trim()) return "";
    // Normalize: collapse all whitespace (including \n) into single spaces
    var text = theory.replace(/\s+/g, " ").trim();

    var html = "";

    // 1. Try to detect a numbered list structure
    var numbered = tryParseNumberedItems(text);
    if (numbered) {
      // Render preamble (anything before the first numbered item) as paragraphs
      if (numbered.firstStart > 0) {
        var preamble = text.substring(0, numbered.firstStart).trim();
        if (preamble) {
          var preSentences = splitSentences(preamble);
          for (var p = 0; p < preSentences.length; p++) {
            html += renderClassified(classifySentence(preSentences[p]));
          }
        }
      }
      // Render each group as a separate <ol> (resets numbering per group)
      for (var g = 0; g < numbered.groups.length; g++) {
        var group = numbered.groups[g];
        html += '<ol class="theory-list">';
        for (var i = 0; i < group.length; i++) {
          var b = group[i];
          var itemHtml =
            '<strong class="li-title">' +
            highlightTerms(escapeHtml(b.title)) +
            "</strong>";
          if (b.content) {
            itemHtml += " — " + renderItemContent(b.content);
          }
          html += "<li>" + itemHtml + "</li>";
        }
        html += "</ol>";
      }
      return html;
    }

    // 2. Fall back to sentence-by-sentence classification
    var sentences = splitSentences(text);
    var listBuffer = []; // buffer for consecutive paragraph/heading items
    function flushParagraphs() {
      if (listBuffer.length === 0) return;
      var combined = listBuffer.join(" ");
      html += "<p>" + highlightTerms(escapeHtml(combined)) + "</p>";
      listBuffer = [];
    }
    for (var j = 0; j < sentences.length; j++) {
      var item = classifySentence(sentences[j]);
      if (!item) continue;
      if (item.type === "paragraph" || item.type === "heading") {
        if (item.type === "heading") {
          flushParagraphs();
          html += '<h3 class="theory-heading">' +
            highlightTerms(escapeHtml(item.text)) + "</h3>";
        } else {
          listBuffer.push(item.text);
        }
      } else {
        flushParagraphs();
        html += renderClassified(item);
      }
    }
    flushParagraphs();
    return html;
  }

  /* ===================================================================
   * 4. MCQ rendering & interactivity
   * =================================================================== */
  var totalMcqs = 0;
  var correctCount = 0;
  var answeredCount = 0;

  function renderMcqCard(mcq, index) {
    var html = '<div class="mcq-card" data-qno="' + mcq.qno + '" data-index="' + index + '">';
    html += '<div class="mcq-header">';
    html += '<span class="mcq-number">Q' + mcq.qno + "</span>";
    if (mcq.exam_source && mcq.exam_source.trim()) {
      html += '<span class="mcq-source">📌 ' + escapeHtml(mcq.exam_source) + "</span>";
    }
    if (mcq.format && mcq.format !== "regular") {
      var fmtLabel = mcq.format.replace(/_/g, " ");
      html += '<span class="mcq-format">🎯 ' + escapeHtml(fmtLabel) + "</span>";
    }
    html += "</div>";
    html +=
      '<div class="mcq-question">' +
      highlightTerms(escapeHtml(mcq.question)) +
      "</div>";
    html += '<div class="mcq-options">';
    var letters = ["a", "b", "c", "d", "e"];
    for (var i = 0; i < letters.length; i++) {
      var letter = letters[i];
      if (!mcq.options[letter]) continue;
      var optText = mcq.options[letter];
      if (mcq.format === "error_spotting" && !optText) {
        optText = "(d) No error";
      }
      html +=
        '<button class="mcq-option" data-letter="' + letter +
        '" data-correct="' + escapeAttr(mcq.correct) + '">';
      html += '<span class="option-letter">' + letter.toUpperCase() + "</span>";
      html += '<span class="option-text">' + escapeHtml(optText) + "</span>";
      html += '<span class="option-icon"></span>';
      html += "</button>";
    }
    html += "</div>";

    // Explanation (hidden until answered)
    var explanationHtml = "";
    if (mcq.explanation && mcq.explanation.trim()) {
      explanationHtml =
        '<div class="explanation-text">' +
        highlightTerms(escapeHtml(mcq.explanation)) +
        "</div>";
    } else if (mcq.format === "error_spotting") {
      explanationHtml =
        '<div class="explanation-text">The error is in part (' +
        escapeHtml(mcq.correct) + ").</div>";
    } else {
      explanationHtml =
        '<div class="explanation-text">Correct answer is option (' +
        escapeHtml(mcq.correct.toUpperCase()) + ").</div>";
    }
    html +=
      '<div class="mcq-explanation">' +
      '<span class="explanation-label">💡 Explanation</span>' +
      explanationHtml +
      "</div>";

    html += "</div>";
    return html;
  }

  function attachMcqHandlers() {
    var cards = document.querySelectorAll(".mcq-card");
    cards.forEach(function (card) {
      var options = card.querySelectorAll(".mcq-option");
      options.forEach(function (opt) {
        opt.addEventListener("click", function () {
          if (card.classList.contains("answered")) return;
          var clickedLetter = opt.getAttribute("data-letter");
          var correctLetter = opt.getAttribute("data-correct");
          var correctIcon = "✓";
          var wrongIcon = "✗";
          if (clickedLetter === correctLetter) {
            opt.classList.add("correct");
            opt.querySelector(".option-icon").textContent = correctIcon;
            card.classList.add("answered", "correct-pick");
            correctCount++;
          } else {
            opt.classList.add("wrong");
            opt.querySelector(".option-icon").textContent = wrongIcon;
            // Also mark the correct option in green
            options.forEach(function (o) {
              if (o.getAttribute("data-letter") === correctLetter) {
                o.classList.add("correct");
                o.querySelector(".option-icon").textContent = correctIcon;
              }
            });
            card.classList.add("answered", "wrong-pick");
          }
          // Disable all options
          options.forEach(function (o) { o.disabled = true; });
          // Show explanation
          var exp = card.querySelector(".mcq-explanation");
          if (exp) exp.classList.add("shown");
          answeredCount++;
          updateProgress();
        });
      });
    });
  }

  function updateProgress() {
    var total = totalMcqs;
    if (total === 0) return;
    var bar = document.getElementById("progress-bar");
    var text = document.getElementById("progress-text");
    var score = document.getElementById("score-pill");
    var pct = (answeredCount / total) * 100;
    if (bar) bar.style.width = pct + "%";
    if (text) text.textContent = answeredCount + " / " + total + " answered";
    if (score) {
      score.textContent = "⭐ Score: " + correctCount + "/" + total;
      if (answeredCount === total) {
        var pctCorrect = Math.round((correctCount / total) * 100);
        var emoji = pctCorrect >= 80 ? "🏆" : pctCorrect >= 50 ? "🎉" : "📚";
        score.textContent = emoji + " Final Score: " + correctCount + "/" + total + " (" + pctCorrect + "%)";
      }
    }
  }

  /* ===================================================================
   * 5. Homepage rendering
   * =================================================================== */
  var tocData = null;
  var activeSection = "ALL";

  function renderTOC() {
    var container = document.getElementById("toc-container");
    if (!container) return;
    fetch(url("data/toc.json"))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        tocData = data;
        var html = "";
        var totalChapters = 0;
        var totalMcqsLocal = 0;
        var sectionsCount = 0;

        data.sections.forEach(function (section) {
          if (section.chapters.length === 0) return;
          sectionsCount++;
          totalChapters += section.chapters.length;
          var secMcqs = 0;
          section.chapters.forEach(function (ch) { secMcqs += ch.mcq_count; });
          totalMcqsLocal += secMcqs;

          html += '<section class="section" data-section="' + section.id + '">';
          html +=
            '<h2 class="section-title" data-sec="' + section.id + '">' +
            '<span class="sec-chip">' + escapeHtml(section.id) + "</span>" +
            escapeHtml(section.name) +
            '<span class="section-meta">' + section.chapters.length +
            " chapters · " + secMcqs.toLocaleString() + " MCQs</span>" +
            "</h2>";
          html += '<div class="chapter-grid">';
          section.chapters.forEach(function (ch) {
            html +=
              '<a class="chapter-card" href="' + url(ch.page) +
              '" data-section="' + section.id + '" data-title="' + escapeAttr(ch.title.toLowerCase()) + '">';
            html += '<div class="ch-top">';
            html +=
              '<span class="ch-num"><span class="num-circle">' +
              ch.chapter_no + "</span> Chapter</span>";
            html +=
              '<span class="ch-section-badge">Section ' + escapeHtml(section.id) + "</span>";
            html += "</div>";
            html += '<div class="ch-title">' + escapeHtml(ch.title) + "</div>";
            html += '<div class="ch-meta">';
            html +=
              '<span class="ch-badge">📝 ' + ch.mcq_count + " MCQs</span>";
            html += '<span class="ch-arrow">→</span>';
            html += "</div></a>";
          });
          html += "</div></section>";
        });
        container.innerHTML = html;

        // Update hero stats
        var chStat = document.getElementById("stat-chapters");
        var mcqStat = document.getElementById("stat-mcqs");
        var secStat = document.getElementById("stat-sections");
        if (chStat) chStat.textContent = totalChapters;
        if (mcqStat) mcqStat.textContent = totalMcqsLocal.toLocaleString();
        if (secStat) secStat.textContent = sectionsCount;
      })
      .catch(function (err) {
        container.innerHTML =
          '<div class="empty-state"><span class="emoji">⚠️</span>' +
          "<p>Failed to load chapters. Please refresh the page.</p></div>";
        console.error(err);
      });
  }

  /* Homepage search filter */
  function initSearch() {
    var input = document.getElementById("search-input");
    if (!input) return;
    input.addEventListener("input", function () {
      var query = input.value.toLowerCase().trim();
      var cards = document.querySelectorAll(".chapter-card");
      cards.forEach(function (card) {
        var title = card.getAttribute("data-title") || "";
        var num = card.querySelector(".num-circle") ?
          card.querySelector(".num-circle").textContent.toLowerCase() : "";
        var match = !query ||
          title.indexOf(query) !== -1 ||
          num.indexOf(query) !== -1;
        // Respect active section tab too
        var secMatch = activeSection === "ALL" ||
          card.getAttribute("data-section") === activeSection;
        card.style.display = (match && secMatch) ? "" : "none";
      });
      document.querySelectorAll(".section").forEach(function (sec) {
        var visible = sec.querySelectorAll(
          '.chapter-card:not([style*="display: none"])'
        );
        sec.style.display = visible.length === 0 ? "none" : "";
      });
    });
  }

  /* Homepage section tab filter */
  function initSectionTabs() {
    var tabs = document.querySelectorAll(".section-tab");
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        activeSection = tab.getAttribute("data-section") || "ALL";
        // Trigger search re-filter
        var input = document.getElementById("search-input");
        if (input) {
          // Fire an input event
          input.dispatchEvent(new Event("input"));
        } else {
          applySectionFilter();
        }
      });
    });
  }

  function applySectionFilter() {
    var cards = document.querySelectorAll(".chapter-card");
    cards.forEach(function (card) {
      var sec = card.getAttribute("data-section");
      var show = activeSection === "ALL" || sec === activeSection;
      if (!show) card.style.display = "none";
      else card.style.display = "";
    });
    document.querySelectorAll(".section").forEach(function (sec) {
      var visible = sec.querySelectorAll(
        '.chapter-card:not([style*="display: none"])'
      );
      sec.style.display = visible.length === 0 ? "none" : "";
    });
  }

  /* ===================================================================
   * 6. Chapter page rendering
   * =================================================================== */
  function renderChapter() {
    var container = document.getElementById("chapter-content");
    var chNum = document.body.getAttribute("data-chapter");
    if (!chNum) return;
    var chNumInt = parseInt(chNum, 10);
    var chNumPadded = String(chNum).padStart(2, "0");

    fetch(url("data/ch" + chNumPadded + ".json"))
      .then(function (r) { return r.json(); })
      .then(function (ch) {
        // 1. Document title
        document.title =
          "Chapter " + ch.chapter_no + " — " + ch.title +
          " | Concept Book of English Grammar";

        // 2. Header
        var headerEl = document.getElementById("chapter-header");
        if (headerEl) {
          headerEl.setAttribute("data-section", ch.section || "A");
          var secClass = "section-pill";
          var breadcrumb =
            '<div class="breadcrumb">' +
            '<a href="' + url("index.html") + '">🏠 Home</a>' +
            '<span class="sep">›</span>' +
            '<span class="' + secClass + '">Section ' + escapeHtml(ch.section) + "</span>" +
            '<span class="sep">›</span>' +
            "<span>Chapter " + ch.chapter_no + "</span>" +
            "</div>";
          headerEl.innerHTML =
            breadcrumb +
            "<h1>" + escapeHtml(ch.title) + "</h1>" +
            '<div class="chapter-meta">' +
            '<span class="meta-pill">📚 Chapter ' + ch.chapter_no + "</span>" +
            '<span class="meta-pill">📄 Pages ' + ch.start_page + "–" + ch.end_page + "</span>" +
            '<span class="meta-pill">✍️ ' + ch.mcqs.length + " MCQs</span>" +
            '<span class="meta-pill ' + secClass + '">🏷️ Section ' + escapeHtml(ch.section) + "</span>" +
            "</div>";
        }

        // 3. Theory section (collapsible)
        var theoryEl = document.getElementById("theory-section");
        if (theoryEl) {
          if (ch.theory && ch.theory.trim()) {
            theoryEl.style.display = "";
            theoryEl.innerHTML =
              '<div class="theory-head" id="theory-head">' +
              "<h2>Concept &amp; Theory</h2>" +
              '<button class="theory-toggle" type="button" aria-expanded="true">' +
              '<span class="toggle-label">Collapse</span>' +
              '<span class="toggle-icon">▼</span>' +
              "</button></div>" +
              '<div class="theory-body" id="theory-body">' +
              renderTheory(ch.theory) +
              "</div>";
            // Wire up collapse toggle
            var head = document.getElementById("theory-head");
            if (head) {
              head.addEventListener("click", function () {
                theoryEl.classList.toggle("collapsed");
                var label = theoryEl.querySelector(".toggle-label");
                if (label) {
                  label.textContent = theoryEl.classList.contains("collapsed")
                    ? "Expand"
                    : "Collapse";
                }
              });
            }
          } else {
            theoryEl.style.display = "none";
          }
        }

        // 4. Progress card
        var progressEl = document.getElementById("progress-card");
        if (progressEl) {
          progressEl.style.display = "";
          progressEl.innerHTML =
            '<div class="progress-head">' +
            '<span class="progress-title">🎯 Practice Progress</span>' +
            '<span class="progress-stats">' +
            '<span id="progress-text">0 / ' + ch.mcqs.length + " answered</span>" +
            '<span class="score-pill" id="score-pill">⭐ Score: 0/' + ch.mcqs.length + "</span>" +
            "</span></div>" +
            '<div class="progress-bar-wrap">' +
            '<div class="progress-bar" id="progress-bar"></div>' +
            "</div>";
        }

        // 5. MCQ section
        totalMcqs = ch.mcqs.length;
        correctCount = 0;
        answeredCount = 0;
        var mcqSection = document.getElementById("mcq-section");
        if (mcqSection) {
          if (ch.mcqs.length === 0) {
            mcqSection.innerHTML =
              '<div class="empty-state"><span class="emoji">📝</span>' +
              "<p>No practice questions for this chapter yet.</p></div>";
          } else {
            var html =
              '<h2><span class="icon-quiz">✍️</span> Practice Questions (' +
              ch.mcqs.length + ")</h2>";
            ch.mcqs.forEach(function (mcq, idx) {
              html += renderMcqCard(mcq, idx);
            });
            mcqSection.innerHTML = html;
            attachMcqHandlers();
            updateProgress();
          }
        }

        // 6. Chapter navigation
        renderChapterNav(chNumInt);
      })
      .catch(function (err) {
        if (container) {
          container.innerHTML =
            '<div class="empty-state"><span class="emoji">⚠️</span>' +
            "<p>Failed to load chapter content. Please refresh the page.</p></div>";
        }
        console.error(err);
      });
  }

  /* Prev/Next chapter navigation (assumes chapter numbering 1..132) */
  function renderChapterNav(currentNum) {
    var navEl = document.getElementById("chapter-nav");
    if (!navEl) return;
    var MAX = 132;
    var prevNum = currentNum - 1;
    var nextNum = currentNum + 1;
    var prevPadded = prevNum >= 1 ? String(prevNum).padStart(2, "0") : null;
    var nextPadded = nextNum <= MAX ? String(nextNum).padStart(2, "0") : null;

    var html = '<div class="chapter-nav">';
    if (prevPadded) {
      html +=
        '<a class="nav-btn prev" href="' + url("chapters/ch" + prevPadded + ".html") + '">' +
        '<span class="nav-arrow">←</span>' +
        "<span><span class='nav-label'>Previous</span>" +
        '<span class="nav-title">Chapter ' + prevNum + "</span></span>" +
        "</a>";
    } else {
      html +=
        '<div class="nav-btn prev disabled">' +
        '<span class="nav-arrow">←</span>' +
        "<span><span class='nav-label'>Previous</span>" +
        '<span class="nav-title">No previous chapter</span></span></div>';
    }
    if (nextPadded) {
      html +=
        '<a class="nav-btn next" href="' + url("chapters/ch" + nextPadded + ".html") + '">' +
        "<span><span class='nav-label'>Next</span>" +
        '<span class="nav-title">Chapter ' + nextNum + "</span></span>" +
        '<span class="nav-arrow">→</span>' +
        "</a>";
    } else {
      html +=
        '<div class="nav-btn next disabled">' +
        "<span><span class='nav-label'>Next</span>" +
        '<span class="nav-title">You have finished the book!</span></span>' +
        '<span class="nav-arrow">→</span></div>';
    }
    html += "</div>";
    navEl.innerHTML = html;
  }

  /* ===================================================================
   * 7. Init on DOM ready
   * =================================================================== */
  document.addEventListener("DOMContentLoaded", function () {
    renderTOC();
    initSearch();
    initSectionTabs();
    renderChapter();
  });
})();
