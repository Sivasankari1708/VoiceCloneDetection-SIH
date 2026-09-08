"""
backend/platform/__init__.py
============================
Platform, Orchestration & Security Layer for VoiceCloneDetection-SIH (Member 2).
Builds around Member 1's frozen AI/Audio intelligence module.
"""

__version__ = "1.0.0"

# If accidentally imported as top-level 'platform' (e.g. when executing from inside backend/ directory),
# forward attributes to Python's standard library platform to prevent shadowing conflicts in dependencies like SQLAlchemy.
if __name__ == "platform":
    import sys
    import importlib.machinery
    import importlib.util

    _paths = [p for p in sys.path if p and "VoiceCloneDetection-SIH" not in p]
    _spec = importlib.machinery.PathFinder.find_spec("platform", _paths)
    if _spec:
        _stdlib_mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_stdlib_mod)
        globals().update({k: getattr(_stdlib_mod, k) for k in dir(_stdlib_mod) if not k.startswith("__")})

