import fs from 'fs';

// fix slashCatalog return
{
  let c = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  c = c.replace(
    /return \[\.\.\.core, \.\.\.skills[^\]]*\]\s*;/,
    `return [
    ...core,
    ...skills,
    { name: 'copy-last', description: 'Copy last assistant message' },
  ];`
  );
  // also fix the broken line form
  if (c.includes('...skills  { name:')) {
    c = c.replace(
      /return \[\.\.\.core, \.\.\.skills[\s\S]*?\];/,
      `return [
    ...core,
    ...skills,
    { name: 'copy-last', description: 'Copy last assistant message' },
  ];`
    );
  }
  fs.writeFileSync('src/host/cli/slashCatalog.ts', c);
  console.log('catalog', c.includes("name: 'copy-last'"), !c.includes('...skills  {'));
}

// fix models slash order
{
  let m = fs.readFileSync('src/webview/app/main.ts', 'utf8');
  // replace the broken models block start through first append
  const start = m.indexOf("  if (cmd === 'models' || (cmd === 'model' && !rest)) {");
  if (start < 0) {
    console.log('models block not found');
  } else {
    // find end of this if block - look for next "  if (cmd ===" at same indent after start
    const after = m.slice(start + 10);
    const next = after.search(/\n  if \(cmd === /);
    const end = next >= 0 ? start + 10 + next : -1;
    if (end < 0) {
      console.log('models end miss');
    } else {
      const old = m.slice(start, end);
      const neu = `  if (cmd === 'models' || (cmd === 'model' && !rest)) {
    const models = modelSelect
      ? Array.from(modelSelect.options).map((o) => o.value || o.textContent || '').filter(Boolean)
      : [];
    if (!models.length) {
      showToast('refresh models…');
      post({ type: 'refreshModels' });
    } else {
      showToast('models');
    }
    if (statusLabel) statusLabel.textContent = 'models…';
    if (models.length) {
      appendOrUpdateMessage({
        id: 'sys_models_' + Date.now(),
        role: 'assistant',
        text:
          '**Models**\\n' +
          models
            .slice(0, 30)
            .map((m) => '- \`' + m + '\`' + (m === selectedModel ? ' ← current' : ''))
            .join('\\n') +
          (models.length > 30 ? '\\n- … +' + (models.length - 30) + ' more' : ''),
      });
    }
    return true;
  }
`;
      // keep original block body if it's complex - better just fix the top order
      // simpler fix: move MODELS_REFRESH after const models and remove double post
      let block = old;
      // remove the bad early refresh that uses models before define
      block = block.replace(
        /\/\/ MODELS_REFRESH_IF_EMPTY[\s\S]*?if \(statusLabel\) statusLabel\.textContent = 'models…';\s*/,
        ''
      );
      // ensure after const models we refresh if empty once
      if (!block.includes('MODELS_REFRESH_IF_EMPTY') && block.includes('const models = modelSelect')) {
        block = block.replace(
          /const models = modelSelect[\s\S]*?\.filter\(Boolean\);\s*/,
          (s) =>
            s +
            "    // MODELS_REFRESH_IF_EMPTY\n    if (!models.length) {\n      showToast('refresh models…');\n      post({ type: 'refreshModels' });\n    }\n"
        );
      }
      // remove duplicate post refreshModels if still early
      m = m.slice(0, start) + block + m.slice(end);
      fs.writeFileSync('src/webview/app/main.ts', m);
      console.log('models fixed');
    }
  }
}

// verify tsc-able catalog line
{
  const c = fs.readFileSync('src/host/cli/slashCatalog.ts', 'utf8');
  const i = c.lastIndexOf('return [');
  console.log(c.slice(i, i + 200));
}
