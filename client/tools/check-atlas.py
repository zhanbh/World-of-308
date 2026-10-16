"""Read-only guard for an edited atlas; requires existing Pillow runtime.
Usage: python check-atlas.py reference.png candidate.png [columns=8] [rows=3]
Exit 0: structural checks pass (visual review still required). Exit 1: reject.
Never resizes, recolors or writes either image.
"""
import json
import sys
from PIL import Image, ImageChops


def inspect(reference, candidate, columns=8, rows=3):
    errors, warnings = [], []
    with Image.open(reference) as ref, Image.open(candidate) as trial:
        if trial.size != ref.size:
            errors.append(f"Dimensions changed: {ref.size} -> {trial.size}; existing frame coordinates are invalid")
        if trial.width % columns or trial.height % rows:
            errors.append("Dimensions are not divisible by the frame grid")
        if 'A' not in trial.getbands():
            errors.append("No alpha channel")
        alpha = trial.convert('RGBA').getchannel('A')
        if alpha.getextrema()[0] > 0:
            errors.append("No fully transparent pixels")
        if trial.size == ref.size:
            old_alpha = ref.convert('RGBA').getchannel('A')
            # Formerly empty gutters must not acquire invented background pixels.
            old_empty = old_alpha.point(lambda value: 255 if value == 0 else 0)
            new_visible = alpha.point(lambda value: 255 if value > 16 else 0)
            if ImageChops.multiply(old_empty, new_visible).getbbox():
                errors.append("Visible pixels introduced into formerly transparent space; inspect frame alignment/background")
            if ImageChops.difference(ref.convert('RGBA'), trial.convert('RGBA')).getbbox():
                warnings.append("Pixels differ; inspect all changed frames, attached trails, proportions and foot anchors before integration")
        return {"reference": str(reference), "candidate": str(candidate), "grid": [columns, rows],
                "reference_size": list(ref.size), "candidate_size": list(trial.size),
                "accepted_structure": not errors, "errors": errors, "warnings": warnings,
                "visual_approval_required": True}


if __name__ == '__main__':
    result = inspect(sys.argv[1], sys.argv[2], *(int(value) for value in sys.argv[3:5]))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result['accepted_structure'] else 1)
