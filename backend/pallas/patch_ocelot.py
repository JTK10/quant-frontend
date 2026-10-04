"""Create a reviewable minimal Ocelot patch from a verified local source copy."""
from pathlib import Path
import argparse
import ast


def patched(source):
    if 'PALLAS_CHAIN_RECEIVED' in source:
        raise ValueError('Pallas hook already present')
    source = source.replace('# ---------------------------------------------------------------- capture\n',
                            '# ---------------------------------------------------------------- capture\nPALLAS_CHAIN_RECEIVED = {}\n', 1)
    needle = '                return sym, r.json().get("data", [])'
    assert source.count(needle) == 1
    source = source.replace(needle, '                rows = r.json().get("data", [])\n                PALLAS_CHAIN_RECEIVED[sym] = time.time()\n                return sym, rows')
    needle = '    t0 = time.time()\n    sem = asyncio.Semaphore(CONC)'
    assert source.count(needle) == 1
    source = source.replace(needle, '    t0 = time.time()\n    PALLAS_CHAIN_RECEIVED.clear()\n    rusty_candles = {}\n    sem = asyncio.Semaphore(CONC)')
    root = ast.parse(source)
    run = next(n for n in root.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'run_cut')
    lines = source.splitlines(keepends=True)
    hook = '''
    # Optional Pallas export AFTER retained publishers; no broker calls or DB reads.
    try:
        from pallas_export import export_cut
        export_cut(cut_ts, expiry, chain_rows, live, lv, rusty_candles,
                   dict(PALLAS_CHAIN_RECEIVED), degraded or late)
    except Exception as exc:
        log(f"Pallas optional export failed: {type(exc).__name__}")
'''
    lines.insert(run.end_lineno, hook)
    result = ''.join(lines)
    ast.parse(result)
    assert 'PALLAS_CHAIN_RECEIVED = {}' in result
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source'); parser.add_argument('output')
    args = parser.parse_args()
    Path(args.output).write_text(patched(Path(args.source).read_text(encoding='utf-8')), encoding='utf-8')
