# NFC Kart Okuyucu — Tasarım

Tarih: 2026-11-04
Durum: Onaylanmış tasarım (kullanıcı onayı: bölüm 1 ve 2)

## Amaç

Kullanıcının kendi temassız ödeme kartının (Papara Mastercard sticker/kart) NFC ile okunabilen
bilgilerini gösteren, telefona APK olarak kurulabilen bir Android uygulaması.

**Başarı ölçütü:** Kart telefonun arkasına yaklaştırıldığında uygulama birkaç saniye içinde kart
numarasını, son kullanma tarihini, kart tipini, ülke ve para birimini Türkçe arayüzde gösterir;
kart numarası tek dokunuşla kopyalanabilir. APK GitHub'dan telefona indirilip kurulabilir.

### Kullanıcının belirttikleri
- Papara Mastercard temassız kart/sticker, NFC ile okunacak, APK istiyor.
- Gösterilecek bilgi: **temel bilgiler** (kart no, son kullanma, kart tipi, ülke, para birimi).
- Kart numarası: **tam numara + Kopyala düğmesi**.
- Yaklaşım: **yerli Android (Java), ek kütüphane yok**.

### Varsayımlar
- Okunan kart kullanıcının kendi kartıdır.
- Uygulama, depodaki oyundan bağımsızdır; oyunun kodu ve iş akışı değişmez.

### Kapsam dışı (bilerek yok)
- CVV/CVC, PIN, bakiye: çipte yoktur ya da NFC ile okunamaz; uygulama bunları göstermez.
- Harcama geçmişi, ATC, PIN deneme sayacı, ham EMV dökümü (kullanıcı "temel bilgiler"i seçti).
- Okunan veriyi kaydetme, dışa aktarma, ağ üzerinden gönderme. Uygulamanın **internet izni yoktur**.

## Mimari

Konum: `apps/nfc-kart-okuyucu/` — tek modüllü (`app`) Gradle Android projesi.

| Ayar | Değer |
| --- | --- |
| applicationId / paket | `com.nfckart.okuyucu` |
| Uygulama adı | NFC Kart Okuyucu |
| minSdk / targetSdk / compileSdk | 21 / 35 / 35 |
| Android Gradle Plugin / Gradle | 8.7.3 / 8.14.3 (wrapper depoda) |
| Java | kaynak/hedef 17 |
| Bağımlılıklar | yok (yalnızca test için JUnit 4.13.2) |
| İzinler | `android.permission.NFC` (`uses-feature android.hardware.nfc required=true`) |
| Tema | `@android:style/Theme.Material.Light.DarkActionBar` (AndroidX yok) |

### Birimler

EMV mantığı `com.nfckart.okuyucu.emv` paketindedir ve **Android sınıflarına bağımlı değildir**;
böylece Android SDK olmadan düz JUnit ile test edilir.

| Birim | Ne yapar | Arayüzü | Bağımlılığı |
| --- | --- | --- | --- |
| `Hex` | bayt ↔ onaltılık metin | `toHex(byte[])`, `fromHex(String)` | — |
| `Tlv` | BER-TLV çözücü: çok baytlı etiket, `81`/`82` uzunluk, iç içe (constructed) yapı | `List<Tlv> parse(byte[])`, `find(List<Tlv>, int tag)` (derin arama), `tag`, `value`, `children` | — |
| `Transceiver` | Karta APDU gönderip yanıt alma soyutlaması | `byte[] transceive(byte[]) throws IOException` | — |
| `EmvReader` | Karttan okuma akışı (aşağıda) | `CardInfo read()` | `Transceiver`, `Tlv` |
| `CardInfo` | Sonuç modeli | `pan`, `expiry` (AA/YY), `cardType`, `holderName` (yoksa `null`), `countryCode`, `currencyCode`, `aid` | — |
| `EmvException` | Ödeme uygulaması yok / kart hatası | Türkçe mesaj taşır | — |
| `Labels` | Ülke ve para birimi kodlarını Türkçe ada çevirir (792→Türkiye, 949→TRY vb.), kart numarasını 4'lü gruplar | statik yardımcılar | — |
| `MainActivity` | NFC okuyucu modu, arka planda okuma, sonucu gösterme, kopyalama | Android `Activity` | `EmvReader`, `IsoDep` |

### Okuma akışı (`EmvReader.read`)

1. **APDU yardımcısı:** Her komutta yanıtın son iki baytı (SW1 SW2) ayrılır. `61xx` → `GET RESPONSE`
   (`00 C0 00 00 xx`) ile devamı alınır; `6Cxx` → komut `Le = xx` ile yeniden gönderilir.
2. **PPSE seçimi:** `SELECT 2PAY.SYS.DDF01`. Yanıttaki tüm `4F` (AID) değerleri, varsa `87`
   (öncelik) sırasıyla aday listesine alınır.
3. **Yedek AID listesi:** PPSE başarısızsa ya da AID içermiyorsa bilinen AID'ler sırayla denenir:
   Mastercard `A0000000041010`, Maestro `A0000000043060`, Visa `A0000000031010`,
   Visa Electron `A0000000032010`, Troy `A0000006723010`, Amex `A00000002501`.
4. **Uygulama seçimi:** `SELECT <AID>`; `9000` dönen ilk AID kullanılır. FCI'dan `50` (etiket),
   `9F12` (tercih edilen ad) ve `9F38` (PDOL) alınır. Hiçbiri seçilemezse
   `EmvException("Kartta desteklenen bir ödeme uygulaması bulunamadı")`.
5. **GPO:** PDOL varsa her etiket için uzunluğu tutan değer doldurulur (aşağıdaki tablo; tabloda
   olmayan ya da uzunluğu farklı etiket → istenen uzunlukta sıfır). Komut:
   `80 A8 00 00 Lc 83 L <veri> 00`; PDOL yoksa `80 A8 00 00 02 83 00 00`.
   Yanıt biçim 1 (`80`: ilk 2 bayt AIP, kalanı AFL) veya biçim 2 (`77` içinde `94` AFL ve
   doğrudan gelebilen `57`/`5A`/`5F24` vb.) olarak çözülür.
6. **Kayıt okuma:** AFL 4'er baytlık gruplar halinde okunur (SFI = bayt1 >> 3, ilk–son kayıt);
   her kayıt `00 B2 <kayıt> <(SFI << 3) | 4> 00` ile okunur. GPO başarısızsa ya da AFL boşsa
   yedek tarama: SFI 1–10, her SFI'de kayıt 1–16, ilk başarısız yanıtta sonraki SFI'ye geçilir.
7. **Bilgileri çıkarma** (tüm yanıtlardaki TLV'ler birlikte aranır):
   - Kart no: `5A` (BCD, sondaki `F` atılır) → yoksa `57` Track 2 (`D` ayıracından önce) →
     yoksa `9F6B` (Mastercard Track 2) → yoksa `56` Track 1 (`B<PAN>^...`).
   - Son kullanma: `5F24` (YYAAGG → `AA/YY`) → yoksa Track 2'de ayıraçtan sonraki YYAA.
   - Kart sahibi: `5F20` → yoksa `9F0B`; boş, yalnızca boşluk ya da `/` ise `null`.
   - Kart tipi: `9F12` (yazdırılabilir ASCII ise) → `50` → AID'nin bilinen adı.
   - Ülke: `5F28`; para birimi: `9F42`.
   - Kart numarası bulunamazsa `EmvException("Kart numarası okunamadı")`.

**PDOL varsayılanları:**

| Etiket | Anlam | Değer |
| --- | --- | --- |
| `9F66` | TTQ | `36 00 00 00` |
| `9F02` / `9F03` | Tutar / diğer tutar | 6 bayt sıfır |
| `9F1A` | Terminal ülke kodu | `07 92` (Türkiye) |
| `5F2A` | İşlem para birimi | `09 49` (TRY) |
| `95` | TVR | 5 bayt sıfır |
| `9A` | İşlem tarihi | bugün, `YY AA GG` (BCD) |
| `9C` | İşlem tipi | `00` |
| `9F37` | Rastgele sayı | 4 rastgele bayt |
| `9F35` | Terminal tipi | `22` |
| `9F33` | Terminal yetenekleri | `E0 B0 C8` |

### Veri akışı ve arayüz (`MainActivity`)

- `onResume`: `NfcAdapter.enableReaderMode(FLAG_READER_NFC_A | FLAG_READER_NFC_B |
  FLAG_READER_SKIP_NDEF_CHECK)`; `onPause`: `disableReaderMode`.
- Kart algılanınca (okuyucu iş parçacığında): `IsoDep.get(tag)` → `connect()`,
  `setTimeout(5000)` → `EmvReader(isoDep::transceive).read()` → `runOnUiThread` ile gösterim.
- Ekran (XML yerleşim, kaydırılabilir):
  - Başlık ve durum metni: "Kartı telefonun arkasına yaklaştır" / "Okunuyor…" / hata metni.
  - NFC kapalıysa uyarı + **NFC ayarlarını aç** düğmesi (`Settings.ACTION_NFC_SETTINGS`).
  - Sonuç alanı: Kart numarası (tam, 4'lü gruplar, eş aralıklı yazı) + **Kopyala** düğmesi;
    Son kullanma; Kart tipi; Kart sahibi (yalnızca varsa); Ülke; Para birimi.
- Kopyala: `ClipData.newPlainText`; Android 13+ (`API 33`) için `ClipDescription.EXTRA_IS_SENSITIVE`
  işaretlenir (pano önizlemesinde gizlenir); Android 12 ve altı için "Kopyalandı" bildirimi (Toast).

### Hata yönetimi

| Durum | Gösterilen mesaj |
| --- | --- |
| Telefonda NFC yok | "Bu telefonda NFC yok." (okuma devre dışı) |
| NFC kapalı | "NFC kapalı. Açmak için düğmeye dokun." + ayar düğmesi |
| Etikette `IsoDep` yok | "Bu bir ödeme kartı değil." |
| `TagLostException` / bağlantı koptu | "Kart erken uzaklaştı. Kartı 2–3 saniye sabit tut ve tekrar dene." |
| `EmvException` | İstisnanın Türkçe mesajı |
| Beklenmeyen hata | "Kart okunamadı: <hata sınıfı>" |

Okuma, `onTagDiscovered` geri çağrısının içinde eşzamanlı yapılır (bu geri çağrı zaten arayüz
iş parçacığı dışında çalışır; ayrıca iş parçacığı açılmaz). Ekranda her zaman son okumanın sonucu kalır.

## Derleme ve dağıtım

- Yeni iş akışı `.github/workflows/nfc-kart-okuyucu.yml`; mevcut `apps.yml` değişmez.
- Tetikleyiciler: `workflow_dispatch`; `push` → dallar `main` ve `claude/nfc-card-reader-app-*`,
  yollar `apps/nfc-kart-okuyucu/**` ve iş akışı dosyasının kendisi.
- Adımlar: checkout → `setup-java` (temurin 17) → `./gradlew testDebugUnitTest assembleDebug
  --no-daemon` → `app-debug.apk` → `NFCKartOkuyucu.apk` → `upload-artifact` →
  `nfc-kart-okuyucu` etiketli GitHub sürümü silinip bu commit'e (`--target ${{ github.sha }}`)
  yeniden oluşturulur, APK eklenir. İzin: `contents: write`.
- APK debug anahtarıyla imzalıdır; "bilinmeyen kaynaklar" izniyle kurulur.
- `gradlew` çalıştırma izniyle (`+x`) depoya eklenir.

## Test

JUnit 4 testleri `app/src/test/java/com/nfckart/okuyucu/emv/` altında; Android'e bağımlı değil.
Yerelde `javac` + JUnit jar ile, CI'da `testDebugUnitTest` ile çalışır.

- `HexTest`: gidiş-dönüş, boşluklu girdi.
- `TlvTest`: tek baytlı/çok baytlı etiket (`9F38`, `BF0C`), `81`/`82` uzunluk, iç içe yapı ve
  derin arama, bozuk/eksik veride (uzunluk taşması, yarım etiket) istisna fırlatmadan o noktaya kadar
  çözülenleri döndürme.
- `EmvReaderTest` — sahte `Transceiver` (komut → yanıt eşlemesi):
  - PPSE + Mastercard, biçim 2 GPO, AFL'den kayıt okuma, `5A`/`5F24`/`5F28`/`9F42` → beklenen
    `CardInfo` (test kart numarası `5555555555554444`).
  - PPSE yok → yedek AID listesine düşme.
  - Kart numarası yalnızca Track 2'de (`57`) → doğru PAN ve son kullanma.
  - PDOL varken GPO komutunun uzunluğu/biçimi doğru.
  - `61xx` yanıtında `GET RESPONSE` ile devam.
  - Hiçbir AID seçilemezse `EmvException`.
- `LabelsTest`: 792 → Türkiye, 949 → TRY, 4'lü gruplama.

Doğrulama: testler önce bu ortamda çalıştırılır; gönderimden sonra GitHub Actions çalışmasının
(test + APK derleme) başarılı olduğu kontrol edilir.

## Belgeler

`apps/nfc-kart-okuyucu/OKUBENI.md`: APK'yı indirme bağlantısı, kurulum (bilinmeyen kaynaklar),
NFC'yi açma, kartı okutma; **sticker notu**: stickerların arkasındaki ferrit katman nedeniyle
telefon kendi kılıfındaki sticker'ı okuyamayabilir — kılıfı çıkarıp sticker'ın ön yüzünü telefonun
arkasına tutmak ya da başka bir telefonla okumak gerekir; okunamayan bilgiler (CVV, PIN, bakiye).
