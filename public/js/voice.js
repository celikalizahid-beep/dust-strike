// Sesli sohbet (özel odalarda): ses tarayıcılar arasında doğrudan akar (WebRTC); sunucu yalnızca kimin açık olduğunu
// ve bağlantı kurma sinyallerini iletir. Kipler: 'off' kapalı, 'ptt' bas-konuş (tuş basılıyken), 'open' açık mikrofon.
// Sesi duymak için de sohbetin açık olması gerekir (bas-konuş kipinde mikrofon tuşa basılana kadar kapalıdır).
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] };

export class Voice {
  // send(mesaj): sunucuya gönderir; onChange(): durum değişince arayüzü yenilemek için çağrılır
  constructor(send, onChange = () => {}) {
    this.send = send;
    this.onChange = onChange;
    this.mode = 'off';
    this.stream = null;
    this.peers = new Map(); // oyuncu kimliği → { pc, audio }
    this.volume = 1;
    this.error = '';
  }

  get supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }
  get connected() { let n = 0; for (const p of this.peers.values()) if (p.pc.connectionState === 'connected') n++; return n; }

  async setMode(mode) {
    this.error = '';
    if (mode === 'off') { this.stop(); return; }
    if (!this.supported) { this.error = 'Bu tarayıcı sesli sohbeti desteklemiyor (ya da sayfa https değil).'; this.onChange(); return; }
    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch {
        this.error = 'Mikrofon izni verilmedi.';
        this.onChange();
        return;
      }
      this.mode = mode;
      this.mute(mode !== 'open');
      this.send({ t: 'voice', on: true });
    }
    this.mode = mode;
    this.mute(mode !== 'open');
    this.onChange();
  }
  mute(m) { if (this.stream) for (const t of this.stream.getAudioTracks()) t.enabled = !m; }
  // Bas-konuş tuşu
  talk(down) { if (this.mode === 'ptt') this.mute(!down); }
  setVolume(v) { this.volume = v; for (const p of this.peers.values()) p.audio.volume = v; }

  peer(id) {
    let p = this.peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection(ICE);
    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = this.volume;
    p = { pc, audio };
    this.peers.set(id, p);
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); };
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'rtc', to: id, d: { candidate: e.candidate } }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.drop(id); this.onChange(); };
    return p;
  }
  // Sohbeti açınca sunucu, zaten açık olanların listesini yollar: her birine bağlantı teklifi gönderilir
  async onPeers(ids) {
    if (!this.stream) return;
    for (const id of ids) {
      const { pc } = this.peer(id);
      await pc.setLocalDescription(await pc.createOffer());
      this.send({ t: 'rtc', to: id, d: { sdp: pc.localDescription } });
    }
  }
  async onSignal(from, d) {
    if (!this.stream) return;
    const { pc } = this.peer(from);
    try {
      if (d.sdp) {
        await pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this.send({ t: 'rtc', to: from, d: { sdp: pc.localDescription } });
        }
      } else if (d.candidate) await pc.addIceCandidate(d.candidate);
    } catch { /* geç gelen ya da bozuk sinyal: yok say */ }
  }
  drop(id) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    this.peers.delete(id);
    this.onChange();
  }
  // Sohbeti kapat: mikrofonu bırak, bağlantıları kes, sunucuya bildir
  stop(tell = true) {
    if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); if (tell) this.send({ t: 'voice', on: false }); }
    this.stream = null;
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.mode = 'off';
    this.onChange();
  }
}
