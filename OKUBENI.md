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
   `public/`, `server/`, `server.js`, `package.json`, `package-lock.json`, `render.yaml`, `BASLAT.bat`, `OKUBENI.md`
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

## Admin paneli

Adres: `<oyunun adresi>/admin` (örnek: `http://localhost:3000/admin`). Telefondan da kullanılır.

**Şifre**
- Kendi bilgisayarında: sunucu açılırken pencerede `Şifre:` satırında yazar. İlk açılışta üretilir, sonraki
  açılışlarda aynı kalır (`data/admin.json` içinde saklanır). Kendin belirlemek için `ADMIN_PASSWORD` ortam
  değişkenini ayarla.
- Render'da: panelde servisini aç → **Environment** → `ADMIN_PASSWORD`. Bu depo Blueprint ile kurulduysa Render
  değeri kendisi üretir; oradan görebilir ya da kendi şifrenle değiştirebilirsin. Değişken hiç yoksa elle ekle
  (yoksa şifre sunucu her yeniden başladığında değişir ve yalnızca Render'ın **Logs** sekmesinde görünür).
- 5 yanlış denemeden sonra o adresin girişi 10 dakika kilitlenir.

**Neler yapılır**
- **Oyuncular:** oyundaki herkes adı, odası, takımı, IP adresi ve ping'iyle listelenir. **At** oyuncuyu oyundan
  çıkarır (yeniden girebilir), **Banla** IP adresini yasaklar.
- **Yasaklı IP'ler:** liste, **Banı kaldır**, elle IP ekleme. Banlanan oyuncu menüde sebebiyle birlikte uyarı
  görür; ban kaldırılınca sayfayı yenilemesine gerek kalmadan en geç 15 saniyede yeniden bağlanır.
- **Aynı IP kuralı**, **izinli IP'ler**, **duyuru** (herkesin sohbetine düşen mesaj) ve **olay kaydı**
  (girişler, banlar, engellenen bağlantılar). Oyundan çıkmış biri de olay kaydındaki satırından banlanabilir.
- Banlı bir IP admin sayfasına yine de girebilir: kendi evini yanlışlıkla banlarsan panelden kaldırabilirsin.

### Aynı IP kuralı

Aynı internet bağlantısından ikinci bir kişi oyuna girmeye çalışınca ne olacağını belirler:

| Seçenek | Ne olur |
| --- | --- |
| **Engelle ve IP'yi banla** (varsayılan) | İkinci kişi giremez, IP yasaklanır, o IP'den oynayan kişi de oyundan düşer. Ban panelden kaldırılana kadar sürer. |
| **Sadece engelle** | İkinci kişi giremez; içerideki oynamaya devam eder, kimse banlanmaz. |
| **Kapalı** | Aynı IP'den istenen kadar kişi girebilir. |

Bilmen gerekenler:
- Aynı evdeki, okuldaki ya da internet kafedeki herkes dışarıdan **tek bir IP** ile görünür; bazı mobil operatörler
  de birçok kişiye aynı IP'yi verir. Yani bu kural açıkken aynı evden iki kişi aynı anda oynayamaz. Böyle biri
  banlanırsa panelde **Kaldır + izin ver** ile banı kaldırıp IP'yi izinli listeye alabilirsin.
- Sayfayı yenileyen ya da bağlantısı kopup geri gelen oyuncu ikinci kişi sayılmaz (tarayıcı kendini tanıtır; aynı
  tarayıcı yeniden girince eski bağlantısı düşer). Menüde bekleyen ama oyuna girmemiş bağlantılar da sayılmaz.
- Sunucunun çalıştığı bilgisayardan (`localhost`) yapılan bağlantılar kuralın dışındadır.
- IPv6 kullananlarda aynı ev /64 ağıyla tanınır (cihazın adresi değişse de ban sürer).

### Kalıcı ayarlar (Render ücretsiz plan için önemli)

Banlar ve panel ayarları `data/admin.json` dosyasına yazılır. Kendi bilgisayarında bu kalıcıdır. **Render'ın ücretsiz
planında disk kalıcı değildir:** sunucu uyuyup uyandığında ya da yeniden kurulduğunda panelden eklenen banlar ve
ayarlar sıfırlanır. Kalıcı olmasını istediklerini Render → **Environment** bölümüne yaz:

| Değişken | Anlamı |
| --- | --- |
| `ADMIN_PASSWORD` | Admin şifresi |
| `IP_RULE` | Aynı IP kuralının başlangıç değeri: `ban`, `block` (sadece engelle) ya da `off` |
| `BANNED_IPS` | Kalıcı yasaklı IP'ler, virgülle ayrılmış (ör. `85.105.12.34, 78.180.1.2`). Panelden kaldırılamaz. |
| `ALLOWED_IPS` | Aynı IP kuralından muaf IP'ler, virgülle ayrılmış |
| `DATA_DIR` | Veri klasörü (varsayılan `data/`). Kalıcı diski olan bir sunucuda o diskin yolunu ver. |
| `TRUST_PROXY` | Gerçek IP'nin nasıl bulunacağı (aşağıya bak) |

**Gerçek IP adresi:** Sunucu Render'da ya da `cloudflared` tünelinin arkasında çalışırken oyuncuların gerçek IP'si
kendiliğinden doğru bulunur. Başka bir barındırma hizmeti ya da kendi vekil sunucun (nginx vb.) varsa `TRUST_PROXY=1`
(X-Forwarded-For) ya da vekilin yazdığı başlığın adını (ör. `TRUST_PROXY=x-real-ip`) ayarla. IP güvenilir biçimde
bulunamıyorsa panel uyarı gösterir ve o bağlantılara kural ile ban **uygulanmaz** (yanlış ayar yüzünden herkesin aynı
IP sayılıp banlanmasını önlemek için).

## Botlar, özel odalar, sesli sohbet, öldüren kamerası

- **Botlar:** Herkese açık odalarda oyuncu azsa sunucu odayı botlarla doldurur (varsayılan: odada toplam 4 kişi olana
  kadar). Gerçek oyuncu geldikçe botlar yerini bırakır; oda boşalınca botlar da gider. Sayıyı `BOTS` ortam değişkeniyle
  ayarlarsın (`BOTS=0` botları kapatır). Botlar gezer, silah alır, ateş eder, klasik modda bomba kurar / imha eder.
  Skor tablosunda ping yerine **BOT** yazar; admin panelinde görünmezler.
- **Özel oda:** Menünün altındaki **ODA KUR** ile, seçili mod ve haritada yalnızca kodu bilenlerin girebildiği bir oda
  açılır (bot sayısını 0–9 arasında sen seçersin). 6 karakterlik kod duraklatma menüsünde (Esc) yazar; **Bağlantıyı
  kopyala** ile arkadaşına gönderebilirsin (`…/?oda=KOD`). Arkadaşın kodu yazıp **KODLA GİR** der. Özel odalar herkese
  açık listede görünmez, son kişi çıkınca kapanır.
- **Sesli sohbet (yalnızca özel odada):** Duraklatma menüsünden açılır: *Kapalı* / *Bas-konuş (K tuşu basılıyken)* /
  *Açık mikrofon*. Tarayıcı mikrofon izni ister. Ses oyuncular arasında doğrudan akar (WebRTC), sunucu yalnızca
  bağlantıyı kurdurur. Sesi duymak için de sohbeti açmış olman gerekir. Site https olmalı (Render'da öyle; `localhost`
  da çalışır). Çok kısıtlı ağlarda (bazı okul/şirket ağları) bağlantı kurulamayabilir.
- **Öldüren kamerası:** Ölünce, kısa düşüşün ardından kamera seni öldüren oyuncunun omzunun arkasına geçer
  (yaklaşık 3 saniye ya da yeniden doğana kadar).

## Oda ayarları ve bot zorluğu

- **Bot zorluğu:** Kolay / Orta / Zor. Zor botlar daha çabuk tepki verir, daha isabetlidir ve daha sık kafadan vurur.
  Özel odada kurarken ya da sonradan seçilir. Herkese açık odalarda `BOT_SKILL` ortam değişkeniyle ayarlanır
  (`easy`, `normal`, `hard`; varsayılan `normal`).
- **Oda ayarları (yalnızca özel odada, Esc menüsünde):** Odayı kuran kişi değiştirir, diğerleri yalnızca görür.
  - Süre (ölüm maçları): 3–20 dakika. Maç sürerken değişirse hemen uygulanır.
  - Leş sınırı (ölüm maçları): sınıra ulaşan oyuncu ya da takım maçı kazanır.
  - Kazanma raundu (klasik): kaç raundu alan kazanır.
  - Bot sayısı ve bot zorluğu.
  - Dost ateşi: açıkken takım arkadaşları birbirine hasar verir; takım arkadaşını öldüren bir leş kaybeder.
- **Oyuncu çıkarma:** Kurucu, Esc menüsündeki listeden bir oyuncuyu **At** ile odadan çıkarır; çıkarılan o odaya
  kodla geri giremez. Kurucu odadan ayrılırsa kuruculuk sıradaki oyuncuya geçer.

## Vuruş göstergeleri, seriler, maç sonu

- **Hasar sayıları:** Birini vurunca verdiğin hasar vurduğun yerde belirir (kafadan vuruş kırmızı, öldüren vuruş sarı).
- **Hasar yönü:** Vurulunca nişangahın çevresinde, ateşin geldiği yönü gösteren kırmızı bir yay çıkar.
- **Hasar özeti:** Ölünce, o canda kime ne kadar hasar verdiğin ve kimden ne kadar aldığın listelenir.
- **Leş serisi:** Ölmeden art arda leş alınca duyuru ve ses çıkar (Çifte leş, Üçlü seri, Durdurulamıyor…). Başkasının
  serisini bitirmek de duyurulur.
- **Maç sonu ekranı:** Ölüm maçları bitince skor tablosunun üstünde ödüller görünür: maçın yıldızı, keskin nişancı
  (kafadan leş), en uzun seri, en çok hasar.
- **Sesler:** Adımlar sağ/sol ayak olarak farklı tınlar; duvarın arkasındaki sesler (adım, silah, patlama) boğuk ve
  kısık duyulur; zıplayıp yere inen oyuncunun sesi yönüyle birlikte gelir. Kulaklıkla düşmanın yeri anlaşılır.

## Oyun modları

Menüden mod seçilir; üç mod aynı anda oynanabilir (her biri ayrı oda).

| Mod | Kurallar |
| --- | --- |
| **Klasik** | Raundlu bomba modu (aşağıdaki kurallar). En fazla 20 kişi. |
| **Takımlı Ölüm Maçı** | T vs CT, ölünce 2,5 sn sonra yeniden doğarsın. 10 dakika sonunda en çok leşi alan takım kazanır. En fazla 20 kişi. |
| **Herkes Tek** | Herkes herkese karşı, takım yok. 10 dakika sonunda en çok leşi alan oyuncu kazanır. En fazla 32 kişi. |

Ölüm maçı modlarında: silahlar bedava ve her yerde alınabilir (B / $), son aldığın ana silah ile zırh
yeniden doğunca otomatik verilir, doğunca 2 saniye koruma vardır (ateş edince biter). Yanlış silah
alırsan satın alma menüsünün **6. İade** sütunundan alımı iptal edip önceki silahına (eklentileriyle) dönebilirsin.
Maç süresi `DM_TIME` ortam değişkeniyle (saniye) değiştirilebilir.

## Haritalar

Menüde mod seçtikten sonra harita seçilir (her mod + harita ayrı bir odadır).

| Harita | Tema | Modlar |
| --- | --- | --- |
| **de_kum** | CS2 **Dust II** düzeni: Uzun A, Long kapıları, Pit, A rampası, A arabası, Goose; Orta, Xbox, Kedi yolu (Kısa A), orta kapılar; alt ve üst B tünelleri, B kapıları, pencere, B arabası | Hepsi |
| **de_serap** | CS2 **Mirage** düzeni: Saray ve balkonu, T/A rampası, Tetris, gişe; Orta, pencere odası, bağlantı, orman; B daireleri, minibüs, market, mutfak | Hepsi |
| **de_depo** | Endüstriyel depo, raflı ana salon, konteynerler | Hepsi |
| **de_kar** | Karlı kış üssü, geniş orta avlu, kar yağışı | Hepsi |
| **dm_arena** | Küçük simetrik arena, neon ışıklar | Takımlı ÖM, Herkes Tek |

**Doğuş noktaları ortadan görünmez.** Klasik modda raund başında kimse doğduğu yerde ortadan (ya da karşı doğuştan)
vurulamaz: de_kum'da T doğuşunda Suicide ağzının karşısında bir yapı, CT doğuşunda CT ortanın karşısında avlu duvarı;
de_serap'ta T doğuşunda üst ortaya bakan duvar; de_depo ve de_kar'da doğuş odaları iki yan kapıyla açılır. Her
haritanın `mid` (orta bölge) tanımı vardır ve `npm test` bu kuralı her haritada doğrular; yeni harita eklerken ya da
haritayı değiştirirken test kırmızıya dönerse doğuş noktaları ortadan görünüyor demektir.

de_kum ve de_serap, CS2'deki haritaların düzeninden (bölgeler, geçitler, yükseklikler) esinlenerek kodla yeniden
kuruldu; Valve'ın harita dosyaları ya da dokuları kullanılmadı. Merdivenler, yükseltilmiş alanlar (A bölgesi, kedi
yolu, pencere odası, saray), tünel tavanları, kapı kanatları ve araba, konteyner, palmiye gibi eşyalar vardır.

Haritalar `public/shared/map.js` içinde: ızgara (`carve`, `put`) ve ek kutular (`stairs`, `platform`, `roof`,
`slab`, `win`, `prop`). Eşya modelleri ve bina cepheleri (pencere, kepenk, kapı, tente) `public/js/props.js` içinde.

## Silah eklentileri

Satın alma menüsünün 5. sütunu (**Eklentiler**). Elindeki silaha takılır (bıçak/bomba elindeyse ana silaha).

| Eklenti | Fiyat | Etki | Silahlar |
| --- | --- | --- | --- |
| Susturucu | $400 | Sessiz atış: namlu alevi ve mermi izi görünmez, uzaktan duyulmaz | Tabanca, SMG, tüfek |
| Kırmızı Nokta | $350 | Sağ tık / NİŞAN: 1.6x yakınlaştırma, daha isabetli | SMG, tüfek |
| Uzun Şarjör | $300 | %50 daha fazla mermi | Hepsi |
| Tutamaç | $300 | %30 daha az tepme | SMG, tüfek |

Ölüm maçlarında eklentiler de bedava ve yeniden doğunca silahla birlikte geri gelir.

## Ayarlar

Ana menüde sağ üstteki **⚙ Ayarlar** butonu ya da oyunda Esc / ☰ → **Ayarlar**. Ayarlar cihazda saklanır ve
hemen uygulanır.

| Sekme | İçerik |
| --- | --- |
| **Nişangah** | Şekil (Artı, T, Çarpı, Daire, Nokta), renk (hazır renkler ya da istediğin renk), uzunluk, kalınlık, ortadaki boşluk, görünürlük, orta nokta, siyah kenarlık ve "koşarken / ateş ederken açılsın". Önizlemede çöl, kar ve karanlık zemin denenebilir. |
| **Görüntü** | Grafik kalitesi, görüş alanı (FOV), parlaklık, FPS göster |
| **Kontrol ve ses** | Fare / bakış hassasiyeti, ses düzeyi, fareyi dikeyde ters çevirme |
| **Telefon** | Butonları düzenle, jiroskop ayarları (sadece telefonda görünür) |

## Grafik ve performans

Ayarlar → Görüntü → **Grafik kalitesi**:

| Kalite | Ne açık |
| --- | --- |
| **Otomatik** (önerilen) | Bilgisayarda Yüksek, telefonda Orta ile başlar. Kare hızı 55'in altına düşerse önce çözünürlük, sonra son işlem efektleri, en son gölgeler azaltılır (60 FPS hedefi). |
| **Düşük** | Gölge yok, düşük çözünürlük |
| **Orta** | Gölgeler (2048), ortam yansıması, duvar ve sandık diplerinde yumuşak gölgelenme, duvarlarda ton farkı, toz zerreleri |
| **Yüksek** | Keskin, yumuşak kenarlı gölgeler; ışık parlaması (namlu alevi, patlamalar, neon şeritler); haritaya göre renk düzenleme; kenar yumuşatma |
| **Ultra** | Yüksek + ekran uzayı ortam gölgelendirmesi (köşeler ve nesne dipleri kararır) ve daha yüksek çözünürlük. Güçlü ekran kartı gerekir. |

Son işlem efektleri `public/js/post.js` içinde (three.js eklentileri sunucuda `/three/addons/` adresinden verilir).

Çevre (`public/js/world.js`, `public/js/props.js`): temaya göre ufuk (kum tepeleri, karlı dağlar, şehir silueti),
çatılarda parapet, çatı odası, kubbe ve anten, tavanlı yerlerde lambalar (zemine düşen ışık gerçek ışık kaynağı
değildir; telefonda da ucuzdur), havada toz zerreleri.

Oyuncu modeli (`public/js/player.js`): eklemli, yuvarlak hatlı asker; oyuncu başına tek çizim çağrısı. Yürüme, eğilme
(diz çökme), silahı tutuş ve ölüm duruşları `public/js/rig.js` içinde hesaplanır; isabet kutuları
`public/shared/hitbox.js` içindedir ve görünen modelle örtüştükleri testle doğrulanır.

Silah modelleri (`public/js/models.js`): metal, ahşap ve plastik parçalar ayrı malzemeyle çizilir (metal ortamı
yansıtır, ahşapta damar, yüzeylerde ince doku). Elindeki silahta kenarlar yuvarlatılmıştır ve arpacık, ray,
kavisli şarjör, dürbün camı gibi ayrıntılar vardır; diğer oyuncuların silahları performans için sade tutulur.

### FPS sınırını kaldır

Ayarlar → Görüntü → **FPS sınırını kaldır** (yalnızca bilgisayarda). Tarayıcılar oyunu ekranın yenileme hızına kilitler
(60 Hz ekranda 60 FPS). Bu seçenek açıkken:

- **Tarayıcıda:** oyun ekranı beklemeden çizer (en fazla ~250 FPS). 60 Hz ekranda göze görünen kare yine 60'tır;
  kazanç daha düşük gecikmedir. Bilgisayar daha çok ısınır.
- **Windows uygulamasında:** sınır tamamen kalkar (dikey eşitleme kapanır). Değiştirince uygulama kendini yeniden
  başlatır. Görüntüde yırtılma olabilir.

## Klasik mod kuralları

- İki takım: **Teröristler (T)** ve **Anti-Terör (CT)**. Her iki takımda en az 1 kişi olunca maç başlar;
  o zamana kadar ısınma modu (sınırsız para, ölünce yeniden doğma).
- T'lerden biri C4 taşır; A veya B bölgesine kurup 40 saniye korursa T kazanır.
- CT'ler bombayı imha ederse (10 sn, kitle 5 sn) ya da süre biterse CT kazanır. Takımı yok eden de kazanır.
- Para sistemi: başlangıç $800, leş $300 (bıçak $1500, AWP $100), raund kazanma $3250, kaybetme $1400+.
- **İade:** Satın alma menüsünün son sütunu **6. İade**: bu raund aldıkların orada listelenir, tıklayınca tam fiyatına
  geri verilir (klavyede 6 ve sıra numarası; Z son alımı iade eder). Sadece satın alma süresi bitmeden ve satın alma
  alanındayken. Ateş ettiğin silah, attığın bomba, hasar almış zırh ve elden çıkardığın silah iade edilemez.
  Silahı iade edince yerine aldığın eski silah hâlâ yerdeyse eline geri gelir; silaha taktığın eklentiler de iade edilir.
- İlk 10 raundu alan takım maçı kazanır.

## Telefondan oynamak (Android / iOS)

Aynı link telefonda açılınca oyun dokunmatik kontrollere geçer. Telefonu yatay tut.

- Sol taraf: parmağını kaydırarak hareket et (az itersen sessiz yürürsün)
- Sağ taraf: parmağını kaydırarak etrafa bak; ATEŞ butonuna basılıyken kaydırınca da nişan alırsın
- Butonlar: ATEŞ, ZIPLA, EĞİL, ŞARJÖR, SİLAH, DÜRBÜN / SAPLA, bölgedeyken KUR / İMHA
- Üst sağ: $ (satın al), SOHBET, SKOR, ☰ (menü / takım değiştir)
- Android'de oyun tam ekran açılır. iPhone'da tam ekran için Safari'de **Paylaş → Ana Ekrana Ekle** yap, oradan aç.
- iPhone'un yan tarafındaki sessiz düğmesi açıksa oyun sesleri duyulmaz.
- **Butonları düzenle:** ☰ → Ayarlar → Telefon → "Butonları düzenle". Butonları (joystick dahil) sürükleyerek taşı, seçili butonun
  ya da tüm butonların boyutunu ayarla, "Bitti" de. Düzen telefonda saklanır; "Sıfırla" ile varsayılana döner.
- **Jiroskop:** ☰ → Ayarlar → Telefon → "Jiroskop ile nişan al". Telefonu çevirerek nişan alırsın (parmakla bakış da çalışmaya devam eder).
  Hassasiyet ayarlanabilir; yön ters geliyorsa "Yatayı / Dikeyi ters çevir". iPhone'da ilk açışta hareket izni sorulur.

## Uygulamalar (Android APK ve Windows)

- **Android:** Sitedeki menüde "Android uygulamasını indir (APK)" bağlantısı var. İndirdikten sonra telefonda
  "bilinmeyen kaynaklardan yükleme" izni gerekir. Uygulama tam ekran ve yatay açılır, canlı sunucuya bağlanır.
- **Windows:** `DustStrike.exe` (kurulum gerektirmez): sitedeki menüde "Windows uygulamasını indir" ya da doğrudan
  https://github.com/celikalizahid-beep/dust-strike/releases/latest/download/DustStrike.exe — İlk açılışta
  SmartScreen uyarısı çıkarsa "Ek bilgi → Yine de çalıştır". Ayrıca Chrome/Edge'de menüdeki
  "Bilgisayara uygulama olarak yükle" butonu oyunu Başlat menüsüne uygulama olarak ekler.
- Uygulamalar GitHub Actions ile derlenir (`.github/workflows/apps.yml`): `apps/` klasörü değişince ya da
  Actions sekmesinden "Run workflow" ile. İkisi de canlı sunucuyu açtığı için oyun güncellemeleri uygulamalara
  kendiliğinden gelir; yeniden derlemeye gerek yoktur.

## Testler

`npm test` (Node 20+). Harita kuralları (doğuş noktaları ortadan görünmez, her yer yürünerek ulaşılabilir), IP ve ban
mantığı, admin API'si (gerçek sunucu başlatılarak) ve oyuncu iskeleti denenir.

## Yük testi

`node tools/bots.mjs <adres> <bot sayısı> <süre sn> <mod> <harita>` gerçek oyuncu gibi davranan botlar bağlar
(dolaşır, silah alır, ateş eder) ve her 5 saniyede sunucu durumunu yazar. Sunucu durumu: `<adres>/stats`.

## Kontroller (bilgisayar)

| Tuş | İşlev |
| --- | --- |
| W A S D | Hareket — Shift yürü, C / Ctrl eğil, Boşluk zıpla |
| Sol tık / Sağ tık | Ateş / dürbün (AWP, Scout), kırmızı nokta ile nişan ya da bıçak saplama |
| 1 2 3 4 5 | Ana silah, tabanca, bıçak, bombalar, C4 — Q: son silah, tekerlek: silah değiştir |
| R / G | Şarjör değiştir / silahı yere at |
| B | Satın alma menüsü (raund başında doğuş alanında) · menüdeyken Z: son alımı iade et |
| E (basılı) | Bomba kur (T) / imha et (CT) |
| Tab | Skor tablosu |
| Y / U | Sohbet / takım sohbeti |
| M | Takım değiştir |
| V | Kendini önden gör (aç / kapat): karakterin diğerlerinin gördüğü gibi görünür |

## Ayarlar

`server.js` dosyasının başındaki sabitlerle raund süresi, kazanma raundu, başlangıç parası vb.
değiştirilebilir. Silah değerleri `public/shared/weapons.js`, harita `public/shared/map.js` içinde.
