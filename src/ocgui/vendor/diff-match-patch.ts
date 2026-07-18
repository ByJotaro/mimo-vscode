// Wrapper: tries real diff-match-patch package first, falls back to bundled copy
// (avoids crash when vsix excludes node_modules)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const _dmp: Record<string, unknown> = (() => {
    try {
        return require('diff-match-patch');
    } catch {
        return require('./diff-match-patch-lib');
    }
})();

export const diff_match_patch = (_dmp.diff_match_patch || _dmp) as { new(): any };
export const DIFF_DELETE = -1 as const;
export const DIFF_INSERT = 1 as const;
export const DIFF_EQUAL = 0 as const;

export type Diff = [-1 | 0 | 1, string];
