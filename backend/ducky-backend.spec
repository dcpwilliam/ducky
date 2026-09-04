# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = ['ducky_backend', 'ducky_backend.protocol', 'ducky_backend.protocol.jsonrpc', 'ducky_backend.protocol.dispatcher', 'ducky_backend.services', 'ducky_backend.services.conda_service', 'ducky_backend.services.venv_service', 'ducky_backend.services.pip_service', 'ducky_backend.services.pypi_service', 'ducky_backend.services.jupyter_service', 'ducky_backend.services.training_service', 'ducky_backend.training', 'ducky_backend.training.duck_env', 'ducky_backend.training.ppo', 'ducky_backend.training.ppo', 'ducky_backend.training.policy_io', 'ducky_backend.platform', 'ducky_backend.platform.windows']
tmp_ret = collect_all('ducky_backend')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['ducky_backend/__main__.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ducky-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ducky-backend',
)
