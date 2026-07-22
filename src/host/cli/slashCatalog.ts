/** Static slash surface from MiMo Code CLI command/index + skills (0.1.7). */

export type SlashCommand = { name: string; description: string };

export function getSlashCommandCatalog(): SlashCommand[] {
  const core: SlashCommand[] = [
    { name: 'init', description: 'Guided AGENTS.md setup' },
    { name: 'review', description: 'Review changes [commit|branch|pr]' },
    { name: 'dream', description: 'Consolidate project memory from traces' },
    { name: 'distill', description: 'Package repeated workflows into skills/commands' },
    { name: 'goal', description: 'Set stop-condition goal (judge verifies). /goal clear to abort' },
    { name: 'rebuild', description: 'Rebuild context from latest checkpoint now' },
    { name: 'deep-research', description: 'Deep multi-source research report workflow' },
    { name: 'loops', description: 'List scheduled jobs; /loops cancel <id>' },
    { name: 'loop', description: '[interval] <prompt> — schedule a repeating prompt' },
    { name: 'voice', description: 'Toggle streaming voice input' },
    { name: 'connect', description: 'Sign in to a provider' },
    { name: 'login', description: 'Login / connect provider' },
    { name: 'btw', description: 'Side question without derailing the main turn' },
    { name: 'skills', description: 'Browse / invoke skills' },
    { name: 'help', description: 'Show help' },
    { name: 'doctor', description: 'Extension diagnostics (bin/db/sqlite)' },
    { name: 'new', description: 'Start a new session' },
    { name: 'clear', description: 'Clear the current chat view' },
    { name: 'sessions', description: 'Open session history' },
    { name: 'model', description: 'Switch model' },
    { name: 'models', description: 'Refresh / list models' },
    { name: 'agent', description: 'Switch agent / mode' },
    { name: 'undo', description: 'Undo last file changes' },
    { name: 'redo', description: 'Redo last undo' },
    { name: 'compact', description: 'Compact context' },
    { name: 'export', description: 'Export session' },
    { name: 'share', description: 'Share session' },
    { name: 'stop', description: 'Stop current turn' },
    { name: 'retry', description: 'Retry last message' },
    { name: 'reload', description: 'Soft-reload current session from DB' },
    { name: 'refresh', description: 'Soft-reload current session from DB' },
    { name: 'plan', description: 'Enter plan mode' },
    { name: 'build', description: 'Enter build mode' },
    { name: 'compose', description: 'Enter compose mode' },
    { name: 'diff', description: 'Show pending diffs' },
    { name: 'cost', description: 'Show token / cost usage' },
    { name: 'status', description: 'Show session status' },
    { name: 'port', description: 'Show serve status / workspace' },
    { name: 'server', description: 'Show serve status / workspace' },
    { name: 'editor', description: 'Open external editor' },
    { name: 'theme', description: 'Theme settings' },
    { name: 'exit', description: 'Exit session' },
    { name: 'stash', description: 'Stash prompt draft' },
    { name: 'details', description: 'Toggle tool details' },
    { name: 'home', description: 'Go to home (logo + recent)' },
    { name: 'history', description: 'Open session history panel' },
    { name: 'questions', description: 'Answer pending questions' },
    { name: 'never-ask', description: 'Toggle never-ask for questions' },
    { name: 'skip-permissions', description: 'Skip permission prompts (forced-ask remains)' },
    { name: 'agents', description: 'List / switch agents' },
    { name: 'tasks', description: 'Show task tree' },
    { name: 'mcp', description: 'MCP servers status' },
    { name: 'permissions', description: 'Permission settings' },
    { name: 'config', description: 'Open MiMo VS Code settings' },
    { name: 'log', description: 'Show MiMo extension output channel' },
    { name: 'output', description: 'Show MiMo extension output channel' },
    { name: 'checkpoint', description: 'Checkpoint status / rebuild' },
    { name: 'memory', description: 'Browse project memory' },
    { name: 'usage', description: 'Token / context usage' },
    { name: 'fork', description: 'Fork current session' },
    { name: 'id', description: 'Copy current session id' },
    { name: 'session', description: 'Show / copy current session id' },
    { name: 'open', description: 'Open file path in editor' },
    { name: 'cwd', description: 'Show workspace root path' },
    { name: 'folder', description: 'Reveal workspace/folder in OS' },
    { name: 'explore', description: 'Reveal workspace/folder in OS' },
    { name: 'pwd', description: 'Show workspace root path' },
    { name: 'sel', description: 'Insert active editor selection into prompt' },
    { name: 'selection', description: 'Insert active editor selection into prompt' },
    { name: 'agents', description: 'List agents / modes' },
    { name: 'modes', description: 'List modes' },
    { name: 'title', description: 'Show session title (or /title <name> rename)' },
    { name: 'rename', description: 'Rename current session' },
    { name: 'delete', description: 'Delete a session' },
    { name: 'resume', description: 'Resume a session by id' },
  ];
  const skills = [
    'arxiv',
    'claude-code',
    'codex',
    'data-analytics',
    'deep-research',
    'design-blueprint',
    'docx-official',
    'drive-mimo',
    'evolve',
    'frontend-design',
    'html-to-video-pipeline',
    'imagegen',
    'learn-everything',
    'loop',
    'mimocode',
    'mimocode-docs',
    'modern-python-toolchain',
    'openai-docs',
    'pdf-official',
    'plugin-creator',
    'pptx-official',
    'product-design',
    'research-paper-writing',
    'sales',
    'skill-creator',
    'skill-installer',
    'super-research',
    'xlsx-official',
  ].map((name) => ({ name, description: `Skill: ${name}` }));
  return [...core, ...skills];
}

export function filterSlashCommands(query: string, catalog: SlashCommand[]): SlashCommand[] {
  const q = String(query || '')
    .replace(/^\//, '')
    .toLowerCase()
    .trim();
  if (!q) return catalog.slice(0, 40);
  return catalog
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
    )
    .slice(0, 40);
}
