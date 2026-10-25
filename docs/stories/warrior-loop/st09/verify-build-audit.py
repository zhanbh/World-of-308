"""Read-only local checks of the accepted ST09 plan and original delivery. No Jira/network calls."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[4]
FEATURE = Path(__file__).resolve().parent
PLAN = json.loads((FEATURE / 'plan-check.json').read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

def check():
    errors = []
    if sha(FEATURE / 'spec.md') != PLAN['spec_hash']:
        errors.append('spec revision changed')
    if sha(FEATURE.parent / 'st09.md') != PLAN['source_hash']:
        errors.append('source revision changed')
    if not re.search(r'^status: accepted$', (FEATURE / 'spec.md').read_text(), re.M):
        errors.append('spec not accepted')
    graph = {}
    for number, ticket in enumerate(PLAN['tickets'], 1):
        path = (ROOT / ticket['path']).resolve()
        if FEATURE not in path.parents:
            errors.append('ticket outside feature')
            continue
        text = path.read_text()
        if sha(path) != ticket['revision'] or not re.search(r'^status: accepted$', text, re.M):
            errors.append(ticket['id'] + ' stale or unaccepted')
        match = re.search(r'^blocked_by: (\[[^\n]*\])$', text, re.M)
        if not match or json.loads(match[1]) != ticket['blocked_by']:
            errors.append(ticket['id'] + ' dependencies differ')
        if PLAN['spec_hash'] not in text:
            errors.append(ticket['id'] + ' source differs')
        graph[number] = ticket['blocked_by']
    remaining = dict(graph)
    frontiers = []
    while remaining:
        ready = sorted(n for n, deps in remaining.items() if all(d in graph and d not in remaining for d in deps))
        if not ready:
            errors.append('dependency cycle or missing dependency')
            break
        frontiers.append(ready)
        for n in ready:
            del remaining[n]
    manifest = json.loads((FEATURE / 'implementation-sha256.json').read_text())
    mismatches = [p for p, h in manifest['files'].items() if not (ROOT / p).is_file() or sha(ROOT / p) != h]
    # This manifest intentionally describes the original delivery, before audit annotations.
    original = git('rev-parse', '5129c57')
    original_mismatches = [p for p, h in manifest['files'].items()
                          if hashlib.sha256(subprocess.check_output(['git', 'show', original + ':' + p], cwd=ROOT)).hexdigest() != h]
    if original_mismatches:
        errors.append('original implementation manifest differs')
    reviewed = git('rev-parse', 'HEAD')
    diff = git('diff', '04a1cc7...' + reviewed, '--no-ext-diff')
    patterns = {
        'private-key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        'github-token': r'\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b',
        'aws-access-id': r'\bAKIA[A-Z0-9]{16}\b',
        'slack-token': r'\bxox[baprs]-[0-9A-Za-z-]{20,}\b',
    }
    matches = [name for name, pattern in patterns.items() if re.search(pattern, diff)]
    return {
        'reviewed_commit': reviewed, 'original_delivery_commit': original, 'base': git('rev-parse', '04a1cc7'),
        'diff_sha256': hashlib.sha256(diff.encode()).hexdigest(),
        'spec_revision': PLAN['spec_hash'], 'tickets': PLAN['tickets'],
        'plan_gate': {'result': 'fail' if errors else 'pass', 'errors': errors, 'frontiers': frontiers},
        'original_manifest': {'files': len(manifest['files']), 'mismatches': original_mismatches},
        'worktree_changes_since_original_manifest': mismatches,
        'local_security_screen': {'result': 'fail' if matches else 'pass', 'rules': list(patterns), 'matches': matches,
                                  'scope': 'Reviewed implementation text diff only; not a comprehensive security audit'},
        'remote_ci': 'not-run-no-configured-ci', 'jira_actions': False, 'external_issue_actions': False,
    }

if __name__ == '__main__':
    result = check()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['plan_gate']['result'] == result['local_security_screen']['result'] == 'pass' else 1)
