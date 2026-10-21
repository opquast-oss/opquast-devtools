/* Opquast DevTools — V5 automation overlay: extra oqs@ test functions.
 *
 * Copyright (c) 2026 Opquast (https://www.opquast.com/)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain
 * one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * Loaded AFTER engine/oqs-tests.js (see src/lib/engine-assets.ts). Globals provided by the engine
 * (do NOT redefine): $ (jQuery), _getDetails(node) [JSON-serialisable detail], logger, sidecar,
 * XHR (background-fetched bodies by URL or logical key), document.
 * Contract, as in engine/oqs-tests.js: a non-empty array = the rule matches (ontrue); [] = no
 * match (onfalse); false = could not tell (=> "i"). Written for the V5 automation batch — see
 * data/v5-automation-triage.json.
 */
(function ($) {
  'use strict';

  // The visible text of the page: script, style and template contents are not text a reader sees,
  // and matching inside them (JSON, CSS, inline code) only produces false signals.
  function _oqsV5Text(doc) {
    var root = (doc && doc.body) || (doc && doc.documentElement);
    if (!root) return '';
    var copy = root.cloneNode(true);
    $(copy).find('script, style, noscript, template').remove();
    return copy.textContent || '';
  }

  // Text an element holds directly (its own text nodes), without walking a copy of its subtree.
  function _oqsV5OwnText(el) {
    var out = '';
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) out += n.nodeValue;
    return out;
  }

  // `href` resolved against the page, or null when it is not a URL.
  function _oqsV5Url(href, doc) {
    try { return new URL(href, (doc && doc.baseURI) || document.baseURI); } catch (e) { return null; }
  }

  // Same site, www. or not.
  function _oqsV5SameHost(a, b) {
    var strip = function (h) { return String(h || '').toLowerCase().replace(/^www\./, ''); };
    return strip(a) === strip(b);
  }

window.oqsV5FieldWoAutocomplete = function oqsV5FieldWoAutocomplete(doc) {
  var result = [];
  // Separators include [ ] for framework names such as user[email] or billing[address].
  var reNeedle = /(^|[-_\s\[\]])(f?name|firstname|lastname|nom|prenom|surname|email|e-?mail|mail|courriel|tel|phone|mobile|fax|address|addr|adresse|street|rue|city|ville|zip|postal|cp|country|pays|state|region|company|organization|organisation|societe|username|login|cc-?(name|number|exp|csc)|card|birth|bday|dob)([-_\s\[\]]|$)/i;
  var okType = /^(text|email|tel|url|search|number|password)$/i;
  try {
    $('input, select, textarea', doc).each(function () {
      var el = this,
          tag = (el.tagName || '').toLowerCase();
      if (tag === 'input') {
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        if (!okType.test(t)) return;
      }
      // "off" switches autofill off: for these personal fields, it is the problem, not a value.
      var ac = (el.getAttribute('autocomplete') || '').trim().toLowerCase();
      if (ac && ac !== 'off') return;
      var hay = (el.getAttribute('name') || '') + ' ' + (el.getAttribute('id') || '') + ' ' + (el.getAttribute('type') || '');
      if (reNeedle.test(hay)) result.push(_getDetails(el));
    });
  } catch (err) { logger.error('oqsV5FieldWoAutocomplete', err); result = false; }
  return result;
};
window.oqsV5MixedContent = function oqsV5MixedContent(doc) {
  var result = [];
  try {
    var loc = (doc && doc.location) || document.location;
    if (!loc || loc.protocol !== 'https:') return [];
    $('img[src], img[srcset], script[src], iframe[src], audio[src], video[src], video[poster], source[src], source[srcset], embed[src], object[data], link[rel~="stylesheet"][href], link[rel~="icon"][href], link[rel~="preload"][href]', doc).each(function () {
      var el = this;
      var urls = [el.getAttribute('src'), el.getAttribute('href'), el.getAttribute('data'), el.getAttribute('poster')];
      // srcset: "url 1x, url 2x" — the URL is the first token of each candidate.
      (el.getAttribute('srcset') || '').split(',').forEach(function (c) { urls.push(c.trim().split(/\s+/)[0]); });
      for (var i = 0; i < urls.length; i++) {
        if (urls[i] && /^http:\/\//i.test(urls[i].trim())) { result.push(_getDetails(el)); return; }
      }
    });
  } catch (err) { logger.error('oqsV5MixedContent', err); result = false; }
  return result;
};

window.oqsV5HomeLink = function oqsV5HomeLink(doc) {
    var result = [];
    try {
        $("a[href]", doc).each(function () {
            var href = ($(this).attr("href") || "").trim();
            var text = ($(this).text() || "").trim().toLowerCase();
            var aria = ($(this).attr("aria-label") || "").trim().toLowerCase();
            var title = ($(this).attr("title") || "").trim().toLowerCase();
            var label = text + " " + aria + " " + title;
            var u = _oqsV5Url(href, doc);
            var here = (doc && doc.location) || document.location;
            var hrefHome = href === "/" || /(^|\/)index\.(html?|php)(\?.*)?$/i.test(href) ||
                // an absolute link to the root of this same site
                !!(u && here && u.origin === here.origin && /^\/(index\.(html?|php))?$/i.test(u.pathname));
            var textHome = /(^|\W)(accueil|home|homepage|page d'accueil)(\W|$)/i.test(label);
            if (hrefHome || textHome) {
                result.push(_getDetails(this));
            }
        });
    } catch (err) {
        logger.error("oqsV5HomeLink", err);
        result = false;
    }
    return result;
};

window.oqsV5Breadcrumb = function oqsV5Breadcrumb(doc) {
    var result = [];
    try {
        $("nav, ol, ul, div, p", doc).each(function () {
            var cls = ($(this).attr("class") || "").toLowerCase();
            var id = ($(this).attr("id") || "").toLowerCase();
            var aria = ($(this).attr("aria-label") || "").toLowerCase().replace(/[\u2018\u2019]/g, "'");
            if (cls.indexOf("breadcrumb") !== -1 || id.indexOf("breadcrumb") !== -1 ||
                aria.indexOf("breadcrumb") !== -1 ||
                cls.indexOf("fil-ariane") !== -1 || cls.indexOf("fil_ariane") !== -1 ||
                cls.indexOf("filariane") !== -1 ||
                aria.indexOf("fil d'ariane") !== -1 || aria.indexOf("fil d ariane") !== -1) {
                result.push(_getDetails(this));
            }
        });
    } catch (err) {
        logger.error("oqsV5Breadcrumb", err);
        result = false;
    }
    return result;
};

window.oqsV5NavWithoutActiveItem = function oqsV5NavWithoutActiveItem(doc) {
    var result = [];
    try {
        var navSel = "nav, [role='navigation'], ul[class*='menu'], ul[class*='nav']";
        // "active" / "current" as a class word: not "inactive", "non-current" or "actived-by".
        var activeRe = /(^|[\s_-])(active|current)(?=$|[\s_-])/i;
        $(navSel, doc).each(function () {
            // A menu inside a navigation already reported is the same navigation.
            if ($(this).parent().closest(navSel).length) return;
            var links = $("a", this).length;
            var active = $("[aria-current]", this).filter(function () {
                return (this.getAttribute("aria-current") || "").toLowerCase() !== "false";
            }).length;
            $("[class]", this).each(function () {
                var cls = this.getAttribute("class") || "";
                if (activeRe.test(cls) && !/(^|[\s_-])(in|non-?|not-?)(active|current)/i.test(cls)) active++;
            });
            if (links > 0 && active === 0) {
                result.push(_getDetails(this));
            }
        });
    } catch (err) {
        logger.error("oqsV5NavWithoutActiveItem", err);
        result = false;
    }
    return result;
};

// #2 (54407) — copyright / reuse-rights signal present on the page (SEMI).
window.oqsV5CopyrightSignal = function oqsV5CopyrightSignal(doc) {
  var result = [];
  try {
    var textRe = /\u00A9|copyright|tous droits r[eé]serv[eé]s|droits de (?:copie|reproduction|r[eé]utilisation)|mentions l[eé]gales|all rights reserved|legal notice|terms of reuse/i;
    var text = _oqsV5Text(doc);
    if (textRe.test(text)) { result.push(_getDetails(doc.body || doc)); }
    var linkRe = /mentions.l[eé]gales|copyright|droits.d|reproduction|r[eé]utilisation|legal.notice|imprint/i;
    $('a[href]', doc).each(function () {
      var t = ($(this).text() || '') + ' ' + ($(this).attr('href') || '');
      if (linkRe.test(t)) { result.push(_getDetails(this)); }
    });
  } catch (err) { logger.error('oqsV5CopyrightSignal', err); result = false; }
  return result;
};

// #46 (54004) — link to terms of sale/use (CGV/CGU) present (SEMI).
window.oqsV5TermsLink = function oqsV5TermsLink(doc) {
  var result = [];
  try {
    var txtRe = /conditions g[eé]n[eé]rales|conditions de vente|conditions d.utilisation|\bcgv\b|\bcgu\b|terms (?:of (?:sale|use|service)|and conditions)|\bt&c/;
    var hrefRe = /\bcgv\b|\bcgu\b|conditions-?(?:generales|vente|utilisation)|terms(?:-of-(?:sale|use|service)|-and-conditions)?(?:[\/.?#]|$)/;
    $('a[href]', doc).each(function () {
      var t = ($(this).text() || '').toLowerCase();
      var h = ($(this).attr('href') || '').toLowerCase();
      if (txtRe.test(t) || hrefRe.test(h)) { result.push(_getDetails(this)); }
    });
  } catch (err) { logger.error('oqsV5TermsLink', err); result = false; }
  return result;
};

// #105 (54457) — postal address + phone signal present (SEMI).
window.oqsV5ContactAddress = function oqsV5ContactAddress(doc) {
  var result = [];
  try {
    $('a[href^="tel:"], address', doc).each(function () { result.push(_getDetails(this)); });
    var text = _oqsV5Text(doc);
    if (_OQS_V5_PHONE.test(text)) { result.push(_getDetails(doc.body || doc)); }
    // A French postal code before a capitalised town ("75011 Paris"), or a US state + ZIP
    // ("NY 10001"); not any 5-digit number followed by a word ("10000 visites").
    var postalRe = /\b\d{5}\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'\-]+|\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;
    if (postalRe.test(text)) { result.push(_getDetails(doc.body || doc)); }
  } catch (err) { logger.error('oqsV5ContactAddress', err); result = false; }
  return result;
};

// #107 (54158) — contact means: mailto:/tel: links or a contact form (SEMI, human counts >=2).
window.oqsV5ContactMeans = function oqsV5ContactMeans(doc) {
  var result = [];
  try {
    $('a[href^="mailto:"], a[href^="tel:"]', doc).each(function () { result.push(_getDetails(this)); });
    $('form', doc).each(function () {
      var meta = (($(this).attr('id') || '') + ' ' + ($(this).attr('class') || '') + ' ' +
                  ($(this).attr('action') || '') + ' ' + ($(this).attr('name') || '') + ' ' +
                  ($(this).text() || '')).toLowerCase();
      if (meta.indexOf('contact') !== -1) { result.push(_getDetails(this)); }
    });
  } catch (err) { logger.error('oqsV5ContactMeans', err); result = false; }
  return result;
};

// French numbers (0X XX XX XX XX, +33) and international ones written with their country code.
var _OQS_V5_PHONE = /(?:\+33\s?(?:\(0\)\s?)?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b|\+(?!33)\d{1,3}[\s.\-]?\(?\d{1,4}\)?(?:[\s.\-]?\d{2,4}){2,4}\b/;

// #145 (53931) — phone-like text NOT wrapped in an a[href^="tel:"] (SEMI candidate).
window.oqsV5UnlinkedPhone = function oqsV5UnlinkedPhone(doc) {
  var result = [];
  try {
    $('body *', doc).each(function () {
      var tag = this.nodeName && this.nodeName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'a') { return; }
      if ($(this).closest('a[href^="tel:"]').length) { return; }
      // Own text nodes only: reading a copy of every subtree made large pages quadratic.
      if (_OQS_V5_PHONE.test(_oqsV5OwnText(this))) { result.push(_getDetails(this)); }
    });
  } catch (err) { logger.error('oqsV5UnlinkedPhone', err); result = false; }
  return result;
};

// #14 (54555) — text using mathematical-alphanumeric / fullwidth Unicode to fake styling (SEMI).
window.oqsV5UnicodeHijack = function oqsV5UnicodeHijack(doc) {
  var result = [];
  try {
    // \uD835[\uDC00-\uDFFF] = U+1D400..U+1D7FF (Mathematical Alphanumeric Symbols).
    // Fullwidth digits and Latin letters only (U+FF10-FF19, FF21-FF3A, FF41-FF5A), not the
    // fullwidth punctuation Chinese and Japanese use, and not at all on a page in those languages.
    var lang = ((doc && doc.documentElement && doc.documentElement.getAttribute('lang')) || '').toLowerCase();
    var cjk = /^(ja|zh|ko)\b/.test(lang);
    var re = cjk ? /\uD835[\uDC00-\uDFFF]/ : /\uD835[\uDC00-\uDFFF]|[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/;
    var text = _oqsV5Text(doc);
    if (re.test(text)) { result.push(_getDetails(doc.body || doc)); }
  } catch (err) { logger.error('oqsV5UnicodeHijack', err); result = false; }
  return result;
};

// #142 (54411) — internal vs external links differentiated (SEMI). Flags absolute http(s)
// links whose host differs from the page host as external candidates; human checks the
// differentiation (textual mention, icon, behaviour).
window.oqsV5ExternalLinks = function oqsV5ExternalLinks(doc) {
  var result = [];
  try {
    var loc = (doc && doc.location) || document.location;
    $('a[href]', doc).each(function () {
      var href = ($(this).attr('href') || '').trim();
      if (!href || href.charAt(0) === '#') return;
      // Absolute or protocol-relative ("//host/…") links to another site; www. or not is the same.
      if (!/^(https?:)?\/\//i.test(href)) return;
      var u = _oqsV5Url(href, doc);
      if (u && /^https?:$/.test(u.protocol) && !_oqsV5SameHost(u.hostname, loc && loc.hostname)) {
        result.push(_getDetails(this));
      }
    });
  } catch (err) { logger.error('oqsV5ExternalLinks', err); result = false; }
  return result;
};

// #171 (54500) — a sitemap page is reachable from every page (SEMI). Flags a link to a
// sitemap page (href or label); absence => "i" (verify manually) per product-owner decision.
window.oqsV5SitemapLink = function oqsV5SitemapLink(doc) {
  var result = [];
  var reHref = /(^|\/)(plan(-|_)?(du)?(-|_)?site|sitemap|site-?map)(\.[a-z0-9]+)?(\/|\?|#|$)/i;
  var reText = /(plan du site|plan de site|sitemap|site map)/i;
  try {
    $('a[href]', doc).each(function () {
      var href = ($(this).attr('href') || '').trim();
      var label = ($(this).text() || '') + ' ' + ($(this).attr('title') || '') + ' ' + ($(this).attr('aria-label') || '');
      if (reHref.test(href) || reText.test(label)) result.push(_getDetails(this));
    });
  } catch (err) { logger.error('oqsV5SitemapLink', err); result = false; }
  return result;
};

window.OQS_V5_url_credentials = function OQS_V5_url_credentials(doc) {
  var result = [];
  var reQuery = /[?&](sessionid|session_id|sessid|sid|phpsessid|jsessionid|token|access_token|auth_token|password|passwd|pwd)=[^&\s]/i;
  var reAuthority = /^[a-z][a-z0-9+.\-]*:\/\/[^\/?#@\s]+:[^\/?#@\s]+@/i;
  try {
    $('a[href]', doc).each(function () {
      var href = $(this).attr('href') || '';
      if (reQuery.test(href) || reAuthority.test(href)) {
        result.push(_getDetails(this));
      }
    });
  } catch (err) {
    logger.error('OQS_V5_url_credentials', err);
    result = false;
  }
  return result;
};

window.OQS_V5_date_numeric_format = function OQS_V5_date_numeric_format(doc) {
  var result = [];
  // A plausible day and month with the same separator twice, not part of a longer run of digit
  // groups: "12/03/2024" yes, "06.12.34.56.78" (a phone number) or "1.2.3" (a version) no.
  var reDate = /(^|[^\d.\/\-])(0?[1-9]|[12]\d|3[01])([\/.\-])(0?[1-9]|1[0-2])\3(\d{4}|\d{2})(?![\d]|[.\/\-]\d)/;
  try {
    $('p, li, td, th, span, time, h1, h2, h3, h4, h5, h6, dd, dt, caption, figcaption, small', doc).each(function () {
      // Its own text: a date in a paragraph that also holds a link is still a date.
      if (reDate.test(_oqsV5OwnText(this))) {
        result.push(_getDetails(this));
      }
    });
  } catch (err) {
    logger.error('OQS_V5_date_numeric_format', err);
    result = false;
  }
  return result;
};

window.OQS_V5_publication_date = function OQS_V5_publication_date(doc) {
  var result = [];
  try {
    $('article, [role="article"], time', doc).each(function () {
      result.push(_getDetails(this));
    });
  } catch (err) {
    logger.error('OQS_V5_publication_date', err);
    result = false;
  }
  return result;
};

window.OQS_V5_inline_css_not_minified = function OQS_V5_inline_css_not_minified(doc) {
  var result = [];
  var reUnmin = /\n[ \t]{2,}|\/\*/;
  try {
    $('style', doc).each(function () {
      var css = $(this).text() || '';
      if (css.length > 200 && reUnmin.test(css)) {
        result.push(_getDetails(this));
      }
    });
  } catch (err) {
    logger.error('OQS_V5_inline_css_not_minified', err);
    result = false;
  }
  return result;
};

window.OQS_V5_inline_js_not_minified = function OQS_V5_inline_js_not_minified(doc) {
  var result = [];
  var reUnmin = /\n[ \t]{2,}/;
  try {
    $('script', doc).each(function () {
      if ($(this).attr('src')) {
        return;
      }
      var type = ($(this).attr('type') || '').toLowerCase();
      if (type && type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') {
        return;
      }
      var js = $(this).text() || '';
      if (js.length > 200 && reUnmin.test(js)) {
        result.push(_getDetails(this));
      }
    });
  } catch (err) {
    logger.error('OQS_V5_inline_js_not_minified', err);
    result = false;
  }
  return result;
};

  // ===== V5 sidecar — Palier A: HTTP response-header checks (reload mode) =====
  // Convention: return [detail] on VIOLATION (=> ontrue => nc), [] when compliant
  // (=> onfalse => c), false when undeterminable e.g. no captured headers (=> "i").
  function _oqsV5Res() { return (typeof sidecar !== 'undefined' && sidecar && sidecar.resources) ? sidecar.resources : []; }
  function _oqsV5Main() { var r = _oqsV5Res(); for (var i = 0; i < r.length; i++) { if (r[i] && r[i].type === 'main_frame') return r[i]; } return null; }
  function _oqsV5Hdr(res, name) {
    if (!res || !res.headers) return '';
    var h = res.headers, lc = name.toLowerCase();
    if (h[lc]) return h[lc];
    for (var k in h) if (k.toLowerCase() === lc) return Array.isArray(h[k]) ? h[k].join(', ') : h[k];
    return '';
  }
  function _oqsV5Flag(doc) { try { return _getDetails((doc && (doc.documentElement || doc.body)) || doc); } catch (e) { return { info: 'sidecar' }; } }

  window.oqsV5Csp = function oqsV5Csp(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    return (_oqsV5Hdr(m, 'content-security-policy') || _oqsV5Hdr(m, 'content-security-policy-report-only')) ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5Csp', e); return false; } };
  window.oqsV5XFrame = function oqsV5XFrame(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    return (_oqsV5Hdr(m, 'x-frame-options') || /frame-ancestors/i.test(_oqsV5Hdr(m, 'content-security-policy'))) ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5XFrame', e); return false; } };
  window.oqsV5Referrer = function oqsV5Referrer(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    return _oqsV5Hdr(m, 'referrer-policy') ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5Referrer', e); return false; } };
  window.oqsV5NoSniff = function oqsV5NoSniff(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    return /nosniff/i.test(_oqsV5Hdr(m, 'x-content-type-options')) ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5NoSniff', e); return false; } };
  // Browsers have dropped X-XSS-Protection; what activates XSS protection today is a CSP that
  // restricts scripts. Either one counts; "X-XSS-Protection: 0" (off) alone does not.
  window.oqsV5XssProtection = function oqsV5XssProtection(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    var xxp = _oqsV5Hdr(m, 'x-xss-protection'), csp = _oqsV5Hdr(m, 'content-security-policy');
    return ((xxp && !/^\s*0/.test(xxp)) || /(^|;)\s*(script-src|default-src)\b/i.test(csp)) ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5XssProtection', e); return false; } };
  window.oqsV5ContentType = function oqsV5ContentType(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    return _oqsV5Hdr(m, 'content-type') ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5ContentType', e); return false; } };
  window.oqsV5HeaderCharset = function oqsV5HeaderCharset(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    return /charset=/i.test(_oqsV5Hdr(m, 'content-type')) ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5HeaderCharset', e); return false; } };
  window.oqsV5Utf8 = function oqsV5Utf8(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    var ct = _oqsV5Hdr(m, 'content-type'), cs = m.charset || ''; var mm = /charset=\s*([^;]+)/i.exec(ct); if (mm) cs = mm[1].trim().replace(/^["']|["']$/g, '');
    return /^\s*utf-?8\s*$/i.test(cs) ? [] : [_oqsV5Flag(doc)]; } catch (e) { logger.error('oqsV5Utf8', e); return false; } };
  window.oqsV5ServerLeak = function oqsV5ServerLeak(doc) { try { var m = _oqsV5Main(); if (!m) return false;
    var s = _oqsV5Hdr(m, 'server') + ' ' + _oqsV5Hdr(m, 'x-powered-by'); return /\d+\.\d+/.test(s) ? [_oqsV5Flag(doc)] : []; } catch (e) { logger.error('oqsV5ServerLeak', e); return false; } };
  window.oqsV5HttpsAll = function oqsV5HttpsAll(doc) { try { var r = _oqsV5Res(); var m = _oqsV5Main(); if (!m) return false;
    if (!/^https:/i.test(m.uri || '')) return [_oqsV5Flag(doc)]; var bad = [];
    for (var i = 0; i < r.length; i++) { if (r[i] && /^http:\/\//i.test(r[i].uri || '')) bad.push({ info: r[i].uri }); } return bad; } catch (e) { logger.error('oqsV5HttpsAll', e); return false; } };
  window.oqsV5Gzip = function oqsV5Gzip(doc) { try { var r = _oqsV5Res(), checked = 0, bad = [];
    for (var i = 0; i < r.length; i++) { var el = r[i]; if (!el) continue; var ct = el.content_type || '';
      var isText = /^text\//i.test(ct) || /(javascript|json|css|xml|svg)/i.test(ct);
      var big = Number(_oqsV5Hdr(el, 'content-length') || 0) > 300;
      if (isText && el.status === 200 && big) { checked++; if (!/gzip|br|deflate|zstd/i.test(_oqsV5Hdr(el, 'content-encoding'))) bad.push({ info: el.uri }); } }
    if (checked === 0) return false; return bad; } catch (e) { logger.error('oqsV5Gzip', e); return false; } };
  window.oqsV5Cache = function oqsV5Cache(doc) { try { var r = _oqsV5Res(), checked = 0, bad = [];
    for (var i = 0; i < r.length; i++) { var el = r[i]; if (!el) continue; var ct = el.content_type || '';
      if (/(javascript|css|image\/|font)/i.test(ct) && el.status === 200) { checked++; if (!_oqsV5Hdr(el, 'cache-control') && !_oqsV5Hdr(el, 'expires')) bad.push({ info: el.uri }); } }
    if (checked === 0) return false; return bad; } catch (e) { logger.error('oqsV5Cache', e); return false; } };


  // ===== V5 sidecar — Palier B: site-root probes (via XHR logical keys, background probe-service) =====
  // Async; return [detail] on VIOLATION (=> nc), [] when compliant (=> c), false when the probe
  // did not run / errored (=> "i"). Details are plain serialisable objects (no DOM nodes).
  window.oqsV5RobotsTxt = function oqsV5RobotsTxt(doc) {
    return XHR.get('oqs-v5:robots').then(function (r) {
      if (!r || r.status === 0) return false;
      if (r.status === 200 && /(^|\n)\s*(user-agent|disallow|allow|sitemap)\s*:/i.test(r.data || '')) return [];
      return [{ info: 'robots.txt absent ou vide (statut ' + r.status + ')' }];
    }, function (e) { logger.error('oqsV5RobotsTxt', e); return false; });
  };
  window.oqsV5Sitemap = function oqsV5Sitemap(doc) {
    return XHR.get('oqs-v5:sitemap').then(function (r) {
      if (!r || r.status === 0) return false;
      if (r.status === 200 && /<(urlset|sitemapindex)\b/i.test(r.data || '')) return [];
      return [{ info: 'sitemap.xml absent (statut ' + r.status + ')' }];
    }, function (e) { logger.error('oqsV5Sitemap', e); return false; });
  };
  window.oqsV5Http404 = function oqsV5Http404(doc) {
    return XHR.get('oqs-v5:probe404').then(function (r) {
      if (!r || r.status === 0) return false;
      return r.status === 404 ? [] : [{ info: 'code HTTP ' + r.status + ' pour une ressource inexistante (404 attendu)' }];
    }, function (e) { logger.error('oqsV5Http404', e); return false; });
  };
  window.oqsV5Custom404 = function oqsV5Custom404(doc) {
    var def = /Apache\/[\d.]+|nginx\/[\d.]+|Internet Information Services|<address>[^<]*Server at/i;
    return XHR.get('oqs-v5:probe404').then(function (r) {
      if (!r || r.status === 0) return false;
      return def.test(r.data || '') ? [{ info: 'page 404 par défaut du serveur' }] : [];
    }, function (e) { logger.error('oqsV5Custom404', e); return false; });
  };
  // #225 (54385) — the main navigation appears on custom error pages (SIDECAR, uses the 404
  // probe). Default server page or a custom page without any nav markup => nc; a custom page
  // carrying navigation => c; no probe => false (=> i).
  window.oqsV5Error404Nav = function oqsV5Error404Nav(doc) {
    var def = /Apache\/[\d.]+|nginx\/[\d.]+|Internet Information Services|<address>[^<]*Server at/i;
    // "nav" / "menu" as a class or id word (nav, main-nav, navbar, menu_top), not inside "canvas".
    var nav = /<nav[\s>]|role\s*=\s*["']?navigation|(id|class)\s*=\s*["'](?:[^"']*[\s_\-])?(nav|menu)/i;
    return XHR.get('oqs-v5:probe404').then(function (r) {
      if (!r || r.status === 0) return false;
      var body = r.data || '';
      if (def.test(body)) return [{ info: 'page 404 par défaut du serveur — pas de navigation principale' }];
      return nav.test(body) ? [] : [{ info: 'page 404 personnalisée sans navigation principale détectée' }];
    }, function (e) { logger.error('oqsV5Error404Nav', e); return false; });
  };
  window.oqsV5Www = function oqsV5Www(doc) {
    return XHR.get('oqs-v5:www').then(function (r) {
      if (!r || r.status === 0) return false;
      return (r.status >= 200 && r.status < 400) ? [] : [{ info: 'la variante www/non-www ne répond pas (statut ' + r.status + ')' }];
    }, function (e) { logger.error('oqsV5Www', e); return false; });
  };


  // ===== V5 Palier B+: download / PDF link detection (pure DOM, no fetch) =====
  window.oqsV5DownloadLinks = function oqsV5DownloadLinks(doc) {
    var result = [], re = /\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|odt|ods|odp|csv|rtf|tar|t?gz)(\?|#|$)/i;
    try { $('a[href]', doc).each(function () { if (re.test($(this).attr('href') || '')) result.push(_getDetails(this)); }); }
    catch (e) { logger.error('oqsV5DownloadLinks', e); result = false; }
    return result;
  };
  window.oqsV5PdfLinks = function oqsV5PdfLinks(doc) {
    var result = [], re = /\.pdf(\?|#|$)/i;
    try { $('a[href]', doc).each(function () { if (re.test($(this).attr('href') || '')) result.push(_getDetails(this)); }); }
    catch (e) { logger.error('oqsV5PdfLinks', e); result = false; }
    return result;
  };


  // #188/#189: CSS generated content via the MODERN API (legacy CSS_CONTENT used the removed
  // getPropertyCSSValue). Flags elements whose ::before/::after 'content' is set (=> candidate, i).
  window.oqsV5GeneratedContent = function oqsV5GeneratedContent(doc) {
    var result = [];
    try {
      var w = (doc && doc.defaultView) || window;
      var has = function (c) { return c && c !== 'none' && c !== 'normal' && c !== '""' && c !== "''"; };
      // Body content only: two computed styles per element is costly, and the head has no boxes.
      $('body, body *', doc).each(function () {
        var el = this;
        try {
          if (has(w.getComputedStyle(el, '::before').content) || has(w.getComputedStyle(el, '::after').content)) {
            result.push(_getDetails(el));
          }
        } catch (e) { /* skip elements getComputedStyle can't resolve */ }
      });
    } catch (err) { logger.error('oqsV5GeneratedContent', err); result = false; }
    return result;
  };


  // #236 (54451) duplicate ids: an element whose id an earlier element already carries. The
  // XPath version (@id = preceding::*/@id) compared every element with all those before it.
  window.oqsV5DuplicateId = function oqsV5DuplicateId(doc) {
    var result = [], seen = {};
    try {
      $('[id]', doc).each(function () {
        var id = (this.getAttribute('id') || '').trim();
        if (!id) return;
        if (Object.prototype.hasOwnProperty.call(seen, id)) result.push(_getDetails(this));
        else seen[id] = true;
      });
    } catch (e) { logger.error('oqsV5DuplicateId', e); result = false; }
    return result;
  };

  // #214 (54087) scripts and stylesheets from ANOTHER site without an integrity attribute.
  // Absolute URLs to this same site are not external, and a relative path that merely starts
  // with "http" is not a URL.
  window.oqsV5ExtResourceWoSri = function oqsV5ExtResourceWoSri(doc) {
    var result = [];
    try {
      var loc = (doc && doc.location) || document.location;
      $('script[src]:not([integrity]), link[href]:not([integrity])', doc).each(function () {
        var el = this, tag = el.nodeName.toLowerCase();
        if (tag === 'link' && !/(^|\s)stylesheet(\s|$)/i.test(el.getAttribute('rel') || '')) return;
        var ref = (el.getAttribute('src') || el.getAttribute('href') || '').trim();
        if (!/^(https?:)?\/\//i.test(ref)) return;
        var u = _oqsV5Url(ref, doc);
        if (u && loc && u.origin !== loc.origin) result.push(_getDetails(el));
      });
    } catch (e) { logger.error('oqsV5ExtResourceWoSri', e); result = false; }
    return result;
  };

  // #168: internal search field detection (input[type=search], role=search, or search-ish name/id/placeholder/action). Found => i (confirm it is the site search); none => nc.
  window.oqsV5SearchField = function oqsV5SearchField(doc) {
    var result = [], re = /search|recherche|rechercher/i;
    try {
      $("input[type='search'], [role='search']", doc).each(function () { result.push(_getDetails(this)); });
      if (result.length === 0) {
        $("input, form", doc).each(function () {
          var el = this, hay = (el.getAttribute("name")||"")+" "+(el.getAttribute("id")||"")+" "+(el.getAttribute("placeholder")||"")+" "+(el.getAttribute("aria-label")||"")+" "+(el.getAttribute("class")||"")+" "+(el.getAttribute("action")||"");
          if (re.test(hay)) result.push(_getDetails(el));
        });
      }
    } catch (e) { logger.error("oqsV5SearchField", e); result = false; }
    return result;
  };

}(window.jQuery));
