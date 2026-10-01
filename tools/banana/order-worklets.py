#!/usr/bin/env python3
"""Reorder top-level function declarations so every callee is defined before
its callers. Reanimated's babel plugin turns worklet declarations into
non-hoisted assignments and captures closures at definition time, so a worklet
that calls a function declared further down captures `undefined` on the UI
thread. Usage: order-worklets.py file.ts [--check]"""
import re, sys

def strip(code):
    return re.sub(r'//.*', '', code)

def split(src):
    lines = src.split('\n')
    blocks, other, i = [], [], 0
    while i < len(lines):
        ln = lines[i]
        m = re.match(r'^(export )?function (\w+)', ln)
        if m:
            # attach preceding doc comment
            start = len(other)
            while start > 0 and (other[start-1].startswith(' *') or other[start-1].startswith('/**') or other[start-1].startswith('//')):
                start -= 1
            doc = other[start:]
            del other[start:]
            j = i
            while not lines[j].startswith('}'):
                j += 1
            blocks.append((m.group(2), '\n'.join(doc + lines[i:j+1])))
            i = j + 1
            # swallow one blank line
            if i < len(lines) and lines[i] == '':
                i += 1
            continue
        other.append(ln)
        i += 1
    return other, blocks

def order(blocks):
    names = [n for n, _ in blocks]
    body = dict(blocks)
    deps = {n: {m for m in names if m != n and re.search(r'(?<![\w.])' + m + r'\b', strip(body[n].split('\n', 1)[1] if '\n' in body[n] else ''))} for n in names}
    out, seen, stack = [], set(), set()
    def visit(n):
        if n in seen: return
        if n in stack: return  # recursion: leave order
        stack.add(n)
        for d in sorted(deps[n], key=names.index): visit(d)
        stack.discard(n); seen.add(n); out.append(n)
    for n in names: visit(n)
    return out, body

def main():
    path = sys.argv[1]
    src = open(path).read()
    other, blocks = split(src)
    names, body = order(blocks)
    # keep trailing non-function lines (re-exports) after functions
    tail_idx = len(other)
    while tail_idx > 0 and (other[tail_idx-1].startswith('export {') or other[tail_idx-1].startswith('export *') or other[tail_idx-1] == ''):
        tail_idx -= 1
    head, tail = other[:tail_idx], other[tail_idx:]
    new = '\n'.join(head).rstrip('\n') + '\n\n' + '\n\n'.join(body[n] for n in names) + '\n' + ('\n'.join(tail).strip('\n') + '\n' if ''.join(tail).strip() else '')
    if '--check' in sys.argv:
        orig = [n for n, _ in blocks]
        bodies = dict(blocks)
        for i, n in enumerate(orig):
            rest = bodies[n].split('\n', 1)[1] if '\n' in bodies[n] else ''
            for m in orig[i + 1:]:
                if re.search(r'(?<![\w.])' + m + r'\b', strip(rest)):
                    print(f'{path}: {n} calls {m} before it is defined'); sys.exit(1)
        return
    open(path, 'w').write(new)
    print(path, 'ok' if [n for n, _ in blocks] == names else 'reordered')

main()
