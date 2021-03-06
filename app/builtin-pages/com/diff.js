import yo from 'yo-yo'

// exported api
// =

export default function render (diff) {
  let origIdx = 1
  let newIdx = 1

  let originalLinenos = []
  let newLinenos = []

  for (let i = 0; i < diff.length; i++) {
    const lineDiff = diff[i]

    if (lineDiff.added) {
      originalLinenos = originalLinenos.concat(Array(lineDiff.count).fill(' '))

      for (let j = 0; j <  lineDiff.count; j++) {
        newLinenos.push((j + newIdx).toString())
      }
      newIdx += lineDiff.count
    } else if (lineDiff.removed) {
      newLinenos = newLinenos.concat(Array(lineDiff.count).fill(' '))

      for (let j = 0; j <  lineDiff.count; j++) {
        originalLinenos.push((j + origIdx).toString())
      }
      origIdx += lineDiff.count
    } else {
      for (let j = 0; j <  lineDiff.count; j++) {
        originalLinenos.push((j + origIdx).toString())
        newLinenos.push((j + newIdx).toString())
      }
      origIdx += lineDiff.count
      newIdx += lineDiff.count
    }
  }

  const lineEls = originalLinenos.map(l => yo`<div class="lineno">${l}</div>`)
  const lineEls2 = newLinenos.map(l => yo`<div class="lineno">${l}</div>`)

  return yo`
    <div>
      <pre class="diff">
        <div class="linenos">${lineEls}</div>
        <div class="linenos linenos2">${lineEls2}</div>
        ${diff.map(d => yo`<div class=${d.removed ? 'del' : d.added ? 'add' : ''}>${d.value}</div>`)}
      </pre>
    </div>
  `
}