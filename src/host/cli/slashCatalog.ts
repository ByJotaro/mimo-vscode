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
    { name: 'new', description: 'Start a new session' },
    { name: 'clear', description: 'Clear the current chat view' },
    { name: 'sessions', description: 'Open session history' },
    { name: 'model', description: 'Switch model' },
    { name: 'agent', description: 'Switch agent / mode' },
    { name: 'undo', description: 'Undo last file changes' },
    { name: 'redo', description: 'Redo last undo' },
    { name: 'compact', description: 'Compact context' },
    { name: 'export', description: 'Export session' },
    { name: 'share', description: 'Share session' },
    { name: 'stop', description: 'Stop current turn' },
    { name: 'retry', description: 'Retry last message' },
    { name: 'plan', description: 'Enter plan mode' },
    { name: 'build', description: 'Enter build mode' },
    { name: 'compose', description: 'Enter compose mode' },
    { name: 'diff', description: 'Show pending diffs' },
    { name: 'cost', description: 'Show token / cost usage' },
    { name: 'status', description: 'Show session status' },
    { name: 'editor', description: 'Open external editor' },
    { name: 'theme', description: 'Theme settings' },
    { name: 'exit', description: 'Exit session' },
    { name: 'stash', description: 'Stash prompt draft' },
    { name: 'details', description: 'Toggle tool details' },
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
