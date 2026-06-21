function renderMarkdown(text) {
  if (!text) return '';
  var lines = text.split('\n');
  var result = [];
  var inCode = false;
  var inTable = false;
  var tableRowCount = 0;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function processInline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  function isSepLine(line) {
    var stripped = line.replace(/\t/g, ' ').replace(/\|/g, ' ').trim();
    return stripped.length > 0 && /^[\s:\-]+$/.test(stripped);
  }

  function highlightCode(code, lang) {
    try {
      var result;
      if (!lang) {
        result = hljs.highlightAuto(code);
      } else {
        result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
      }
      return result.value;
    } catch (e) {
      try {
        return hljs.highlightAuto(code).value;
      } catch (e2) {
        return esc(code);
      }
    }
  }

  function closeTable() {
    if (inTable) { result.push('</table></div>'); inTable = false; }
  }

  function emitRow(cells, isHeader) {
    var tag = isHeader ? 'th' : 'td';
    var processed = cells.map(function(c) { return processInline(c); });
    var wrapped = processed.map(function(c) { return '<div class="cell-content">' + c + '</div>'; });
    result.push('<tr><' + tag + '>' + wrapped.join('</' + tag + '><' + tag + '>') + '</' + tag + '></tr>');
    if (isHeader) tableRowCount = 0;
    tableRowCount++;
  }

  var codeLang = '';
  var codeLines = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf('```') === 0) {
      closeTable();
      if (inCode) {
        var raw = codeLines.join('\n');
        var highlighted = highlightCode(raw, codeLang);
        result.push(highlighted + '</code></pre>');
        inCode = false;
        codeLang = '';
        codeLines = [];
      } else {
        codeLang = line.slice(3).trim();
        result.push('<pre><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    var trimmed = line.trim();

    if (trimmed.match(/^#{1,6}\s/)) {
      closeTable();
      var level = trimmed.indexOf(' ');
      var content = trimmed.slice(level + 1);
      result.push('<h' + level + '>' + processInline(content) + '</h' + level + '>');
      continue;
    }

    if (/^[\s\-]+$/.test(trimmed) && trimmed.length >= 3 && trimmed.indexOf('-') >= 0) {
      continue;
    }

    if (isSepLine(line)) continue;

    var isPipeTable = line.match(/^\|(.+)\|$/) && line.indexOf('|') !== line.lastIndexOf('|');
    var isTabTable = line.indexOf('\t') >= 0 && !/^[\s:\-]+$/.test(line.replace(/\t/g, ''));

    if (isPipeTable) {
      if (!inTable) { closeTable(); result.push('<div class="table-wrapper"><table>'); inTable = true; tableRowCount = 0; }
      var pipeCells = line.slice(1, -1).split('|').map(function(c) { return c.trim(); });
      emitRow(pipeCells, tableRowCount === 0);
    } else if (isTabTable) {
      if (!inTable) { closeTable(); result.push('<div class="table-wrapper"><table>'); inTable = true; tableRowCount = 0; }
      var tabCells = line.split('\t').map(function(c) { return c.trim(); }).filter(function(c) { return c; });
      emitRow(tabCells, tableRowCount === 0);
    } else {
      closeTable();
      var processed = processInline(line);
      if (processed) result.push('<p>' + processed + '</p>');
    }
  }
  closeTable();
  if (inCode) result.push('</code></pre>');
  return result.join('\n');
}
