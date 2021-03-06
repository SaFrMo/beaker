/* globals beaker DatArchive */

import * as yo from 'yo-yo'
import {shortenHash} from '../../lib/strings'
import {adjustWindowHeight} from '../../lib/fg/event-handlers'

var currentFilter = ''
var selectedArchiveKey = ''
var archives
var title = ''
var description = ''
var buttonLabel = 'Select'
var customTitle = ''
var currentView = 'archivePicker'
var isFormDisabled = true

// exported api
// =

window.setup = async function (opts) {
  try {
    buttonLabel = opts.buttonLabel || buttonLabel
    customTitle = opts.title || ''

    archives = await beaker.archives.list({
      isSaved: true,
      isOwner: (opts.filters && opts.filters.isOwner)
    })

    render()
  } catch (e) {
    console.error(e)
    // ditch out
    return beaker.browser.closeModal({
      name: e.name,
      message: e.message || e.toString(),
      internalError: true
    })
  }
}

// event handlers
// =

window.addEventListener('keyup', e => {
  if (e.which === 27) {
    beaker.browser.closeModal()
  }
})

function onChangeTitle (e) {
  selectedArchiveKey = ''
  title = e.target.value
}

function onChangeDescription (e) {
  selectedArchiveKey = ''
  description = e.target.value
}

function onClickCancel (e) {
  e.preventDefault()
  beaker.browser.closeModal()
}

function onChangeFilter (e) {
  currentFilter = e.target.value.toLowerCase()
  render()
}

function onChangeSelectedArchive (e) {
  isFormDisabled = false
  selectedArchiveKey = e.currentTarget.dataset.key
  render()
}

function onUpdateActiveView (e) {
  currentView = e.target.dataset.content
  render()
}

async function onSubmit (e) {
  e.preventDefault()
  if (!selectedArchiveKey) {
    try {
      var newArchive = await DatArchive.create({title, description})
      beaker.browser.closeModal(null, {url: newArchive.url})
    } catch (e) {
      beaker.browser.closeModal({
        name: e.name,
        message: e.message || e.toString(),
        internalError: true
      })
    }
  } else {
    beaker.browser.closeModal(null, {url: `dat://${selectedArchiveKey}/`})
  }
}

// internal methods
// =

function render () {
  yo.update(document.querySelector('main'), yo`<main>
    <div class="modal">
      <div class="modal-inner">
        <div class="select-archive-modal">
          ${renderActiveViewContent()}
        </div>
      </div>
    </div>
  </main>`)
  adjustWindowHeight('main')
}

function renderActiveViewContent () {
  if (currentView === 'archivePicker') return renderSelectArchiveForm()
  else if (currentView === 'newArchive') return renderNewArchiveForm()
}

function renderNewArchiveForm () {
  return yo`
    <form onsubmit=${onSubmit}>
      <h1 class="title">${customTitle || 'Select an archive'}</h1>
      <div class="view create-archive">
        <label for="title">Title</label>
        <input autofocus name="title" tabindex="2" value=${title || ''} placeholder="Title" onchange=${onChangeTitle} />

        <label for="desc">Description</label>
        <textarea name="desc" tabindex="3" placeholder="Description (optional)" onchange=${onChangeDescription}>${description || ''}</textarea>
      </div>

      <div class="form-actions">
        <div class="left">
          <button type="button" onclick=${onUpdateActiveView} data-content="archivePicker" class="btn">
            <i class="fa fa-caret-left"></i> Back
          </button>
        </div>
        <div class="right">
          <button type="button" onclick=${onClickCancel} class="btn" tabindex="4">Cancel</button>
          <button type="submit" class="btn primary" tabindex="5">
            Create
          </button>
        </div>
      </div>
    </form>
  `
}

function renderSelectArchiveForm () {
  return yo`
    <form onsubmit=${onSubmit}>
      <h1 class="title">${customTitle || 'Select an archive'}</h1>

      ${renderArchivePicker()}

      <div class="form-actions">
        <div class="left">
          <button type="button" onclick=${onUpdateActiveView} data-content="newArchive" class="btn">
            Create new archive
          </button>
        </div>
        <div class="right">
          <button type="button" onclick=${onClickCancel} class="btn" tabindex="4">Cancel</button>
          <button disabled=${isFormDisabled ? 'disabled' : 'false'} type="submit" class="btn primary" tabindex="5">
            ${buttonLabel}
          </button>
        </div>
      </div>
    </form>
  `
}

function renderArchivePicker () {
  if (!archives.length) {
    return 'No archives'
  }

  return yo`
    <div class="view archive-picker">
      <div class="filter-container">
        <i class="fa fa-search"></i>
        <input autofocus onkeyup=${onChangeFilter} id="filter" class="filter" type="text" placeholder="Search"/>
      </div>
      ${renderArchivesList()}
    </div>
  `
}

function renderArchivesList () {
  if (currentFilter) {
    var filtered = archives.filter(a => a.title && a.title.toLowerCase().includes(currentFilter))
  } else {
    filtered = archives
  }

  return yo`<ul class="archives-list">${filtered.map(renderArchive)}</ul>`
}

function renderArchive (archive) {
  var isSelected = selectedArchiveKey === archive.key
  return yo`
    <li class="archive ${isSelected ? 'selected' : ''} ${archive.isOwner ? '' : 'readonly'}" onclick=${onChangeSelectedArchive} data-key=${archive.key}>
      <div class="info">
        <span class="title" title="${archive.title} ${archive.isOwner ? '' : '(Read-only)'}">
          ${archive.title || 'Untitled'}
        </span>

        <code class="hash">${shortenHash(archive.url)}</code>
      </div>
      <i class="fa fa-check-circle"></i>
      ${archive.isOwner ? '' : yo`<span class="readonly">Read-only</span>`}
    </li>
  `
}
