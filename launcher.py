import os
import sys
import time
import subprocess
import webbrowser
import threading
import socket
import re

APP_TITLE = "Vinay Number Guessing Activity"

def is_port_in_use(port: int = 8000) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def start_backend():
    """Starts the FastAPI backend in background if not already running."""
    if is_port_in_use(8000):
        print("[OK] Game server is already active on port 8000.")
        return None
    
    print("[1/2] Starting game engine server...")
    # Find python or run.py in current directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    run_script = os.path.join(base_dir, "run.py")
    
    if os.path.exists(run_script):
        proc = subprocess.Popen([sys.executable, run_script], cwd=base_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        # Fallback inline uvicorn
        proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000"], cwd=base_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Wait for server to be responsive
    for _ in range(15):
        time.sleep(0.5)
        if is_port_in_use(8000):
            print("[OK] Game engine ready!")
            break
    return proc

def run_tunnel():
    """Launches the SSH tunnel and displays the public link."""
    print("\n[2/2] Generating instant online share link...")
    print("=" * 60)
    print("   VINAY NUMBER GUESSING ACTIVITY - ONLINE MULTIPLAYER")
    print("   Developed by Vinay")
    print("=" * 60)
    print("Connecting to secure tunnel network...")
    print("-" * 60)

    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=30",
        "-R", "80:127.0.0.1:8000",
        "nokey@localhost.run"
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        opened_browser = False
        url_pattern = re.compile(r'https://[a-zA-Z0-9\.\-]+\.lhr\.life')

        for line in proc.stdout:
            print(line, end="")
            match = url_pattern.search(line)
            if match and not opened_browser:
                url = match.group(0)
                print("\n" + "#" * 60)
                print(f"👉 YOUR LIVE SHARE LINK: {url}")
                print("   Share this link with your friend to play together!")
                print("#" * 60 + "\n")
                webbrowser.open(url)
                opened_browser = True

        proc.wait()
    except Exception as e:
        print(f"\n[Error] Tunnel encountered an issue: {e}")
        print("You can still play locally in your browser at: http://localhost:8000")
        webbrowser.open("http://localhost:8000")

def main():
    os.system("title " + APP_TITLE)
    backend_proc = start_backend()
    try:
        run_tunnel()
    finally:
        if backend_proc:
            try:
                backend_proc.terminate()
            except Exception:
                pass

if __name__ == "__main__":
    main()
