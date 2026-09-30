"""Apply the optional publisher hook only to the reviewed VM2 backend hash."""
import argparse
import hashlib
import os
import py_compile
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

EXPECTED = '20082e5e38a8acc8eb6d59416959a61d125fa3589206cead3362ffaf7e606825'
MARKER = 'Optional chart publisher runs after every existing scanner publish.'
HOOK = '''
    # Optional chart publisher runs after every existing scanner publish.
    # Bounded separately; any import/build/network failure stays isolated.
    try:
        from chart_oi import publish_chart_oi
        await asyncio.wait_for(publish_chart_oi(
            client, cut_ts, chain_rows, degraded or late, ords_cfg(), ords_token), timeout=10)
    except Exception as exc:
        log(f"chart OI optional publish failed: {type(exc).__name__}: {str(exc)[:100]}")
'''


def install(target, module, apply=False):
    target = Path(target).resolve()
    module = Path(module).resolve()
    source = target.read_bytes()
    if MARKER.encode() in source:
        print('Hook already installed; no changes made')
        return
    if hashlib.sha256(source).hexdigest() != EXPECTED:
        raise RuntimeError('Live backend changed since review; refusing to overwrite it')
    text = source.decode('utf-8')
    anchor = '\n\ndef prune(con):'
    if text.count(anchor) != 1:
        raise RuntimeError('Expected isolated insertion point not found')
    patched = text.replace(anchor, HOOK + anchor)
    fd, staged = tempfile.mkstemp(prefix='chart_oi_stage_', suffix='.py', dir=target.parent)
    os.close(fd)
    try:
        Path(staged).write_text(patched, encoding='utf-8')
        py_compile.compile(staged, doraise=True)
        py_compile.compile(str(module), doraise=True)
        if not apply:
            print('Dry run passed: baseline hash, optional hook and compilation')
            return
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        backup = str(target) + '.bak_chart_oi_' + stamp
        shutil.copy2(target, backup)
        dest = target.parent / 'chart_oi.py'
        if dest.exists() and dest != module:
            shutil.copy2(dest, str(dest) + '.bak_' + stamp)
        if dest != module:
            shutil.copy2(module, dest)
        shutil.copymode(target, staged)
        os.replace(staged, target)
        print('Installed optional OI publisher; rollback backend: ' + backup)
    finally:
        if Path(staged).exists():
            Path(staged).unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', default='/home/ubuntu/ocelot/ocelot.py')
    parser.add_argument('--module', default=str(Path(__file__).parent / 'chart_oi.py'))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    install(args.target, args.module, args.apply)
