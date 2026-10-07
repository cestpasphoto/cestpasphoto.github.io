#!/usr/bin/env python3
"""
Generate the Python files of a game's web page from the framework (Pyodide has
no numba, and the network runs in JavaScript).

    python make_web_py.py <framework root> <game> <web folder> [--players 2,3,4] [--check]

<game> is the game's folder in the framework (catan, splendor, ...).

What is shipped: the game file (the <game>/*Game.py defining a subclass of Game),
MCTS.py and Game.py, plus every local module they import, recursively. A local module is left out when it imports, at
module level, a package Pyodide does not provide (torch, ...: see --allow); the
imports of a left-out module are then removed from the shipped files, together
with the functions, methods and statements that use what they imported.
Display-only packages (--strip, default colorama) are removed from the code: colour
codes become empty strings, the text is returned unformatted.

Every shipped file is written flat into <web folder> (Pyodide loads them from the
root of its filesystem): relative and package imports are rewritten as plain
imports, numba (imports, aliases, decorators, jitclass spec) is stripped, prange becomes
range. MCTS.py also gets search() / getActionProb() as coroutines and the network
queried through js.predict() (game.js).

proxy.py is checked: the self-play features must be off (prob_fullMCTS = 1,
forced_playouts False, no dirichlet_noise / is_selfplay in MCTS()), the MCTS
arguments must not be None, and every name it imports from a generated module
must exist there.

--players 2,3,4: the configuration constant (a module-level `NAME = <int>` whose
name contains PLAYERS, e.g. N_PLAYERS / NUMBER_PLAYERS, found automatically; any
other with --players-var, e.g. --players-var NB_GODS --players 1,11 for
Santorini) is read from the page when the module is imported, by a few lines
written in place of `NAME = <int>`:
    NAME = int(js.gameConfig.NAME)   # + an error if it is missing or not supported
globalThis.gameConfig = {NAME: n} must be set by the page before `import proxy`;
the page never falls back silently on a default. Constants derived from NAME at
import time are therefore always consistent.

proxy.py defines its MCTS arguments per configuration value, checked for every
value of --players (or the fixed value of the constant without --players):
    MCTS_PROFILES = {2: dict(cpuct=..., fpu=..., universes=...), 3: ...}
    mcts_args = dotdict(MCTS_COMMON, numMCTSSims=..., **MCTS_PROFILES[NUMBER_PLAYERS])

proxy.py is web-only and never written. A `self.args.*` key read by MCTS but not
set by proxy.py takes the default of the framework's main.py (add_argument), which
is written into the generated MCTS.py; a key with neither is an error.

Modules named *Display (--exclude) are left out, unless a shipped file cannot do
without them (it imports a name, or calls a method, that their removal would take
away): they are then put back. The .py files of the web folder the page no longer
uses are deleted: those neither proxy.py nor a generated file imports, and the
player-count module once replaced by its per-count copies.

--check (needs the framework's environment: numba and its imports; --python, or
a venv/.venv inside the framework root is picked up) compares,
for every player count, the framework and the web files on scratch copies:
  - engine: seeded random games, byte-identical trajectories required;
  - search: framework MCTS (numba disabled: fastmath may flip near-ties of the
    PUCT score) vs web MCTS, same positions, same deterministic stand-in network,
    identical policies and values required.
The framework itself is never modified.
"""
import argparse
import ast
import os
import re
import shutil
import subprocess
import sys
import tempfile

ME = os.path.basename(__file__)
DEFAULT_ALLOW = ('numpy',)      # packages loaded by game.js (pyodide.loadPackage)
STRIPPED = ('numba',)           # removed by the transformation, never a blocker
EXCLUDED_ROOT = ('proxy',)      # web-only modules, never generated
WEB_ONLY = ('js',)              # modules that exist in the page only
DEFAULT_STRIP = ('colorama',)   # display-only packages removed from the code (see strip_display)
DEFAULT_EXCLUDE = ('Display',)  # module-name suffixes never shipped (terminal display only)
# Self-play features the page must not run (PCR, forced playouts / policy target
# pruning): proxy.py must set these values, checked by static_checks
WEB_REQUIRED = {'prob_fullMCTS': 1.0, 'forced_playouts': False}
# MCTS() keyword arguments that turn self-play behaviour on
SELFPLAY_KWARGS = ('dirichlet_noise', 'is_selfplay')
# MCTS arguments only read by those features: any value works, main.py's default
# is a placeholder so that the attribute exists.
TRAINING_ONLY_ARGS = ('dirichletAlpha', 'temperature', 'ratio_fullMCTS', 'forced_playouts_k')
# numba names with a pure-Python equivalent
NUMBA_SHIMS = {'prange': 'range', 'literal_unroll': '(lambda x: x)'}
PYTHON = sys.executable         # interpreter running --check, see --python


def fail(msg):
    raise SystemExit(f'[{ME}] ERROR: {msg}')


def note(msg):
    print(f'[{ME}] {msg}')


def read(path):
    if not os.path.isfile(path):
        fail(f'missing file {path}')
    with open(path) as f:
        return f.read()


# =============================================================================
# Source layout
# =============================================================================

class Sources:
    """Local modules of the framework: <game>/*.py first, then <root>/*.py."""

    def __init__(self, root, game):
        self.root, self.game = root, game
        self.game_dir = os.path.join(root, game)
        if not os.path.isdir(self.game_dir):
            fail(f'no folder {self.game_dir}')
        self.path, self.clash = {}, set()
        for d in (root, self.game_dir):            # game folder wins on a name clash
            for name in sorted(os.listdir(d)):
                if name.endswith('.py') and name != '__init__.py':
                    if name[:-3] in self.path:
                        self.clash.add(name[:-3])
                    self.path[name[:-3]] = os.path.join(d, name)

    def resolve(self, module, level):
        """Local module name for an import, or None if not local."""
        if module is None:
            return None
        parts = module.split('.')
        if level > 0 or (len(parts) > 1 and parts[0] == self.game):
            name = parts[-1]
        else:
            name = parts[0] if len(parts) == 1 else None
        return name if name in self.path else None

    def in_game_dir(self, name):
        return os.path.dirname(self.path[name]) == self.game_dir


def find_game_file(src, forced):
    if forced:
        name = forced[:-3] if forced.endswith('.py') else forced
        if name not in src.path:
            fail(f'--game-file {forced}: not found')
        return name, _game_class(read(src.path[name]), name)
    found = []
    for name in src.path:
        if src.in_game_dir(name) and name.endswith('Game'):
            cls = _game_class(read(src.path[name]), name, required=False)
            if cls:
                found.append((name, cls))
    if len(found) != 1:
        fail(f'expected one {src.game}/*Game.py defining a subclass of Game, found {[f for f, _ in found]}: '
             f'use --game-file')
    return found[0]


def _game_class(text, name, required=True):
    for node in ast.parse(text).body:
        if isinstance(node, ast.ClassDef) and any(isinstance(b, ast.Name) and b.id == 'Game' for b in node.bases):
            return node.name
    if required:
        fail(f'{name}.py: no class deriving from Game')
    return None


# =============================================================================
# Text transformations
# =============================================================================

def _loads(tree, skip):
    """{name: [line, ...]} of the names read by the code, outside the nodes in skip."""
    out = {}
    def visit(n):
        if id(n) in skip:
            return
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load):
            out.setdefault(n.id, []).append(n.lineno)
        for c in ast.iter_child_nodes(n):
            visit(c)
    visit(tree)
    return out


def _apply_edits(text, edits):
    """edits: (first line, last line, replacement line or None), 1-based, non-overlapping."""
    lines = text.split('\n')
    for a, b, rep in sorted(edits, key=lambda e: (e[0], e[1]), reverse=True):
        lines[a - 1:b] = [rep] if rep is not None else []
    return '\n'.join(lines)


def strip_numba(text, name):
    """Remove numba: imports (aliases included), decorators referring to it, and the
    module-level statements that only build numba data (jitclass spec). prange and
    literal_unroll get their pure-Python equivalent. Any other use of numba left in
    the code is an error: it would fail in the browser."""
    tree = ast.parse(text)
    imports, aliases, shimmed = [], set(), set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            nb = [a for a in n.names if a.name.split('.')[0] == 'numba']
            if nb and len(nb) != len(n.names):
                fail(f'{name} line {n.lineno}: numba imported together with other modules, split the import')
            if nb:
                imports.append((n, []))
                aliases |= {a.asname or 'numba' for a in nb}
        elif isinstance(n, ast.ImportFrom) and n.level == 0 and n.module and n.module.split('.')[0] == 'numba':
            shims = []
            for a in n.names:
                bound = a.asname or a.name
                aliases.add(bound)
                if a.name in NUMBA_SHIMS:
                    shims.append(f'{bound} = {NUMBA_SHIMS[a.name]}')
                    shimmed.add(bound)
            imports.append((n, shims))
    if not imports:
        return text

    def refs(node, pool):
        return {x.id for x in ast.walk(node) if isinstance(x, ast.Name) and x.id in pool}

    edits, skip = [], set()
    for n, shims in imports:
        indent = ' ' * n.col_offset
        rep = '; '.join(shims) or ('pass' if n.col_offset else None)
        edits.append((n.lineno, n.end_lineno, indent + rep if rep else None))
        skip.add(id(n))
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            for d in n.decorator_list:
                if refs(d, aliases):
                    edits.append((d.lineno, d.end_lineno, None))
                    skip.add(id(d))
    # module-level statements that build numba-only data (spec = [('x', numba.int8)])
    gone = aliases - shimmed
    changed = True
    while changed:
        changed = False
        for st in tree.body:
            if id(st) in skip or not isinstance(st, (ast.Assign, ast.AugAssign, ast.AnnAssign)) or not refs(st, gone):
                continue
            bound = {t.id for t in ast.walk(st) if isinstance(t, ast.Name) and isinstance(t.ctx, ast.Store)}
            if bound & set(_loads(tree, skip | {id(st)})):
                continue                            # still read elsewhere: reported below
            edits.append((st.lineno, st.end_lineno, None))
            skip.add(id(st))
            gone |= bound
            changed = True
    left = {k: v for k, v in _loads(tree, skip).items() if k in gone}
    if left:
        fail(f'{name}: numba still used after stripping its imports and decorators: '
             + ', '.join(f'{k} (line {", ".join(map(str, v))})' for k, v in sorted(left.items()))
             + '. Only decorators, jitclass specs, prange and literal_unroll can be removed automatically')
    return _apply_edits(text, edits)


def strip_display(text, pkgs, name):
    """Remove a display-only package (--strip, default colorama): its imports, the
    statements that only call it (init(), just_fix_windows_console()) and every
    attribute read through it (Fore.RED, Style.RESET_ALL...), which becomes str(),
    i.e. ''. The functions using it then return unformatted text."""
    tree = ast.parse(text)
    edits, namespaces, funcs = [], set(), set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import) and any(a.name.split('.')[0] in pkgs for a in n.names):
            if not all(a.name.split('.')[0] in pkgs for a in n.names):
                fail(f'{name} line {n.lineno}: a --strip package imported together with other modules, split the import')
            namespaces |= {a.asname or a.name.split('.')[0] for a in n.names}
        elif isinstance(n, ast.ImportFrom) and n.level == 0 and n.module and n.module.split('.')[0] in pkgs:
            if any(a.name == '*' for a in n.names):
                fail(f'{name} line {n.lineno}: "from {n.module} import *": import the names explicitly')
            for a in n.names:   # Fore, Back, Style are namespaces; init, deinit... are functions
                (namespaces if a.name[:1].isupper() else funcs).add(a.asname or a.name)
        else:
            continue
        edits.append((n.lineno, n.end_lineno, ' ' * n.col_offset + 'pass' if n.col_offset else None))
    if not edits:
        return text
    bound = namespaces | funcs
    for n in ast.walk(tree):                        # colorama.init() / init(autoreset=True)
        if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) \
                and {x.id for x in ast.walk(n.value.func) if isinstance(x, ast.Name)} & bound:
            edits.append((n.lineno, n.end_lineno, ' ' * n.col_offset + 'pass' if n.col_offset else None))
    text = _apply_edits(text, edits)
    for ns in sorted(namespaces):                   # Fore.RED, colorama.Style.BRIGHT -> str()
        text = re.sub(rf'(?<![\w.]){re.escape(ns)}(?:\.\w+)+', 'str()', text)
    left = {k: v for k, v in _loads(ast.parse(text), set()).items() if k in bound}
    if left:
        fail(f'{name}: {", ".join(sorted(pkgs))} still used after removing it: '
             + ', '.join(f'{k} (line {", ".join(map(str, v))})' for k, v in sorted(left.items()))
             + '. Only attribute reads (Fore.RED) and statement calls (init()) are removed automatically')
    return text


def flatten_imports(text, src):
    """Package and relative imports of local modules -> plain imports (the web folder is flat):
         from .X import a / from <game>.X import a  ->  from X import a
         from . import X / from <game> import X     ->  import X
         import <game>.X as Y                        ->  import X as Y"""
    def sub_from(m):
        indent, dots, pkg, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        name = pkg.split('.')[-1]
        if (dots or pkg.split('.')[0] == src.game) and name in src.path:
            return f'{indent}from {name} import {rest}'
        return m.group(0)

    def sub_pkg(m):                                 # from . import X, Y as Z
        indent, rest = m.group(1), m.group(2)
        names = [n.strip() for n in rest.split('#')[0].strip().strip('()').split(',') if n.strip()]
        if names and all(n.split(' as ')[0].strip() in src.path for n in names):
            return f'{indent}import {", ".join(names)}'
        return m.group(0)

    def sub_import(m):                              # import <game>.X [as Y]
        indent, name, alias = m.group(1), m.group(2), m.group(3)
        if name not in src.path:
            return m.group(0)
        if not alias:
            fail(f'"import {src.game}.{name}" without "as": the web folder is flat, "{src.game}.{name}.x" '
                 f'cannot work there. Use "from .{name} import ..." or "import {src.game}.{name} as {name}"')
        return f'{indent}import {name} as {alias}'

    text = re.sub(r'^(\s*)from\s+(?:\.+|' + re.escape(src.game) + r')\s+import\s+(.*)$', sub_pkg, text, flags=re.M)
    text = re.sub(r'^(\s*)from\s+(\.*)([\w.]+)\s+import\s+(.*)$', sub_from, text, flags=re.M)
    text = re.sub(r'^(\s*)import\s+' + re.escape(src.game) + r'\.(\w+)(?:\s+as\s+(\w+))?\s*$', sub_import,
                  text, flags=re.M)
    return text


def _imports(tree):
    """(node, module, level, bound names, at module level?) for every import."""
    out = []
    module_level = set()
    def walk_level(nodes):                 # module level, including try / if / with blocks
        for n in nodes:
            module_level.add(id(n))
            if isinstance(n, (ast.Try, ast.If, ast.With)):
                for field in ('body', 'orelse', 'finalbody'):
                    walk_level(getattr(n, field, []))
                for h in getattr(n, 'handlers', []):
                    walk_level(h.body)
    walk_level(tree.body)
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            for a in n.names:
                out.append((n, a.name, 0, [a.asname or a.name.split('.')[0]], id(n) in module_level))
        elif isinstance(n, ast.ImportFrom):
            out.append((n, n.module, n.level, [a.asname or a.name for a in n.names], id(n) in module_level))
    return out


def available(pkg, allow):
    top = pkg.split('.')[0]
    return top in sys.stdlib_module_names or top in allow or top in STRIPPED or top in WEB_ONLY


def remove_dependents(text, dropped_imports, name):
    """Remove the given import nodes and everything that uses what they bound.
    Returns (text, removed top-level names, removed method names)."""
    tree = ast.parse(text)
    lines = text.split('\n')
    removed = set()
    edits = []                                     # (first line, last line, replacement or None)
    for node, bound in dropped_imports:
        if any(b == '*' for b in bound):
            fail(f'{name}: "from ... import *" from a module left out of the web build ({ast.unparse(node)}): '
                 f'cannot tell which names it provides')
        removed |= set(bound)
        # an import inside a block becomes `pass` so that the block never gets empty
        rep = None if node.col_offset == 0 else ' ' * node.col_offset + 'pass  # removed for the web'
        edits.append((node.lineno, node.end_lineno, rep))
    dropped_ids = {id(n) for n, _ in dropped_imports}

    def uses(node):
        return any(isinstance(n, ast.Name) and n.id in removed for n in ast.walk(node))

    def first_line(node):
        return min([node.lineno] + [d.lineno for d in getattr(node, 'decorator_list', [])])

    def bound_names(node):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            return {node.name}
        return {t.id for t in ast.walk(node) if isinstance(t, ast.Name) and isinstance(t.ctx, ast.Store)}

    gone, methods = set(), set()
    changed = True
    while changed:                                 # fixpoint: dropping X drops what uses X
        changed = False
        for node in tree.body:
            if id(node) in gone or id(node) in dropped_ids or isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            if isinstance(node, ast.ClassDef) and not any(uses(b) for b in node.bases + node.decorator_list):
                for m in node.body:
                    if id(m) not in gone and uses(m):
                        gone.add(id(m)); changed = True
                        if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            methods.add(m.name)
                        edits.append((first_line(m), m.end_lineno, None))
                        note(f'{name}: removed {node.name}.{getattr(m, "name", "statement line " + str(m.lineno))} '
                             f'(uses {sorted(removed & {n.id for n in ast.walk(m) if isinstance(n, ast.Name)})})')
                continue
            if uses(node):
                gone.add(id(node)); changed = True
                removed |= bound_names(node)
                edits.append((first_line(node), node.end_lineno, None))
                what = getattr(node, 'name', None) or f'statement line {node.lineno}'
                note(f'{name}: removed {what} (uses {sorted(removed & {n.id for n in ast.walk(node) if isinstance(n, ast.Name)})})')
    for a, b, rep in sorted(edits, reverse=True):
        lines[a - 1:b] = [rep] if rep is not None else []
    return '\n'.join(lines), removed, methods


WEB_PREDICT = '''import js


async def _predict(board, valids):
    # the network runs in JavaScript (onnxruntime-web), see game.js's predict()
    result = (await js.predict(board.flat[:], valids.flat[:])).to_py()
    return np.exp(np.array(result['pi'], dtype=np.float32)), np.array(result['v'], dtype=np.float32)


'''


def main_py_defaults(src):
    """{dest: default} of the add_argument() calls of the framework's main.py."""
    path = os.path.join(src.root, 'main.py')
    if not os.path.isfile(path):
        return {}
    out = {}
    for node in ast.walk(ast.parse(read(path))):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'add_argument'):
            continue
        opts = [a.value for a in node.args if isinstance(a, ast.Constant) and isinstance(a.value, str)]
        kw = {k.arg: k.value for k in node.keywords}
        longs = [o for o in opts if o.startswith('--')]
        if 'dest' in kw and isinstance(kw['dest'], ast.Constant):
            dest = kw['dest'].value
        elif longs:
            dest = longs[0][2:].replace('-', '_')
        else:
            continue
        action = kw['action'].value if isinstance(kw.get('action'), ast.Constant) else None
        if 'default' in kw:
            try:
                out[dest] = ast.literal_eval(kw['default'])
            except (ValueError, SyntaxError, TypeError):
                pass
        elif action == 'store_true':
            out[dest] = False
        elif action == 'store_false':
            out[dest] = True
    return out


def inject_arg_defaults(text, defaults):
    """The page's proxy.py may omit arguments: they then take main.py's default."""
    if not defaults:
        return text
    body = ''.join(f'    {k!r:<22}: {v!r},\n' for k, v in sorted(defaults.items()))
    block = ('\n# Defaults of the framework main.py, for the MCTS arguments proxy.py does not set\n'
             f'_ARG_DEFAULTS = {{\n{body}}}\n')
    text, n = re.subn(r'^([ \t]*)self\.args = args[ \t]*$',
                      r'\1self.args = args\n\1for _k, _v in _ARG_DEFAULTS.items():\n'
                      r'\1    if _k not in self.args:\n\1        self.args[_k] = _v',
                      text, count=1, flags=re.M)
    if n != 1:
        fail('MCTS.py: "self.args = args" not found, cannot add the argument defaults')
    i = text.find('\nclass MCTS')
    return text[:i + 1] + block + '\n\n' + text[i + 1:]


def make_mcts_async(text):
    for fn in ('getActionProb', 'search'):
        text, n = re.subn(rf'^(\s*)def {fn}\(', rf'\1async def {fn}(', text, flags=re.M)
        if n != 1:
            fail(f'MCTS.py: expected one "def {fn}(", found {n}')
    text = re.sub(r'(?<!await )\bself\.search\(', 'await self.search(', text)
    text = re.sub(
        r'^(\s*)if self\.batch_info is None:\n\s*(\w+), (\w+) = self\.nnet\.predict\(([^)]*)\)\n'
        r'\s*else:\n\s*\w+, \w+ = self\.nnet\.predict_client\([^)]*\)\n',
        r'\1\2, \3 = await _predict(\4)\n', text, flags=re.M)
    text = re.sub(r'\bself\.nnet\.predict\(', 'await _predict(', text)
    left = [l.strip() for l in text.split('\n') if re.search(r'self\.nnet\.|predict_client', l.split('#')[0])]
    if left:
        fail('MCTS.py: network calls not converted:\n  ' + '\n  '.join(left))
    i = text.find('\nclass MCTS')
    if i < 0:
        fail('MCTS.py: "class MCTS" not found')
    text = text[:i + 1] + WEB_PREDICT + text[i + 1:]
    # every await must sit in a coroutine: a sync caller of search() would break
    for fn in ast.walk(ast.parse(text)):
        if isinstance(fn, ast.FunctionDef):
            inner = {id(s) for f in ast.walk(fn) if f is not fn and isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))
                     for s in ast.walk(f)}
            for s in ast.walk(fn):
                if isinstance(s, ast.Await) and id(s) not in inner:
                    fail(f'MCTS.py: "await" needed inside sync function {fn.name}() (line {s.lineno}): '
                         f'its callers must become async too')
    return text


# =============================================================================
# Build
# =============================================================================

def build(src, game_module, opts, keep=frozenset()):
    """{module: web text} for every shipped module.
    A module left out by --exclude is put back (keep) when the files that import it,
    or proxy.py, cannot do without it."""
    seeds = [game_module, 'MCTS', 'Game']
    for s in seeds:
        if s not in src.path:
            fail(f'{s}.py not found in the framework')
    parsed = {}
    allow = tuple(opts.allow)

    def prepared(name):
        if name not in parsed:
            text = strip_numba(read(src.path[name]), f'{name}.py')
            parsed[name] = strip_display(flatten_imports(text, src), opts.strip, f'{name}.py')
        return parsed[name]

    def shippable(name):
        if name in seeds:
            return True
        tree = ast.parse(prepared(name))
        bad = [m for _, m, lvl, _, top in _imports(tree)
               if top and lvl == 0 and m and src.resolve(m, 0) is None and not available(m, allow)]
        if name.endswith(tuple(opts.exclude)) and name not in keep:
            if not bad:
                by_suffix.add(name)
            note(f'{name}.py left out (--exclude {",".join(opts.exclude)})')
            return False
        if bad:
            note(f'{name}.py left out: imports {sorted(set(bad))}, not available in Pyodide (see --allow)')
        return not bad

    ship, queue, verdict, by_suffix = [], list(seeds), {}, set()
    while queue:
        name = queue.pop(0)
        if name in ship or name in EXCLUDED_ROOT:
            continue
        ship.append(name)
        for _, m, lvl, _, _ in _imports(ast.parse(prepared(name))):
            local = src.resolve(m, lvl)
            if local and local not in ship and local not in EXCLUDED_ROOT:
                if local not in verdict:
                    verdict[local] = shippable(local)
                if verdict[local]:
                    queue.append(local)
    for name in sorted(set(ship) & src.clash):
        note(f'WARNING {name}.py exists both in the framework root and in {src.game}/: the flat web folder holds '
             f'the {src.game}/ one only, framework modules importing the root one get it too')

    out, removed_top, removed_methods, dropped_from = {}, {}, {}, {}
    for name in ship:
        text = prepared(name)
        tree = ast.parse(text)
        dropped, lazy = [], []
        for node, m, lvl, bound, top in _imports(tree):
            local = src.resolve(m, lvl)
            if (local in ship) if local else available(m or '', allow):
                continue
            (dropped if top else lazy).append((node, bound))
            if local:
                dropped_from.setdefault(name, set()).add(local)
        for node, _ in lazy:
            note(f'WARNING {name}.py line {node.lineno}: "{ast.unparse(node)}" inside a function is not '
                 f'available in the browser; that function will fail if called')
        if dropped:
            text, removed_top[name], removed_methods[name] = remove_dependents(text, dropped, f'{name}.py')
        if name == 'MCTS':
            text = make_mcts_async(text)
            read_keys = set(re.findall(r'self\.args\.(\w+)', text))
            text = inject_arg_defaults(text, {k: v for k, v in opts.defaults.items() if k in read_keys})
        try:
            compile(text, f'{name}.py', 'exec')
        except SyntaxError as e:
            fail(f'generated {name}.py does not compile: {e}')
        out[name] = text

    # Something still uses what was removed (a name imported from a trimmed module,
    # a method called on an object): put back the --exclude'd modules behind it.
    dangling, from_proxy = {}, {}                   # owner module -> what is still used
    all_methods = {mm: owner for owner, ms in removed_methods.items() for mm in ms}
    users = dict(out)
    if opts.proxy_text is not None:
        users['proxy'] = opts.proxy_text
    for name, text in users.items():
        target = from_proxy if name == 'proxy' else dangling
        tree = ast.parse(text)
        for node, m, lvl, bound, _ in _imports(tree):
            local = src.resolve(m, lvl)
            if local in removed_top:
                for b in set(bound) & removed_top[local]:
                    target.setdefault(local, set()).add(f'{name}.py imports {b}')
        for n in ast.walk(tree):
            if isinstance(n, ast.Attribute) and n.attr in all_methods:
                target.setdefault(all_methods[n.attr], set()).add(f'{name}.py line {n.lineno} uses .{n.attr}')
    both = {k: dangling.get(k, set()) | from_proxy.get(k, set()) for k in set(dangling) | set(from_proxy)}
    back = {x for owner in both for x in dropped_from.get(owner, ()) if x in by_suffix} - set(keep)
    if back:
        details = '; '.join(sorted(s for v in both.values() for s in v))
        note(f'putting back {", ".join(sorted(m + ".py" for m in back))}: still needed ({details})')
        return build(src, game_module, opts, frozenset(keep) | back)
    if dangling:
        details = '; '.join(sorted(s for v in dangling.values() for s in v))
        culprits = sorted({x for owner in dangling for x in dropped_from.get(owner, ())})
        fail(f'code removed for the web is still used: {details}. It comes from '
             f'{", ".join(c + ".py" for c in culprits)}, left out because it imports a package Pyodide does '
             f'not provide: load it in the page and add it to --allow')
    if from_proxy:
        note('WARNING proxy.py uses code removed for the web (fine if these are other objects with the same '
             'method name): ' + '; '.join(sorted(s for v in from_proxy.values() for s in v)))
    return out


PLAYERS_PATTERN = r'[A-Z][A-Z0-9_]*PLAYERS[A-Z0-9_]*'


def find_config_var(files, forced, required=True):
    """(module, NAME) of the module-level `NAME = <int>` configuration constant."""
    pat = re.compile(rf'^({re.escape(forced) if forced else PLAYERS_PATTERN})[ \t]*=[ \t]*(\d+)[ \t]*(#.*)?$', re.M)
    hits = [(name, m.group(1), int(m.group(2))) for name, text in files.items() if name not in ('MCTS', 'Game')
            for m in pat.finditer(text)]
    if len(hits) != 1:
        if not required:
            return None
        fail(f'--players: expected one module-level "<NAME> = <int>" player-count constant, found '
             f'{[h[:2] for h in hits]}: use --players-var NAME' if not forced
             else f'--players-var {forced}: expected one module-level "{forced} = <int>", found {[h[:2] for h in hits]}')
    return hits[0]


def set_config(text, var, n):
    """Framework copy for --check: the constant set to n."""
    return re.sub(rf'^{var}([ \t]*)=([ \t]*)\d+', rf'{var}\g<1>=\g<2>{n}', text, count=1, flags=re.M)


def inject_config(text, var, values):
    """Web copy: the constant read from the page (globalThis.gameConfig) at import time."""
    allowed = tuple(values)
    block = (f"import js as _js   # {var} is set by the page: globalThis.gameConfig = {{{var}: ...}}\n"
             f"try:\n"
             f"    {var} = int(_js.gameConfig.{var})\n"
             f"except AttributeError:\n"
             f"    raise RuntimeError('globalThis.gameConfig.{var} must be set by the page before importing proxy')\n"
             f"if {var} not in {allowed!r}:\n"
             f"    raise ValueError(f'globalThis.gameConfig.{var} = {{{var}}}, supported values: {allowed!r}')")
    text, n = re.subn(rf'^{var}[ \t]*=[ \t]*\d+[^\n]*', lambda m: block, text, count=1, flags=re.M)
    if n != 1:
        fail(f'"{var} = <int>" not found at module level')
    return text


def _hidden_info_only(text):
    """self.game.X reached only under `if self.hidden_info` (or `... if self.hidden_info else ...`)."""
    out = set()
    def guarded(test):
        return any((isinstance(n, ast.Attribute) and n.attr == 'hidden_info') or
                   (isinstance(n, ast.Name) and n.id == 'hidden_info') for n in ast.walk(test))
    for node in ast.walk(ast.parse(text)):
        if isinstance(node, (ast.If, ast.IfExp)) and guarded(node.test):
            for part in (node.body if isinstance(node, ast.If) else [node.body]):
                for n in ast.walk(part):
                    if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Attribute) \
                            and n.value.attr == 'game':
                        out.add(n.attr)
    return out


def _module_names(text):
    """Names bound at module level (including inside if / try / with blocks)."""
    out = set()
    def walk(nodes):
        for n in nodes:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                out.add(n.name)
            elif isinstance(n, (ast.Import, ast.ImportFrom)):
                out.update(a.asname or a.name.split('.')[0] for a in n.names)
            elif isinstance(n, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
                out.update(t.id for t in ast.walk(n) if isinstance(t, ast.Name) and isinstance(t.ctx, ast.Store))
            elif isinstance(n, (ast.Try, ast.If, ast.With)):
                for field in ('body', 'orelse', 'finalbody'):
                    walk(getattr(n, field, []))
                for h in getattr(n, 'handlers', []):
                    walk(h.body)
    walk(ast.parse(text).body)
    return out


def _proxy_settings(tree):
    """{key: [value nodes]} for every key proxy.py may set: dict literals, keyword
    arguments (dotdict(cpuct=...)), x['k'] = v and x.k = v."""
    out = {}
    for n in ast.walk(tree):
        if isinstance(n, ast.Dict):
            for k, v in zip(n.keys, n.values):
                if isinstance(k, ast.Constant) and isinstance(k.value, str):
                    out.setdefault(k.value, []).append(v)
        elif isinstance(n, ast.Call):
            for k in n.keywords:
                if k.arg:
                    out.setdefault(k.arg, []).append(k.value)
        elif isinstance(n, (ast.Assign, ast.AugAssign)):
            for t in (n.targets if isinstance(n, ast.Assign) else [n.target]):
                if isinstance(t, ast.Subscript) and isinstance(t.slice, ast.Constant) and isinstance(t.slice.value, str):
                    out.setdefault(t.slice.value, []).append(n.value)
                elif isinstance(t, ast.Attribute):
                    out.setdefault(t.attr, []).append(n.value)
    return out


def check_proxy(text, files, src, mcts, defaults, config_values, config_var):
    tree = ast.parse(text)
    errors = []

    # 1. imports: framework modules must be generated, imported names must exist there
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or '']
            for m in mods:
                top = m.split('.')[0]
                if top in src.path and top not in files and top not in EXCLUDED_ROOT:
                    errors.append(f'line {node.lineno}: imports {top}, a framework module that is not generated '
                                  f'(not reached from {", ".join(sorted(files))[:80]}...)')
            if isinstance(node, ast.ImportFrom) and node.module in files:
                defined = _module_names(files[node.module])
                for a in node.names:
                    if a.name != '*' and a.name not in defined:
                        errors.append(f'line {node.lineno}: imports {a.name} from {node.module}, which does not '
                                      f'define it in the web build')

    # 2. self-play features off
    settings = _proxy_settings(tree)
    for k, want in WEB_REQUIRED.items():
        vals = settings.get(k, [])
        if not vals and defaults.get(k) != want:
            errors.append(f'{k} is not set: main.py\'s default {defaults.get(k)!r} would apply, the page needs {want!r}')
        for v in vals:
            if not (isinstance(v, ast.Constant) and v.value == want):
                errors.append(f'line {v.lineno}: {k} = {ast.unparse(v)}, the page needs {want!r}')
    for c in ast.walk(tree):
        if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == 'MCTS':
            if len(c.args) > 3:
                errors.append(f'line {c.lineno}: MCTS() with more than 3 positional arguments: pass '
                              f'{", ".join(SELFPLAY_KWARGS)} by keyword, or not at all')
            for k in c.keywords:
                if k.arg in SELFPLAY_KWARGS and not (isinstance(k.value, ast.Constant) and k.value.value is False):
                    errors.append(f'line {c.lineno}: MCTS({k.arg}={ast.unparse(k.value)}), the page needs False')

    # 3. MCTS_PROFILES: one entry per configuration value
    profiles = [n for n in tree.body if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == 'MCTS_PROFILES' for t in n.targets)]
    if len(profiles) != 1 or not isinstance(profiles[0].value, ast.Dict):
        errors.append('expected one module-level "MCTS_PROFILES = {<config value>: dict(...), ...}" dict literal')
    else:
        keys = []
        for k in profiles[0].value.keys:
            if not (isinstance(k, ast.Constant) and isinstance(k.value, int)):
                errors.append(f'line {profiles[0].lineno}: MCTS_PROFILES key {ast.unparse(k)} is not an int literal')
            else:
                keys.append(k.value)
        if config_values is not None and sorted(keys) != sorted(config_values):
            errors.append(f'MCTS_PROFILES keys {sorted(keys)} differ from the configuration values '
                          f'{sorted(config_values)}')
        uses = [n for n in ast.walk(tree) if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name)
                and n.value.id == 'MCTS_PROFILES' and isinstance(n.ctx, ast.Load)]
        if not uses:
            errors.append('MCTS_PROFILES is never used (expected MCTS_PROFILES[<constant>])')
        defined = _module_names(text)
        for u in uses:
            root = u.slice
            while isinstance(root, ast.Attribute):
                root = root.value
            if isinstance(root, ast.Name) and root.id not in defined:
                errors.append(f'line {u.lineno}: MCTS_PROFILES[{ast.unparse(u.slice)}]: {root.id} is not defined '
                              f'in proxy.py (import it, e.g. from <module> import {root.id})')

    # 4. arguments read by MCTS: None is never a valid value (`None > 0` raises)
    read_keys = set(re.findall(r'self\.args\.(\w+)', mcts))
    for k in sorted(read_keys & set(settings)):
        for v in settings[k]:
            if any(isinstance(x, ast.Constant) and x.value is None for x in ast.walk(v)):
                errors.append(f'line {v.lineno}: {k} = {ast.unparse(v)} can be None, which MCTS.py cannot use')

    if config_var:
        for n in ast.walk(tree):
            if isinstance(n, ast.Attribute) and isinstance(n.ctx, ast.Store) and n.attr == config_var:
                errors.append(f'line {n.lineno}: proxy.py assigns {ast.unparse(n)}: the configuration is read from '
                              f'globalThis.gameConfig when the module is imported, patching it afterwards leaves '
                              f'derived constants stale')

    absent = read_keys - set(settings)
    defaulted = sorted((absent & set(defaults)) - set(TRAINING_ONLY_ARGS) - set(WEB_REQUIRED))
    placeholders = sorted(absent & set(defaults) & set(TRAINING_ONLY_ARGS))
    if defaulted:
        note('MCTS arguments not set by proxy.py, main.py default used: '
             + ', '.join(f'{k}={defaults[k]!r}' for k in defaulted))
    if placeholders:
        note(f'training-only MCTS arguments not set by proxy.py (unused by the page, placeholder value): '
             f'{", ".join(placeholders)}')
    missing = sorted(absent - set(defaults))
    if missing:
        errors.append(f'MCTS.py reads self.args.{missing}: not set, and without a default in main.py')
    if errors:
        fail('proxy.py:\n  ' + '\n  '.join(errors))


def static_checks(files, game_module, game_class, dst, defaults, src, config_values, config_var):
    mcts = files['MCTS']
    def members(text, cls):
        for node in ast.parse(text).body:
            if isinstance(node, ast.ClassDef) and node.name == cls:
                names = {n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
                names |= {t.id for n in node.body if isinstance(n, ast.Assign) for t in n.targets
                          if isinstance(t, ast.Name)}
                names |= {t.attr for n in ast.walk(node) if isinstance(n, ast.Assign) for t in n.targets
                          if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == 'self'}
                return names
        return set()
    api = members(files[game_module], game_class) | members(files['Game'], 'Game')
    # getattr(self.game, 'x', default) is optional by construction
    used = set(re.findall(r'self\.game\.(\w+)', mcts))
    optional = set(re.findall(r"hasattr\(self\.game, '(\w+)'\)", mcts)) | _hidden_info_only(mcts)
    missing = sorted(used - api - optional)
    if missing:
        # often legitimate: optional hooks behind a guard (hidden_info = hasattr(self.game, 'getObservation'))
        note(f'WARNING MCTS.py uses self.game.{missing}, not defined by the web {game_class}: fine if they are '
             f'only reached behind a hasattr / getattr guard, --check runs the search for real')
    proxy = os.path.join(dst, 'proxy.py')
    if os.path.isfile(proxy):
        check_proxy(read(proxy), files, src, mcts, defaults, config_values, config_var)
    else:
        note(f'no proxy.py in {dst}: MCTS arguments not checked')


# =============================================================================
# --check
# =============================================================================

COMMON = r'''
import sys, os, zlib, hashlib, inspect, random, numpy as np
root, tmp, mode, mod, cls = sys.argv[1:6]
class dotdict(dict):
    def __getattr__(self, k): return self[k]
ARGS = dotdict(numMCTSSims=SIMS, cpuct=1.0, fpu=0.1, fpu_root=0.0, universes=1, prob_fullMCTS=1., ratio_fullMCTS=1,
               forced_playouts=False, forced_playouts_k=1.5, no_mem_optim=False, dirichletAlpha=0., temperature=[1., 1., 1.])
def stub_net(board, valids, n_players):
    # deterministic stand-in for the network, identical float32 operations on both sides
    rng = np.random.default_rng(zlib.crc32(np.asarray(board, dtype=np.int8).tobytes()))
    logits = rng.normal(size=len(valids)).astype(np.float32)
    logp = np.where(np.asarray(valids, bool), logits, np.float32(-1e9)).astype(np.float32)
    logp = (logp - np.log(np.exp(logp - logp.max()).sum()) - logp.max()).astype(np.float32)
    return logp, rng.uniform(-1, 1, n_players).astype(np.float32)
'''

TAIL = r'''
g = Klass()
P = g.getNumberOfPlayers()
params = inspect.signature(g.getNextState).parameters
def step(b, p, a, seed):
    if 'random_seed' in params:
        return g.getNextState(b, p, a, random_seed=seed)
    if 'deterministic' in params:
        return g.getNextState(b, p, a, deterministic=True)
    reseed(seed)
    return g.getNextState(b, p, a)
hidden = hasattr(g, 'getObservation') and hasattr(g, 'sampleWorld')
if mode == 'init':
    for i in range(6):
        np.save(f'{tmp}/init_{i}.npy', np.copy(g.getInitBoard()))
    rng = np.random.default_rng(7); pos = []; b, p = np.copy(g.getInitBoard()), 0
    while len(pos) < NPOS:
        if np.asarray(g.getGameEnded(b, p)).any():
            b, p = np.copy(g.getInitBoard()), 0
        c = g.getCanonicalForm(b, p)
        if rng.random() < 0.08:
            pos.append(np.copy(c))
        b, p = step(b, p, int(rng.choice(np.flatnonzero(g.getValidMoves(c, 0)))), int(rng.integers(1, 2**30)))
    np.save(f'{tmp}/positions.npy', np.array(pos))
elif mode == 'engine':
    out = []
    for game in range(6):
        b = np.load(f'{tmp}/init_{game}.npy'); p = 0
        rng = np.random.default_rng(1000 + game)
        for i in range(4000):
            c = g.getCanonicalForm(b, p)
            a = int(rng.choice(np.flatnonzero(g.getValidMoves(c, 0))))
            b, p = step(b, p, a, 1 + i + 7919 * game)
            w = g.sampleWorld(g.getObservation(g.getCanonicalForm(b, p), 0), 1 + i).tobytes() if hidden else b''
            out.append(hashlib.sha1(np.asarray(b).tobytes() + w + bytes([int(p)])).hexdigest())
            if np.asarray(g.getGameEnded(b, p)).any():
                break
    print(len(out), hashlib.sha1('\n'.join(out).encode()).hexdigest(),
          'random_seed' if 'random_seed' in params else ('deterministic' if 'deterministic' in params else 'reseeded'))
else:
    out = []
    for i, c in enumerate(np.load(f'{tmp}/positions.npy')):
        np.random.seed(i); random.seed(i)
        m = new_mcts(); m.rng = np.random.default_rng(i)
        probs, q, _ = run_search(m, c)
        out.append(np.concatenate([np.asarray(probs, np.float64), np.asarray(q, np.float64)]))
    np.save(f'{tmp}/mcts_SIDE.npy', np.array(out))
'''

FW_SCRIPT = COMMON + r'''
sys.path.insert(0, root)
import importlib
Klass = getattr(importlib.import_module(f'{os.environ["WEB_GAME_PKG"]}.{mod}'), cls)
def reseed(seed):
    np.random.seed(seed); random.seed(seed)
    try:
        from numba import njit
        @njit
        def _s(x): np.random.seed(x)
        _s(seed)
    except ImportError:
        pass
def new_mcts():
    from MCTS import MCTS
    class Net:
        def predict(self, b, v):
            logp, val = stub_net(b, v, P)
            return np.exp(logp), val
    return MCTS(g, Net(), ARGS)
def run_search(m, c):
    return m.getActionProb(c, temp=1)
''' + TAIL.replace('SIDE', 'fw')

WEB_SCRIPT = COMMON + r'''
import types, asyncio
class _R:
    def __init__(self, d): self.d = d
    def to_py(self): return self.d
js = types.ModuleType('js')
async def _js_predict(board, valids):
    logp, v = stub_net(board, valids, P)
    return _R({'pi': logp.tolist(), 'v': v.tolist()})
js.predict = _js_predict
import json
if os.environ.get('WEB_GAME_CONFIG'):                # globalThis.gameConfig of the page
    js.gameConfig = types.SimpleNamespace(**json.loads(os.environ['WEB_GAME_CONFIG']))
sys.modules['js'] = js
sys.path.insert(0, root)
import importlib
Klass = getattr(importlib.import_module(mod), cls)
assert 'numba' not in sys.modules, 'numba imported by the web files'
def reseed(seed):
    np.random.seed(seed); random.seed(seed)
def new_mcts():
    from MCTS import MCTS
    return MCTS(g, None, ARGS)
def run_search(m, c):
    return asyncio.run(m.getActionProb(c, temp=1))
''' + TAIL.replace('SIDE', 'web')


def _run(script, args, what, env_extra):
    env = dict(os.environ, PYTHONPATH='', PYTHONDONTWRITEBYTECODE='1', **env_extra)
    r = subprocess.run([PYTHON, '-c', script] + args, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        fail(f'check ({what}) crashed:\n{r.stderr[-3000:]}')
    return r.stdout.strip().split('\n')[-1] if r.stdout.strip() else ''


def _has_numba(python):
    try:
        r = subprocess.run([python, '-c', 'import numba, numpy'], capture_output=True, text=True)
    except OSError as e:
        return False, str(e)
    return r.returncode == 0, (r.stderr.strip().split('\n') or [''])[-1]


def pick_python(src, forced):
    """Interpreter for --check: --python, else this one, else a virtualenv inside the framework."""
    if forced:
        ok, err = _has_numba(forced)
        if not ok:
            fail(f'--python {forced}: cannot import numba ({err})')
        return forced
    ok, err = _has_numba(sys.executable)
    if ok:
        return sys.executable
    for venv in ('venv', '.venv', 'env', '.env'):
        for exe in (os.path.join(src.root, venv, 'bin', 'python'), os.path.join(src.root, venv, 'Scripts', 'python.exe')):
            if os.path.isfile(exe) and _has_numba(exe)[0]:
                note(f'--check runs with {exe} (numba not available to {sys.executable})')
                return exe
    fail(f'--check needs the framework\'s environment: numba is not importable with {sys.executable} ({err}). '
         f'Activate the framework\'s virtualenv, or pass its interpreter with --python /path/to/python')


def dynamic_check(src, dst, game_module, game_class, written, config, n, sims, npos):
    """config: (module, NAME) of the configuration constant, n its value for this run."""
    import json
    import numpy as np
    tag = f'{config[1]}={n}' if config else 'default'
    with tempfile.TemporaryDirectory() as tmp:
        fw = os.path.join(tmp, 'fw')
        os.makedirs(os.path.join(fw, src.game))
        for name, path in src.path.items():
            sub = src.game if src.in_game_dir(name) else ''
            shutil.copyfile(path, os.path.join(fw, sub, os.path.basename(path)))
        if config:
            mod, var = config
            p = os.path.join(fw, src.game, f'{mod}.py') if src.in_game_dir(mod) else os.path.join(fw, f'{mod}.py')
            text = read(p)
            with open(p, 'w') as f:
                f.write(set_config(text, var, n))
        web = os.path.join(tmp, 'web')
        os.makedirs(web)
        for name in written:
            shutil.copyfile(os.path.join(dst, name + '.py'), os.path.join(web, name + '.py'))
        fw_s = FW_SCRIPT.replace('SIMS', str(sims)).replace('NPOS', str(npos))
        web_s = WEB_SCRIPT.replace('SIMS', str(sims)).replace('NPOS', str(npos))
        env = {'WEB_GAME_PKG': src.game, 'WEB_GAME_CONFIG': json.dumps({config[1]: n}) if config else ''}
        a_args, w_args = [fw, tmp, 'init', game_module, game_class], [web, tmp, 'init', game_module, game_class]
        _run(fw_s, a_args, f'{tag} init', env)
        a = _run(fw_s, [fw, tmp, 'engine', game_module, game_class], f'{tag} engine, framework', env)
        b = _run(web_s, [web, tmp, 'engine', game_module, game_class], f'{tag} engine, web', env)
        print(f'  {tag} engine: framework {a}  |  web {b}  ->  {"IDENTICAL" if a == b else "MISMATCH"}')
        if a != b:
            if a.endswith('reseeded'):
                note(f'WARNING {tag}: getNextState takes no random_seed / deterministic argument, so numba\'s and '
                     f'numpy\'s random generators were both reseeded at every move; they need not produce the same '
                     f'numbers, the mismatch may come from that rather than from the transformation')
            else:
                fail(f'{tag}: the web engine diverges from the framework engine')
        _run(fw_s, [fw, tmp, 'mcts', game_module, game_class], f'{tag} MCTS, framework', dict(env, NUMBA_DISABLE_JIT='1'))
        _run(web_s, [web, tmp, 'mcts', game_module, game_class], f'{tag} MCTS, web', env)
        x, y = np.load(f'{tmp}/mcts_fw.npy'), np.load(f'{tmp}/mcts_web.npy')
        same = int((np.abs(x - y).max(axis=1) <= 1e-6).sum())
        print(f'  {tag} MCTS: {same}/{len(x)} positions identical ({sims} sims), max |diff| {float(np.abs(x - y).max()):.1e}')
        if same != len(x):
            fail(f'{tag}: the web MCTS diverges from the framework MCTS')


# =============================================================================
# main
# =============================================================================

def check_js(dst, written, allow):
    """The page mounts what list_of_files names (in the .js files of the game folder):
    every generated module must be there, and every mounted .py must exist. Every
    --allow package but numpy (loaded by common/game.js) must be in pyPackages."""
    js_files = sorted(n for n in os.listdir(dst) if n.endswith('.js'))
    if not js_files:
        note(f'no .js file in {dst}: list_of_files not checked')
        return
    mounted = set()
    for n in js_files:
        mounted |= set(re.findall(r'[\'"`](?:[\w.\-]*/)*(\w+)\.py[\'"`]', read(os.path.join(dst, n))))
    missing = sorted(set(written) - mounted)
    if missing:
        fail(f'not in list_of_files ({", ".join(js_files)}): {", ".join(m + ".py" for m in missing)}. '
             f'The page would not load them')
    js_text = '\n'.join(read(os.path.join(dst, n)) for n in js_files)
    m = re.search(r'pyPackages\s*=\s*\[([^\]]*)\]', js_text)
    declared = set(re.findall(r'[\'"]([\w\-]+)[\'"]', m.group(1))) if m else set()
    undeclared = sorted(set(allow) - {'numpy'} - declared)
    if undeclared:
        fail(f'--allow {", ".join(undeclared)}: not in the pyPackages list of {", ".join(js_files)}, the page '
             f'would not install it (e.g. const pyPackages = {undeclared!r};)')
    present = {n[:-3] for n in os.listdir(dst) if n.endswith('.py')}
    absent = sorted(mounted - present)
    if absent:
        note(f'WARNING list_of_files ({", ".join(js_files)}) mounts files that are not in {dst}: '
             f'{", ".join(a + ".py" for a in absent)}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('framework', help='framework root (contains MCTS.py, Game.py and <game>/)')
    ap.add_argument('game', help='game folder in the framework, e.g. catan')
    ap.add_argument('dst', help='web folder of the game (contains its proxy.py)')
    ap.add_argument('--players', '--config-values', dest='values',
                    help='values of the configuration constant the page supports, e.g. 2,3,4 (or 1,11 for '
                         'NB_GODS): the constant is then read from globalThis.gameConfig at import time')
    ap.add_argument('--players-var', '--config-var', dest='var',
                    help='name of the configuration constant (default: the one whose name contains PLAYERS)')
    ap.add_argument('--game-file', help='game module, e.g. CatanGame.py (default: found automatically)')
    ap.add_argument('--allow', default=','.join(DEFAULT_ALLOW),
                    help=f'third-party packages available in the page (default {",".join(DEFAULT_ALLOW)})')
    ap.add_argument('--strip', default=','.join(DEFAULT_STRIP),
                    help=f'display-only packages removed from the generated code, their colour codes becoming '
                         f'empty strings (default {",".join(DEFAULT_STRIP)})')
    ap.add_argument('--exclude', default=','.join(DEFAULT_EXCLUDE),
                    help=f'module-name suffixes never shipped (default {",".join(DEFAULT_EXCLUDE)})')
    ap.add_argument('--check', action='store_true', help='compare with the framework (needs its environment)')
    ap.add_argument('--python', help='interpreter of the framework for --check (default: this one, or a '
                                     'venv/.venv found in the framework root)')
    ap.add_argument('--check-sims', type=int, default=100, help='MCTS simulations per position for --check')
    ap.add_argument('--check-positions', type=int, default=40, help='positions per value for --check')
    args = ap.parse_args()
    if args.var and not args.values:
        fail('--players-var needs --players (the values to generate)')

    src = Sources(os.path.abspath(args.framework), args.game)
    dst = os.path.abspath(args.dst)
    split = lambda x: tuple(v for v in x.split(',') if v)
    game_module, game_class = find_game_file(src, args.game_file)
    defaults = main_py_defaults(src)
    if not defaults:
        note('no main.py (or no argparse defaults in it): every MCTS argument must be set by proxy.py')
    proxy = os.path.join(dst, 'proxy.py')
    opts = argparse.Namespace(allow=split(args.allow), strip=split(args.strip), exclude=split(args.exclude),
                              defaults=defaults, proxy_text=read(proxy) if os.path.isfile(proxy) else None)
    files = build(src, game_module, opts)

    config, values = None, [None]
    if args.values:
        values = sorted({int(x) for x in args.values.split(',')})
        mod, var, _ = find_config_var(files, args.var)
        config = (mod, var)
        files[mod] = inject_config(files[mod], var, values)
        note(f'configuration: {var} in {mod}.py read from globalThis.gameConfig.{var}, values {values}')
        profile_values = values
    else:
        hit = find_config_var(files, None, required=False)
        profile_values = [hit[2]] if hit else None
        if hit:
            note(f'{hit[1]} = {hit[2]} in {hit[0]}.py kept as is (fixed configuration; --players a,b,... '
                 f'to read it from the page)')
    static_checks(files, game_module, game_class, dst, defaults, src, profile_values, config and config[1])

    os.makedirs(dst, exist_ok=True)
    written = []
    outputs = [(name, text, f'# Generated by {ME} from {os.path.relpath(src.path[name], src.root)}. Do not edit.\n')
               for name, text in files.items()]
    for out_name, out_text, header in outputs:
        with open(os.path.join(dst, out_name + '.py'), 'w') as f:
            f.write(header + out_text)
        written.append(out_name)
    note(f'wrote {", ".join(w + ".py" for w in written)} into {dst}')

    # .py files of the folder the page no longer uses: anything that neither proxy.py
    # nor a generated file imports (old hand-made copies, per-value copies of an
    # earlier version, left-out Display modules)
    present = {n[:-3] for n in os.listdir(dst) if n.endswith('.py')}
    used, queue = set(), [s for s in ['proxy'] + written if s in present]
    while queue:
        stem = queue.pop()
        if stem in used:
            continue
        used.add(stem)
        tree = ast.parse(read(os.path.join(dst, stem + '.py')))
        for _, m, lvl, _, _ in _imports(tree):
            dep = (m or '').split('.')[0]
            if dep in present and dep not in used:
                queue.append(dep)
    stale = sorted(present - used - set(written))
    for stem in stale:
        os.remove(os.path.join(dst, stem + '.py'))
    if stale:
        note(f'removed from {dst}, no longer used by the page: {", ".join(s + ".py" for s in stale)}')

    check_js(dst, written, opts.allow)

    if args.check:
        global PYTHON
        PYTHON = pick_python(src, args.python)
        note('checking against the framework ...')
        for n in values:
            dynamic_check(src, dst, game_module, game_class, written, config, n,
                          args.check_sims, args.check_positions)
        note('all checks passed')


if __name__ == '__main__':
    main()
