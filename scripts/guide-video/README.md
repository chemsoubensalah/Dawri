# Vidéo guide (avec voix)

Fabrique la vidéo « guide d'utilisation » en filmant l'application en direct, calée sur un commentaire lu par une voix locale.

- `narration.<lang>.cjs` : le commentaire, scène par scène (`say` = texte lu, `cap` = sous-titre).
- `scenes.cjs` : ce que fait le curseur dans chaque scène.
- `record.cjs` : démarre un serveur local neuf par scène (base en mémoire, cabinet de démonstration rempli par `seed.cjs`, horloge fixée par `clock-preload.cjs`) et filme l'écran.
- `tts.py` : lit le commentaire avec Piper (voix locale, rien n'est envoyé à un service externe).
- `assemble.py` : images + voix → une vidéo par scène, puis la vidéo complète.

```bash
pip install piper-tts
mkdir -p /var/tmp/dawri-video/voice && cd /var/tmp/dawri-video/voice
for f in fr_FR-siwis-medium.onnx fr_FR-siwis-medium.onnx.json; do
  curl -sLO "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/$f"
done
cd <dépôt> && npx next build
python3 scripts/guide-video/tts.py fr /var/tmp/dawri-video/out /var/tmp/dawri-video/voice
node scripts/guide-video/record.cjs fr /var/tmp/dawri-video/out            # ou une seule scène : … out settings
python3 scripts/guide-video/assemble.py fr /var/tmp/dawri-video/out        # → out/guide-fr.mp4
```

Après un changement de texte dans `narration`, relancer `tts.py`, puis refilmer la scène concernée (les gestes sont calés sur la durée de la voix).
