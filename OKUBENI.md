# DUST STRIKE — CS 1.6 tarzı çevrimiçi FPS

Tarayıcıda çalışan, 3D, çok oyunculu bir CS 1.6 benzeri. Sunucu senin bilgisayarında çalışır,
arkadaşların sadece bir link ile tarayıcıdan katılır (kurulum gerekmez).

## Başlatma

`BASLAT.bat` dosyasına çift tıkla (veya bu klasörde `npm start`). Açılan pencerede adresler yazar:

- Sen: `http://localhost:3000`
- Aynı Wi-Fi / ağdaki arkadaşlar: `http://<bilgisayarının-IP'si>:3000` (pencerede yazan adres)

İlk çalıştırmada Windows Güvenlik Duvarı "Node.js'e izin verilsin mi?" diye sorarsa **İzin ver**
de (Özel ağlar işaretli olsun). Yoksa arkadaşların bağlanamaz.

## Ücretsiz sunucuya kurmak (Render.com) — önerilen

Bilgisayarın kapalıyken bile herkesin girebileceği kalıcı bir link verir (`https://dust-strike-xxxx.onrender.com`).

1. github.com'da ücretsiz hesap aç, yeni bir depo (repository) oluştur.
2. Bu klasördeki dosyaları depoya yükle (`node_modules` klasörü HARİÇ):
   `public/`, `server.js`, `package.json`, `package-lock.json`, `render.yaml`, `BASLAT.bat`, `OKUBENI.md`
3. render.com'da GitHub ile giriş yap → **New → Blueprint** → deponu seç → **Apply**.
   `render.yaml` sayesinde ayarlar (Frankfurt sunucusu, ücretsiz plan, başlatma komutu) otomatik gelir.
4. Birkaç dakika sonra Render sana linki verir; arkadaşlarına o linki gönder.

Notlar: Ücretsiz planda 15 dakika kimse oynamazsa sunucu uyur; ilk giren kişi için açılması yaklaşık
1 dakika sürer. Oyun sırasında uyumaz. Ayda 750 saat ücretsiz kullanım var.

## Kendi bilgisayarından internete açmak (geçici)

Ücretsiz Cloudflare tüneli (hesap gerekmez), sadece senin bilgisayarın açıkken çalışır:

1. Bir kere kur: `winget install Cloudflare.cloudflared`
2. Oyun sunucusu açıkken ayrı bir pencerede: `cloudflared tunnel --url http://localhost:3000`
3. Çıktıdaki `https://....trycloudflare.com` adresini arkadaşlarına gönder.

(Alternatif: modeminden 3000 portunu bilgisayarına yönlendirip dış IP'ni paylaşmak.)

## Oyun kuralları

- İki takım: **Teröristler (T)** ve **Anti-Terör (CT)**. Her iki takımda en az 1 kişi olunca maç başlar;
  o zamana kadar ısınma modu (sınırsız para, ölünce yeniden doğma).
- T'lerden biri C4 taşır; A veya B bölgesine kurup 40 saniye korursa T kazanır.
- CT'ler bombayı imha ederse (10 sn, kitle 5 sn) ya da süre biterse CT kazanır. Takımı yok eden de kazanır.
- Para sistemi: başlangıç $800, leş $300 (bıçak $1500, AWP $100), raund kazanma $3250, kaybetme $1400+.
- İlk 10 raundu alan takım maçı kazanır.

## Telefondan oynamak (Android / iOS)

Aynı link telefonda açılınca oyun dokunmatik kontrollere geçer. Telefonu yatay tut.

- Sol taraf: parmağını kaydırarak hareket et (az itersen sessiz yürürsün)
- Sağ taraf: parmağını kaydırarak etrafa bak; ATEŞ butonuna basılıyken kaydırınca da nişan alırsın
- Butonlar: ATEŞ, ZIPLA, EĞİL, ŞARJÖR, SİLAH, DÜRBÜN / SAPLA, bölgedeyken KUR / İMHA
- Üst sağ: $ (satın al), SOHBET, SKOR, ☰ (menü / takım değiştir)
- Android'de oyun tam ekran açılır. iPhone'da tam ekran için Safari'de **Paylaş → Ana Ekrana Ekle** yap, oradan aç.
- iPhone'un yan tarafındaki sessiz düğmesi açıksa oyun sesleri duyulmaz.

## Kontroller (bilgisayar)

| Tuş | İşlev |
| --- | --- |
| W A S D | Hareket — Shift yürü, C / Ctrl eğil, Boşluk zıpla |
| Sol tık / Sağ tık | Ateş / dürbün (AWP, Scout) veya bıçak saplama |
| 1 2 3 4 5 | Ana silah, tabanca, bıçak, bombalar, C4 — Q: son silah, tekerlek: silah değiştir |
| R / G | Şarjör değiştir / silahı yere at |
| B | Satın alma menüsü (raund başında doğuş alanında) |
| E (basılı) | Bomba kur (T) / imha et (CT) |
| Tab | Skor tablosu |
| Y / U | Sohbet / takım sohbeti |
| M | Takım değiştir |

## Ayarlar

`server.js` dosyasının başındaki sabitlerle raund süresi, kazanma raundu, başlangıç parası vb.
değiştirilebilir. Silah değerleri `public/shared/weapons.js`, harita `public/shared/map.js` içinde.
