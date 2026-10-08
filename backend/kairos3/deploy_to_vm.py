import os
import subprocess
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

LOCAL_DIR = Path(__file__).resolve().parent
KEY = r'C:\Users\RK\.ssh\oci'
HOST = 'ubuntu@92.4.65.253'
REMOTE_DIR = '/home/ubuntu/kairos3'

def run_ssh(remote_cmd, timeout=30):
    cmd = ['ssh', '-n', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-i', KEY, HOST, remote_cmd]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
    if res.returncode != 0:
        print(f"[SSH ERROR] Command failed: {remote_cmd}")
        print(f"Stdout: {res.stdout}")
        print(f"Stderr: {res.stderr}")
        raise RuntimeError(f"SSH failed with return code {res.returncode}")
    return res.stdout

def run_scp(local_files, remote_dest, timeout=30):
    cmd = ['scp', '-q', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-i', KEY] + [str(f) for f in local_files] + [f"{HOST}:{remote_dest}"]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
    if res.returncode != 0:
        print(f"[SCP ERROR] Failed to transfer files")
        print(f"Stderr: {res.stderr}")
        raise RuntimeError(f"SCP failed with return code {res.returncode}")

def main():
    print("=== STEP 1: Creating remote directory ===")
    out = run_ssh(f"mkdir -p {REMOTE_DIR} && chmod 700 {REMOTE_DIR}")
    print("Remote directory ready:", REMOTE_DIR)

    print("\n=== STEP 2: Transferring Kairos 3.0 files ===")
    files_to_send = [
        LOCAL_DIR / 'kairos3_engine.py',
        LOCAL_DIR / 'kairos3_live.py',
        LOCAL_DIR / 'test_kairos3.py',
        LOCAL_DIR / 'kairos3.service'
    ]
    for f in files_to_send:
        assert f.exists(), f"Missing file: {f}"
        print(f"  -> Uploading {f.name}")
    run_scp(files_to_send, REMOTE_DIR + '/')
    print("Files successfully transferred!")

    print("\n=== STEP 3: Compiling and running tests on VM2 ===")
    test_cmd = (
        f"cd {REMOTE_DIR} && "
        f"/home/ubuntu/ocelot/venv/bin/python -m py_compile kairos3_engine.py kairos3_live.py test_kairos3.py && "
        f"/home/ubuntu/ocelot/venv/bin/python test_kairos3.py"
    )
    test_out = run_ssh(test_cmd, timeout=60)
    print("Test Output:\n" + test_out)

    print("\n=== STEP 4: Installing systemd service ===")
    service_cmd = (
        f"sudo cp {REMOTE_DIR}/kairos3.service /etc/systemd/system/kairos3.service && "
        f"sudo systemctl daemon-reload && "
        f"sudo systemctl enable kairos3.service && "
        f"sudo systemctl restart kairos3.service"
    )
    run_ssh(service_cmd, timeout=30)
    print("Service installed and started!")

    print("\n=== STEP 5: Verifying service status ===")
    time.sleep(3)
    status_out = run_ssh("systemctl status kairos3.service --no-pager")
    print(status_out)

    print("\n=== STEP 6: Verifying health and state ===")
    time.sleep(2)
    state_out = run_ssh(f"cat {REMOTE_DIR}/health.json 2>/dev/null || echo 'Waiting for health.json'; echo '---'; cat {REMOTE_DIR}/state.json 2>/dev/null || echo 'Waiting for state.json'")
    print(state_out)

if __name__ == '__main__':
    main()
