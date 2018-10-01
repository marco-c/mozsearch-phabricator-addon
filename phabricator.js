/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

tippy.disableAnimations();
tippy.setDefaults({
  size: 'small',
  interactive: true,
  placement: 'bottom',
  distance: 0,
  theme: 'light',
  trigger: 'click',
});

let searchfoxDataMap = {};

function idle() {
  return new Promise(resolve => requestIdleCallback(resolve));
}

async function getSearchfox(path) {
  if (!searchfoxDataMap.hasOwnProperty(path)) {
    // We can't use the actual revision, as searchfox doesn't have ANALYSIS_DATA on pages
    // in the format `https://searchfox.org/mozilla-central/rev/${parentRevision}/${path}`.
    let response = await fetch(`https://searchfox.org/mozilla-central/source/${path}`);
    let content = await response.text();

    let parser = new DOMParser();
    searchfoxDataMap[path] = {
      'doc': parser.parseFromString(content, 'text/html'),
      'analysis_data': JSON.parse(content.substring(content.indexOf('<script>var ANALYSIS_DATA = ') + '<script>var ANALYSIS_DATA = '.length, content.indexOf(';</script'))),
    };
  }

  return searchfoxDataMap[path];
}

function searchInSearchfox(elem, searchfoxLine) {
  for (let searchfoxElem of searchfoxLine.children) {
    let dataID = searchfoxElem.getAttribute('data-id');
    if (!dataID) {
      continue
    }

    if (elem.textContent == searchfoxElem.textContent) {
      return searchfoxElem;
    }
  }

  return null;
}

// Used to highlight things.
let dataIDMap = new Map();

function addLinksAndHighlight(elem, searchfoxElem, searchfoxAnalysisData) {
  let links = [];

  let dataID = searchfoxElem.getAttribute('data-id');
  let index = searchfoxElem.getAttribute('data-i');
  if (index) {
    let [jumps, searches] = searchfoxAnalysisData[index];

    for (let i = 0; i < jumps.length; i++) {
      let sym = jumps[i].sym;
      let pretty = jumps[i].pretty;
      links.push(`<a href="https://searchfox.org/mozilla-central/define?q=${encodeURIComponent(sym)}&redirect=false" target="_blank">Go to definition of ${pretty}</a>`);
    }

    for (let i = 0; i < searches.length; i++) {
      let sym = searches[i].sym;
      let pretty = searches[i].pretty;
      links.push(`<a href="https://searchfox.org/mozilla-central/search?q=symbol:${encodeURIComponent(sym)}&redirect=false" target="_blank">Search for ${pretty}</a>`);
    }
  }

  links.push(`<a href="https://searchfox.org/mozilla-central/search?q=${encodeURIComponent(searchfoxElem.textContent)}&redirect=false" target="_blank">Search for the substring <strong>${searchfoxElem.textContent}</strong></a>`);

  tippy(elem, {
    content: links.join('<br>'),
  });

  if (!dataIDMap.has(dataID)) {
    dataIDMap.set(dataID, [])
  }
  let dataIDArray = dataIDMap.get(dataID);
  dataIDArray.push(elem);

  elem.onmouseover = function() {
    for (let e of dataIDArray) {
      e.style.backgroundColor = "yellow";
      e.style.cursor = "pointer";
    }
  };
  elem.onmouseout = function() {
    for (let e of dataIDArray) {
      e.style.backgroundColor = "";
    }
  };
}

function getAllLines(block) {
  return block.querySelectorAll('table.differential-diff tbody tr th');
}

async function injectStuff(block) {
  const path = block.querySelector('h1.differential-file-icon-header').textContent;

  let searchfoxData = await getSearchfox(path);
  let searchfoxDoc = searchfoxData['doc'];
  let searchfoxAnalysisData = searchfoxData['analysis_data'];

  for (let line of getAllLines(block)) {
    await idle();

    let phabLineNumber = parseInt(line.textContent);
    if (isNaN(phabLineNumber)) {
      continue;       
    }

    if (line.classList.contains('show-context-line')) {
      continue;
    }

    let codeContainer = line.nextSibling;
    if (codeContainer.classList.length != 0) {
      codeContainer = codeContainer.nextSibling;
    }

    // Try with the corresponding line number first, otherwise try to look at any line from mozsearch
    // (lines might not correspond if they are on different revisions).
    for (let elem of codeContainer.children) {
      let lineNumber = phabLineNumber;

      let searchfoxElem;
      let searchfoxLine = searchfoxDoc.getElementById(`line-${lineNumber}`);
      if (!searchfoxLine) {
        lineNumber = 1;
      } else {
        searchfoxElem = searchInSearchfox(elem, searchfoxLine);
        lineNumber = 1;
      }

      while (!searchfoxElem) {
        searchfoxLine = searchfoxDoc.getElementById(`line-${lineNumber}`);
        if (!searchfoxLine) {
          break;
        }
        lineNumber++;

        searchfoxElem = searchInSearchfox(elem, searchfoxLine);
      }

      if (searchfoxElem) {
        addLinksAndHighlight(elem, searchfoxElem, searchfoxAnalysisData);
      }
    }

    // XXX: Add blame information on the left.
  }
}

function injectCodeSearch() {
  async function callInjectStuff(block) {
    await idle();
    await injectStuff(block);
  }

  document.querySelectorAll('div[data-sigil=differential-changeset]').forEach(block => {
    let timeoutID = setTimeout(() => callInjectStuff(block), 3000);

    let observer = new MutationObserver(() => {
      clearTimeout(timeoutID);
      callInjectStuff(block);
    });
    observer.observe(block, { childList: true, subtree: true });
  });
}

injectCodeSearch();
