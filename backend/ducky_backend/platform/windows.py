import os
import sys
import logging
from typing import Optional

logger = logging.getLogger('ducky.platform.windows')


def get_process_kill_cmd(pid: int) -> list[str]:
    if os.name == 'nt':
        return ['taskkill', '/PID', str(pid), '/T', '/F']
    return ['kill', '-9', str(pid)]


def clear_python_env(env: dict[str, str]) -> dict[str, str]:
    cleaned = dict(env)
    for key in ('PYTHONHOME', 'PYTHONPATH', 'PYTHONSTARTUP', 'PYTHONEXECUTABLE'):
        cleaned.pop(key, None)
    return cleaned


def find_conda_windows() -> Optional[str]:
    if os.name != 'nt':
        return None

    home = os.path.expanduser('~')
    candidates = [
        os.path.join(home, 'anaconda3', 'Scripts', 'conda.exe'),
        os.path.join(home, 'miniconda3', 'Scripts', 'conda.exe'),
        os.path.join(home, 'mambaforge', 'Scripts', 'conda.exe'),
        os.path.join('C:\\', 'ProgramData', 'anaconda3', 'Scripts', 'conda.exe'),
    ]

    for path in candidates:
        if os.path.isfile(path):
            return path

    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Python\ContinuumAnalytics\Anaconda3\InstallPath')
        value, _ = winreg.QueryValueEx(key, '')
        winreg.CloseKey(key)
        conda = os.path.join(value, 'Scripts', 'conda.exe')
        if os.path.isfile(conda):
            return conda
    except (OSError, FileNotFoundError, ImportError):
        pass

    return None
