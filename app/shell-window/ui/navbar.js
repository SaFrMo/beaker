/* globals URL beaker */

import { remote } from 'electron'
import * as pages from '../pages'
import * as zoom from '../pages/zoom'
import * as yo from 'yo-yo'
import prettyHash from 'pretty-hash'
import {UpdatesNavbarBtn} from './navbar/updates'
import {BrowserMenuNavbarBtn} from './navbar/browser-menu'
// import {AppsMenuNavbarBtn} from './navbar/apps-menu' TODO(apps) restore when we bring back apps -prf
import {DatsiteMenuNavbarBtn} from './navbar/datsite-menu'
import {BookmarkMenuNavbarBtn} from './navbar/bookmark-menu'
import {PageMenuNavbarBtn} from './navbar/page-menu'
import {findParent} from '../../lib/fg/event-handlers'
import renderNavArrowIcon from './icon/nav-arrow'
import renderRefreshIcon from './icon/refresh'
import renderCloseIcon from './icon/close'

const KEYCODE_DOWN = 40
const KEYCODE_UP = 38
const KEYCODE_ESC = 27
const KEYCODE_ENTER = 13
const KEYCODE_N = 78
const KEYCODE_P = 80
const KEYCODE_BACKSPACE = 8
const KEYCODE_DELETE = 46

const isDatHashRegex = /^[a-z0-9]{64}/i

// globals
// =

var toolbarNavDiv = document.getElementById('toolbar-nav')
var updatesNavbarBtn = null
var browserMenuNavbarBtn = null
var bookmarkMenuNavbarBtn = null
// var appsMenuNavbarBtn = null TODO(apps) restore when we bring back apps -prf
var datsiteMenuNavbarBtn = null
var pageMenuNavbarBtn = null
var lastKeyDown = null
var enteredValue = ''

var isLocationHighlighted = false

// autocomplete data
var autocompleteCurrentValue = null
var autocompleteCurrentSelection = 0
var autocompleteResults = null // if set to an array, will render dropdown
var autocompleteSuggestion = null

// exported functions
// =

export function setup () {
  // create the button managers
  updatesNavbarBtn = new UpdatesNavbarBtn()
  // appsMenuNavbarBtn = new AppsMenuNavbarBtn() TODO(apps) restore when we bring back apps -prf
  browserMenuNavbarBtn = new BrowserMenuNavbarBtn()
  bookmarkMenuNavbarBtn = new BookmarkMenuNavbarBtn()
  datsiteMenuNavbarBtn = new DatsiteMenuNavbarBtn()
  pageMenuNavbarBtn = new PageMenuNavbarBtn()

  // add some global listeners
  window.addEventListener('keydown', onGlobalKeydown)
}

export function createEl (id) {
  // render
  var el = render(id, null)
  toolbarNavDiv.appendChild(el)
  return el
}

export function destroyEl (id) {
  var el = document.querySelector(`.toolbar-actions[data-id="${id}"]`)
  if (el) {
    toolbarNavDiv.removeChild(el)
  }
}

export function focusLocation (page) {
  var el = page.navbarEl.querySelector('.nav-location-input')

  // the container el which has :focus styles applied
  el.classList.remove('hidden')
  el.focus()
  isLocationHighlighted = true
  el.select()
}

export function isLocationFocused (page) {
  // fetch current page, if not given
  page = page || pages.getActive()

  // get element and pull state
  var addrEl = page.navbarEl.querySelector('.nav-location-input')
  return addrEl.matches(':focus')
}

export function showInpageFind (page) {
  // show control and highlight text
  page.isInpageFinding = true
  page.inpageFindInfo = null
  update(page)
  var el = page.navbarEl.querySelector('.nav-find-input')
  el.focus()
  el.select()
}

export function hideInpageFind (page) {
  if (page.isInpageFinding) {
    page.stopFindInPageAsync('clearSelection')
    page.isInpageFinding = false
    page.inpageFindInfo = null
    update(page)
  }
}

export function clearAutocomplete () {
  if (autocompleteResults) {
    autocompleteCurrentValue = null
    autocompleteCurrentSelection = 0
    autocompleteResults = null
    update()
  }
}

export function update (page) {
  // fetch current page, if not given
  page = page || pages.getActive()
  if (!page.webviewEl) return

  // render
  yo.update(page.navbarEl, render(page.id, page))
}

export function updateLocation (page) {
  // fetch current page, if not given
  page = page || pages.getActive()

  // update location
  var addrEl = page.navbarEl.querySelector('.nav-location-input')
  var isAddrElFocused = addrEl.matches(':focus')
  if (!isAddrElFocused || !addrEl.value) { // only update if not focused or empty, so we dont mess up what the user is doing
    addrEl.value = page.getIntendedURL()
    if (isAddrElFocused) {
      addrEl.select() // if was focused, then select what we put in
    }
  }
}

export function bookmarkAndOpenMenu () {
  bookmarkMenuNavbarBtn.onClickBookmark()
}

export function closeMenus () {
  browserMenuNavbarBtn.isDropdownOpen = false
  browserMenuNavbarBtn.updateActives()
  // appsMenuNavbarBtn.close() TODO(apps) restore when we bring back apps -prf
  pageMenuNavbarBtn.close()
  bookmarkMenuNavbarBtn.close()
  datsiteMenuNavbarBtn.close()
}

// internal helpers
// =

function render (id, page) {
  const isLoading = page && page.isLoading()
  const isViewingDat = page && page.getURL().startsWith('dat:')
  const siteHasDatAlternative = page && page.siteHasDatAlternative
  const gotInsecureResponse = page && page.siteLoadError && page.siteLoadError.isInsecureResponse
  const siteLoadError = page && page.siteLoadError

  // back/forward should be disabled if its not possible go back/forward
  var backDisabled = (page && page.canGoBack()) ? '' : 'disabled'
  var forwardDisabled = (page && page.canGoForward()) ? '' : 'disabled'

  // render reload/cancel btn
  var reloadBtn = (isLoading)
    ? yo`
        <button class="toolbar-btn nav-cancel-btn" onclick=${onClickCancel}>
          ${renderCloseIcon()}
        </button>`
    : yo`
        <button class="toolbar-btn nav-reload-btn" onclick=${onClickReload} title="Reload this page">
          ${renderRefreshIcon()}
        </button>`

  // `page` is null on initial render
  // and the toolbar should be hidden on initial render
  // and it should be hidden if the page isnt active
  var toolbarHidden = (!page || !page.isActive) ? ' hidden' : ''

  // preserve the current finder value and focus
  var findEl = page && page.navbarEl.querySelector('.nav-find-input')
  var findValue = findEl ? findEl.value : ''

  // inpage finder ctrl
  var inpageFinder = (page && page.isInpageFinding)
    ? yo`
        <div class="nav-find-wrapper">
          <input
            type="text"
            class="nav-find-input nav-location-input"
            placeholder="Find in page..."
            oninput=${onInputFind}
            onkeydown=${onKeydownFind}
            value=${findValue} />
          ${findValue && page.inpageFindInfo
            ? yo`
              <span class="nav-find-info">
                ${page.inpageFindInfo.activeMatchOrdinal}
                of
                ${page.inpageFindInfo.matches}
              </span>`
            : ''}
          <div class="nav-find-btns">
            <button disabled=${!findValue} class="btn" onclick=${e => onClickFindNext(e, false)}><i class="fa fa-angle-up"></i></button>
            <button disabled=${!findValue} class="btn last" onclick=${e => onClickFindNext(e, true)}><i class="fa fa-angle-down"></i></button>
            <button class="close-btn" onclick=${e => hideInpageFind(page)}>${renderCloseIcon()}</button>
          </div>
        </div>
      `
    : ''

  // zoom btn should only show if zoom is not the default setting
  var zoomBtn = ''
  if (page && page.zoom != 0) {
    // I dont know what that formula is, so I solved this problem like any good programmer would, by stealing the values from chrome
    var zoomPct = ({
      '-0.5': 90,
      '-1': 75,
      '-1.5': 67,
      '-2': 50,
      '-2.5': 33,
      '-3': 25,
      '0': 100,
      '0.5': 110,
      '1': 125,
      '1.5': 150,
      '2': 175,
      '2.5': 200,
      '3': 250,
      '3.5': 300,
      '4': 400,
      '4.5': 500
    })[page.zoom]
    var zoomIcon = zoomPct < 100 ? '-minus' : '-plus'
    zoomBtn = yo`
      <button onclick=${onClickZoom} title="Zoom: ${zoomPct}%" class="zoom">
        <i class=${'fa fa-search' + zoomIcon}></i>
        ${zoomPct}%
      </button>`
  }

  // dat buttons
  var datBtns = ''

  if (isViewingDat) {
    datBtns = []
    if (page.isLiveReloading()) {
      datBtns.unshift(
        yo`<span class="live-reload-indicator" title="Live reloading active">
            <i class="fa fa-bolt"></i>
          </span>`
      )
    }
    // TODO(apps) restore when we bring back apps -prf
    // if (page.siteInfo && page.siteInfo.type.includes('app')) {
    //   if (page.isInstalledApp() === false) {
    //     datBtns.unshift(
    //       yo`<button
    //         class="callout install-callout"
    //         title="Install this application"
    //         onclick=${onClickInstallApp}
    //       >
    //         <span class="fa fa-download"></span> Install Application
    //       </button>`
    //     )
    //   }
    // }
  } else if (siteHasDatAlternative) {
    datBtns = [
      yo`<button
        class="callout"
        title="Go to Dat Version of this Site"
        onclick=${onClickGotoDatVersion}
      >
        <span class="fa fa-share-alt"></span> P2P version available
      </button>`
    ]
  }

  // autocomplete dropdown
  var autocompleteDropdown = ''
  if (autocompleteResults) {
    autocompleteDropdown = yo`
      <div class="autocomplete-dropdown" onclick=${onClickAutocompleteDropdown}>
        ${autocompleteResults.map((r, i) => {
          // content
          var contentColumn
          if (r.search) { contentColumn = yo`<span class="result-search">${r.search}</span>` } else {
            contentColumn = yo`<span class="result-url"></span>`
            if (r.urlDecorated) {
              contentColumn.innerHTML = r.urlDecorated // use innerHTML so our decoration can show
            } else {
              contentColumn.textContent = r.url
            }
          }
          var titleColumn = yo`<span class="result-title"></span>`
          if (r.titleDecorated) {
            titleColumn.innerHTML = r.titleDecorated // use innerHTML so our decoration can show
          } else {
            titleColumn.textContent = r.title
          }

          // selection
          var rowCls = 'result'
          if (i == autocompleteCurrentSelection) { rowCls += ' selected' }

          // result row
          return yo`
            <div class=${rowCls} data-result-index=${i}>
              ${r.bookmarked ? yo`<i class="fa fa-star-o"></i>` : ''}
              ${r.search
                ? yo`<i class="icon icon-search"></i>`
                : yo`<img class="icon" src=${'beaker-favicon:' + r.url}/>`
              }
              ${contentColumn}
              ${titleColumn}
            </div>`
        })}
      </div>
    `
  }

  // preserve the current address value
  var addrEl = page && page.navbarEl.querySelector('.nav-location-input')
  var addrValue = addrEl ? addrEl.value : ''
  var isAddrElFocused = addrEl && addrEl.matches(':focus')

  // the main URL input
  var locationInput = yo`
    <input
      type="text"
      class="nav-location-input ${(!isAddrElFocused) ? ' hidden' : ''}"
      oncontextmenu=${onContextMenu}
      onfocus=${onFocusLocation}
      onblur=${onBlurLocation}
      onkeydown=${onKeydownLocation}
      oninput=${onInputLocation}
      value=${addrValue} />
  `

  // a prettified rendering of the main URL input
  var locationPrettyView = renderPrettyLocation(addrValue, isAddrElFocused, gotInsecureResponse, siteLoadError)

  // render
  return yo`
    <div data-id=${id} class="toolbar-actions${toolbarHidden}">
      <div class="toolbar-group">
        <button style="transform: scaleX(-1);" class="toolbar-btn nav-back-btn" ${backDisabled} onclick=${onClickBack}>
          ${renderNavArrowIcon()}
        </button>

        <button class="toolbar-btn nav-forward-btn" ${forwardDisabled} onclick=${onClickForward}>
          ${renderNavArrowIcon()}
        </button>
        ${reloadBtn}
      </div>

      <div class="toolbar-input-group${isLocationHighlighted ? ' input-focused' : ''}${autocompleteResults ? ' autocomplete' : ''}">
        ${page && !(isLoading || isLocationHighlighted) ? page.siteInfoNavbarBtn.render() : ''}
        ${locationPrettyView}
        ${locationInput}
        ${inpageFinder}
        ${zoomBtn}
        ${!isLocationHighlighted ? datBtns : ''}
        ${!isLocationHighlighted ? datsiteMenuNavbarBtn.render() : ''}
        ${!isLocationHighlighted ? pageMenuNavbarBtn.render() : ''}
        ${!isLocationHighlighted ? bookmarkMenuNavbarBtn.render() : ''}
      </div>
      <div class="toolbar-group">
        ${''/*appsMenuNavbarBtn.render() TODO(apps) restore when we bring back apps -prf*/}
        ${browserMenuNavbarBtn.render()}
        ${updatesNavbarBtn.render()}
      </div>
      ${autocompleteDropdown}
    </div>
  </div>`
}

function renderPrettyLocation (value, isHidden, gotInsecureResponse, siteLoadError) {
  var valueRendered = value
  if (/^(dat|http|https):/.test(value)) {
    try {
      var { protocol, host, pathname, search, hash } = new URL(value)
      var hostVersion
      if (protocol === 'dat:') {
        let match = /(.*)\+(.*)/.exec(host)
        if (match) {
          host = match[1]
          hostVersion = '+' + match[2]
        }
        if (isDatHashRegex.test(host)) {
          host = prettyHash(host)
        }
      }
      var cls = 'protocol'
      if (['beaker:'].includes(protocol)) cls += ' protocol-secure'
      if (['https:'].includes(protocol) && !siteLoadError && !gotInsecureResponse) cls += ' protocol-secure'
      if (['https:'].includes(protocol) && gotInsecureResponse) cls += ' protocol-insecure'
      if (['dat:'].includes(protocol)) cls += ' protocol-p2p'
      valueRendered = [
        yo`<span class=${cls}>${protocol.slice(0, -1)}</span>`,
        yo`<span class="syntax">://</span>`,
        yo`<span class="host">${host}</span>`,
        hostVersion ? yo`<span class="host-version">${hostVersion}</span>` : false,
        yo`<span class="path">${pathname}${search}${hash}</span>`
      ].filter(Boolean)
    } catch (e) {
      // invalid URL, just use value
    }
  }

  return yo`
    <div
      class="nav-location-pretty${(isHidden) ? ' hidden' : ''}"
      onclick=${onFocusLocation}
      onmousedown=${onFocusLocation}>
      ${valueRendered}
    </div>
  `
}

async function handleAutocompleteSearch (results) {
  var v = autocompleteCurrentValue
  if (!v) return

  // decorate result with bolded regions
  // explicitly replace special characters to match sqlite fts tokenization
  var searchTerms = v.replace(/[:^*-./]/g, ' ').split(' ').filter(Boolean)
  results.forEach(r => decorateResultMatches(searchTerms, r))

  // does the value look like a url?
  var isProbablyUrl = (!v.includes(' ') && (
    /\.[A-z]/.test(v) ||
    isDatHashRegex.test(v) ||
    v.startsWith('localhost') ||
    v.includes('://') ||
    v.startsWith('beaker:')
  ))
  var vWithProtocol = v
  var isGuessingTheScheme = false
  if (isProbablyUrl && !v.includes('://') && !(v.startsWith('beaker:'))) {
    if (isDatHashRegex.test(v)) {
      vWithProtocol = 'dat://' + v
    } else if (v.startsWith('localhost')) {
      vWithProtocol = 'http://' + v
    } else {
      vWithProtocol = 'https://' + v
      isGuessingTheScheme = true // note that we're guessing so that, if this fails, we can try http://
    }
  }

  // set the top results accordingly
  var gotoResult = { url: vWithProtocol, title: 'Go to ' + v, isGuessingTheScheme }
  var duckduckgoTitle = 'DuckDuckGo Search'
  var searchResult = {
    search: v,
    title: duckduckgoTitle,
    url: 'https://duckduckgo.com/?q=' + v.split(' ').join('+')
  }
  if (isProbablyUrl) autocompleteResults = [gotoResult, searchResult]
  else autocompleteResults = [searchResult, gotoResult]

  // add search results
  if (results) {
    autocompleteResults = autocompleteResults.concat(results)
  }

  await Promise.all(autocompleteResults.map(async r => {
    let bookmarked = false
    try {
      bookmarked = await beaker.bookmarks.isBookmarked(r.url)
    } catch (_) {}
    Object.assign(r, {bookmarked})
  }))

  // find the first autocomplete result that:
  // (a) starts with the input value, ignoring (protocol)://(www.)
  // (b) is not the DuckDuckGo search, and
  // (c) has been visited before
  var foundIndex = autocompleteResults.findIndex(result => {
    return (
      result.url.replace(/^.*?:\/\/(?:www\.)?/, '').startsWith(v) &&
      result.title !== duckduckgoTitle &&
      result.num_visits
    )
  })

  const lastKeycodeDown = lastKeyDown.keyCode

  // if we didn't find an autocomplete result that fit the requirements, reset suggestion and selection
  // also run reset when backspace or delete are pressed
  if (lastKeycodeDown === KEYCODE_BACKSPACE || lastKeycodeDown === KEYCODE_DELETE || foundIndex === -1) {
    autocompleteSuggestion = ''
    autocompleteCurrentSelection = 0
  } else {
    // if we did find one, set the current selection to the found index
    autocompleteCurrentSelection = foundIndex
  }

  if (autocompleteCurrentSelection !== 0) {
    // auto-fill the URL with suggestion if we have one
    var selectionUrl = getAutocompleteSelectionUrl(autocompleteCurrentSelection)
    var re = new RegExp('^.*?' + v)
    autocompleteSuggestion = selectionUrl.replace(re, '')
  }

  // render
  update()
}

function getAutocompleteSelection (i) {
  if (typeof i !== 'number') {
    i = autocompleteCurrentSelection
  }
  if (autocompleteResults && autocompleteResults[i]) {
    return autocompleteResults[i]
  }

  // fallback to the current value in the navbar
  var addrEl = pages.getActive().navbarEl.querySelector('.nav-location-input')
  var url = addrEl.value

  // autocorrect urls of known forms
  if (isDatHashRegex.test(url)) {
    url = 'dat://' + url
  } else {
    if (/:\/\//.test(url) === false) {
      url = 'https://' + url
    }
  }
  return { url, isGuessingTheScheme: true }
}

function getAutocompleteSelectionUrl (i) {
  return getAutocompleteSelection(i).url
}

// helper for autocomplete
// - takes in the current search (tokenized) and a result object
// - mutates `result` so that matching text is bold
var offsetsRegex = /([\d]+ [\d]+ [\d]+ [\d]+)/g
function decorateResultMatches (searchTerms, result) {
  // extract offsets
  var tuples = (result.offsets || '').match(offsetsRegex)
  if (!tuples) { return }

  // iterate all match tuples, and break the values into segments
  let lastTuple
  let segments = { url: [], title: [] }
  let lastOffset = { url: 0, title: 0 }
  for (let tuple of tuples) {
    tuple = tuple.split(' ').map(i => +i) // the map() coerces to the proper type
    let [ columnIndex, termIndex, offset ] = tuple
    let columnName = ['url', 'title'][columnIndex]

    // sometimes multiple terms can hit at the same point
    // that breaks the algorithm, so skip that condition
    if (lastTuple && lastTuple[0] === columnIndex && lastTuple[2] === offset) continue
    lastTuple = tuple

    // use the length of the search term
    // (sqlite FTS gives the length of the full matching token, which isnt as helpful)
    let searchTerm = searchTerms[termIndex]
    if (!searchTerm) continue
    let len = searchTerm.length

    // extract segments
    segments[columnName].push(result[columnName].slice(lastOffset[columnName], offset))
    segments[columnName].push(result[columnName].slice(offset, offset + len))
    lastOffset[columnName] = offset + len
  }

  // add the remaining text
  segments.url.push(result.url.slice(lastOffset.url))
  segments.title.push(result.title.slice(lastOffset.title))

  // join the segments with <strong> tags
  result.urlDecorated = joinSegments(segments.url)
  result.titleDecorated = joinSegments(segments.title)
}

// helper for decorateResultMatches()
// - takes an array of string segments (extracted from the result columns)
// - outputs a single escaped string with every other element wrapped in <strong>
var ltRegex = /</g
var gtRegex = />/g
function joinSegments (segments) {
  var str = ''
  var isBold = false
  for (var segment of segments) {
    // escape for safety
    segment = segment.replace(ltRegex, '&lt;').replace(gtRegex, '&gt;')

    // decorate with the strong tag
    if (isBold) str += '<strong>' + segment + '</strong>'
    else str += segment
    isBold = !isBold
  }
  return str
}

// ui event handlers
// =

function getEventPage (e) {
  for (var i = 0; i < e.path.length; i++) {
    if (e.path[i].dataset && e.path[i].dataset.id) { return pages.getById(e.path[i].dataset.id) }
  }
}

function onClickBack (e) {
  var page = getEventPage(e)
  if (page && page.canGoBack()) {
    page.goBackAsync()
  }
}

function onClickForward (e) {
  var page = getEventPage(e)
  if (page && page.canGoForward()) {
    page.goForwardAsync()
  }
}

function onClickReload (e) {
  var page = getEventPage(e)
  if (page) { page.reload() }
}

function onClickCancel (e) {
  var page = getEventPage(e)
  if (page) {
    page.stopAsync()
  }
}

// TODO(apps) restore when we bring back apps -prf
// async function onClickInstallApp (e) {
//   const page = getEventPage(e)
//   if (!page || !page.siteInfo) return
//   const res = await beaker.apps.runInstaller(0, `dat://${page.siteInfo.key}`)
//   if (res && res.name) {
//     page.loadURL(`app://${res.name}`)
//   }
// }

function onClickGotoDatVersion (e) {
  const page = getEventPage(e)
  if (!page || !page.protocolInfo) return

  const url = `dat://${page.protocolInfo.hostname}${page.protocolInfo.pathname}`
  if (e.metaKey || e.ctrlKey) { // popup
    pages.setActive(pages.create(url))
  } else {
    page.loadURL(url) // goto
  }
}

function onClickZoom (e) {
  const { Menu } = remote
  var menu = Menu.buildFromTemplate([
    { label: 'Reset Zoom', click: () => zoom.zoomReset(pages.getActive()) },
    { label: 'Zoom In', click: () => zoom.zoomIn(pages.getActive()) },
    { label: 'Zoom Out', click: () => zoom.zoomOut(pages.getActive()) }
  ])
  menu.popup(remote.getCurrentWindow())
}

function onFocusLocation (e) {
  var page = getEventPage(e)
  if (page) {
    page.navbarEl.querySelector('.nav-location-pretty').classList.add('hidden')
    page.navbarEl.querySelector('.nav-location-input').classList.remove('hidden')
    page.navbarEl.querySelector('.toolbar-input-group').classList.add('input-focused')
    // wait till next tick to avoid events messing with each other
    setTimeout(() => page.navbarEl.querySelector('.nav-location-input').select(), 0)
  }
}

function onBlurLocation (e) {
  // HACK
  // blur gets called right before the click event for onClickAutocompleteDropdown
  // so, wait a bit before clearing the autocomplete, so the click has a chance to fire
  // -prf
  setTimeout(clearAutocomplete, 150)
  var page = getEventPage(e)
  if (page) {
    try {
      page.navbarEl.querySelector('.nav-location-pretty').classList.remove('hidden')
      page.navbarEl.querySelector('.nav-location-input').classList.add('hidden')
      page.navbarEl.querySelector('.toolbar-input-group').classList.remove('input-focused')
    } catch (e) {
      // ignore
    }
    isLocationHighlighted = false
    update()
  }
}

function onInputLocation (e) {
  var value = e.target.value = enteredValue

  // run autocomplete
  // TODO debounce
  var autocompleteValue = value.trim()
  if (autocompleteValue) {
    autocompleteCurrentValue = autocompleteValue // update the current value
    autocompleteCurrentSelection = 0 // reset the selection
    // update the suggestions
    beaker.history.search(value)
      .then(handleAutocompleteSearch)
      .then(() => {
        if (autocompleteCurrentSelection !== -1 && autocompleteSuggestion) {
          // find the length of the current value
          var startingIndex = e.target.value.length
          // add the autocomplete suggestion
          e.target.value += autocompleteSuggestion
          // select the autocomplete suggestion
          e.target.setSelectionRange(startingIndex, e.target.value.length)
        }
      })
  } else if (!autocompleteValue) { clearAutocomplete() } // no value, cancel out

  isLocationHighlighted = true
}

function isCharacterKeyPress (evt) {
  if (typeof evt.which == 'number' && evt.which > 0) {
    // In other browsers except old versions of WebKit, evt.which is
    // only greater than zero if the keypress is a printable key.
    // We need to filter out backspace and ctrl/alt/meta key combinations
    return !evt.ctrlKey && !evt.metaKey && !evt.altKey && evt.which != 8 && evt.key.length === 1
  }
  return false
}

function onKeydownLocation (e) {
  lastKeyDown = e
  if (isCharacterKeyPress(e)) {
    e.preventDefault()
    enteredValue += e.key
    onInputLocation(e)
  }

  // on enter
  if (e.keyCode == KEYCODE_ENTER) {
    e.preventDefault()

    let page = getEventPage(e)
    if (page) {
      let selection = getAutocompleteSelection()
      page.loadURL(selection.url, { isGuessingTheScheme: selection.isGuessingTheScheme })
      e.target.blur()
    }
    return
  }

  // on escape
  if (e.keyCode == KEYCODE_ESC) {
    let page = getEventPage(e)
    page.navbarEl.querySelector('.nav-location-input').value = page.getIntendedURL()
    e.target.blur()
    return
  }

  // on keycode navigations
  var up = (e.keyCode == KEYCODE_UP || (e.ctrlKey && e.keyCode == KEYCODE_P))
  var down = (e.keyCode == KEYCODE_DOWN || (e.ctrlKey && e.keyCode == KEYCODE_N))
  if (autocompleteResults && (up || down)) {
    e.preventDefault()
    if (up && autocompleteCurrentSelection > 0) { autocompleteCurrentSelection-- }
    if (down && autocompleteCurrentSelection < autocompleteResults.length - 1) { autocompleteCurrentSelection++ }

    // re-render and update the url
    let page = getEventPage(e)
    let newValue = getAutocompleteSelectionUrl(autocompleteCurrentSelection)
    page.navbarEl.querySelector('.nav-location-input').value = newValue
    update(page)
  }
}

function onClickAutocompleteDropdown (e) {
  // get the result index
  for (var i = 0; i < e.path.length; i++) {
    if (e.path[i].dataset && e.path[i].classList.contains('result')) {
      // follow result url
      var resultIndex = +e.path[i].dataset.resultIndex
      pages.getActive().loadURL(getAutocompleteSelectionUrl(resultIndex))
      return
    }
  }
}

function onInputFind (e) {
  var str = e.target.value
  var page = getEventPage(e)
  if (page) {
    if (str) page.findInPageAsync(str)
    else page.stopFindInPageAsync('clearSelection')
    update()
  }
}

function onClickFindNext (e, forward) {
  var page = pages.getActive()
  if (page) {
    var wrapperEl = findParent(e.target, 'nav-find-wrapper')
    var inputEl = wrapperEl.querySelector('input')
    var str = inputEl.value
    if (str) page.findInPageAsync(str, { findNext: true, forward })
  }
}

function onKeydownFind (e) {
  // on enter
  if (e.keyCode == KEYCODE_ENTER) {
    let str = e.target.value
    let backwards = e.shiftKey // search backwords on shift+enter
    let page = getEventPage(e)
    if (page) {
      if (str) page.findInPageAsync(str, { findNext: true, forward: !backwards })
      else page.stopFindInPageAsync('clearSelection')
    }
  }
}

function onGlobalKeydown (e) {
  // on escape, hide the in page finder
  if (e.keyCode == KEYCODE_ESC) {
    let page = pages.getActive()
    if (page) { hideInpageFind(page) }
  }
}

function onContextMenu (e) {
  const { Menu } = remote
  const menu = [
    { label: 'Cut', role: 'cut' },
    { label: 'Copy', role: 'copy' },
    { label: 'Paste', role: 'paste' }
  ]
  Menu.buildFromTemplate(menu).popup()
}
