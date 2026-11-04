# NFC Kart Okuyucu Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temassız ödeme kartının NFC ile okunabilen temel bilgilerini gösteren, GitHub Actions ile APK'sı derlenen bağımsız bir Android uygulaması.

**Architecture:** EMV mantığı (`Hex`, `Tlv`, `EmvReader`, `Labels`) Android'den bağımsız düz Java'dır ve JUnit ile test edilir. `MainActivity` yalnızca NFC okuyucu modunu, `IsoDep` bağlantısını ve ekranı yönetir. APK'yı ayrı bir GitHub Actions iş akışı derleyip `nfc-kart-okuyucu` sürümüne ekler.

**Tech Stack:** Java 17, Android Gradle Plugin 8.7.3, Gradle 8.14.3 (wrapper), Android framework widget'ları (AndroidX yok), JUnit 4.13.2.

**Spec:** `docs/superpowers/specs/2026-11-04-nfc-kart-okuyucu-design.md`

## Global Constraints

- Proje kökü: `apps/nfc-kart-okuyucu/`; paket/applicationId `com.nfckart.okuyucu`; uygulama adı "NFC Kart Okuyucu".
- minSdk 21, targetSdk 35, compileSdk 35; Java kaynak/hedef 17; `java.time` kullanılmaz (API 26 gerektirir) — tarih için `java.util.Calendar`.
- Çalışma zamanı bağımlılığı yok; yalnızca `testImplementation 'junit:junit:4.13.2'`.
- Tek izin `android.permission.NFC`; `uses-feature android.hardware.nfc required="true"`. İnternet izni **yok**.
- `com.nfckart.okuyucu.emv` paketindeki hiçbir dosya `android.*` içe aktarmaz.
- Tüm kullanıcıya görünen metinler Türkçe, spec'teki metinlerle birebir aynı.
- Mevcut oyun dosyaları ve `.github/workflows/apps.yml` değişmez.
- Commit mesajları Türkçe, sonunda oturumun atıf satırları.
- **Yerel test** (Android SDK bu ortamda yok): `S=/tmp/claude-0/-home-user-dust-strike/8caa0a6c-5370-5f26-a9fa-c15a0bf6f62c/scratchpad`
  içinde `jars/junit.jar` (`junit:junit:4.13.2`) ve `jars/hamcrest.jar` (`org.hamcrest:hamcrest-core:1.3`) Maven Central'dan indirilir;
  `$S/emvtest.sh <TestSınıfı...>` betiği `app/src/main/java/com/nfckart/okuyucu/emv/*.java` ve
  `app/src/test/java/com/nfckart/okuyucu/emv/*.java` dosyalarını `javac` ile `$S/out`'a derleyip
  `org.junit.runner.JUnitCore com.nfckart.okuyucu.emv.<TestSınıfı>` çalıştırır. Başarı: çıktıda `OK (N tests)`.

## Review Focus

1. Kart okuma ortasında uzaklaştırılır (`IOException`/`TagLostException`) → istisna yedek AID/kayıt taramasında yutulmamalı, `read()`'den dışarı çıkmalı ki ekranda "Kart erken uzaklaştı…" görünsün. (Task 2: `ioExceptionPropagates`)
2. PPSE birden çok AID listeler, ilki `SELECT`'te `6A82` döner → sıradaki AID denenmeli. (Task 2: `triesNextAidWhenSelectFails`)
3. GPO `6985` döner (terminal verisi kartça reddedilir) → kayıt taramasıyla yine kart numarası bulunmalı. (Task 2: `gpoFailureFallsBackToRecordScan`)
4. Tek sayıda haneli kart numarası `F` ile doldurulmuş gelir (ör. 15 haneli Amex `378282246310005F`) → `F` atılmalı. (Task 2: `stripsPanPadding`)
5. Kart sahibi alanı `" /"` ya da boşluk (Papara'da tipik) → "Kart sahibi" satırı gizlenmeli (`holderName == null`). (Task 2: ana senaryoda doğrulanır)

---

### Task 1: `Hex` ve `Tlv` (BER-TLV çözücü)

**Files:**
- Create: `apps/nfc-kart-okuyucu/app/src/main/java/com/nfckart/okuyucu/emv/Hex.java`
- Create: `apps/nfc-kart-okuyucu/app/src/main/java/com/nfckart/okuyucu/emv/Tlv.java`
- Test: `apps/nfc-kart-okuyucu/app/src/test/java/com/nfckart/okuyucu/emv/HexTest.java`
- Test: `apps/nfc-kart-okuyucu/app/src/test/java/com/nfckart/okuyucu/emv/TlvTest.java`
- Create (yalnızca yerel, depoya girmez): `$S/emvtest.sh`

**Interfaces:**
- Produces:
  - `Hex.toHex(byte[]) : String` — büyük harf, boşluksuz.
  - `Hex.fromHex(String) : byte[]` — boşlukları yok sayar; tek sayıda hane veya geçersiz karakterde `IllegalArgumentException`.
  - `Tlv` alanları: `final int tag` (ör. `0x9F38`), `final byte[] value`, `final List<Tlv> children` (ilkel ise boş); `boolean isConstructed()` (ilk etiket baytında `0x20` biti).
  - `Tlv.parse(byte[]) : List<Tlv>` — asla istisna fırlatmaz; bozuk noktaya kadar çözülenleri döndürür. Etiket konumunda `0x00`/`0xFF` dolgu baytları atlanır.
  - `Tlv.find(List<Tlv>, int tag) : Tlv` — derinlik öncelikli, yoksa `null`.
  - `Tlv.findAll(List<Tlv>, int tag) : List<Tlv>` — derinlik öncelikli, belge sırasında.

- [ ] **Step 1: Yerel test ortamını kur** — jar'ları indir, `$S/emvtest.sh`'yi yaz (Global Constraints).
- [ ] **Step 2: Başarısız testleri yaz**

```java
// HexTest
@Test public void roundTrip() { assertEquals("00A4FF", Hex.toHex(Hex.fromHex("00 a4 ff"))); }
@Test(expected = IllegalArgumentException.class) public void oddLengthRejected() { Hex.fromHex("ABC"); }

// TlvTest
@Test public void multiByteTagAndLongLength() {
    // 9F38 tek bayt uzunluk; 81 uzunluk: 0x81 0x80 → 128 bayt değer
    List<Tlv> l = Tlv.parse(Hex.fromHex("9F3803010203" + "5F2081" + "80" + "41".repeat(128)));
    assertEquals(0x9F38, l.get(0).tag); assertEquals("010203", Hex.toHex(l.get(0).value));
    assertEquals(0x5F20, l.get(1).tag); assertEquals(128, l.get(1).value.length);
}
@Test public void twoByteLength() { assertEquals(300, Tlv.parse(Hex.fromHex("5A82012C" + "00".repeat(300))).get(0).value.length); }
@Test public void nestedFindAndFindAll() {
    // 6F{84, A5{BF0C{61{4F=A1}, 61{4F=A2}}}}
    List<Tlv> l = Tlv.parse(Hex.fromHex("6F17" + "8401AA" + "A512" + "BF0C0F" + "6105" + "4F03A00001" + "6106" + "4F04A0000002"));
    assertTrue(l.get(0).isConstructed());
    assertEquals("A00001", Hex.toHex(Tlv.find(l, 0x4F).value));
    assertEquals(2, Tlv.findAll(l, 0x4F).size());
    assertNull(Tlv.find(l, 0x50));
}
@Test public void skipsPaddingBytes() { assertEquals(0x5A, Tlv.parse(Hex.fromHex("0000FF5A0112")).get(0).tag); }
@Test public void truncatedValueReturnsParsedPrefix() {
    List<Tlv> l = Tlv.parse(Hex.fromHex("5A01125F2405AABB"));   // ikinci öğenin değeri eksik
    assertEquals(1, l.size()); assertEquals(0x5A, l.get(0).tag);
}
@Test public void halfTagReturnsParsedPrefix() { assertEquals(1, Tlv.parse(Hex.fromHex("5A01129F")).size()); }
```

  (Not: `nestedFindAndFindAll` içindeki uzunluk baytlarını yazarken doğrula; test hex'i yanlışsa düzelt, beklentiyi değil.)

- [ ] **Step 3: Çalıştır, derleme hatasıyla başarısız olduğunu gör** — `$S/emvtest.sh HexTest TlvTest` → `Hex`/`Tlv` bulunamadı.
- [ ] **Step 4: `Hex` ve `Tlv`'yi yaz.** Etiket: ilk baytın alt 5 biti `0x1F` ise sonraki baytlar `0x80` biti sıfır olana dek eklenir. Uzunluk: `<0x80` tek bayt, `0x81` → 1 bayt, `0x82` → 2 bayt, diğerleri bozuk sayılıp çözme durur. Yapısal öğenin değeri özyinelemeli `parse` ile `children`'a çözülür.
- [ ] **Step 5: Çalıştır** — `$S/emvtest.sh HexTest TlvTest` → `OK (8 tests)`.
- [ ] **Step 6: Commit** — `git add apps/nfc-kart-okuyucu/app/src` → "NFC okuyucu: Hex ve BER-TLV çözücü".

---

### Task 2: `EmvReader` (kart okuma akışı)

**Files:**
- Create: `.../emv/Transceiver.java`, `.../emv/CardInfo.java`, `.../emv/EmvException.java`, `.../emv/EmvReader.java` (hepsi `app/src/main/java/com/nfckart/okuyucu/emv/`)
- Test: `.../test/.../emv/FakeCard.java`, `.../test/.../emv/EmvReaderTest.java`

**Interfaces:**
- Consumes: Task 1'deki `Hex`, `Tlv`.
- Produces:
  - `interface Transceiver { byte[] transceive(byte[] apdu) throws IOException; }`
  - `final class CardInfo` — `public final String pan` (yalnızca rakam), `expiry` (`"AA/YY"` ya da `null`), `cardType` (null değil), `holderName` (yoksa `null`), `countryCode` (`"792"` gibi 3 hane ya da `null`), `currencyCode` (`"949"` gibi ya da `null`), `aid` (hex); tüm alanları alan tek kurucu, bu sırayla.
  - `final class EmvException extends Exception` — `EmvException(String message)`.
  - `final class EmvReader` — `EmvReader(Transceiver)`; `CardInfo read() throws IOException, EmvException`.
  - Test yardımcısı `FakeCard implements Transceiver`: `FakeCard on(String cmdHexPrefix, String responseHex)` (ilk eşleşen kural kazanır; eşleşmeyen komut → `"6A82"`), `FakeCard throwOn(String cmdHexPrefix)` (eşleşince `IOException`), `List<String> sent` (gönderilen komutların hex'i); statik `tlv(String tagHex, String... valueHexParts)` uzunluğu hesaplayıp TLV hex'i üretir; statik `ascii(String)` → hex.

Sabit komutlar (testler bunlarla eşleşir): PPSE `00A404000E325041592E5359532E444446303100`; AID seçimi `00A40400 <Lc> <AID> 00`; GPO `80A80000…`; kayıt okuma `00B2 <kayıt> <(SFI<<3)|4> 00`; GET RESPONSE `00C00000<xx>`.

- [ ] **Step 1: Başarısız testleri yaz** (`EmvReaderTest`; PDOL = `9F6604 9F0206 9F1A02 5F2A02 9A03 9C01 9F3704` → 22 bayt)

```java
private static final String OK = "9000";
private static String ppse(String... aids) { /* 6F{84=2PAY.SYS.DDF01, A5{BF0C{ her AID için 61{4F=aid, 87=sıra} }}} + OK */ }
private static FakeCard mastercard() {
    return new FakeCard()
        .on("00A404000E", ppse("A0000000041010"))
        .on("00A4040007A0000000041010", tlv("6F", tlv("84", "A0000000041010"),
                tlv("A5", tlv("50", ascii("Debit Mastercard")), tlv("9F38", "9F66049F02069F1A025F2A029A039C019F3704"))) + OK)
        .on("80A80000", tlv("77", tlv("82", "1980"), tlv("94", "08010100" + "10010200")) + OK)
        .on("00B2010C", tlv("70", tlv("9F6B", "5555555555554444D2912201")) + OK)
        .on("00B20114", tlv("70", tlv("5A", "5555555555554444"), tlv("5F24", "291231"), tlv("5F20", ascii(" /")),
                tlv("5F28", "0792"), tlv("9F42", "0949")) + OK)
        .on("00B20214", tlv("70", tlv("8C", "9F0206")) + OK);
}

@Test public void readsMastercard() throws Exception {
    CardInfo c = new EmvReader(mastercard()).read();
    assertEquals("5555555555554444", c.pan); assertEquals("12/29", c.expiry);
    assertEquals("Debit Mastercard", c.cardType); assertNull(c.holderName);
    assertEquals("792", c.countryCode); assertEquals("949", c.currencyCode); assertEquals("A0000000041010", c.aid);
}
@Test public void gpoCommandFilledFromPdol() throws Exception {
    FakeCard card = mastercard(); new EmvReader(card).read();
    String gpo = card.sent.stream().filter(s -> s.startsWith("80A8")).findFirst().get();
    assertTrue(gpo.startsWith("80A80000188316")); assertEquals(2 * 30, gpo.length()); assertTrue(gpo.endsWith("00"));
    String data = gpo.substring(14, 14 + 44);
    assertEquals("36000000", data.substring(0, 8)); assertEquals("0792", data.substring(20, 24)); assertEquals("0949", data.substring(24, 28));
}
@Test public void noPdolSendsEmptyGpo() { /* AID FCI'da 9F38 yok → GPO komutu tam olarak "80A80000028300" + "00" */ }
@Test public void fallsBackToKnownAidsWhenPpseFails() { /* PPSE kuralı yok (6A82); Mastercard AID'i doğrudan seçilir → pan okunur; sent ilk komut PPSE */ }
@Test public void triesNextAidWhenSelectFails() { /* PPSE iki AID listeler: A0000000043060 (seçimde 6A82) ve A0000000041010 → aid == "A0000000041010" */ }
@Test public void panAndExpiryFromTrack2Only() { /* kayıtta yalnızca 57 = "4111111111111111D27051010000000000000F" → pan "4111111111111111", expiry "05/27"; 50 yok ve AID Visa → cardType "Visa" */ }
@Test public void stripsPanPadding() { /* 5A = "378282246310005F" → pan "378282246310005" */ }
@Test public void gpoFailureFallsBackToRecordScan() { /* GPO → "6985"; 00B2010C → 70{5A,5F24} + OK; diğerleri 6A83 → pan okunur */ }
@Test public void followsGetResponseOn61xx() { /* AID seçimi "6120" döner; "00C0000020" → FCI + OK → okuma başarılı */ }
@Test public void retriesWithLeOn6Cxx() { /* kayıt komutu Le=00 ile "6C1A" döner; "00B2010C1A" → kayıt + OK */ }
@Test(expected = EmvException.class) public void noPaymentAppThrows() throws Exception { new EmvReader(new FakeCard()).read(); }
@Test(expected = EmvException.class) public void missingPanThrows() { /* kayıtlarda kart no yok → "Kart numarası okunamadı" */ }
@Test(expected = IOException.class) public void ioExceptionPropagates() throws Exception { new EmvReader(mastercard().throwOn("00B2")).read(); }
```

  Yorum satırıyla verilen testler, gösterilen kalıpla (`FakeCard` kuralları + `assertEquals`) yazılır; parantez içindeki değerler beklentilerdir. `throwOn` kuralı `on` kurallarından önce denetlenir.

- [ ] **Step 2: Çalıştır, başarısız olduğunu gör** — `$S/emvtest.sh EmvReaderTest` → sınıflar bulunamadı.
- [ ] **Step 3: `Transceiver`, `CardInfo`, `EmvException`, `EmvReader`'ı yaz.** Akış, yedek AID listesi (sırası ve adları: Mastercard, Maestro, Visa, Visa Electron, Troy, American Express), PDOL varsayılanları, AFL ve yedek kayıt taraması (SFI 1–10, kayıt 1–16), alan öncelikleri ve hata mesajları spec'teki "Okuma akışı" bölümünden birebir alınır. Kurallar:
  - `IOException` hiçbir yerde yakalanmaz; yalnızca durum kodu `9000` değilse sonraki adaya/yedeğe geçilir.
  - AID adayları: PPSE'deki `61` girdileri `87` önceliğine göre (öncelik yoksa sona), ardından listede olmayan yedek AID'ler.
  - Arama kümesi: seçilen AID'in FCI'ı + GPO yanıtı + okunan kayıtlar (PPSE dahil değil).
  - `9A` için `Calendar` ile `YY AA GG` BCD; `9F37` için `SecureRandom`.
  - Ülke/para birimi: değer hex'i rakamsa `Integer.parseInt` → `String.format("%03d")`, değilse `null`.
- [ ] **Step 4: Çalıştır** — `$S/emvtest.sh HexTest TlvTest EmvReaderTest` → `OK (21 tests)`.
- [ ] **Step 5: Commit** — "NFC okuyucu: EMV okuma akışı (PPSE, GPO, kayıtlar)".

---

### Task 3: `Labels` (ülke, para birimi, kart no gruplama)

**Files:**
- Create: `.../main/.../emv/Labels.java`
- Test: `.../test/.../emv/LabelsTest.java`

**Interfaces:**
- Produces: `Labels.country(String code) : String`, `Labels.currency(String code) : String`, `Labels.groupPan(String pan) : String` — hepsi statik; `null` girdi → `"—"`.

- [ ] **Step 1: Başarısız testleri yaz**

```java
@Test public void country() { assertEquals("Türkiye (792)", Labels.country("792")); assertEquals("999", Labels.country("999")); assertEquals("—", Labels.country(null)); }
@Test public void currency() { assertEquals("TRY (Türk Lirası)", Labels.currency("949")); assertEquals("EUR (Euro)", Labels.currency("978")); assertEquals("—", Labels.currency(null)); }
@Test public void groupPan() { assertEquals("5555 5555 5555 4444", Labels.groupPan("5555555555554444")); assertEquals("3782 8224 6310 005", Labels.groupPan("378282246310005")); }
```

- [ ] **Step 2: Çalıştır, başarısız olduğunu gör** — `$S/emvtest.sh LabelsTest`.
- [ ] **Step 3: `Labels`'ı yaz.** Ülkeler: 792 Türkiye, 840 ABD, 826 Birleşik Krallık, 276 Almanya, 250 Fransa, 528 Hollanda (`"<ad> (<kod>)"`; bilinmeyen → kodun kendisi). Para birimleri: 949 TRY (Türk Lirası), 840 USD (ABD Doları), 978 EUR (Euro), 826 GBP (İngiliz Sterlini) (bilinmeyen → kodun kendisi).
- [ ] **Step 4: Çalıştır** — `$S/emvtest.sh HexTest TlvTest EmvReaderTest LabelsTest` → `OK (24 tests)`.
- [ ] **Step 5: Commit** — "NFC okuyucu: ülke/para birimi adları ve kart no biçimi".

---

### Task 4: Android uygulaması, CI ve kullanım talimatı

**Files:**
- Create: `apps/nfc-kart-okuyucu/settings.gradle`, `build.gradle`, `gradle.properties`, `.gitignore` (`.gradle/`, `build/`, `app/build/`, `local.properties`)
- Create: `apps/nfc-kart-okuyucu/gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`, `gradle/wrapper/gradle-wrapper.properties` — yerel `/opt/gradle` ile boş bir dizinde `gradle wrapper --gradle-version 8.14.3` (gerekirse `--no-validate-url`) üretilip kopyalanır; `gradlew` için `git update-index --chmod=+x`.
- Create: `apps/nfc-kart-okuyucu/app/build.gradle`
- Create: `apps/nfc-kart-okuyucu/app/src/main/AndroidManifest.xml`
- Create: `apps/nfc-kart-okuyucu/app/src/main/res/layout/activity_main.xml`, `res/values/strings.xml`, `res/drawable/ic_launcher.xml` (vektör simge: koyu zemin üzerinde kart + NFC dalgaları)
- Create: `apps/nfc-kart-okuyucu/app/src/main/java/com/nfckart/okuyucu/MainActivity.java`
- Create: `.github/workflows/nfc-kart-okuyucu.yml`
- Create: `apps/nfc-kart-okuyucu/OKUBENI.md`

**Interfaces:**
- Consumes: `EmvReader(Transceiver).read()`, `CardInfo` alanları, `EmvException.getMessage()`, `Labels.country/currency/groupPan`.

- [ ] **Step 1: Gradle dosyalarını yaz.** Kök `build.gradle`: `plugins { id 'com.android.application' version '8.7.3' apply false }`. `settings.gradle`: `pluginManagement` ve `dependencyResolutionManagement` için `google()`, `mavenCentral()` (+ eklentiler için `gradlePluginPortal()`); `rootProject.name = 'nfc-kart-okuyucu'`; `include ':app'`. `app/build.gradle`: `namespace 'com.nfckart.okuyucu'`, Global Constraints'teki SDK/Java değerleri, `versionCode 1`, `versionName "1.0"`, `testImplementation 'junit:junit:4.13.2'`. `gradle.properties`: `org.gradle.jvmargs=-Xmx2g`.
- [ ] **Step 2: Manifest, simge, metinler ve yerleşimi yaz.** Manifest: NFC izni ve özelliği, `android:icon="@drawable/ic_launcher"`, `android:label="@string/app_name"`, tema `@android:style/Theme.Material.Light.DarkActionBar`, `MainActivity` başlatıcı (`exported="true"`, `screenOrientation="portrait"`). Yerleşim (`ScrollView` içinde dikey `LinearLayout`): `status` (TextView), `nfcSettings` (Button, başta gizli), `result` (başta gizli; satırlar: `pan` (monospace, büyük) + `copy` düğmesi, `expiry`, `cardType`, `holderRow`/`holder`, `country`, `currency`). Spec'teki tüm mesajlar `strings.xml`'de birebir.
- [ ] **Step 3: `MainActivity`'yi yaz.** `onResume`: adaptör yoksa "Bu telefonda NFC yok."; kapalıysa uyarı + `nfcSettings` görünür (`Settings.ACTION_NFC_SETTINGS`); açıksa `enableReaderMode(this, this::onTag, FLAG_READER_NFC_A | FLAG_READER_NFC_B | FLAG_READER_SKIP_NDEF_CHECK, null)` ve "Kartı telefonun arkasına yaklaştır". `onPause`: `disableReaderMode`. `onTag(Tag)`: `IsoDep.get` null → "Bu bir ödeme kartı değil."; değilse "Okunuyor…" → `connect()`, `setTimeout(5000)`, `new EmvReader(isoDep::transceive).read()`, `finally close()`; sonuç ve hatalar `runOnUiThread` ile spec'teki hata tablosuna göre gösterilir (`TagLostException` ve diğer `IOException` → "Kart erken uzaklaştı. Kartı 2–3 saniye sabit tut ve tekrar dene."; diğer istisnalar → "Kart okunamadı: " + `getClass().getSimpleName()`). Kopyala: `ClipData.newPlainText("Kart numarası", pan)`; `Build.VERSION.SDK_INT >= 33` ise `PersistableBundle` ile `ClipDescription.EXTRA_IS_SENSITIVE = true`, değilse `Toast` "Kopyalandı".
- [ ] **Step 4: XML'leri doğrula** — `python3 -c "import xml.dom.minidom,sys;[xml.dom.minidom.parse(f) for f in sys.argv[1:]]" <manifest> <layout> <strings> <drawable>` → çıktı yok, hata yok.
- [ ] **Step 5: İş akışını yaz** (`.github/workflows/nfc-kart-okuyucu.yml`, adı "NFC Kart Okuyucu derle"). Tetikleyiciler, adımlar ve sürüm (`nfc-kart-okuyucu` etiketi, `--target ${{ github.sha }}`, `contents: write`) spec'teki "Derleme ve dağıtım" bölümünden birebir. Sürüm notunda APK indirme bağlantısı: `https://github.com/${{ github.repository }}/releases/download/nfc-kart-okuyucu/NFCKartOkuyucu.apk`.
- [ ] **Step 6: `OKUBENI.md`'yi yaz** — spec'teki "Belgeler" bölümünün tüm maddeleri; indirme bağlantısı `https://github.com/celikalizahid-beep/dust-strike/releases/download/nfc-kart-okuyucu/NFCKartOkuyucu.apk`.
- [ ] **Step 7: Yerel testleri yeniden çalıştır** — `$S/emvtest.sh HexTest TlvTest EmvReaderTest LabelsTest` → `OK (24 tests)`.
- [ ] **Step 8: Commit ve push** — "NFC okuyucu: Android uygulaması, APK derleme iş akışı ve kullanım talimatı"; `git push -u origin claude/nfc-card-reader-app-gpq082`.
- [ ] **Step 9: CI'ı doğrula** — GitHub MCP `actions_list` ile "NFC Kart Okuyucu derle" çalışmasının sonucunu izle. Başarı: iş `success`, sürümde `NFCKartOkuyucu.apk` var. Başarısızsa `get_job_logs` ile hatayı oku, systematic-debugging ile düzelt, tekrar push et.
