// Element inspection helpers: highlight/clear an occurrence's element in the inspected page and open
// it in the Elements panel — all via browser.devtools.inspectedWindow.eval.

import type { Detail } from '@/lib/types';
import { t } from '@/lib/ui-strings';
import { state } from './context';
import { evalInInspected } from './inspected';

/** Highlight / clear the element matching a detail in the inspected page (via inspectedWindow.eval). */
export function highlightElement(d: Detail) {
  const locExpr = d.xpath
    ? `document.evaluate(${JSON.stringify(d.xpath)},document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue`
    : d.selector
      ? `document.querySelector(${JSON.stringify(d.selector)})`
      : null;
  if (!locExpr) return;
  const expr =
    `(function(){try{` +
    `if(window.__oqsHl){var p=window.__oqsHl;p.el.style.outline=p.o;p.el.style.outlineOffset=p.oo;window.__oqsHl=null;}` +
    `var r=${locExpr};` +
    `if(r&&r.style){window.__oqsHl={el:r,o:r.style.outline,oo:r.style.outlineOffset};` +
    `r.style.outline='2px solid #d81b60';r.style.outlineOffset='1px';` +
    `if(r.scrollIntoView)r.scrollIntoView({block:'nearest'});}` +
    `}catch(e){}})()`;
  void evalInInspected(expr);
}

export function clearHighlight() {
  const expr =
    `(function(){try{if(window.__oqsHl){var p=window.__oqsHl;` +
    `p.el.style.outline=p.o;p.el.style.outlineOffset=p.oo;window.__oqsHl=null;}}catch(e){}})()`;
  void evalInInspected(expr);
}

export function inspect(d: Detail) {
  let expr: string | null = null;
  if (d.xpath) {
    expr = `(function(){try{var r=document.evaluate(${JSON.stringify(
      d.xpath,
    )},document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;if(r){inspect(r);return true;}}catch(e){}return false;})()`;
  } else if (d.selector) {
    expr = `(function(){try{var el=document.querySelector(${JSON.stringify(
      d.selector,
    )});if(el){inspect(el);return true;}}catch(e){}return false;})()`;
  }
  if (!expr) return;
  void evalInInspected<boolean>(expr).then(([found, err]) => {
    if (err || found === false) console.warn(t(state.lang, 'notFound'));
  });
}
