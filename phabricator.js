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

function idle() {
  return new Promise(resolve => requestIdleCallback(resolve));
}

let repository;
function getRepository() {
  if (!repository) {
    let properties = document.body.querySelectorAll('.phui-property-list-key');
    for (let property of properties) {
      if (property.textContent.startsWith('Repository')) {
        let phabRepository = property.nextSibling.textContent;
        if (phabRepository.startsWith('rNSS')) {
          repository = 'nss';
        } else if (phabRepository.startsWith('rCOMMCENTRAL')) {
          repository = 'comm-central';
        }
      }
    }

    if (!repository) {
      // Default to mozilla-central if we were not able to detect the repository.
      repository = 'mozilla-central';
    }
  }

  return repository;
}

let searchfoxDataMap = {};
async function getSearchfox(path) {
  if (!searchfoxDataMap.hasOwnProperty(path)) {
    // We can't use the actual revision, as searchfox doesn't have ANALYSIS_DATA on pages
    // in the format `https://searchfox.org/mozilla-central/rev/${parentRevision}/${path}`.
    let response = await fetch(`https://searchfox.org/${getRepository()}/source/${path}`);
    let content = await response.text();

    let parser = new DOMParser();
    searchfoxDataMap[path] = {
      'doc': parser.parseFromString(content, 'text/html'),
      'analysis_data': JSON.parse(content.substring(content.indexOf('<script>var ANALYSIS_DATA = ') + '<script>var ANALYSIS_DATA = '.length, content.indexOf(';</script'))),
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

    for (let searchfoxElem of searchfoxLine.children) {
      let dataID = searchfoxElem.getAttribute('data-id');
      if (!dataID) {
        continue
      }

      searchfoxElemMap.set(searchfoxElem.textContent, searchfoxElem);
    }
  }

  return searchfoxElemMap;
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

let parsedLines = new Set();

async function injectStuff(block) {
  const path = block.querySelector('h1.differential-file-icon-header').textContent;

  let searchfoxData = await getSearchfox(path);
  let searchfoxDoc = searchfoxData['doc'];
  let searchfoxAnalysisData = searchfoxData['analysis_data'];

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

    // Try to look at any line from mozsearch, as lines might not correspond if they are on different revisions.
    // TODO: Look at corresponding line first (maybe more likely not to pick a wrong element with the same name) by
    // adding a second searchfoxElemMap mapping line numbers to elements.
    for (let elem of codeContainer.children) {
      let searchfoxElem = searchfoxElemMap.get(elem.textContent);

      if (searchfoxElem) {
        addLinksAndHighlight(elem, searchfoxElem, searchfoxAnalysisData);
      }
    }

    // XXX: Add blame information on the left.
  }
}

function injectCodeSearch() {
  document.querySelectorAll('div[data-sigil=differential-changeset]').forEach(block => {
    let timeoutID = setTimeout(() => injectStuff(block), 3000);

    let observer = new MutationObserver(() => {
      clearTimeout(timeoutID);
      injectStuff(block);
    });
    observer.observe(block, { childList: true, subtree: true });
  });
}

injectCodeSearch();
