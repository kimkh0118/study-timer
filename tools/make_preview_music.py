import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter
SR=44100; BPM=80; beat=60/BPM; bars=8; L=int(SR*beat*4*bars)
def mtof(m): return 440*2**((m-69)/12)
out=np.zeros((L,2))
def add(sig,t,pan=0.5):
    i=int(t*SR)%L; n=len(sig)
    for k in range(0,n):
        pass
    idx=(np.arange(n)+i)%L   # wrap around so loop is seamless
    out[idx,0]+=sig*(1-pan); out[idx,1]+=sig*pan
def epiano(m,dur,vel=0.3):
    t=np.arange(int(SR*(dur+1.5)))/SR; f=mtof(m)
    env=np.exp(-t*2.2)*np.minimum(1,t*200)
    rel=np.where(t>dur, np.exp(-(t-dur)*5),1)
    s=(np.sin(2*np.pi*f*t)+0.35*np.sin(2*np.pi*2*f*t)*np.exp(-t*4)+0.12*np.sin(2*np.pi*3*f*t)*np.exp(-t*7))
    s*=1+0.08*np.sin(2*np.pi*4.5*t)  # tremolo
    return s*env*rel*vel
def bell(m,vel=0.12):
    t=np.arange(int(SR*2.5))/SR; f=mtof(m)
    return (np.sin(2*np.pi*f*t)+0.3*np.sin(2*np.pi*f*2.76*t)*np.exp(-t*6))*np.exp(-t*2.8)*np.minimum(1,t*300)*vel
def bass(m,dur,vel=0.35):
    t=np.arange(int(SR*dur))/SR; f=mtof(m)
    env=np.minimum(1,t*80)*np.exp(-t*0.8)*np.minimum(1,(dur-t)*20)
    return (np.sin(2*np.pi*f*t)+0.2*np.sin(2*np.pi*2*f*t))*env*vel
def pad(ms,dur,vel=0.05):
    t=np.arange(int(SR*dur))/SR
    env=np.minimum(1,t/1.2)*np.minimum(1,(dur-t)/1.2)
    s=sum(np.sin(2*np.pi*mtof(m)*t*(1+d))for m in ms for d in(-0.003,0.003))
    return s*env*vel
# Fmaj7 - Em7 - Dm9 - Cmaj7 (two bars each)
chords=[([53,57,60,64],41),([52,55,59,62],40),([50,53,57,60,64],38),([48,52,55,59],36)]
melody=[(0,76),(1.5,74),(2,72),(3,69),(4,72),(6,67),(8,74),(9.5,72),(10,71),(11,67),(12,69),(14,71),
        (16,72),(17.5,74),(18,72),(19,69),(20,67),(22,64),(24,67),(25.5,69),(26,71),(27,72),(28,71),(30,67)]
for ci,(ch,b) in enumerate(chords):
    t0=ci*8*beat
    for rep in range(2):
        tb=t0+rep*4*beat
        for j,m in enumerate(ch): add(epiano(m+12 if m<55 else m,beat*1.8,0.13),tb+j*0.012,0.35+0.08*j)
        add(epiano(ch[1]+12,beat*0.9,0.08),tb+2.5*beat,0.6)
        add(bass(b,beat*2.8),tb,0.5); add(bass(b+7,beat*0.9,0.25),tb+3*beat,0.5)
    add(pad([m+12 for m in ch[:3]],8*beat+0.6),t0,0.5)
for bt,m in melody: add(bell(m),bt*beat,0.6)
# soft hat-ish noise ticks
rng=np.random.default_rng(1)
for k in range(bars*8):
    n=rng.standard_normal(int(SR*0.05))*np.exp(-np.arange(int(SR*0.05))/SR*90)
    n=lfilter([1,-1],[1],n)*0.012*(1.4 if k%2 else 0.8); add(n,k*beat/2,0.7)
# simple feedback-delay reverb, wrapped
for d,g in ((0.137,0.25),(0.211,0.2),(0.293,0.15),(0.377,0.1)):
    sh=int(d*SR); out+=np.roll(out,sh,axis=0)*g*0.6
out=np.tanh(out*1.1); out/=np.abs(out).max()/0.85
wavfile.write("loop.wav",SR,(out*32767).astype(np.int16))
print(L/SR)
