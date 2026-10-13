"""앱에 들어가는 알람 음악을 코드로 직접 만들어요(저작권 걱정 없음). python3 tools/make_alarm_sounds.py"""
import numpy as np, subprocess, os
from scipy.io import wavfile
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "app", "Resources", "sounds")
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def T(sec): return np.arange(int(SR * sec)) / SR
def marimba(m, v=.35):
    t = T(1.2); f = mtof(m)
    return (np.sin(2*np.pi*f*t) + .25*np.sin(2*np.pi*f*4*t)*np.exp(-t*25)) * np.exp(-t*5) * np.minimum(1, t*400) * v
def musicbox(m, v=.25):
    t = T(2.2); f = mtof(m)
    return (np.sin(2*np.pi*f*t) + .4*np.sin(2*np.pi*f*2.01*t)*np.exp(-t*3) + .2*np.sin(2*np.pi*f*5.4*t)*np.exp(-t*9)) * np.exp(-t*2.2) * np.minimum(1, t*600) * v
def bell(m, v=.3):
    t = T(3.5); f = mtof(m)
    return sum(a*np.sin(2*np.pi*f*r*t)*np.exp(-t*d) for r, a, d in ((1,1,1.1),(2.0,.5,1.8),(2.76,.35,2.6),(5.4,.2,4),(8.9,.1,6))) * np.minimum(1, t*500) * v
def beep(m, dur=.12, v=.22):
    t = T(dur); f = mtof(m)
    s = np.sign(np.sin(2*np.pi*f*t)) * .35 + np.sin(2*np.pi*f*t) * .65
    return s * np.minimum(1, t*300) * np.minimum(1, (dur - t)*300) * v
def pluck(m, v=.3):
    t = T(1.0); f = mtof(m)
    return (np.sin(2*np.pi*f*t) + .5*np.sin(2*np.pi*2*f*t)*np.exp(-t*8) + .25*np.sin(2*np.pi*3*f*t)*np.exp(-t*12)) * np.exp(-t*4) * np.minimum(1, t*300) * v
def bass(m, dur, v=.3):
    t = T(dur); f = mtof(m)
    return np.sin(2*np.pi*f*t) * np.minimum(1, t*80) * np.minimum(1, (dur - t)*20) * np.exp(-t*.6) * v
def kick(v=.5):
    t = T(.25); return np.sin(2*np.pi*(50 + 90*np.exp(-t*30))*t) * np.exp(-t*14) * v
def hat(v=.06):
    n = np.random.default_rng(3).standard_normal(int(SR*.04)); n = np.diff(n, prepend=0)
    return n * np.exp(-np.arange(len(n))/SR*120) * v

def render(name, length, events, reverb=.5):
    L = int(SR*length); out = np.zeros(L)
    for t, sig in events:
        i = int(t*SR); idx = (np.arange(len(sig)) + i) % L; np.add.at(out, idx, sig)
    for d, g in ((.11,.3),(.17,.22),(.23,.16),(.31,.1)):
        out += np.roll(out, int(d*SR)) * g * reverb
    out = np.tanh(out*1.2); out /= np.abs(out).max() / .85
    wav = f"/tmp/{name}.wav"; wavfile.write(wav, SR, (out*32767).astype(np.int16))
    subprocess.run(["ffmpeg","-loglevel","error","-y","-i",wav,"-c:a","alac",os.path.join(OUT,f"{name}.caf")], check=True)

b = 60/112  # 아침 햇살: 마림바
ev = []; mel = [72,76,79,76, 74,77,81,77, 72,76,79,84, 83,79,77,74]
prog = [48,53,55,48]
for bar in range(4):
    for k in range(4):
        ev.append(((bar*4+k)*b, marimba(mel[bar*4+k])))
        ev.append(((bar*4+k+.5)*b, marimba(mel[bar*4+k]-12, .2)))
    ev.append((bar*4*b, bass(prog[bar], 4*b*.95)))
render("morning", 16*b, ev, .35)

b = 60/76  # 오르골
ev = []; mel = [(0,79),(1,76),(2,72),(3,76),(4,77),(5,74),(6,71),(7,74),(8,76),(9,72),(10,69),(11,72),(12,74),(13.5,71),(14,67),(15,71)]
for t, m in mel: ev.append((t*b, musicbox(m)))
for i, m in enumerate([60,65,57,55]):
    for k in range(4): ev.append(((i*4+k)*b + b/2, musicbox(m + (0,7,12,7)[k], .12)))
render("musicbox", 16*b, ev, .7)

b = 60/60  # 종소리
ev = []
for t, m in [(0,76),(1,72),(2,74),(3,67),(5,67),(6,74),(7,76),(8,72)]: ev.append((t*b, bell(m)))
render("bells", 10*b, ev, .6)

b = 60/120  # 디지털 알람
ev = []
for k in range(4):
    for j in range(4): ev.append((k*b*2 + j*.14, beep(88)))
render("digital", 8*b, ev, .1)

b = 60/100  # 상쾌한 기상: 비트 + 플럭
ev = []; prog = [(57,[69,72,76]),(53,[69,72,77]),(48,[67,72,76]),(55,[67,71,74])]
for bar, (bs, ch) in enumerate(prog):
    t0 = bar*4*b
    for k in range(4):
        ev.append((t0 + k*b, kick(.45 if k % 2 == 0 else .25)))
        ev.append((t0 + k*b + b/2, hat()))
    for k, m in enumerate(ch*3)[:8] if False else enumerate((ch*3)[:8]):
        ev.append((t0 + k*b/2, pluck(m + 12 if k % 4 == 3 else m)))
    ev.append((t0, bass(bs-12, 4*b*.9, .35)))
render("wakeup", 16*b, ev, .3)
print("ok")
