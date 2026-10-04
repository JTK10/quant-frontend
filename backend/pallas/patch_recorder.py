"""Bound visibility latency of the existing recorder; no subscription changes."""
import ast
from pathlib import Path
import sys
def patched(source):
    assert 'PALLAS_FLUSH_SECONDS' not in source
    needle='FLUSH_EVERY     = 200'
    assert source.count(needle)==1
    source=source.replace(needle,needle+'\nPALLAS_FLUSH_SECONDS = 1.0\n_last_flush = {"t": 0.0}')
    needle='        if _count["n"] % FLUSH_EVERY == 0: _fh.flush()\n        now = time.time()'
    assert source.count(needle)==1
    source=source.replace(needle,'''        now = time.time()
        if _count["n"] % FLUSH_EVERY == 0 or now - _last_flush["t"] >= PALLAS_FLUSH_SECONDS:
            _fh.flush()
            _last_flush["t"] = now''')
    ast.parse(source)
    return source
if __name__=='__main__':Path(sys.argv[2]).write_text(patched(Path(sys.argv[1]).read_text()),encoding='utf-8')
