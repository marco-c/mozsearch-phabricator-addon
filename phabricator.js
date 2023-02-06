/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

tippy.disableAnimations();
tippy.setDefaults({
  size: "small",
  interactive: true,
  placement: "bottom",
  distance: 0,
  theme: "light",
  trigger: "click",
});

function idle() {
  return new Promise(resolve => requestIdleCallback(resolve));
}

let repository;
function getRepository() {
  if (!repository) {
    let properties = document.body.querySelectorAll(".phui-property-list-key");
    for (let property of properties) {
      if (property.textContent.startsWith("Repository")) {
        let phabRepository = property.nextSibling.textContent;
        if (phabRepository.startsWith("rNSS")) {
          repository = "nss";
        } else if (phabRepository.startsWith("rCOMMCENTRAL")) {
          repository = "comm-central";
        }
      }
    }

    if (!repository) {
      // Default to mozilla-central if we were not able to detect the repository.
      repository = "mozilla-central";
    }
  }

  return repository;
}

let searchfoxDataMap = {};
async function getSearchfox(path) {
  if (!Object.hasOwn(searchfoxDataMap, path)) {
    // We can't use the actual revision, as searchfox doesn't have SYM_INFO on pages
    // in the format `https://searchfox.org/mozilla-central/rev/${parentRevision}/${path}`.
    let response = await fetch(
      `https://searchfox.org/${getRepository()}/source/${path}`
    );
    let content = await response.text();

    let parser = new DOMParser();
    searchfoxDataMap[path] = {
      doc: parser.parseFromString(content, "text/html"),
      sym_info: JSON.parse(
        content.substring(
          content.indexOf("<script>var SYM_INFO = ") +
            "<script>var SYM_INFO = ".length,
          content.indexOf(";</script")
        )
      )
    };
  }

  return searchfoxDataMap[path];
}

let searchfoxPathMap = new Map();

function searchInSearchfox(path, searchfoxDoc) {
  let searchfoxElemMap = searchfoxPathMap.get(path);
  if (searchfoxElemMap) {
    return searchfoxElemMap;
  }

  searchfoxElemMap = new Map();
  searchfoxPathMap.set(path, searchfoxElemMap);

  let lineNumber = 1;
  while (true) {
    let searchfoxLine = searchfoxDoc.getElementById(`line-${lineNumber}`);
    if (!searchfoxLine) {
      break;
    }
    lineNumber++;

    for (let searchfoxElem of searchfoxLine.querySelector(".source-line")
      .children) {
      let dataSymbols = searchfoxElem.getAttribute("data-symbols");
      if (!dataSymbols) {
        continue;
      }

      searchfoxElemMap.set(searchfoxElem.textContent, searchfoxElem);
    }
  }

  return searchfoxElemMap;
}

// Used to highlight things.
let dataIDMap = new Map();

function addLinksAndHighlight(elem, searchfoxElem, searchfoxSymInfo) {
  let links = [];

  let dataSymbols = searchfoxElem.dataset.symbols.split(",");
  for (const dataSymbol of dataSymbols) {
    let { jumps, sym, pretty } = searchfoxSymInfo[dataSymbol] || {};

    if (jumps?.def) {
      links.push(
        `<a href="https://searchfox.org/mozilla-central/source/${jumps.def}" target="_blank">Go to definition of ${pretty}</a>`
      );
    }

    if (jumps?.decl) {
      links.push(
        `<a href="https://searchfox.org/mozilla-central/source/${jumps.decl}" target="_blank">Go to declaration of ${pretty}</a>`
      );
    }

    if (jumps?.idl) {
      links.push(
        `<a href="https://searchfox.org/mozilla-central/source/${jumps.idl}" target="_blank">Go to IDL of ${pretty}</a>`
      );
    }

    if (sym) {
      links.push(
        `<a href="https://searchfox.org/mozilla-central/search?q=symbol:${encodeURIComponent(
          sym
        )}&redirect=false" target="_blank">Search for ${pretty}</a>`
      );
    }
  }

  links.push(
    `<a href="https://searchfox.org/mozilla-central/search?q=${encodeURIComponent(
      searchfoxElem.textContent
    )}&redirect=false" target="_blank">Search for the substring <strong>${
      searchfoxElem.textContent
    }</strong></a>`
  );

  tippy(elem, {
    content: links.join("<br>")
  });

  let visibleText = searchfoxElem.textContent;
  if (!dataIDMap.has(visibleText)) {
    dataIDMap.set(visibleText, new Map());
  }
  let visibleTextMap = dataIDMap.get(visibleText);
  for (let symbol of dataSymbols) {
    if (!visibleTextMap.has(symbol)) {
      visibleTextMap.set(symbol, []);
    }
    let elemList = visibleTextMap.get(symbol);
    elemList.push(elem);
  }

  elem.onmouseover = function() {
    for (let symbol of dataSymbols) {
      for (let e of visibleTextMap.get(symbol)) {
        e.style.backgroundColor = "yellow";
        e.style.cursor = "pointer";
      }
    }
  };
  elem.onmouseout = function() {
    for (let symbol of dataSymbols) {
      for (let e of visibleTextMap.get(symbol)) {
        e.style.backgroundColor = "";
      }
    }
  };
}

function getAllLines(block) {
  return block.querySelectorAll("table.differential-diff tbody tr td.n");
}

let parsedLines = new Set();

// Yields objects with start and end offsets, which define ASCII words
// in the given text, from last to first.
function* tokenOffsets(text) {
  function charCanStartToken(ch) {
    return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
  }

  function charInToken(ch) {
    return charCanStartToken(ch) || (ch >= "0" && ch <= "9");
  }

  let tokenEnd = null;
  for (let i = text.length - 1; i >= 0; i--) {
    let inToken = charInToken(text[i]);
    if (inToken && tokenEnd == null) {
      tokenEnd = i;
    } else if (!inToken && tokenEnd != null) {
      if (charCanStartToken(text[i + 1])) {
        yield { start: i + 1, end: tokenEnd + 1 };
      }
      tokenEnd = null;
    }
  }
  if (tokenEnd != null) {
    if (charCanStartToken(0)) {
      yield { start: 0, end: tokenEnd + 1 };
    }
    tokenEnd = null;
  }
}

async function injectStuff(block) {
  const path = block.querySelector("h1.differential-file-icon-header")
    .textContent;

  let searchfoxData = await getSearchfox(path);
  let searchfoxDoc = searchfoxData.doc;
  let searchfoxSymInfo = searchfoxData.sym_info;

  let searchfoxElemMap = searchInSearchfox(path, searchfoxDoc);

  let deadline = await idle();

  for (let line of getAllLines(block)) {
    if (parsedLines.has(line)) {
      continue;
    }
    parsedLines.add(line);

    if (deadline.timeRemaining() <= 1) {
      deadline = await idle();
    }

    let phabLineNumber = parseInt(line.dataset.n);
    if (isNaN(phabLineNumber)) {
      continue;
    }

    if (line.classList.contains("show-context-line")) {
      continue;
    }

    let codeContainer = line.nextSibling;
    if (codeContainer.classList.length) {
      codeContainer = codeContainer.nextSibling;
    }

    // Try to look at any line from mozsearch, as lines might not correspond if they are on different revisions.
    for (let elem of codeContainer.childNodes) {
      if (elem.nodeType == Element.TEXT_NODE) {
        for (let token of tokenOffsets(elem.textContent)) {
          let range = document.createRange();
          range.setStart(elem, token.start);
          range.setEnd(elem, token.end);
          let searchfoxElem = searchfoxElemMap.get(range.toString());
          if (searchfoxElem) {
            let span = document.createElement("span");
            range.surroundContents(span);
            addLinksAndHighlight(span, searchfoxElem, searchfoxSymInfo);
          }
        }
      } else {
        let searchfoxElem = searchfoxElemMap.get(elem.textContent);

        if (searchfoxElem) {
          addLinksAndHighlight(elem, searchfoxElem, searchfoxSymInfo);
        }
      }
    }
  }
}

function injectCodeSearch() {
  document
    .querySelectorAll("div[data-sigil=differential-changeset]")
    .forEach(block => {
      let timeoutID = setTimeout(() => injectStuff(block), 3000);

      let observer = new MutationObserver(() => {
        clearTimeout(timeoutID);
        injectStuff(block);
      });
      observer.observe(block, { childList: true, subtree: true });
    });
}

injectCodeSearch();
