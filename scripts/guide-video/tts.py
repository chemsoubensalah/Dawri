#!/usr/bin/env python3
"""Vidéo guide : lit le commentaire (narration.<lang>.cjs) avec la voix locale Piper.
Usage : python3 tts.py <lang> <out_dir> <voices_dir>   → <out_dir>/audio/<lang>/<scene>.<beat>.wav + durations.json
"""
import hashlib, json, subprocess, sys, wave
from pathlib import Path
from piper import PiperVoice, SynthesisConfig

lang, out, voices = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
here = Path(__file__).resolve().parent
N = json.loads(subprocess.check_output(["node", "-e", f"console.log(JSON.stringify(require('{here}/narration.{lang}.cjs')))"]))
SPEED, GAP = 1.12, 0.34  # plus lent que la voix d'origine ; silence entre deux phrases (s)
adir = out / "audio" / lang
adir.mkdir(parents=True, exist_ok=True)
voice = None
durations = {}
for sc in N["scenes"]:
    for b in sc["beats"]:
        key = f"{sc['id']}.{b['id']}"
        wav, tag = adir / f"{key}.wav", adir / f"{key}.sha"
        h = hashlib.sha1(f"{N['voice']}|{SPEED}|{GAP}|{b['say']}".encode()).hexdigest()
        if not (wav.exists() and tag.exists() and tag.read_text() == h):
            voice = voice or PiperVoice.load(str(voices / f"{N['voice']}.onnx"))
            with wave.open(str(wav), "wb") as w:
                first = True
                for ch in voice.synthesize(b["say"], syn_config=SynthesisConfig(length_scale=SPEED)):
                    if first:
                        w.setnchannels(ch.sample_channels); w.setsampwidth(ch.sample_width); w.setframerate(ch.sample_rate)
                    else:
                        w.writeframes(b"\x00" * (int(ch.sample_rate * GAP) * ch.sample_width * ch.sample_channels))
                    w.writeframes(ch.audio_int16_bytes)
                    first = False
            tag.write_text(h)
        with wave.open(str(wav), "rb") as w:
            durations[key] = round(w.getnframes() / w.getframerate(), 3)
(out / f"durations.{lang}.json").write_text(json.dumps(durations, indent=1))
print(f"{len(durations)} passages, {sum(durations.values()):.0f} s de voix")
