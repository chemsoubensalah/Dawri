#!/usr/bin/env python3
"""Vidéo guide : assemble les images filmées et la voix → une vidéo par scène, puis la vidéo complète.
Usage : python3 assemble.py <lang> <out_dir> [scene ...]   → <out_dir>/guide-<lang>.mp4
"""
import json, subprocess, sys, wave
from array import array
from pathlib import Path

lang, out = sys.argv[1], Path(sys.argv[2])
only = sys.argv[3:]
here = Path(__file__).resolve().parent
N = json.loads(subprocess.check_output(["node", "-e", f"console.log(JSON.stringify(require('{here}/narration.{lang}.cjs')))"]))
RATE = 22050
parts = out / "parts" / lang
parts.mkdir(parents=True, exist_ok=True)

def run(*cmd):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *map(str, cmd)], check=True)

for sc in N["scenes"]:
    sid = sc["id"]
    mp4 = parts / f"{sid}.mp4"
    if only and sid not in only:
        continue
    fdir = out / "frames" / lang / sid
    meta = json.loads((fdir / "scene.json").read_text())
    start, end, frames = meta["start"], meta["end"], meta["frames"]
    # images : chacune reste à l'écran jusqu'à la suivante
    before = [f for f in frames if f[1] <= start]
    frames = (before[-1:] if before else frames[:1]) + [f for f in frames if start < f[1] < end]
    lines, t = ["ffconcat version 1.0"], start
    for i, (name, ts) in enumerate(frames):
        nxt = frames[i + 1][1] if i + 1 < len(frames) else end
        lines += [f"file '{fdir / name}'", f"duration {max(nxt - max(ts, start), 0.001):.4f}"]
    lines.append(f"file '{fdir / frames[-1][0]}'")
    (fdir / "list.txt").write_text("\n".join(lines))
    # voix : chaque passage posé à son instant
    total = end - start
    track = array("h", bytes(2 * int(total * RATE + 1)))
    for b in meta["timeline"]:
        with wave.open(str(out / "audio" / lang / f"{b['key']}.wav"), "rb") as w:
            assert w.getframerate() == RATE and w.getnchannels() == 1
            pcm = array("h", w.readframes(w.getnframes()))
        at = int(b["t"] * RATE)
        if at + len(pcm) > len(track):
            track.extend([0] * (at + len(pcm) - len(track)))
        track[at : at + len(pcm)] = pcm
    wav = fdir / "voice.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(track.tobytes())
    dur = len(track) / RATE
    run("-f", "concat", "-safe", "0", "-i", fdir / "list.txt", "-i", wav,
        "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-tune", "animation",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-t", f"{dur:.3f}", mp4)
    print(f"  {sid}: {dur:.1f} s")

if not only:
    lst = parts / "all.txt"
    lst.write_text("\n".join(f"file '{parts / (sc['id'] + '.mp4')}'" for sc in N["scenes"]))
    final = out / f"guide-{lang}.mp4"
    run("-f", "concat", "-safe", "0", "-i", lst, "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-movflags", "+faststart", final)
    d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(final)]))
    print(f"{final} — {int(d // 60)} min {int(d % 60)} s, {final.stat().st_size / 1e6:.1f} Mo")
